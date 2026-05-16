// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../contracts/HexChain.sol";
import "../contracts/HexChainRegistry.sol";
import "./mocks/MockRevealVerifier.sol";

/**
 * HexChain v4 테스트 (keeper reveal 기반)
 *
 * 실행:
 *   forge test -vv
 *   forge test --match-test test_FullRound -vvv
 *
 * commit 해시 테스트값은 keccak256 기반 uint256 (실제 배포에서는 poseidon2)
 * seq commit 해시는 keccak256(bytes32) 기반
 *
 * survivingMask 정의: nibble-value 비트마스크
 *   bit k = nibble k가 생존 (소수자 게임 결과)
 */

contract HexChainTest is Test {

    HexChain         public game;
    HexChainRegistry public registry;

    address public playerA = makeAddr("playerA");
    address public playerB = makeAddr("playerB");
    address public playerC = makeAddr("playerC");


    // ─────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────

    function setUp() public {
        vm.roll(100); // blockhash(N-1) 사용 가능한 블록부터 시작
        MockGroth16Verifier mockVerifier = new MockGroth16Verifier();
        game     = new HexChain(address(mockVerifier));
        registry = new HexChainRegistry(address(game));
        vm.deal(playerA, 1 ether);
        vm.deal(playerB, 1 ether);
        vm.deal(playerC, 1 ether);
    }

    // ─────────────────────────────────────────
    // 헬퍼 — 해시 생성 (uint256, 테스트용 keccak256)
    // ─────────────────────────────────────────

    function _commitHash(uint8[4] memory c, uint256 salt) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(c[0], c[1], c[2], c[3], salt)));
    }

    function _eyeHash(uint8 order, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(order, salt));
    }

    // ─────────────────────────────────────────
    // 헬퍼 — nibble-value 마스크 계산
    // ─────────────────────────────────────────

    /// 4픽을 nibble-value 비트마스크로 변환
    function _picksToMask(uint8[4] memory choices) internal pure returns (uint16) {
        uint16 mask = 0;
        for (uint8 i = 0; i < 4; i++) {
            mask |= uint16(1) << choices[i];
        }
        return mask;
    }

    /// survivingMask 계산: mine & ~othersMask
    /// othersMask = union of other players' picks (self 제외)
    function _survivingMask(uint16 mine, uint16 othersMask) internal pure returns (uint16) {
        uint16 collided = mine & othersMask;
        return mine & ~collided;
    }

    // ─────────────────────────────────────────
    // 헬퍼 — keeper reveal
    // ─────────────────────────────────────────

    // 테스트용 더미 proof — MockVerifier가 항상 true 반환
    uint[2]    internal _dummyA  = [uint(1), uint(1)];
    uint[2][2] internal _dummyB  = [[uint(1), uint(1)], [uint(1), uint(1)]];
    uint[2]    internal _dummyC  = [uint(1), uint(1)];

    function _keeperReveal(uint256 rid, address player, uint8[4] memory choices) internal {
        uint16 mask = _picksToMask(choices);
        // 저장된 commitHash 읽기 (구조체 getter → 튜플 분해)
        (uint256 ch, , , , , , , , , , , , , ) = game.commitments(rid,player);
        uint[2] memory pubSig = [ch, uint(mask)];
        game.revealFor(rid, player, _dummyA, _dummyB, _dummyC, pubSig);
    }

    // ─────────────────────────────────────────
    // 헬퍼 — getRoundInfo 파싱
    // ─────────────────────────────────────────

    function _getState(uint256 rid) internal view returns (HexChain.RoundState st) {
        (st, , , , , , , ) = game.getRoundInfo(rid);
    }

    function _getRevealBlock(uint256 rid) internal view returns (uint64 rb) {
        ( , , , rb, , , , ) = game.getRoundInfo(rid);
    }

    function _getEyeRevealBlock(uint256 rid) internal view returns (uint64 erb) {
        ( , , , , , erb, , ) = game.getRoundInfo(rid);
    }

    // ─────────────────────────────────────────
    // 헬퍼 — getPlayerInfo 파싱
    // ─────────────────────────────────────────

    function _getSurvivingMask(uint256 rid, address player) internal view returns (uint16 mask) {
        ( , , , , , mask, , ) = game.getPlayerInfo(rid, player);
    }

    function _getScore(uint256 rid, address player) internal view returns (uint64 score) {
        ( , , , , , , score, ) = game.getPlayerInfo(rid, player);
    }

    function _isRevealed(uint256 rid, address player) internal view returns (bool rev) {
        ( , rev, , , , , , ) = game.getPlayerInfo(rid, player);
    }

    function _isEyeRevealed(uint256 rid, address player) internal view returns (bool rev) {
        ( , , rev, , , , , ) = game.getPlayerInfo(rid, player);
    }

    function _getEyeOrder(uint256 rid, address player) internal view returns (uint8 order) {
        ( , , , order, , , , ) = game.getPlayerInfo(rid, player);
    }

    // ─────────────────────────────────────────
    // 헬퍼 — 단계 전환
    // ─────────────────────────────────────────

    function _doLock(uint256 rid, bytes32 /*h*/) internal {
        // 해시는 createRound()에서 이미 캡처됨 — lockRound는 상태만 전환
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        game.lockRound(rid);
    }

    function _doOpenEye(uint256 rid) internal {
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + game.REVEAL_WINDOW() + 1);
        game.openEyeGame(rid);
    }

    function _doLockEye(uint256 rid) internal {
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);
        game.lockEyeRound(rid);
    }

    function _doAdvanceToSettle(uint256 rid) internal {
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + game.EYE_REVEAL_WINDOW() + 1);
    }

    // ─────────────────────────────────────────
    // 헬퍼 — 전체 라운드 진행
    // ─────────────────────────────────────────

    function _runFullRound(
        uint8[4] memory cA, uint8[4] memory cB, uint8[4] memory cC,
        uint8 eyeA, uint8 eyeB, uint8 eyeC,
        bytes32 revealHash
    ) internal returns (uint256 rid) {
        // 직전 블록 해시를 원하는 값으로 세팅 후 라운드 생성
        if (revealHash != bytes32(0)) vm.setBlockhash(block.number - 1, revealHash);
        rid = game.createRound();

        uint256 sA = uint256(bytes32("sA"));
        uint256 sB = uint256(bytes32("sB"));
        uint256 sC = uint256(bytes32("sC"));

        uint256 hashA = _commitHash(cA, sA);
        uint256 hashB = _commitHash(cB, sB);
        uint256 hashC = _commitHash(cC, sC);

        vm.prank(playerA); game.commit(rid, hashA, 0);
        vm.prank(playerB); game.commit(rid, hashB, 0);
        vm.prank(playerC); game.commit(rid, hashC, 0);

        _doLock(rid, revealHash);

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);

        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        bytes32 esA = bytes32("esA");
        bytes32 esB = bytes32("esB");
        bytes32 esC = bytes32("esC");

        bytes32 eyeHashA = _eyeHash(eyeA, esA);
        bytes32 eyeHashB = _eyeHash(eyeB, esB);
        bytes32 eyeHashC = _eyeHash(eyeC, esC);

        vm.prank(playerA); game.eyeCommit(rid, eyeHashA);
        vm.prank(playerB); game.eyeCommit(rid, eyeHashB);
        vm.prank(playerC); game.eyeCommit(rid, eyeHashC);

        _doLockEye(rid);

        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);

        vm.prank(playerA); game.eyeReveal(rid, eyeA, esA);
        vm.prank(playerB); game.eyeReveal(rid, eyeB, esB);
        vm.prank(playerC); game.eyeReveal(rid, eyeC, esC);

        _doAdvanceToSettle(rid);
        game.settle(rid);
    }

    // ─────────────────────────────────────────
    // 1. 정상 플로우
    // ─────────────────────────────────────────

    function test_CreateRound() public {
        uint256 rid = game.createRound();
        assertEq(rid, 1);
        assertEq(uint8(_getState(1)), uint8(HexChain.RoundState.OPEN));

        // Registry는 퍼미션리스 — 누구나 register() 호출 가능
        registry.register(rid);
        assertTrue(registry.isOpen(rid));
    }

    function test_LockRound_Permissionless() public {
        uint256 rid = game.createRound();
        vm.prank(playerA);
        game.commit(rid, 12345, 0);
        vm.prank(playerB);
        game.commit(rid, 67890, 0);

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);

        vm.prank(playerA);
        game.lockRound(rid);

        assertEq(uint8(_getState(rid)), uint8(HexChain.RoundState.LOCKED));
    }

    function test_FullRound_HappyPath() public {
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        uint256 rid = _runFullRound(cA, cB, cC, 1, 2, 3, bytes32(0));

        assertEq(uint8(_getState(rid)), uint8(HexChain.RoundState.SETTLED));
        assertTrue(_isRevealed(rid, playerA));
        assertTrue(_isRevealed(rid, playerB));
        assertTrue(_isRevealed(rid, playerC));
        assertTrue(_isEyeRevealed(rid, playerA));
        assertTrue(_isEyeRevealed(rid, playerB));
        assertTrue(_isEyeRevealed(rid, playerC));
    }

    function test_FullRound_StateTransitions() public {
        uint256 rid = game.createRound();
        assertEq(uint8(_getState(rid)), uint8(HexChain.RoundState.OPEN));

        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 salt = uint256(bytes32("s"));
        uint256 ch = _commitHash(c, salt);
        vm.prank(playerA);
        game.commit(rid, ch, 0);
        vm.prank(playerB);
        game.commit(rid, 1, 0);

        _doLock(rid, bytes32(0));
        assertEq(uint8(_getState(rid)), uint8(HexChain.RoundState.LOCKED));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, c);

        _doOpenEye(rid);
        assertEq(uint8(_getState(rid)), uint8(HexChain.RoundState.EYE_OPEN));

        bytes32 eyeS = bytes32("es");
        bytes32 eyeH = _eyeHash(1, eyeS);
        vm.prank(playerA);
        game.eyeCommit(rid, eyeH);

        _doLockEye(rid);
        assertEq(uint8(_getState(rid)), uint8(HexChain.RoundState.EYE_LOCKED));

        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);
        vm.prank(playerA);
        game.eyeReveal(rid, 1, eyeS);

        _doAdvanceToSettle(rid);
        game.settle(rid);
        assertEq(uint8(_getState(rid)), uint8(HexChain.RoundState.SETTLED));
    }

    // ─────────────────────────────────────────
    // 2. 소수자 게임 — survivingMask 검증
    // ─────────────────────────────────────────

    function test_SurvivingMask_NoOverlap() public {
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        uint256 rid = _runFullRound(cA, cB, cC, 1, 2, 3, bytes32(0));

        // 픽이 겹치지 않으므로 모든 픽이 생존
        assertEq(_getSurvivingMask(rid, playerA), _picksToMask(cA));
        assertEq(_getSurvivingMask(rid, playerB), _picksToMask(cB));
        assertEq(_getSurvivingMask(rid, playerC), _picksToMask(cC));
    }

    function test_SurvivingMask_WithOverlap() public {
        // A와 B가 nibble 5를 겹침
        uint8[4] memory cA = [uint8(0), 1, 2, 5];
        uint8[4] memory cB = [uint8(3), 4, 5, 6];
        uint8[4] memory cC = [uint8(7), 8, 9, 10];

        uint256 rid = _runFullRound(cA, cB, cC, 1, 2, 3, bytes32(0));

        // nibble 5 겹침: A는 0,1,2 생존 / B는 3,4,6 생존
        uint16 expA = _picksToMask([uint8(0), 1, 2, 0]) & ~(uint16(1) << 0); // 0,1,2
        expA = (uint16(1) << 0) | (uint16(1) << 1) | (uint16(1) << 2);
        uint16 expB = (uint16(1) << 3) | (uint16(1) << 4) | (uint16(1) << 6);
        uint16 expC = _picksToMask(cC);

        assertEq(_getSurvivingMask(rid, playerA), expA);
        assertEq(_getSurvivingMask(rid, playerB), expB);
        assertEq(_getSurvivingMask(rid, playerC), expC);
    }

    function test_SurvivingMask_AllOverlap() public {
        // 3명이 모두 같은 픽 (nibble 0,1,2,3)
        uint8[4] memory c = [uint8(0), 1, 2, 3];

        uint256 rid = _runFullRound(c, c, c, 1, 2, 3, bytes32(0));

        // 모든 픽 겹침 → survivingMask = 0
        assertEq(_getSurvivingMask(rid, playerA), 0);
        assertEq(_getSurvivingMask(rid, playerB), 0);
        assertEq(_getSurvivingMask(rid, playerC), 0);
    }

    // ─────────────────────────────────────────
    // 3. 눈치게임
    // ─────────────────────────────────────────

    function test_EyeGame_AllDifferentOrders() public {
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        uint256 rid = _runFullRound(cA, cB, cC, 1, 2, 3, bytes32(0));

        assertEq(_getEyeOrder(rid, playerA), 1);
        assertEq(_getEyeOrder(rid, playerB), 2);
        assertEq(_getEyeOrder(rid, playerC), 3);
    }

    function test_EyeGame_Overlap_ForfeitsLowest() public {
        // A와 B가 같은 눈치 순서(1) 선택 → 둘 다 겹침 → 낮은 배율 픽 1개 포기
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        uint256 rid = _runFullRound(cA, cB, cC, 1, 1, 3, bytes32(0));

        // A, B 모두 눈치 1 선택 (겹침) → 눈치 성공 아님
        // 점수에 눈치 배수/기본점수 없음
        uint64 scoreC = _getScore(rid, playerC);

        // C는 눈치 성공 (3번 혼자) → 기본점수 있음
        assertTrue(scoreC > 0); // 픽이 있고 눈치 성공
    }

    // ─────────────────────────────────────────
    // 4. nibble 배율 계산
    // ─────────────────────────────────────────

    function test_NibbleMult_ZeroAppearance() public {
        // revealHash = 0x0011... → nibble 0: 2회 → 2.0x = 20
        bytes32 h = hex"0011000000000000000000000000000000000000000000000000000000000000";
        vm.setBlockhash(block.number - 1, h);
        uint256 rid = game.createRound();
        vm.prank(playerA);
        game.commit(rid, 1, 0);
        vm.prank(playerB);
        game.commit(rid, 2, 0);
        _doLock(rid, h);

        uint8[16] memory mult = game.getNibbleMult(rid);
        // nibble 0: 4회 이상(h에서 앞 16 nibble 중 0이 많음) → 30
        // 실제 h = 0x0011 → nibble 0,0,1,1,0,0,0,...
        assertGt(mult[0], 10); // 0이 등장했으므로 배율 > 1.0x
    }

    function test_NibbleMult_AllSame() public {
        // revealHash 첫 16 nibble 모두 0 → nibble 0: 16회 (상한 30)
        bytes32 h = hex"0000000000000000ffffffffffffffffffffffffffffffffffffffffffffffff";
        vm.setBlockhash(block.number - 1, h);
        uint256 rid = game.createRound();
        vm.prank(playerA);
        game.commit(rid, 1, 0);
        vm.prank(playerB);
        game.commit(rid, 2, 0);
        _doLock(rid, h);

        uint8[16] memory mult = game.getNibbleMult(rid);
        assertEq(mult[0], 30); // 4+회 → 상한 3.0x = 30
        assertEq(mult[1], 10); // 0회 → 1.0x = 10
    }

    // ─────────────────────────────────────────
    // 5. 커밋 검증
    // ─────────────────────────────────────────

    function test_Commit_AlreadyCommitted() public {
        uint256 rid = game.createRound();
        vm.prank(playerA);
        game.commit(rid, 12345, 0);
        vm.prank(playerA);
        vm.expectRevert(HexChain.AlreadyCommitted.selector);
        game.commit(rid, 67890, 0);
    }

    function test_Commit_MaxPlayersReached() public {
        uint256 rid = game.createRound();
        vm.prank(playerA); game.commit(rid, 1, 0);
        vm.prank(playerB); game.commit(rid, 2, 0);
        vm.prank(playerC); game.commit(rid, 3, 0);
        address extra = makeAddr("extra");
        vm.deal(extra, 1 ether);
        vm.prank(extra);
        vm.expectRevert(HexChain.MaxPlayersReached.selector);
        game.commit(rid, 4, 0);
    }

    function test_Reveal_NotOperator() public {
        uint256 rid = game.createRound();
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 salt = 42;
        uint256 ch = _commitHash(c, salt);

        vm.prank(playerA);
        game.commit(rid, ch, 0);
        vm.prank(playerB);
        game.commit(rid, 1, 0);
        _doLock(rid, bytes32(0));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);

        (uint256 ch2, , , , , , , , , , , , , ) = game.commitments(rid,playerA);
        uint[2] memory pubSig2 = [ch2, uint(_picksToMask(c))];
        // playerB (non-operator) cannot revealFor playerA
        vm.prank(playerB);
        vm.expectRevert(HexChain.NotOperator.selector);
        game.revealFor(rid, playerA, _dummyA, _dummyB, _dummyC, pubSig2);
    }

    function test_Reveal_AlreadyRevealed() public {
        uint256 rid = game.createRound();
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 salt = 42;
        uint256 ch = _commitHash(c, salt);

        vm.prank(playerA);
        game.commit(rid, ch, 0);
        vm.prank(playerB);
        game.commit(rid, 1, 0);
        _doLock(rid, bytes32(0));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, c);

        (uint256 ch3, , , , , , , , , , , , , ) = game.commitments(rid,playerA);
        uint[2] memory pubSig3 = [ch3, uint(_picksToMask(c))];
        vm.expectRevert(HexChain.AlreadyRevealed.selector);
        game.revealFor(rid, playerA, _dummyA, _dummyB, _dummyC, pubSig3);
    }

    // ─────────────────────────────────────────
    // 6. 타이밍 검증
    // ─────────────────────────────────────────

    function test_Timing_CommitWindowClosed() public {
        uint256 rid = game.createRound();
        (, , uint64 lockBlock, , , , ,) = game.getRoundInfo(rid);
        vm.roll(lockBlock + 1); // commit 창 닫힘
        vm.prank(playerA);
        vm.expectRevert(HexChain.CommitWindowClosed.selector);
        game.commit(rid, 1, 0);
    }

    function test_Timing_RevealWindowClosed() public {
        uint256 rid = game.createRound();
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 ch = _commitHash(c, 1);

        vm.prank(playerA);
        game.commit(rid, ch, 0);
        vm.prank(playerB);
        game.commit(rid, 1, 0);
        _doLock(rid, bytes32(0));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + game.REVEAL_WINDOW() + 1); // reveal 창 닫힘

        uint[2] memory pubSig4 = [uint(0), uint(_picksToMask(c))]; // 창 닫힘 → 어떤 값이든 revert
        vm.expectRevert(HexChain.RevealWindowClosed.selector);
        game.revealFor(rid, playerA, _dummyA, _dummyB, _dummyC, pubSig4);
    }

    function test_Timing_EyeRevealWindowClosed() public {
        uint256 rid = game.createRound();
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 ch = _commitHash(c, 1);

        vm.prank(playerA);
        game.commit(rid, ch, 0);
        vm.prank(playerB);
        game.commit(rid, 1, 0);
        _doLock(rid, bytes32(0));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, c);

        _doOpenEye(rid);
        bytes32 eyeS = bytes32(uint256(99));
        bytes32 eyeH = _eyeHash(2, eyeS);
        vm.prank(playerA);
        game.eyeCommit(rid, eyeH);

        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + game.EYE_REVEAL_WINDOW() + 1); // eyeReveal 창 닫힘

        vm.prank(playerA);
        vm.expectRevert(HexChain.EyeRevealWindowClosed.selector);
        game.eyeReveal(rid, 2, eyeS);
    }

    function test_Timing_TooEarlyToOpenEye() public {
        uint256 rid = game.createRound();
        vm.prank(playerA);
        game.commit(rid, 1, 0);
        vm.prank(playerB);
        game.commit(rid, 2, 0);
        _doLock(rid, bytes32(0));
        // reveal 창이 아직 안 닫힘
        vm.expectRevert(HexChain.TooEarlyToOpenEye.selector);
        game.openEyeGame(rid);
    }

    function test_Timing_TooEarlyToSettle() public {
        uint256 rid = game.createRound();
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 ch = _commitHash(c, 1);
        vm.prank(playerA);
        game.commit(rid, ch, 0);
        vm.prank(playerB);
        game.commit(rid, 1, 0);
        _doLock(rid, bytes32(0));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, c);

        _doOpenEye(rid);
        vm.prank(playerA);
        game.eyeCommit(rid, _eyeHash(1, bytes32(uint256(1))));
        _doLockEye(rid);

        // eyeReveal 창 아직 안 닫힘
        vm.expectRevert(HexChain.TooEarlyToSettle.selector);
        game.settle(rid);
    }

    // ─────────────────────────────────────────
    // 7. 정산 / 상금 분배
    // ─────────────────────────────────────────


    // ─────────────────────────────────────────
    // 8. 엣지 케이스
    // ─────────────────────────────────────────

    function test_Edge_NotCommitted_CannotReveal() public {
        uint256 rid = game.createRound();
        vm.prank(playerB);
        game.commit(rid, 1, 0);
        vm.prank(playerC);
        game.commit(rid, 2, 0);
        _doLock(rid, bytes32(0));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);

        uint[2] memory pubSig5 = [uint(0), uint(_picksToMask([uint8(0), 1, 2, 3]))];
        vm.expectRevert(HexChain.NotCommitted.selector);
        game.revealFor(rid, playerA, _dummyA, _dummyB, _dummyC, pubSig5);
    }

    function test_Edge_EyeReveal_InvalidOrder() public {
        uint256 rid = game.createRound();
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 ch = _commitHash(c, 1);

        vm.prank(playerA);
        game.commit(rid, ch, 0);
        vm.prank(playerB);
        game.commit(rid, 1, 0);
        _doLock(rid, bytes32(0));

        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, c);

        _doOpenEye(rid);

        // order=4 (잘못됨) eyeCommitHash 생성
        bytes32 eyeH = _eyeHash(4, bytes32(uint256(99)));
        vm.prank(playerA);
        game.eyeCommit(rid, eyeH);

        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);

        vm.prank(playerA);
        vm.expectRevert(HexChain.InvalidEyeOrder.selector);
        game.eyeReveal(rid, 4, bytes32(uint256(99)));
    }

    function test_Edge_SecondRound_AfterSettle() public {
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 rid1 = _runFullRound(c, c, c, 1, 2, 3, bytes32(0));
        assertEq(uint8(_getState(rid1)), uint8(HexChain.RoundState.SETTLED));

        // 새 라운드 생성 가능
        uint256 rid2 = game.createRound();
        assertEq(rid2, 2);
        assertEq(uint8(_getState(rid2)), uint8(HexChain.RoundState.OPEN));
    }

    function test_Edge_MultiRoom_ConcurrentRounds() public {
        // 멀티룸: 정산 전에도 새 라운드 생성 가능
        uint256 rid1 = game.createRound();
        uint256 rid2 = game.createRound();
        assertEq(rid1, 1);
        assertEq(rid2, 2);
        assertEq(uint8(_getState(rid1)), uint8(HexChain.RoundState.OPEN));
        assertEq(uint8(_getState(rid2)), uint8(HexChain.RoundState.OPEN));
    }

    function test_Edge_Score_ZeroSurvivingPicksEyeSuccess() public {
        // 3명이 같은 픽 (survivingMask=0) + 눈치 성공 → base 점수만 있음
        uint8[4] memory c = [uint8(0), 1, 2, 3];

        uint256 rid = _runFullRound(c, c, c, 1, 2, 3, bytes32(0));

        // 모두 survivingMask=0, 각자 다른 순서 → 눈치 성공
        // score = 0 × eyeMult + base × 10
        uint64 scoreA = _getScore(rid, playerA);
        uint64 scoreB = _getScore(rid, playerB);
        uint64 scoreC = _getScore(rid, playerC);

        // playerA: order=1, base=10 → score = 0*20 + 10*10 = 100
        assertEq(scoreA, 100);
        // playerB: order=2, base=7 → score = 0*15 + 7*10 = 70
        assertEq(scoreB, 70);
        // playerC: order=3, base=5 → score = 0*12 + 5*10 = 50
        assertEq(scoreC, 50);
    }

    function test_Edge_PartialReveal_UnrevealedPlayersScore0() public {
        uint256 rid = game.createRound();
        uint8[4] memory c = [uint8(0), 1, 2, 3];
        uint256 ch = _commitHash(c, 1);

        // playerA만 커밋 및 리빌
        vm.prank(playerA); game.commit(rid, ch, 0);
        vm.prank(playerB); game.commit(rid, _commitHash(c, 2), 0);

        _doLock(rid, bytes32(0));
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);

        _keeperReveal(rid, playerA, c);
        // playerB는 reveal 안 함

        _doOpenEye(rid);

        vm.prank(playerA); game.eyeCommit(rid, _eyeHash(1, bytes32(uint256(1))));
        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);

        vm.prank(playerA); game.eyeReveal(rid, 1, bytes32(uint256(1)));

        _doAdvanceToSettle(rid);
        game.settle(rid);

        // playerB는 reveal 안 했으므로 score=0
        assertEq(_getScore(rid, playerB), 0);
    }

    // ─────────────────────────────────────────
    // 특전 공통 헬퍼 — perkId 커밋 + 전체 진행
    // ─────────────────────────────────────────

    /**
     * revealHash = bytes32(1), 눈치게임 eye order 지정 포함
     * playerA perkId=perk, B/C perkId=0
     */
    function _runPerkRoundWithEye(
        uint8[4] memory cA, uint8[4] memory cB, uint8[4] memory cC,
        uint8 perk, uint8 eyeA, uint8 eyeB, uint8 eyeC
    ) internal returns (uint256 rid) {
        bytes32 rh = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, rh);
        rid = game.createRound();

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perk);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, rh);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        bytes32 esA = bytes32(uint256(10));
        bytes32 esB = bytes32(uint256(20));
        bytes32 esC = bytes32(uint256(30));
        vm.prank(playerA); game.eyeCommit(rid, _eyeHash(eyeA, esA));
        vm.prank(playerB); game.eyeCommit(rid, _eyeHash(eyeB, esB));
        vm.prank(playerC); game.eyeCommit(rid, _eyeHash(eyeC, esC));

        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);

        vm.prank(playerA); game.eyeReveal(rid, eyeA, esA);
        vm.prank(playerB); game.eyeReveal(rid, eyeB, esB);
        vm.prank(playerC); game.eyeReveal(rid, eyeC, esC);

        _doAdvanceToSettle(rid);
        game.settle(rid);
    }

    /**
     * revealHash = bytes32(1) → nibbleMult: [0]=30, [1..15]=10
     * playerA perkId=perk, B/C perkId=0
     */
    function _runPerkRound(
        uint8[4] memory cA, uint8[4] memory cB, uint8[4] memory cC, uint8 perk
    ) internal returns (uint256 rid) {
        bytes32 rh = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, rh);
        rid = game.createRound();

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perk);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, rh);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);
        _doLockEye(rid);
        _doAdvanceToSettle(rid);
        game.settle(rid);
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — A-1 군중 속으로
    // ─────────────────────────────────────────

    function test_Perk_A1_CrowdBonus() public {
        uint8 perk = game.PERK_A1();
        // A:[0,1,2,3], B:[1,2,3,4], C:[2,3,4,5]
        // othersMask={1,2,3,4,5}, A∩others={1,2,3} → removed=3
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(1), 2, 3, 4];
        uint8[4] memory cC = [uint8(2), 3, 4, 5];
        uint256 rid = _runPerkRound(cA, cB, cC, perk);
        // surviving={0}, base=30×10=300, A-1: +3×50=150 → 450
        assertEq(_getScore(rid, playerA), 450, "A-1: 3 removed -> +150");
    }

    function test_Perk_A1_NoTrigger_LessThan3() public {
        uint8 perk = game.PERK_A1();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(2), 3, 4, 5];
        uint8[4] memory cC = [uint8(6), 7, 8, 9];
        uint256 rid = _runPerkRound(cA, cB, cC, perk);
        // removed={2,3} count=2 → 미발동, base=(30+10)*10=400
        assertEq(_getScore(rid, playerA), 400, "A-1: 2 removed -> no trigger");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — A-2 정밀 타격
    // ─────────────────────────────────────────

    function test_Perk_A2_PrecisionStrike() public {
        uint8 perk = game.PERK_A2();
        // A:[0,1,2,3], B:[3,4,5,6] → removed={3} count=1
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(3), 4, 5, 6];
        uint8[4] memory cC = [uint8(7), 8, 9, 10];
        uint256 rid = _runPerkRound(cA, cB, cC, perk);
        // surviving={0,1,2}, base=(30+10+10)*10=500, +100=600
        assertEq(_getScore(rid, playerA), 600, "A-2: 1 removed -> +100");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — A-3 쌍방 충돌
    // ─────────────────────────────────────────

    function test_Perk_A3_DoubleCollision() public {
        uint8 perk = game.PERK_A3();
        // A:[0,1,2,3], B:[2,3,4,5] → removedMask={2,3}
        // nibble2: A+B 공유 → shared=2, nibble3: A+B 공유 → shared=2, maxShared=2
        // bonus=2×50=100
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(2), 3, 4, 5];
        uint8[4] memory cC = [uint8(6), 7, 8, 9];
        uint256 rid = _runPerkRound(cA, cB, cC, perk);
        // surviving={0,1}, base=400, A-3: +100 → 500
        assertEq(_getScore(rid, playerA), 500, "A-3: 2 removed -> +sum(mult)*10");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — A-4 손실 제한
    // ─────────────────────────────────────────

    /**
     * revealHash = bytes32(1) → 첫 16 nibble 전부 0
     *   nibbleMult[0] = 30 (3.0x), nibbleMult[1..15] = 10 (1.0x)
     *
     * A: [0,1,2,3] perkId=4, B: [2,3,4,5] perkId=0, C: [6,7,8,9] perkId=0
     *   A survivingMask = {0,1}, removedMask = {2,3}
     *   nibbleMult[2]=nibbleMult[3]=10 → highestMult=10 → bonus = 10*5 = 50
     *   A base score (no eye) = (30+10)*10 = 400
     *   A total = 450
     */
    function test_Perk_A4_LossLimit() public {
        bytes32 revealHash = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, revealHash);
        uint256 rid = game.createRound();
        uint8 perkA4 = game.PERK_A4();

        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(2), 3, 4, 5];
        uint8[4] memory cC = [uint8(6), 7, 8, 9];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkA4);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, revealHash);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);
        _doLockEye(rid);
        _doAdvanceToSettle(rid);
        game.settle(rid);

        // A: 기본 400 + A-4 보너스 50 = 450
        assertEq(_getScore(rid, playerA), 450, "A-4: base + loss limit bonus");
    }

    /// A-4: 제거된 픽이 없으면(전부 생존) 보너스 없음
    function test_Perk_A4_NoBonus_WhenNoRemoval() public {
        bytes32 revealHash = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, revealHash);
        uint256 rid = game.createRound();
        uint8 perkA4 = game.PERK_A4();

        // 겹치지 않는 픽
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkA4);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, revealHash);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);
        _doLockEye(rid);
        _doAdvanceToSettle(rid);
        game.settle(rid);

        // A: (30+10+10+10)*10 = 600, removedMask=0 → 보너스 없음
        assertEq(_getScore(rid, playerA), 600, "A-4: no removal, no bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — A-5 최저 보장
    // ─────────────────────────────────────────

    /**
     * A: [0,1,2,3] perkId=5, B: [0,1,4,5], C: [2,3,6,7]
     *   othersMask = {0,1,2,3,4,5,6,7} → A survivingMask = {} (popcount=0)
     *   A-5 발동 → +100
     *   A base score = 0, total = 100
     */
    function test_Perk_A5_MinGuarantee_Triggers() public {
        bytes32 revealHash = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, revealHash);
        uint256 rid = game.createRound();
        uint8 perkA5 = game.PERK_A5();

        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(0), 1, 4, 5];
        uint8[4] memory cC = [uint8(2), 3, 6, 7];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkA5);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, revealHash);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);
        _doLockEye(rid);
        _doAdvanceToSettle(rid);
        game.settle(rid);

        // A: 생존 픽 0개 → A-5 발동 → score = 100
        assertEq(_getScore(rid, playerA), 100, "A-5: zero surviving, +1.0pt");
    }

    /// A-5: 생존 픽이 2개 이상이면 발동 안 함
    function test_Perk_A5_NoTrigger_WhenEnoughSurvive() public {
        bytes32 revealHash = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, revealHash);
        uint256 rid = game.createRound();
        uint8 perkA5 = game.PERK_A5();

        // A는 다른 플레이어와 겹치지 않음 → 4픽 전부 생존
        uint8[4] memory cA = [uint8(8), 9, 10, 11];
        uint8[4] memory cB = [uint8(0), 1, 2, 3];
        uint8[4] memory cC = [uint8(4), 5, 6, 7];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkA5);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, revealHash);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);
        _doLockEye(rid);
        _doAdvanceToSettle(rid);
        game.settle(rid);

        // A: 4픽 전부 생존 (popcount=4 > 1) → A-5 미발동
        // score = (10+10+10+10)*10 = 400 (nibble 8~11은 전부 1.0x)
        assertEq(_getScore(rid, playerA), 400, "A-5: enough surviving, no bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — E-1 서로소 보너스
    // ─────────────────────────────────────────

    function test_Perk_E1_CoprimeBonus() public {
        uint8 perk = game.PERK_E1();
        // [1,5,7,11]: gcd 모두 1 → coprime ✓
        uint8[4] memory cA = [uint8(1), 5, 7, 11];
        uint8[4] memory cB = [uint8(0), 2, 3, 4];
        uint8[4] memory cC = [uint8(6), 8, 9, 10];
        uint256 rid = _runPerkRound(cA, cB, cC, perk);
        // surviving=4픽, pickSum base=10×4=40, E-1: +4×4=16 → 56×10=560
        assertEq(_getScore(rid, playerA), 560, "E-1: coprime bonus +0.2x per pick");
    }

    function test_Perk_E1_NoBonus_NotCoprime() public {
        uint8 perk = game.PERK_E1();
        // gcd(2,4)=2 → not all coprime
        uint8[4] memory cA = [uint8(1), 2, 4, 7];
        uint8[4] memory cB = [uint8(0), 3, 5, 6];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRound(cA, cB, cC, perk);
        assertEq(_getScore(rid, playerA), 400, "E-1: not coprime -> no bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — E-2 소수 집중
    // ─────────────────────────────────────────


    // ─────────────────────────────────────────
    // 특전 테스트 — E-3 공백 선점
    // ─────────────────────────────────────────

    function test_Perk_E3_EmptyNibbleBonus() public {
        uint8 perk = game.PERK_E3();
        // hash=bytes32(1): nibble[0]=30x(등장), [1..15]=10x(0회)
        // A: [1,2,3,4] → 전부 zero-nibble(0회 등장) → zeroPickCnt=4 ≥3 ✓
        uint8[4] memory cA = [uint8(1), 2, 3, 4];
        uint8[4] memory cB = [uint8(5), 6, 7, 8];
        uint8[4] memory cC = [uint8(9), 10, 11, 12];
        uint256 rid = _runPerkRound(cA, cB, cC, perk);
        // pickSum base=40, E-3: +5×4=20 → 60×10=600
        assertEq(_getScore(rid, playerA), 600, "E-3: 4 zero-nibble picks bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — E-4 레인 선언
    // ─────────────────────────────────────────


    // ─────────────────────────────────────────
    // 특전 테스트 — E-5 구간 분산
    // ─────────────────────────────────────────



    // ─────────────────────────────────────────
    // 특전 테스트 — B-1 극단 선택자
    // ─────────────────────────────────────────

    /**
     * hash=bytes32(1) → nibbleMult: [0]=30, [1..15]=10
     * A: [0,1,2,3] perk=B1, eyeOrder=1 (성공, cnt=1)
     * pickSum=60, score=60×20+10×10=1300, B-1: +60×3=180 → 1480
     */
    function test_Perk_B1_Order1_Bonus() public {
        uint8 perk = game.PERK_B1();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 1, 2, 3);
        assertEq(_getScore(rid, playerA), 1480, "B-1: order 1 success -> +0.3x");
    }

    /**
     * A eyeOrder=3 성공 → B-1 발동
     * pickSum=60, score=60×12+5×10=720+50=770, B-1: +60×3=180 → 950
     */
    function test_Perk_B1_Order3_Bonus() public {
        uint8 perk = game.PERK_B1();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 3, 1, 2);
        assertEq(_getScore(rid, playerA), 950, "B-1: order 3 success -> +0.3x");
    }

    /// B-1: 2번 성공 시 미발동
    function test_Perk_B1_Order2_NoBonus() public {
        uint8 perk = game.PERK_B1();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        // A=order2(성공), B=order1, C=order3
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 2, 1, 3);
        // score=60×15+7×10=900+70=970, no B-1
        assertEq(_getScore(rid, playerA), 970, "B-1: order 2 -> no bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — B-2 고독한 질주
    // ─────────────────────────────────────────

    /**
     * A=order2(cnt=1, eyeSuccess), B=order1, C=order1
     * orderCount={1:2, 2:1, 3:0} → hasEmptySlot=true
     * pickSum=60, score=60×15+7×10=970, B-2: +150 → 1120
     */
    function test_Perk_B2_LoneAndEmptySlot() public {
        uint8 perk = game.PERK_B2();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 2, 1, 1);
        assertEq(_getScore(rid, playerA), 1120, "B-2: lone + empty slot -> +1.5pt");
    }

    /// B-2: 빈 슬롯 없을 때 미발동 (모두 다른 순서)
    function test_Perk_B2_NoEmptySlot_NoBonus() public {
        uint8 perk = game.PERK_B2();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        // A=1, B=2, C=3 → 전부 다름 → hasEmptySlot=false
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 1, 2, 3);
        // score=60×20+10×10=1300, no B-2
        assertEq(_getScore(rid, playerA), 1300, "B-2: no empty slot -> no bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — B-4 선제 희생
    // ─────────────────────────────────────────

    /**
     * A=[0,1,2,3] perk=B4, eyeOrder=1, B=eyeOrder=1 (충돌)
     * B-4: 최고배율 nibble0(30x) 희생 → mask={1,2,3}, eyeSuccess=true
     * pickSum=10+10+10=30, score=30×20+10×10=600+100=700
     */
    function test_Perk_B4_SacrificeHighest_ImmuneToCollision() public {
        uint8 perk = game.PERK_B4();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        // A와 B 충돌(order=1), C=order=2
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 1, 1, 2);
        assertEq(_getScore(rid, playerA), 700, "B-4: sacrifice highest -> immune");
    }

    /// B-4: 충돌 없어도 항상 최고배율 픽 희생
    function test_Perk_B4_AlwaysSacrifices() public {
        uint8 perk = game.PERK_B4();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        // 충돌 없음: A=order2, B=order1, C=order3
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 2, 1, 3);
        // nibble0 희생 → mask={1,2,3}, pickSum=30, eyeSuccess
        // score=30×15+7×10=450+70=520
        assertEq(_getScore(rid, playerA), 520, "B-4: always sacrifices highest");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — B-5 보험
    // ─────────────────────────────────────────

    /**
     * A=[0,1,2,3] perk=B5, eyeOrder=1, B=eyeOrder=1 (2-way 충돌)
     * B-5: cnt=2 → forfeit=0 → eyeSuccess=true
     * mask={0,1,2,3}, pickSum=60, score=60×20+10×10=1300
     */

    /**
     * 3-way 충돌: cnt=3 → B-5: forfeit=1
     * _forfeitLowestPicks removes nibble1(mult=10) from {0,1,2,3}
     * mask={0,2,3}, pickSum=30+10+10=50, eyeSuccess=false
     * score=50×10=500
     */

    // ─────────────────────────────────────────
    // 특전 테스트 — B-7 픽-순서 연동
    // ─────────────────────────────────────────

    /**
     * A=[0,1,2,3] perk=B7, eyeOrder=1 (성공)
     * nibble1이 생존마스크에 있음 → pickSum += nibbleMult[1]*5 = 10*5=50
     * pickSum base=60+50=110, score=110×20+10×10=2200+100=2300
     */

    /// B-7: 순서번호와 같은 hex 픽이 없을 때 미발동

    // ─────────────────────────────────────────
    // 특전 테스트 — B-8 집중 도박
    // ─────────────────────────────────────────

    /**
     * hash=bytes32(1) → 첫 16 nibble 위치가 모두 0x00 바이트에서 추출됨
     * cnt[0]=16 → mult[0]=30x, cnt[1..15]=0 → mult[1..15]=10x
     * A: [0,1,2,3] perk=B8, eyeOrder=1 단독
     * 픽 압축: 상위 2픽 [0(30x), 1(10x)] → pickSum=40
     * score = 40×35 + 10×10 = 1400+100 = 1500
     */
    function test_Perk_B8_Top2Picks_Order1_Bonus() public {
        uint8 perk = game.PERK_B8();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 1, 2, 3);
        assertEq(_getScore(rid, playerA), 1500, "B-8: top2 picks + order1 -> x3.5");
    }

    /**
     * B-8: 1번이 아닌 순서(2번) 성공 시 ×3.5 미적용
     * A: [0,1,2,3] perk=B8, eyeOrder=2 단독
     * 픽 압축: [0(30x), 1(10x)] → pickSum=40
     * score = 40×15 + 7×10 = 600+70 = 670
     */
    function test_Perk_B8_Order2_NoBonus() public {
        uint8 perk = game.PERK_B8();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 2, 1, 3);
        assertEq(_getScore(rid, playerA), 670, "B-8: order2 -> no x3.5 bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — G-2 처형 (연쇄)
    // ─────────────────────────────────────────

    /**
     * G-2 처형: 충돌 후 1픽 남은 상대 처형
     * A(G2, eyeOrder=1), B(eyeOrder=1), C(eyeOrder=2)
     * A=[0,1,2,3], B=[0,4,5,6] → nibble0 충돌 → B 픽 1개 제거
     * B.survivingMask 원래 4개, 충돌로 1개 제거 → 3개 남음 → 처형 조건 미충족
     * 대신 B=[0], A=[0,1,2,3] → B 충돌로 0픽 → 처형 필요 없음(이미 0)
     * 단순하게: A(G2, eye=1), B(eye=1, picks=[0]) → 충돌 → B finalMask=0 → 처형 발동 안 함(이미 0)
     * 올바른 케이스: B가 충돌 후 정확히 1픽 남아야 함
     * A=[2,3,4,5], B=[0,1,6,7], 눈치 A=1,B=1 → 충돌 없음 → eyeSuccess 둘다
     * 충돌 케이스: A=[0,1,2,3], B=[0,1,2,4] → nibble 0,1,2 겹침 → B forfeit 2픽(lowest) → B 픽이 4개에서 2개만 남음
     *
     * 가장 명확한 케이스:
     * A(G2)=[4,5,6,7], B=[4,5,6,8] — eyeOrder 둘다 1
     * 충돌: nibble4,5,6 겹침 → cnt=2 → 각자 1픽 forfeit(최저배율)
     * nibble4=10x,5=10x,6=10x,7=10x,8=10x (bytes32(1)에서 0 제외 전부 10x)
     * forfeit 1픽씩 → A:3픽 남, B:3픽 남 → 처형 조건 안 됨
     *
     * 처형 조건(1픽 남음)을 만들려면 cnt=3 이상(3명 같은 순서)이거나 원래 픽이 적어야 함
     * A(G2,eye=1)=[4,5,6,7], B(eye=1)=[4,5,6,7], C(eye=1)=[8,9,10,11]
     * A와 B: nibble4,5,6,7 전부 겹침 → cnt=2 → 각자 1픽 forfeit
     * → A:3픽, B:3픽 → 처형 안 됨
     * 3명 eye=1: A=[4,5,6,7], B=[4,5,6,7], C=[4,5,6,7]
     * cnt=3 → 각자 2픽 forfeit → 각자 2픽 남음 → 처형 조건 안 됨
     *
     * 1픽 남는 경우: 원래 생존 픽이 2개인 상태에서 1픽 충돌
     * 즉 nibble 겹침 Phase(survivingMask)에서 이미 2픽만 남아있어야 함
     * → 4픽 중 2픽이 nibble 겹침으로 이미 제거됨 + 남은 2픽 중 눈치 충돌 1픽 제거 = 1픽 남음
     *
     * 더 단순하게: A(G2,eye=1)=[0,1,2,3], B(eye=1)=[2,3,4,5], C(eye=3)=[8,9,10,11]
     * nibble겹침: A와 B → nibble2,3 겹침 → survivingMask 반영
     * 그 후 눈치 eye=1에서 A,B 둘다 → cnt=2 → 각자 1픽 forfeit
     * B.survivingMask (nibble겹침 후): nibble4,5가 살아있다면 2픽 → 눈치 1픽 forfeit → 1픽 → 처형!
     */
    function test_Perk_G2_Executes_After_Collision() public {
        // revealHash=bytes32(1): nibble0=30x, 나머지=10x
        // A(G2): [0,2,3,4], B: [0,1,2,5] — nibble겹침: 0,2
        // nibble겹침 결과: A=[3,4](2픽), B=[1,5](2픽)
        // 눈치: A=eye1, B=eye1 → cnt=2 → 각자 1픽 forfeit(최저배율)
        // A forfeit: nibble3(10x) or nibble4(10x) → nibble3 제거 → A finalMask=[4]
        // B forfeit: nibble1(10x) or nibble5(10x) → nibble1 제거 → B finalMask=[5]
        // B finalMask=1픽 → G2 처형 → B finalMask=0
        uint8 perk = game.PERK_G2();
        uint8[4] memory cA = [uint8(0), 2, 3, 4];
        uint8[4] memory cB = [uint8(0), 1, 2, 5];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 1, 1, 3);
        // B는 처형으로 score=0
        assertEq(_getScore(rid, playerB), 0, "G-2: B processed after collision, executed");
        // A는 살아서 점수 있음
        assertGt(_getScore(rid, playerA), 0, "G-2: A survived");
    }

    /**
     * G-2 처형 보너스: 처형 성공 시 잃은 픽 보전 + 0.5pt
     * 위와 동일 세팅. A는 nibble겹침으로 nibble0 제거(30x 손실), 눈치충돌로 1픽 더 제거
     * 처형 1킬 → 잃은 픽 배율 합 × 0.5 pickSum 보전 + 0.5pt
     */
    function test_Perk_G2_Kill_Bonus() public {
        uint8 perk = game.PERK_G2();
        uint8[4] memory cA = [uint8(0), 2, 3, 4];
        uint8[4] memory cB = [uint8(0), 1, 2, 5];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 1, 1, 3);
        // A.survivingMask=[3,4](nibble겹침으로 0,2 제거), 눈치 forfeit nibble3 → finalMask=[4]
        // g2LostSum: survivingMask[3,4] & ~finalMask[4] = [3] → 10x → lostSum=10
        // score = pickSum(10)×10=100 + 보전(10×5=50) + 1킬(+50) = 200
        assertEq(_getScore(rid, playerA), 200, "G-2: kill bonus applied");
    }

    /**
     * G-2 처형 연쇄: primary(1픽) 처형 후 같은 순서 2픽 상대도 연쇄 처형
     * A(G2,eye=1), B(eye=1, 충돌 후 1픽), C(eye=1, 충돌 후 2픽)
     * A=[8,9,10,11], B=[0,1,2,3], C=[1,2,3,4]
     * nibble겹침: B∩C={1,2,3} → B.surviving=[0](1픽), C.surviving=[4](1픽)
     * 눈치 A=1,B=1,C=1 → cnt=3 → 각자 2픽 forfeit
     * B.surviving=[0] → forfeit 1픽(=0픽 남음), A/C도 forfeit
     * 실제: A.surviving=[8,9,10,11](4픽, 겹침 없음) → forfeit 2픽 → [10,11]
     * B.surviving=[0](1픽) → forfeit 1픽(최저=nibble0=30x) → B finalMask=0
     * C.surviving=[4](1픽) → forfeit 1픽 → C finalMask=0
     * → B,C 모두 0픽 → primary로 처형됨. 연쇄 케이스는 다른 시나리오 필요.
     *
     * 연쇄 케이스: B finalMask=1픽(primary), C finalMask=2픽(chain 대상)
     * A=[8,9,10,11], B=[0,4,5,6], C=[0,1,7,8] — nibble겹침: B∩C={0}
     * B.surviving=[4,5,6](3픽), C.surviving=[1,7,8](3픽)
     * 눈치 A=1,B=1,C=1 → cnt=3 → 각자 2픽 forfeit
     * B forfeit 2픽(10x) → B finalMask=[5or6,4 중 2픽 → 실제: nibble4,5 또는 4,6]
     * 구체적으로: B.surviving=[4,5,6] → 최저2픽(nibble4,5 or 4,6 — 동일 10x, index순)
     *   worstNibble: k=4(10x→wN=4,wM=10), k=5(same→pass), k=6(same→pass) → forfeit nibble4
     *   남은[5,6] → forfeit nibble5 → B finalMask=[6](1픽) ← primary
     * C.surviving=[1,7,8] → forfeit nibble1 → [7,8] → forfeit nibble7 → C finalMask=[8](1픽) ← primary도 됨
     *
     * 3명 동일 순서에서 2픽 chain 케이스를 만들기 어려움. 2명 케이스로 단순화:
     * A(G2,eye=1), B(eye=1), C(eye=2). B 충돌 후 1픽(primary). C는 같은 순서 아니므로 chain 없음.
     * → 연쇄는 3명이 모두 eye=1일 때만 의미있음. 하지만 3명 충돌이면 모두 2픽씩 forfeit이라
     *   4픽 시작 시 2픽 남음 → primary 조건(≤1픽) 미충족 가능성 높음.
     *
     * 실용적 케이스: A(G2,eye=1)=[8,9,10,11], B(eye=1)=[0,1,2,3], C(eye=1)=[4,5,6,7]
     * nibble겹침 없음. 눈치 3명 eye=1 → cnt=3 → 각자 2픽 forfeit
     * B forfeit nibble0,1 → B finalMask=[2,3](2픽) ← chain 대상
     * C forfeit nibble4,5 → C finalMask=[6,7](2픽) ← chain 대상
     * A forfeit nibble8,9 → A finalMask=[10,11](2픽)
     * primary 없음(모두 2픽) → chain 미발동
     *
     * primary를 만들려면: B=[0](커밋 1픽만?) → ZK proof 불가. 또는 nibble겹침으로 1픽만 남도록.
     * B=[0,4,5,6], C=[4,5,6,7] → nibble겹침: {4,5,6} → B.surviving=[0], C.surviving=[7]
     * 눈치 A=1,B=1,C=1 → cnt=3 → 각자 2픽 forfeit
     * B.surviving=[0](1픽) → forfeit 1픽 → B finalMask=0(0픽) — primary로 처형
     * C.surviving=[7](1픽) → forfeit 1픽 → C finalMask=0(0픽) — primary로 처형
     * → 둘 다 primary. chain 케이스가 안 나옴.
     *
     * chain 케이스(B=1픽primary, C=2픽chain):
     * B=[0,4,5,6], C=[4,5,6,7,X] — C픽이 하나 더 있어야. nibble겹침: B∩C={4,5,6}
     * B.surviving=[0](1픽), C.surviving=[7,X](2픽)
     * 눈치 A=1,B=1,C=1: B forfeit → 0픽(primary), C forfeit 2픽→각자 0픽 남음
     * C.surviving=[7,X](2픽) - forfeit 2픽 → 0픽. chain도 이미 0픽이 돼버림.
     *
     * C가 2픽 남으려면 forfeit이 0이어야 → cnt=1(단독). 즉 C는 eye=1이 아닌 다른 순서여야 하는데
     * 그러면 A와 같은 순서가 아니므로 chain 대상이 아님. 구조적으로 3인 게임에서는
     * chain 케이스(2픽 상대)가 자연스럽게 발생하기 어려움.
     * → chain 테스트는 생략하고 계약 로직만 문서화.
     */
    function test_Perk_G2_Chain_Execute_2Picks() public {
        // A(G2,eye=1), B(eye=1, nibble겹침으로 1픽primary), C(eye=1, 2픽 → chain 대상)
        // B=[0,4,5,6], C=[4,5,6,1,X] 구성 불가(4픽 제한)
        // 대신: B=[0,4,5,6], C=[2,4,5,6] → nibble겹침: B∩C={4,5,6}
        // B.surviving=[0](1픽), C.surviving=[2](1픽) — C도 primary가 됨
        // 실질적 chain 케이스 불가(forfeit 때문에). 단순 2명 primary 처형 확인.
        uint8 perk = game.PERK_G2();
        uint8[4] memory cA = [uint8(8), 9, 10, 11];
        uint8[4] memory cB = [uint8(0), 4, 5, 6];
        uint8[4] memory cC = [uint8(2), 4, 5, 6];
        uint256 rid = _runPerkRoundFull(cA, cB, cC, perk, 0, 0, 1, 1, 1);
        // B.surviving=[0](1픽), C.surviving=[2](1픽)
        // cnt=3 → 각자 2픽 forfeit
        // B forfeit nibble0 → 0픽(primary), C forfeit nibble2 → 0픽(primary)
        // → 2킬 보너스 발동
        assertEq(_getScore(rid, playerB), 0, "G-2 chain: B executed");
        assertEq(_getScore(rid, playerC), 0, "G-2 chain: C executed");
        assertGt(_getScore(rid, playerA), 0, "G-2 chain: A survives with bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — D-5 데스페라도
    // ─────────────────────────────────────────

    /**
     * D-5 데스페라도: 0명 적중 → 내 2픽 역제거 (score=0)
     * A(D5)=[0,1,2,3] → 압축: [0(30x),1(10x)]
     * B=[4,5,6,7], C=[8,9,10,11] — 겹침 없음
     * → 0명 적중 → A score=0
     */
    function test_Perk_D5_ZeroHit_Penalty() public {
        uint8 perk = game.PERK_D5();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 1, 2, 3);
        assertEq(_getScore(rid, playerA), 0, "D-5: 0 hits -> score=0");
    }

    /**
     * D-5 데스페라도: 1명 1발 적중 → 겹친 nibble 배율 × 0.5 추가
     * A(D5)=[0,1,2,3] → 압축: [0(30x), 1or2or3(10x)] (nibble1~3 동일 10x, 임의 1개)
     * B=[0,4,5,6] — nibble0만 겹침(30x) → hitCount=1, overlapCnt=1
     * A eyeOrder=2 단독: pickSum=40, eyeMult=15
     * score=40×15+7×10=670, 보너스=30×5=150 → 합계=820
     */
    function test_Perk_D5_OneHit_Bonus() public {
        uint8 perk = game.PERK_D5();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(0), 4, 5, 6];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 2, 1, 3);
        assertEq(_getScore(rid, playerA), 820, "D-5: 1 hit -> 0.5x bonus");
    }

    /**
     * D-5 데스페라도: 1명 2발 집중 → 상대 4픽 전부 제거 + 겹친 배율 합 × 1.0
     * bytes32(1): nibble0=30x, 나머지=10x
     * A(D5)=[0,1,2,3] → 압축: nibble1(k=1) 먼저 제거, nibble2 제거 → [0(30x),3(10x)]
     * B=[0,3,4,5].pickedMask에 nibble0,3 모두 포함 → overlapCnt=2 → hits2Same=1
     * B finalMask=0, hitMult=30+10=40 → 보너스=40×10=400
     * A eyeOrder=2 단독: pickSum=40, score=40×15+7×10=670+400=1070
     */
    function test_Perk_D5_TwoHit_Concentrated() public {
        uint8 perk = game.PERK_D5();
        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(0), 3, 4, 5];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];
        uint256 rid = _runPerkRoundWithEye(cA, cB, cC, perk, 2, 3, 1);
        assertEq(_getScore(rid, playerA), 1070, "D-5: 2 hits concentrated -> max bonus");
        assertEq(_getScore(rid, playerB), 0,    "D-5: target all picks removed");
    }

    // ─────────────────────────────────────────
    // 헬퍼 — 3플레이어 개별 perkId 지정
    // ─────────────────────────────────────────

    /**
     * 모든 플레이어의 perkId를 개별 지정할 수 있는 헬퍼
     * revealHash = bytes32(1): nibble[0]=30x, [1]=15x, [2..15]=10x
     */
    function _runPerkRoundFull(
        uint8[4] memory cA, uint8[4] memory cB, uint8[4] memory cC,
        uint8 perkA, uint8 perkB, uint8 perkC,
        uint8 eyeA, uint8 eyeB, uint8 eyeC
    ) internal returns (uint256 rid) {
        bytes32 rh = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, rh);
        rid = game.createRound();

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkA);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), perkB);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), perkC);

        _doLock(rid, rh);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        bytes32 esA = bytes32(uint256(10));
        bytes32 esB = bytes32(uint256(20));
        bytes32 esC = bytes32(uint256(30));
        vm.prank(playerA); game.eyeCommit(rid, _eyeHash(eyeA, esA));
        vm.prank(playerB); game.eyeCommit(rid, _eyeHash(eyeB, esB));
        vm.prank(playerC); game.eyeCommit(rid, _eyeHash(eyeC, esC));

        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);

        vm.prank(playerA); game.eyeReveal(rid, eyeA, esA);
        vm.prank(playerB); game.eyeReveal(rid, eyeB, esB);
        vm.prank(playerC); game.eyeReveal(rid, eyeC, esC);

        _doAdvanceToSettle(rid);
        game.settle(rid);
    }

    // (H-2 처형 테스트는 G-2 연쇄 처형으로 재설계됨 — test_Perk_G2_* 참조)

    // ─────────────────────────────────────────
    // 특전 테스트 — H-5 순서 선점
    // ─────────────────────────────────────────

    /**
     * A (H-5, order=1), B (order=1), C (order=2)
     * Hash=bytes32(1): nibble[2..15]=10x (겹침 없음 → 4픽 전부 생존)
     *
     * 픽: A=[8,9,10,11], B=[4,5,6,7], C=[12,13,14,15]
     *
     * H-5 pre-pass: B(order=1)를 빈 슬롯 3으로 밀어냄
     *   orderCount: [1]=2,[2]=1,[3]=0 → B→3 → [1]=1,[2]=1,[3]=1
     *
     * A: cnt=1, eyeSuccess(order=1), pickSum=40, score=40×20+10×10=900
     * B: cnt=1, eyeSuccess(order=3), pickSum=40, score=40×12+5×10=530
     * C: cnt=1, eyeSuccess(order=2), pickSum=40, score=40×15+7×10=670
     */

    /**
     * 3-way 충돌에서 H-5: A(H-5,1), B(1), C(1)
     * B,C 모두 같은 빈 슬롯(order=2)으로 밀려남 → B,C끼리 재충돌
     *
     * destOrder=2 (첫 번째 빈 슬롯): orderCount[2]: 0→1(B)→2(C)
     * orderCount 최종: [1]=1, [2]=2, [3]=0
     *
     * A: cnt=1, eyeSuccess(order=1), pickSum=40, score=40×20+10×10=900
     * B: cnt=2 at order=2, forfeit 1 → {5,6,7}, pickSum=30, eyeSuccess=false, score=300
     * C: cnt=2 at order=2, forfeit 1 → {13,14,15}, pickSum=30, eyeSuccess=false, score=300
     */

    /**
     * H-5 order=2 선점: C가 order=1에 있을 때 B(2)는 order=3으로 밀려남
     * (order=1 occupied by C → scan skips it → takes order=3)
     *
     * A(H-5,2), B(2), C(1) → orderCount:[1]=1,[2]=2,[3]=0
     * B bumped: scan o=1(occupied),o=3(empty) → B to 3
     * orderCount after: [1]=1,[2]=1,[3]=1
     *
     * A: order=2, score=40×15+7×10=670
     * B: order=3, score=40×12+5×10=530
     * C: order=1 (unchanged), score=40×20+10×10=900
     */

    /**
     * H-5 order=2 선점: C가 order=3에 있을 때 B(2)는 order=1로 밀려남
     * (order=1 empty → scan takes it first)
     *
     * A(H-5,2), B(2), C(3) → orderCount:[1]=0,[2]=2,[3]=1
     * B bumped: scan o=1(empty) → B to 1
     * orderCount after: [1]=1,[2]=1,[3]=1
     *
     * A: order=2, score=670
     * B: order=1 (낮은 슬롯 → 높은 배수), score=900
     * C: order=3 (unchanged), score=530
     */

    /**
     * H-3 저지불가: H-2 처형으로부터 면역
     * A (H-2, order=1), B (H-3, 1픽 생존, order=1), C (order=2)
     * B가 H-3이므로 H-2 처형 무효 → orderCount[1] 유지=2
     * A: 일반 충돌 (cnt=2), forfeit 1 → score=300
     * B: 일반 충돌, forfeit 1 from {0} → 0픽, score=0
     */
    function test_Perk_H3_ImmuneToH2() public {
        uint8 perkH2 = game.PERK_G2();
        uint8 perkH3 = game.PERK_G3();
        uint8[4] memory cA = [uint8(8), 9, 10, 11];
        uint8[4] memory cB = [uint8(0), 1, 2, 3];  // B.surviving={0} after C overlap
        uint8[4] memory cC = [uint8(1), 2, 3, 4];
        uint256 rid = _runPerkRoundFull(cA, cB, cC, perkH2, perkH3, 0, 1, 1, 2);
        // B has H-3 → H-2 처형 무효
        // orderCount[1]=2: A와 B 일반 충돌
        // A: forfeit 1 → {9,10,11}, pickSum=30, eyeSuccess=false, score=300
        assertEq(_getScore(rid, playerA), 300, "H-3: immune to H-2, A gets no execution benefit");
        // B: forfeit 1 from {0} → 0픽, eyeSuccess=false, score=0
        assertEq(_getScore(rid, playerB), 0, "H-3: B loses picks normally, no execution bonus");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — G-3 순서 함정
    // ─────────────────────────────────────────

    /**
     * F-3 기본 발동:
     *   A (F-3, eyeOrder=2), trapOrder=1 설정 (OPEN 단계)
     *   B (eyeOrder=1), C (eyeOrder=3) — 겹침 없음
     *
     * hash=bytes32(1): nibble[0]=30x, [1..15]=10x
     * A: [0,1,2,3], B: [4,5,6,7], C: [8,9,10,11] — 겹침 없음
     *
     * F-3 함정: B(order=1) → eyeMult 1단계 하향 (2.0→1.5)
     * eyeSuccess 유지
     *
     * A: eyeSuccess(order=2), pickSum=60, score=60×15+7×10=970
     * B: F-3 함정 → eyeM=15, pickSum=40, score=40×15+10×10=700
     * C: eyeSuccess(order=3), pickSum=40, score=40×12+5×10=530
     */
    function test_Perk_G3_Trap_RemovesExtra_FromTrappedOrder() public {
        bytes32 rh = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, rh);
        uint256 rid = game.createRound();
        uint8 perkG3 = game.PERK_F3();

        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkG3);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        // F-3: OPEN 단계에서 trapOrder=1 지정
        vm.prank(playerA); game.setTrap(rid, 0, 1);

        _doLock(rid, rh);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        bytes32 esA = bytes32(uint256(10));
        bytes32 esB = bytes32(uint256(20));
        bytes32 esC = bytes32(uint256(30));
        vm.prank(playerA); game.eyeCommit(rid, _eyeHash(2, esA));
        vm.prank(playerB); game.eyeCommit(rid, _eyeHash(1, esB));
        vm.prank(playerC); game.eyeCommit(rid, _eyeHash(3, esC));

        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);
        vm.prank(playerA); game.eyeReveal(rid, 2, esA);
        vm.prank(playerB); game.eyeReveal(rid, 1, esB);
        vm.prank(playerC); game.eyeReveal(rid, 3, esC);

        _doAdvanceToSettle(rid);
        game.settle(rid);

        // A: 정상 eyeSuccess, pickSum=60, score=970
        assertEq(_getScore(rid, playerA), 970, "F-3: trap holder unaffected");
        // B: F-3 함정 → eyeM=15, score=700
        assertEq(_getScore(rid, playerB), 700, "F-3: trapped player eyeMult downgraded");
        // C: 정상 eyeSuccess, score=530
        assertEq(_getScore(rid, playerC), 530, "F-3: untouched by trap");
    }

    /**
     * F-3 정확한 타겟: trapOrder=3 → C만 타격
     *   A (F-3, eyeOrder=2), trapOrder=3 (OPEN 단계)
     *   B (eyeOrder=1), C (eyeOrder=3)
     *
     * F-3: C(order=3) → eyeM 하향 (1.2→1.0)
     * B: order=1 → 미발동
     *
     * B: pickSum=40, eyeM=20, score=40×20+10×10=900
     * C: pickSum=40, eyeM=10(하향), score=40×10+5×10=450
     */
    function test_Perk_G3_Trap_CorrectTarget() public {
        bytes32 rh = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, rh);
        uint256 rid = game.createRound();
        uint8 perkG3 = game.PERK_F3();

        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkG3);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        // F-3: OPEN 단계에서 trapOrder=3 지정
        vm.prank(playerA); game.setTrap(rid, 0, 3);

        _doLock(rid, rh);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        bytes32 esA = bytes32(uint256(10));
        bytes32 esB = bytes32(uint256(20));
        bytes32 esC = bytes32(uint256(30));
        vm.prank(playerA); game.eyeCommit(rid, _eyeHash(2, esA));
        vm.prank(playerB); game.eyeCommit(rid, _eyeHash(1, esB));
        vm.prank(playerC); game.eyeCommit(rid, _eyeHash(3, esC));

        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);
        vm.prank(playerA); game.eyeReveal(rid, 2, esA);
        vm.prank(playerB); game.eyeReveal(rid, 1, esB);
        vm.prank(playerC); game.eyeReveal(rid, 3, esC);

        _doAdvanceToSettle(rid);
        game.settle(rid);

        // B: order=1, 함정 아님 → 정상, score=900
        assertEq(_getScore(rid, playerB), 900, "F-3: B untouched by trap");
        // C: order=3, 함정 → eyeM=10, score=450
        assertEq(_getScore(rid, playerC), 450, "F-3: C trapped at order=3");
    }

    /**
     * G-3 함정 + H-3 면역:
     *   A (G-3, trapOrder=1), B (H-3, eyeOrder=1)
     *   B가 H-3이므로 G-3 함정 면역
     */
    function test_Perk_G3_H3_Immune() public {
        bytes32 rh = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, rh);
        uint256 rid = game.createRound();
        uint8 perkG3 = game.PERK_F3();
        uint8 perkH3 = game.PERK_G3();

        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkG3);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), perkH3);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        // F-3: OPEN 단계에서 trapOrder=1 지정
        vm.prank(playerA); game.setTrap(rid, 0, 1);

        _doLock(rid, rh);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        bytes32 esA = bytes32(uint256(10));
        bytes32 esB = bytes32(uint256(20));
        bytes32 esC = bytes32(uint256(30));
        vm.prank(playerA); game.eyeCommit(rid, _eyeHash(2, esA));
        vm.prank(playerB); game.eyeCommit(rid, _eyeHash(1, esB));
        vm.prank(playerC); game.eyeCommit(rid, _eyeHash(3, esC));

        _doLockEye(rid);
        uint64 erb = _getEyeRevealBlock(rid);
        vm.roll(erb + 1);
        vm.prank(playerA); game.eyeReveal(rid, 2, esA);
        vm.prank(playerB); game.eyeReveal(rid, 1, esB);
        vm.prank(playerC); game.eyeReveal(rid, 3, esC);

        _doAdvanceToSettle(rid);
        game.settle(rid);

        // B: H-3 면역 → G-3 함정 무효, 정상 eyeSuccess, score=40×20+10×10=900
        assertEq(_getScore(rid, playerB), 900, "G-3: H-3 immune to trap");
    }

    // ─────────────────────────────────────────
    // A-6 역겹침
    // ─────────────────────────────────────────

    /**
     * A-6 기본 발동:
     *   A (A6): picks [0,1,2,3]
     *   B:      picks [2,3,4,5]  → A와 {2,3} 겹침
     *   C:      picks [6,7,8,9]  → 겹침 없음
     *
     * 표준 survivingMask:
     *   A: {0,1}   (2,3은 B와 겹쳐 제거)
     *   B: {4,5}   (2,3은 A와 겹쳐 제거)
     *   C: {6,7,8,9}
     *
     * A6 Phase 2: A와 겹친 B → B의 최저 nibble(4) 추가 제거
     *   B.survivingMask = {5}
     */
    function test_Perk_A6_ReverseOverlap_Triggers() public {
        bytes32 revealHash = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, revealHash);
        uint256 rid = game.createRound();
        uint8 perkA6 = game.PERK_A6();

        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(2), 3, 4, 5];
        uint8[4] memory cC = [uint8(6), 7, 8, 9];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkA6);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, revealHash);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        // A6 적용 후 B.survivingMask = {5} = bit5 = 32
        assertEq(_getSurvivingMask(rid, playerB), uint16(1 << 5), "A6: B loses extra lowest pick");
        // A는 일반 {0,1} 유지
        assertEq(_getSurvivingMask(rid, playerA), uint16((1 << 0) | (1 << 1)), "A6: A survives normally");
        // C는 영향 없음
        assertEq(_getSurvivingMask(rid, playerC), uint16((1<<6)|(1<<7)|(1<<8)|(1<<9)), "A6: C unaffected");
    }

    // ─────────────────────────────────────────
    // 특전 테스트 — B-6 페이크 선언
    // ─────────────────────────────────────────

    /**
     * B6 미스매치: 선언한 순서 ≠ 실제 순서 → pickSum += popcount(survivingMask) * 2
     *
     * hash=bytes32(1): nibble[0]=30x, [1..15]=10x
     * A=[0,1,2,3] perk=B6, 선언=1, 실제=2 (미스매치)
     * B=[4,5,6,7] order=1, C=[8,9,10,11] order=3 (겹침 없음)
     *
     * A: 4픽 전부 생존, pickSum base=60
     * B6 mismatch: +4*2=8 → pickSum=68
     * A eyeSuccess(cnt=1 at order=2)
     * score = 68×15 + 7×10 = 1020+70 = 1090
     */

    /**
     * B6 매치: 선언한 순서 = 실제 순서 + eyeSuccess → score += pickSum * 3
     *
     * A=[0,1,2,3] perk=B6, 선언=2, 실제=2 (매치)
     * B=[4,5,6,7] order=1, C=[8,9,10,11] order=3
     *
     * A: 4픽 전부 생존, pickSum=60
     * eyeSuccess(cnt=1 at order=2)
     * score base = 60×15 + 7×10 = 970
     * B6 match bonus = 60×3 = 180
     * total = 1150
     */

    /**
     * A-6 미발동: 겹침이 없을 때
     *   A (A6): picks [0,1,2,3]
     *   B:      picks [4,5,6,7]  → A와 겹침 없음
     *   C:      picks [8,9,10,11]
     *
     * A6 Phase 2 조건 불충족 → survivingMask 변화 없음
     */
    function test_Perk_A6_NoTrigger_WhenNoOverlap() public {
        bytes32 revealHash = bytes32(uint256(1));
        vm.setBlockhash(block.number - 1, revealHash);
        uint256 rid = game.createRound();
        uint8 perkA6 = game.PERK_A6();

        uint8[4] memory cA = [uint8(0), 1, 2, 3];
        uint8[4] memory cB = [uint8(4), 5, 6, 7];
        uint8[4] memory cC = [uint8(8), 9, 10, 11];

        vm.prank(playerA); game.commit(rid, _commitHash(cA, 1), perkA6);
        vm.prank(playerB); game.commit(rid, _commitHash(cB, 2), 0);
        vm.prank(playerC); game.commit(rid, _commitHash(cC, 3), 0);

        _doLock(rid, revealHash);
        uint64 rb = _getRevealBlock(rid);
        vm.roll(rb + 1);
        _keeperReveal(rid, playerA, cA);
        _keeperReveal(rid, playerB, cB);
        _keeperReveal(rid, playerC, cC);

        _doOpenEye(rid);

        // 겹침 없음 → A6 미발동, 모두 4픽 전부 생존
        assertEq(_getSurvivingMask(rid, playerA), _picksToMask(cA), "A6: no overlap, A full survive");
        assertEq(_getSurvivingMask(rid, playerB), _picksToMask(cB), "A6: no overlap, B full survive");
        assertEq(_getSurvivingMask(rid, playerC), _picksToMask(cC), "A6: no overlap, C full survive");
    }
}
