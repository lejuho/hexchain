// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RevealVerifier.sol";

/**
 * HexChain v5 — 소수자 게임 × Keeper 커밋-리빌 × 눈치게임
 *
 * 구조:
 *   - commit()      : commitHash를 Poseidon(choices, salt) 값으로 커밋
 *   - revealFor()   : keeper가 Groth16 proof를 검증한 뒤 pickedMask 온체인 반영
 *   - eyeReveal()   : 유저가 직접 order+salt 공개 (plain keccak256 검증)
 *   - eyeRevealFor(): keeper가 유저 대신 order+salt 공개 (API 수신 후 대리)
 *   - survivingMask: nibble-value 비트마스크 (bit k = nibble k 생존)
 *
 * 흐름:
 *   1. createRound()                                       — 라운드 생성
 *   2. commit(roundId, commitHash)                         — 4픽 커밋 (Poseidon)
 *   3. lockRound(roundId)                                  — 블록 해시 확정 (LOCKED)
 *   4. revealFor(roundId, player, pA, pB, pC, pubSignals) — keeper ZK proof 검증
 *   5. openEyeGame(roundId)                                — 눈치게임 시작 (EYE_OPEN)
 *   6. eyeCommit(roundId, eyeCommitHash)                   — 눈치 순서 커밋 (keccak256)
 *   7. lockEyeRound(roundId)                               — 눈치게임 락 (EYE_LOCKED)
 *   8. eyeRevealFor(roundId, player, order, salt)          — keeper 대리 공개
 *      또는 eyeReveal(roundId, order, salt)                — 유저 직접 공개
 *   9. settle(roundId)                                     — 최종 점수 + 상금 분배
 */

contract HexChain {
    Groth16Verifier public immutable revealVerifier;

    // ─────────────────────────────────────────
    // 상수
    // ─────────────────────────────────────────

    uint8   public constant CHOICES_COUNT      = 4;
    uint8   public constant MAX_PLAYERS        = 3;
    uint8   public constant MIN_PLAYERS        = 2;

    uint256 public constant COMMIT_WINDOW      = 30;
    uint256 public constant LOCK_OFFSET        = 1;
    uint256 public constant REVEAL_WINDOW      = 30;
    uint256 public constant EYE_COMMIT_WINDOW  = 30;
    uint256 public constant EYE_REVEAL_WINDOW  = 30;
    uint256 public constant BLOCKHASH_LIMIT    = 250;

    // ─────────────────────────────────────────
    // 특전 ID (PERKS 배열 인덱스+1, 0=없음)
    // ─────────────────────────────────────────
    // Category A — 겹침 역전형 (perkId 1~6)
    uint8 public constant PERK_A1 = 1;  // 군중 속으로 — 겹침 3개+ → +0.5pt/개
    uint8 public constant PERK_A2 = 2;  // 정밀 타격  — 겹침 정확히 1개 → +1.0pt
    uint8 public constant PERK_A3 = 3;  // 쌍방 충돌  — 겹침 정확히 2개 → 배율합 pt
    uint8 public constant PERK_A4 = 4;  // 손실 제한  — 제거 픽 최고배율 절반 보전
    uint8 public constant PERK_A5 = 5;  // 최저 보장  — 생존 ≤1개 → +1.0pt
    uint8 public constant PERK_A6 = 6;  // 역겹침     — 겹침 발생 시 상대 생존 픽 1개 추가 제거
    // Category B — 눈치게임형 (perkId 7~13)
    uint8 public constant PERK_B1 = 7;  // 극단 선택자 — 1번/3번 성공 시 eyeMult +0.3
    uint8 public constant PERK_B2 = 8;  // 고독한 질주 — eyeSuccess + 빈 슬롯 → +1.5pt
    uint8 public constant PERK_B3 = 9;  // 라스트 스탠드 — 공개 단독 픽, 생존 시 ×3.0 + 최대 눈치 배수
    uint8 public constant PERK_B4 = 10; // 선제 희생   — 최고배율 픽 희생 → 겹침 완전 면제
    // PERK_B5 (보험) 삭제됨
    // PERK_B6 (페이크 선언) 삭제됨
    // PERK_B7 (픽-순서 연동) 삭제됨
    uint8 public constant PERK_B8 = 44; // 집중 도박   — 상위 2픽만 유효, 1번 단독 성공 시 ×3.5
    // Category C — 정보 교란형 (perkId 14~22)
    uint8 public constant PERK_C1 = 14; // 겹침 목록 열람 — getOverlappingNibbles() 읽기 특전
    // PERK_C4 (탈락 은폐) 삭제됨
    // PERK_C5 (선제 공개) 삭제됨
    // PERK_C8 (순서 교란) 삭제됨
    uint8 public constant PERK_C9 = 22; // 전장 혼돈 — 전원 B 특전 무력화 (구 C10)
    // Category D — 역전/도박형 (perkId 23~26)
    uint8 public constant PERK_D1 = 23; // 연승 가속  — 이전 라운드 1등 → 생존 픽당 +0.2x
    uint8 public constant PERK_D2 = 24; // 언더독     — 직전 꼴찌이면 5픽 허용 (extra pick 선언)
    uint8 public constant PERK_D3 = 25; // 올인       — ≤1 생존 픽 + 선언 시: 해시 등장 → ×1.5 보너스, 미등장 → 0.5pt
    uint8 public constant PERK_D4 = 26; // 기회주의  — 타인 눈치 포기 픽 최고배율 × 0.5
    uint8 public constant PERK_D5 = 45; // 데스페라도 — 상위 2픽 압축 + 겹침 면제, 적중 결과에 따라 보너스/페널티
    // Category E — 규칙 조작형 (perkId 27~32)
    uint8 public constant PERK_E1 = 27; // 서로소 보너스 — 4픽 서로소 → 생존 픽 +0.2x
    // PERK_E2 (소수 집중) 삭제됨
    uint8 public constant PERK_E3 = 29; // 공백 선점    — 0회 nibble 3개+ → 해당 생존 픽 +0.3x
    // PERK_E4 (레인 선언) 삭제됨
    // PERK_E5 (구간 분산) 삭제됨
    // PERK_E6 (사분면 분산) 삭제됨
    // Category F — 함정형 (perkId 33~36, 구 G)
    uint8 public constant PERK_F1 = 33; // 숫자 함정 — trapNibble 픽한 상대 해당 배율 절반
    uint8 public constant PERK_F2 = 34; // 구간 함정 — trapZone 2개+ 픽한 상대 구간 픽 전부 제거
    uint8 public constant PERK_F3 = 35; // 순서 함정 — 지정 순서 선택한 상대 포기 픽 +1
    // PERK_F4 (이중 함정) 삭제됨
    // Category G — 상태이상형 (perkId 37~43, 구 H)
    uint8 public constant PERK_G1 = 37; // 기세 차단  — 타겟 플레이어 eyeMult ×1.0 강제
    uint8 public constant PERK_G2 = 38; // 처형      — 약화된 상대(≤1픽) 같은 순서 → 처치 + orderCount 제외
    uint8 public constant PERK_G3 = 39; // 저지불가  — 상대 특전 효과 면역 (처형 포함)
    uint8 public constant PERK_G4 = 40; // 강제교환 — 타겟 최고배율 픽 ↔ 내 최저배율 픽 스왑
    // PERK_G5 (순서 선점) 삭제됨
    uint8 public constant PERK_G6 = 42; // 편승       — 타겟 플레이어 eyeMult를 자신에게 적용
    // PERK_G7 (픽미러링) 삭제됨

    // ─────────────────────────────────────────
    // 타입
    // ─────────────────────────────────────────

    enum RoundState { OPEN, LOCKED, EYE_OPEN, EYE_LOCKED, SETTLED }

    struct Round {
        bytes32    revealHash;
        uint64     startBlock;
        uint64     lockBlock;
        uint64     revealBlock;
        uint64     eyeLockBlock;
        uint64     eyeRevealBlock;
        uint16     playerCount;
        RoundState state;
    }

    /**
     * Keeper 변경:
     *   - commitHash: Poseidon 해시 값
     *   - eyeCommitHash: keccak256(order, salt) 값
     *   - pickedMask: keeper가 오프체인 검증 후 제출한 nibble 집합
     *   - survivingMask: openEyeGame()에서 온체인 계산
     */
    struct Commitment {
        uint256  commitHash;     // Poseidon(choices, salt)
        bytes32  eyeCommitHash;  // keccak256(order, salt)
        uint16   pickedMask;     // 내가 고른 nibble-value 비트마스크
        uint16   survivingMask;  // nibble-value 비트마스크 (openEyeGame()에서 계산)
        uint8    eyeOrder;       // 1, 2, 3
        uint8    perkId;         // 0=없음, 1~N=PERKS 배열 인덱스+1
        uint8    declaredOrder;  // B-6/C-6: 공개 선언 순서 (0=선언 없음)
        uint8    trapOrder;      // G-3: 함정으로 지정한 눈치 순서 (0=없음)
        uint8    trapNibble;     // G-1/G-4: 함정 nibble+1 (0=없음, 1-16=nibble 0-15)
        uint8    trapZone;       // G-2/G-4: 함정 구간 (0=없음, 1=0x0-3, 2=0x4-7, 3=0x8-b, 4=0xc-f)
        address  targetPlayer;   // H-1/H-6/H-7: 타겟 플레이어 주소 (0=없음)
        bool     revealed;
        bool     eyeRevealed;
        uint64   score;          // ×100 고정소수점
    }

    // ─────────────────────────────────────────
    // 스토리지
    // ─────────────────────────────────────────

    uint256 private _nextRoundId;

    /// @notice 마지막으로 생성된 라운드 ID (멀티룸에서는 Registry의 getOpenRounds() 사용 권장)
    function currentRoundId() external view returns (uint256) { return _nextRoundId; }

    address public immutable operator;

    mapping(uint256 => Round)                            public  rounds;
    mapping(uint256 => mapping(address => Commitment))   public  commitments;
    mapping(uint256 => mapping(uint16 => address))       private _players;

    // ─────────────────────────────────────────
    // 이벤트
    // ─────────────────────────────────────────

    event RoundCreated   (uint256 indexed roundId, uint256 startBlock, uint256 lockBlock);
    event Committed      (uint256 indexed roundId, address indexed player);
    event RoundLocked    (uint256 indexed roundId, bytes32 revealHash);
    event Revealed       (uint256 indexed roundId, address indexed player);
    event EyeGameOpened  (uint256 indexed roundId, uint64 eyeLockBlock);
    event EyeCommitted   (uint256 indexed roundId, address indexed player);
    event EyeGameLocked  (uint256 indexed roundId);
    event EyeRevealed    (uint256 indexed roundId, address indexed player, uint8 order);
    event Settled        (uint256 indexed roundId, address[3] top3, uint64[3] scores);
    event ScoreBreakdownLogged(
        uint256 indexed roundId,
        address indexed player,
        uint16 finalMask,
        uint16 removedMask,
        uint16 basePickSumX10,
        uint16 eyeAppliedScoreX100,
        int32 adjustmentX100,
        uint8 effectivePerk,
        bool eyeSuccess
    );
    event RoundCancelled (uint256 indexed roundId, address indexed by);

    // ─────────────────────────────────────────
    // 에러
    // ─────────────────────────────────────────

    error RoundNotOpen();
    error RoundNotLocked();
    error RoundNotEyeOpen();
    error RoundNotEyeLocked();
    error CommitWindowClosed();
    error RevealWindowClosed();
    error EyeCommitWindowClosed();
    error EyeRevealWindowClosed();
    error AlreadyCommitted();
    error AlreadyRevealed();
    error AlreadyEyeCommitted();
    error AlreadyEyeRevealed();
    error NotCommitted();
    error NotParticipant();
    error MaxPlayersReached();
    error HashNotAvailable();
    error HashExpired();
    error NotOperator();
    error InvalidZKProof();
    error CommitHashMismatch();
    error InvalidEyeOrder();
    error InvalidTrap();
    error InvalidTarget();
    error InvalidEyeReveal();
    error TooEarlyToLock();
    error TooEarlyToOpenEye();
    error TooEarlyToLockEye();
    error TooEarlyToSettle();
    error NothingToSettle();
    error NotEnoughPlayers();
    error RoundNotExpired();
    error NotPerkHolder();
    // ─────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────

    constructor(address _revealVerifier) {
        operator = msg.sender;
        revealVerifier = Groth16Verifier(_revealVerifier);
    }

    // ─────────────────────────────────────────
    // 1. 라운드 생성
    // ─────────────────────────────────────────

    function createRound() external returns (uint256 roundId) {
        roundId = ++_nextRoundId;
        uint64 start       = uint64(block.number);
        uint64 lock        = start + uint64(COMMIT_WINDOW);
        uint64 revealBlock = lock  + uint64(LOCK_OFFSET);

        // 직전 블록 해시로 nibble 배율 즉시 확정 — 커밋 전부터 공개
        bytes32 h = blockhash(block.number - 1);

        rounds[roundId] = Round({
            revealHash:     h,
            startBlock:     start,
            lockBlock:      lock,
            revealBlock:    revealBlock,
            eyeLockBlock:   0,
            eyeRevealBlock: 0,
            playerCount:    0,
            state:          RoundState.OPEN
        });

        emit RoundCreated(roundId, start, lock);
    }

    // ─────────────────────────────────────────
    // 2. Commit — 4픽 봉인 (Poseidon 해시)
    // ─────────────────────────────────────────

    function commit(uint256 roundId, uint256 commitHash, uint8 perkId) external {
        Round storage r = rounds[roundId];

        if (r.startBlock == 0)                              revert RoundNotOpen();
        if (r.state != RoundState.OPEN)                     revert RoundNotOpen();
        if (block.number > r.lockBlock)                     revert CommitWindowClosed();
        if (r.playerCount >= MAX_PLAYERS)                   revert MaxPlayersReached();
        if (commitments[roundId][msg.sender].commitHash != 0) revert AlreadyCommitted();

        commitments[roundId][msg.sender] = Commitment({
            commitHash:     commitHash,
            eyeCommitHash:  bytes32(0),
            pickedMask:     0,
            survivingMask:  0,
            eyeOrder:       0,
            perkId:         perkId,
            declaredOrder:  0,
            trapOrder:      0,
            trapNibble:     0,
            trapZone:       0,
            targetPlayer:   address(0),
            revealed:       false,
            eyeRevealed:    false,
            score:          0
        });

        _players[roundId][r.playerCount] = msg.sender;
        unchecked { r.playerCount++; }

        emit Committed(roundId, msg.sender);
    }

    // ─────────────────────────────────────────
    // 2-b. B-3 라스트 스탠드 커밋 — ZK 없이 단독 픽을 즉시 공개 커밋
    // ─────────────────────────────────────────

    function commitB3(uint256 roundId, uint8 nibble) external {
        Round storage r = rounds[roundId];

        if (r.startBlock == 0)                                               revert RoundNotOpen();
        if (r.state != RoundState.OPEN)                                      revert RoundNotOpen();
        if (block.number > r.lockBlock)                                      revert CommitWindowClosed();
        if (r.playerCount >= MAX_PLAYERS)                                    revert MaxPlayersReached();
        if (commitments[roundId][msg.sender].commitHash != 0)                revert AlreadyCommitted();
        if (nibble > 15)                                                     revert InvalidTrap();

        // commitHash sentinel = type(uint256).max (B3 식별)
        // pickedMask 즉시 공개, revealed = true
        commitments[roundId][msg.sender] = Commitment({
            commitHash:    type(uint256).max,
            eyeCommitHash: bytes32(0),
            pickedMask:    uint16(1) << nibble,
            survivingMask: 0,
            eyeOrder:      0,
            perkId:        PERK_B3,
            declaredOrder: 0,
            trapOrder:     0,
            trapNibble:    nibble + 1, // 선언 nibble 저장 (1-16)
            trapZone:      0,
            targetPlayer:  address(0),
            revealed:      true,      // 공개됨 — 즉시 공개
            eyeRevealed:   false,
            score:         0
        });

        _players[roundId][r.playerCount] = msg.sender;
        unchecked { r.playerCount++; }

        emit Committed(roundId, msg.sender);
    }

    // ─────────────────────────────────────────
    // 3. Lock — 블록 해시 확정
    // ─────────────────────────────────────────

    function lockRound(uint256 roundId) external {
        Round storage r = rounds[roundId];

        if (r.state != RoundState.OPEN)             revert RoundNotOpen();
        if (block.number <= r.revealBlock)           revert TooEarlyToLock();
        if (r.playerCount < MIN_PLAYERS)             revert NotEnoughPlayers();

        r.state = RoundState.LOCKED;
        emit RoundLocked(roundId, r.revealHash);
    }

    // ─────────────────────────────────────────
    // 4. Reveal — keeper가 ZK proof로 pickedMask 검증 후 온체인 반영
    //
    //    pubSignals[0] = commitHash  (poseidon(choices, salt))
    //    pubSignals[1] = pickedMask  (비트마스크, uint16 범위)
    // ─────────────────────────────────────────

    /// @notice 자기 자신은 누구나 호출 가능. 타인 대리는 operator만.
    function revealFor(
        uint256           roundId,
        address           player,
        uint[2]    calldata pA,
        uint[2][2] calldata pB,
        uint[2]    calldata pC,
        uint[2]    calldata pubSignals   // [commitHash, pickedMask]
    ) external {
        if (player != msg.sender && msg.sender != operator) revert NotOperator();

        Round      storage r  = rounds[roundId];
        Commitment storage cm = commitments[roundId][player];

        if (r.state != RoundState.LOCKED)                  revert RoundNotLocked();
        if (block.number > r.revealBlock + REVEAL_WINDOW)  revert RevealWindowClosed();
        if (cm.commitHash == 0)                            revert NotCommitted();
        if (cm.revealed) {
            if (cm.perkId == PERK_B3) return; // B3: 이미 자가 공개됨, 무시
            revert AlreadyRevealed();
        }

        if (!revealVerifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidZKProof();
        if (pubSignals[0] != cm.commitHash) revert CommitHashMismatch();

        cm.pickedMask = uint16(pubSignals[1]);
        cm.revealed   = true;
        emit Revealed(roundId, player);
    }

    // ─────────────────────────────────────────
    // 5. Open Eye Game — 눈치게임 시작
    //    survivingMask는 reveal된 pickedMask들로 온체인 계산
    // ─────────────────────────────────────────

    function openEyeGame(uint256 roundId) external {
        Round storage r = rounds[roundId];

        if (r.state != RoundState.LOCKED)                  revert RoundNotLocked();
        if (block.number <= r.revealBlock + REVEAL_WINDOW) revert TooEarlyToOpenEye();

        _finalizeSurvivingMasks(roundId, r.playerCount);

        uint64 eyeLock        = uint64(block.number) + uint64(EYE_COMMIT_WINDOW);
        uint64 eyeRevealBlock = eyeLock + uint64(LOCK_OFFSET);

        r.eyeLockBlock   = eyeLock;
        r.eyeRevealBlock = eyeRevealBlock;
        r.state          = RoundState.EYE_OPEN;
        emit EyeGameOpened(roundId, eyeLock);
    }

    // ─────────────────────────────────────────
    // 6. Eye Commit — 눈치 순서 봉인 (keccak256 해시)
    // ─────────────────────────────────────────

    function eyeCommit(uint256 roundId, bytes32 eyeCommitHash) external {
        Round      storage r  = rounds[roundId];
        Commitment storage cm = commitments[roundId][msg.sender];

        if (r.state != RoundState.EYE_OPEN)   revert RoundNotEyeOpen();
        if (block.number > r.eyeLockBlock)    revert EyeCommitWindowClosed();
        if (cm.commitHash == 0)               revert NotCommitted();
        if (cm.eyeCommitHash != bytes32(0))   revert AlreadyEyeCommitted();

        cm.eyeCommitHash = eyeCommitHash;
        emit EyeCommitted(roundId, msg.sender);
    }

    // ─────────────────────────────────────────
    // 6-b. F-1/F-3 함정 선언 — OPEN 페이즈 (커밋 후)
    //      F-1: trapNibble 지정 (1-16 = nibble값+1)
    //      F-3: trapOrder 지정 (1-3 = 눈치게임 순서)
    //      F-2: 별도 선언 없음 — settle 시 pickedMask에서 랜덤 구간 자동 선택
    // ─────────────────────────────────────────

    function setTrap(uint256 roundId, uint8 trapNibble, uint8 trapOrder) external {
        Round      storage r  = rounds[roundId];
        Commitment storage cm = commitments[roundId][msg.sender];

        if (r.state != RoundState.OPEN)          revert RoundNotOpen();
        if (block.number > r.lockBlock)          revert CommitWindowClosed();
        if (cm.commitHash == 0)                  revert NotCommitted();
        if (cm.perkId != PERK_F1 && cm.perkId != PERK_F3)
            revert NotPerkHolder();
        if (cm.perkId == PERK_F1) {
            if (trapNibble == 0 || trapNibble > 16) revert InvalidTrap();
            cm.trapNibble = trapNibble;
        }
        if (cm.perkId == PERK_F3) {
            if (trapOrder == 0 || trapOrder > 3) revert InvalidEyeOrder();
            cm.trapOrder = trapOrder;
        }
    }

    // ─────────────────────────────────────────
    // 6-c-2. D-3 올인 선언 — OPEN 페이즈 (커밋 후)
    // ─────────────────────────────────────────

    function declareAllIn(uint256 roundId, uint8 guessNibble) external {
        Round      storage r  = rounds[roundId];
        Commitment storage cm = commitments[roundId][msg.sender];

        if (r.state != RoundState.OPEN)     revert RoundNotOpen();
        if (block.number > r.lockBlock)     revert CommitWindowClosed();
        if (cm.commitHash == 0)             revert NotCommitted();
        if (cm.perkId != PERK_D3)           revert NotPerkHolder();
        if (guessNibble > 15)               revert InvalidTrap();

        cm.trapNibble = guessNibble + 1; // 1-16 (0=미선언)
    }

    // ─────────────────────────────────────────
    // 6-c-3. D-2 언더독 추가 픽 선언 — OPEN 페이즈 (커밋 후)
    // ─────────────────────────────────────────

    function declareExtraPick(uint256 roundId, uint8 extraNibble) external {
        Round      storage r  = rounds[roundId];
        Commitment storage cm = commitments[roundId][msg.sender];

        if (r.state != RoundState.OPEN)     revert RoundNotOpen();
        if (block.number > r.lockBlock)     revert CommitWindowClosed();
        if (cm.commitHash == 0)             revert NotCommitted();
        if (cm.perkId != PERK_D2)           revert NotPerkHolder();
        if (extraNibble > 15)               revert InvalidTrap();

        cm.trapNibble = extraNibble + 1; // 1-16 (0=미선언)
    }

    // ─────────────────────────────────────────
    // 6-d. H-1/H-4/H-6/H-7/C-9 타겟 지정 — EYE_OPEN 페이즈
    // ─────────────────────────────────────────

    // ─────────────────────────────────────────
    // 7. Lock Eye Round — Keeper 호출
    // ─────────────────────────────────────────

    function lockEyeRound(uint256 roundId) external {
        Round storage r = rounds[roundId];

        if (r.state != RoundState.EYE_OPEN)                        revert RoundNotEyeOpen();
        if (block.number <= r.eyeRevealBlock)                      revert TooEarlyToLockEye();
        if (block.number > r.eyeRevealBlock + BLOCKHASH_LIMIT)     revert HashExpired();

        r.state = RoundState.EYE_LOCKED;
        emit EyeGameLocked(roundId);
    }

    // ─────────────────────────────────────────
    // 8. Eye Reveal — order + salt로 커밋 해시 공개
    // ─────────────────────────────────────────

    function eyeReveal(uint256 roundId, uint8 order, bytes32 salt) external {
        Round      storage r  = rounds[roundId];
        Commitment storage cm = commitments[roundId][msg.sender];

        if (r.state != RoundState.EYE_LOCKED)                      revert RoundNotEyeLocked();
        if (block.number > r.eyeRevealBlock + EYE_REVEAL_WINDOW)   revert EyeRevealWindowClosed();
        if (cm.eyeCommitHash == bytes32(0))                         revert NotCommitted();
        if (cm.eyeRevealed)                                         revert AlreadyEyeRevealed();
        if (order == 0 || order > 3)                                revert InvalidEyeOrder();
        if (keccak256(abi.encodePacked(order, salt)) != cm.eyeCommitHash) revert InvalidEyeReveal();

        cm.eyeOrder    = order;
        cm.eyeRevealed = true;
        emit EyeRevealed(roundId, msg.sender, order);
    }

    // ─────────────────────────────────────────
    // 8-b. Eye Reveal For — keeper가 유저 대신 공개
    //      유저가 API로 전달한 order+salt를 keeper가 제출
    // ─────────────────────────────────────────

    function eyeRevealFor(
        uint256 roundId,
        address player,
        uint8   order,
        bytes32 salt
    ) external {
        if (msg.sender != operator) revert NotOperator();

        Round      storage r  = rounds[roundId];
        Commitment storage cm = commitments[roundId][player];

        if (r.state != RoundState.EYE_LOCKED)                      revert RoundNotEyeLocked();
        if (block.number > r.eyeRevealBlock + EYE_REVEAL_WINDOW)   revert EyeRevealWindowClosed();
        if (cm.eyeCommitHash == bytes32(0))                         revert NotCommitted();
        if (cm.eyeRevealed)                                         revert AlreadyEyeRevealed();
        if (order == 0 || order > 3)                                revert InvalidEyeOrder();
        if (keccak256(abi.encodePacked(order, salt)) != cm.eyeCommitHash) revert InvalidEyeReveal();

        cm.eyeOrder    = order;
        cm.eyeRevealed = true;
        emit EyeRevealed(roundId, player, order);
    }

    // ─────────────────────────────────────────
    // 9. Settle — 최종 점수 + 상금 분배
    // ─────────────────────────────────────────

    function settle(uint256 roundId) external {
        Round storage r = rounds[roundId];

        if (r.state != RoundState.EYE_LOCKED)                             revert RoundNotEyeLocked();
        if (block.number <= r.eyeRevealBlock + EYE_REVEAL_WINDOW)         revert TooEarlyToSettle();
        if (r.playerCount == 0)                                            revert NothingToSettle();

        _computeEyeOverlapAndScore(roundId, r.revealHash, r.playerCount);

        (address[3] memory top3, uint64[3] memory top3Scores) =
            _getTop3(roundId, r.playerCount);

        r.state = RoundState.SETTLED;
        emit Settled(roundId, top3, top3Scores);
    }

    // ─────────────────────────────────────────
    // Internal — reveal된 pickedMask로 survivingMask 확정
    // ─────────────────────────────────────────

    function _finalizeSurvivingMasks(uint256 roundId, uint16 playerCount) internal {
        // D-2 언더독: 직전 꼴찌이면 선언한 extra pick을 pickedMask에 추가 (겹침 계산 전)
        if (roundId > 1) {
            for (uint16 i = 0; i < playerCount; i++) {
                address p = _players[roundId][i];
                Commitment storage cm = commitments[roundId][p];
                if (cm.perkId != PERK_D2 || cm.trapNibble == 0 || !cm.revealed) continue;
                if (_wasLastScorer(roundId - 1, p)) {
                    cm.pickedMask |= uint16(1) << (cm.trapNibble - 1);
                }
            }
        }

        // Phase 1: 표준 겹침 제거
        for (uint16 i = 0; i < playerCount; i++) {
            address p = _players[roundId][i];
            Commitment storage cm = commitments[roundId][p];
            if (!cm.revealed) continue;

            uint16 othersMask = 0;
            for (uint16 j = 0; j < playerCount; j++) {
                if (i == j) continue;
                Commitment storage other = commitments[roundId][_players[roundId][j]];
                if (!other.revealed) continue;
                othersMask |= other.pickedMask;
            }
            cm.survivingMask = cm.pickedMask & ~othersMask;
        }

        // Phase 2: A-6 역겹침 — 겹침 발생 시 상대 생존 픽 1개 추가 제거
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmA6 = commitments[roundId][_players[roundId][i]];
            if (cmA6.perkId != PERK_A6 || !cmA6.revealed) continue;
            if ((cmA6.pickedMask & ~cmA6.survivingMask) == 0) continue; // 겹침 없음 → 발동 안 함

            for (uint16 j = 0; j < playerCount; j++) {
                if (i == j) continue;
                Commitment storage tgt = commitments[roundId][_players[roundId][j]];
                if (!tgt.revealed) continue;
                if (tgt.perkId == PERK_G3) continue; // H-3 저지불가: A6 역겹침 면역
                // 나와 겹친 상대 = 공통 픽이 있는 플레이어
                if (cmA6.pickedMask & tgt.pickedMask == 0) continue;
                if (tgt.survivingMask == 0) continue; // 이미 전멸
                // 생존 픽 중 가장 낮은 nibble value 1개 추가 제거
                tgt.survivingMask = _removeLowestNibble(tgt.survivingMask);
            }
        }
    }

    // ─────────────────────────────────────────
    // Internal — 눈치게임 겹침 처리 + 최종 점수
    //   survivingMask = openEyeGame()에서 확정된 비트마스크
    // ─────────────────────────────────────────

    function _computeEyeOverlapAndScore(
        uint256 roundId,
        bytes32 revealHash,
        uint16  playerCount
    ) internal {
        uint8[16] memory nibbleMult = _computeNibbleMult(revealHash);

        // ── G-1 기세 차단 사전 계산 ───────────────────────────────────
        // 차단된 플레이어의 eyeMult를 ×1.0 강제; H-3 보유자는 면역
        // targetPlayer == 0 이면 랜덤 1명 자동 선택
        bool[] memory eyeBlocked = new bool[](playerCount);
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmH1 = commitments[roundId][_players[roundId][i]];
            if (cmH1.perkId != PERK_G1) continue;
            uint16 tgtIdx;
            if (cmH1.targetPlayer != address(0)) {
                bool found = false;
                for (uint16 j = 0; j < playerCount; j++) {
                    if (_players[roundId][j] == cmH1.targetPlayer) { tgtIdx = j; found = true; break; }
                }
                if (!found) continue;
            } else {
                tgtIdx = _randomOpponentIdx(i, playerCount, revealHash);
            }
            if (commitments[roundId][_players[roundId][tgtIdx]].perkId == PERK_G3) continue;
            eyeBlocked[tgtIdx] = true;
        }

        // ── C-10 전장 혼돈 사전 계산 ─────────────────────────────────────
        // C10 보유자(H-1 봉쇄 없음)가 한 명이라도 있으면 전원 B 특전 무력화
        // H-3 보유자는 면역
        bool[] memory isBShuffled = new bool[](playerCount);
        bool c10Active = false;
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmC10 = commitments[roundId][_players[roundId][i]];
            if (cmC10.perkId != PERK_C9) continue;
            c10Active = true;
            break;
        }
        if (c10Active) {
            for (uint16 j = 0; j < playerCount; j++) {
                if (commitments[roundId][_players[roundId][j]].perkId == PERK_G3) continue;
                isBShuffled[j] = true;
            }
        }

        // 눈치게임 순서별 선택자 수
        uint8[4] memory orderCount; // index 1,2,3 사용
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cm = commitments[roundId][_players[roundId][i]];
            if (cm.eyeRevealed) orderCount[cm.eyeOrder]++;
        }

        // (G-2 처형은 Phase 1 충돌 이후로 이동 — 충돌 결과로 1픽 남은 상대를 연쇄 처형)

        // B-2: 순서 1~3 중 아무도 선택 안 한 빈 슬롯 여부 (pre-pass 이후 계산)
        bool hasEmptySlot = (orderCount[1] == 0 || orderCount[2] == 0 || orderCount[3] == 0);

        // ── Phase 1: 겹침 처리 → finalMasks / eyeSuccesses ─────────────
        // D-4가 "눈치 포기 픽"을 참조할 수 있도록 결과를 미리 확정
        uint16[3] memory finalMasks;
        bool[3]   memory eyeSuccesses;
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cm = commitments[roundId][_players[roundId][i]];
            if (!cm.revealed) continue;

            uint16 mask = cm.survivingMask;
            bool eyeSuccess = false;

            if (cm.eyeRevealed) {
                uint8 cnt = orderCount[cm.eyeOrder];
                if (cm.perkId == PERK_B4) {
                    // B-4 선제 희생: 최고배율 픽 1개 희생 → 겹침 완전 면제
                    mask = _forfeitHighestPick(mask, nibbleMult);
                    eyeSuccess = true;
                } else if (cnt > 1) {
                    mask = _forfeitLowestPicks(mask, nibbleMult, cnt - 1);
                } else {
                    eyeSuccess = true;
                }
            }
            finalMasks[i]    = mask;
            eyeSuccesses[i]  = eyeSuccess;
        }

        // ── F-3 순서 함정: 지정 순서 선택자 eyeMult 1단계 하향
        //   1번(×2.0→×1.5) / 2번(×1.5→×1.2) / 3번(×1.2→×1.0)
        //   eyeSuccess 자체는 유지, 배수만 감소
        bool[] memory f3Penalized = new bool[](playerCount);
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmF3 = commitments[roundId][_players[roundId][i]];
            if (cmF3.perkId != PERK_F3 || !cmF3.eyeRevealed || cmF3.trapOrder == 0) continue;
            for (uint16 j = 0; j < playerCount; j++) {
                if (i == j) continue;
                Commitment storage tgt = commitments[roundId][_players[roundId][j]];
                if (!tgt.eyeRevealed || !tgt.revealed) continue;
                if (tgt.eyeOrder != cmF3.trapOrder) continue;
                if (tgt.perkId == PERK_G3) continue;
                f3Penalized[j] = true;
            }
        }

        // ── G-1/G-6용 effectiveEyeM 사전 계산 ─────────────────────────
        // eyeBlocked: ×1.0 강제 / f3Penalized: 1단계 하향 / 나머지: 정상 배수
        uint8[] memory effectiveEyeM = new uint8[](playerCount);
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmEye = commitments[roundId][_players[roundId][i]];
            if (eyeBlocked[i]) {
                effectiveEyeM[i] = 10;
            } else if (f3Penalized[i]) {
                effectiveEyeM[i] = _eyeMultDowngrade(cmEye.eyeOrder);
            } else {
                effectiveEyeM[i] = _eyeMult(cmEye.eyeOrder);
            }
        }

        // ── F-2 구간 함정: 설치자 pickedMask에서 랜덤 1구간 선택 →
        //   그 구간에서 2개+ 픽한 상대 구간 픽 전부 제거.
        //   전원 불발 시 설치자도 해당 구간 픽 1개 제거.
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmF2 = commitments[roundId][_players[roundId][i]];
            if (cmF2.perkId != PERK_F2 || !cmF2.revealed) continue;

            // 설치자의 픽이 존재하는 구간 목록 수집
            uint8[4] memory zones;
            uint8 zoneCount = 0;
            for (uint8 z = 1; z <= 4; z++) {
                if (_countPicksInZone(cmF2.pickedMask, z) > 0) zones[zoneCount++] = z;
            }
            if (zoneCount == 0) continue;

            // 랜덤 1구간 선택
            uint8 trapZone = zones[uint8(uint256(keccak256(abi.encodePacked(revealHash, i))) % zoneCount)];

            bool anyHit = false;
            for (uint16 j = 0; j < playerCount; j++) {
                if (i == j) continue;
                Commitment storage tgt = commitments[roundId][_players[roundId][j]];
                if (!tgt.revealed) continue;
                if (tgt.perkId == PERK_G3) continue;
                if (finalMasks[j] == 0) continue;
                if (_countPicksInZone(tgt.pickedMask, trapZone) < 2) continue;
                finalMasks[j]   = _removePicksInZone(finalMasks[j], trapZone);
                eyeSuccesses[j] = false;
                anyHit = true;
            }
            // 전원 불발 시 설치자도 해당 구간 픽 1개 제거
            if (!anyHit) {
                finalMasks[i] = _removeLowestNibbleInZone(finalMasks[i], trapZone);
            }
        }

        // ── H-4 강제교환: H7 직후, Phase 2 전 ─────────────────────────────
        // H4 보유자의 최저배율 생존 픽 ↔ 타겟의 최고배율 생존 픽 스왑
        // targetPlayer == 0 이면 랜덤 1명 자동 선택
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmH4 = commitments[roundId][_players[roundId][i]];
            if (cmH4.perkId != PERK_G4) continue;
            uint16 j = cmH4.targetPlayer != address(0)
                ? _findPlayerIdx(roundId, playerCount, cmH4.targetPlayer)
                : _randomOpponentIdx(i, playerCount, revealHash);
            if (j == type(uint16).max) continue;
            Commitment storage tgtH4 = commitments[roundId][_players[roundId][j]];
            if (tgtH4.perkId == PERK_G3) continue; // H-3 면역
            if (finalMasks[j] == 0 || finalMasks[i] == 0) continue;
            // 타겟의 최고배율 픽 찾기
            uint8 tgtBest = 255; uint8 tgtBestMult = 0;
            for (uint8 k = 0; k < 16; k++) {
                if (finalMasks[j] & (uint16(1) << k) != 0 && nibbleMult[k] > tgtBestMult) {
                    tgtBestMult = nibbleMult[k]; tgtBest = k;
                }
            }
            // 내 최저배율 픽 찾기
            uint8 myWorst = 255; uint8 myWorstMult = 255;
            for (uint8 k = 0; k < 16; k++) {
                if (finalMasks[i] & (uint16(1) << k) != 0 && nibbleMult[k] < myWorstMult) {
                    myWorstMult = nibbleMult[k]; myWorst = k;
                }
            }
            if (tgtBest == 255 || myWorst == 255) continue;
            if (tgtBestMult <= myWorstMult) continue; // 이득 없으면 불발
            // 스왑
            finalMasks[j] &= ~(uint16(1) << tgtBest);
            finalMasks[j] |=  (uint16(1) << myWorst);
            finalMasks[i] &= ~(uint16(1) << myWorst);
            finalMasks[i] |=  (uint16(1) << tgtBest);
        }

        // ── G-2 처형 패스 (Phase 1 충돌 이후) ──────────────────────────
        // 같은 eyeOrder + finalMask ≤ 1픽인 상대(primary) 전부 처형.
        // primary가 1명 이상 존재하면 같은 순서의 ≤ 2픽 상대(chain)도 연쇄 처형.
        // 처형 성공 시: 잃은 픽 배율 합 × 0.5 pickSum 보전 + 킬 보너스.
        uint32[] memory g2LostSum = new uint32[](playerCount);
        uint8[]  memory g2Kills   = new uint8[](playerCount);
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmG2 = commitments[roundId][_players[roundId][i]];
            if (cmG2.perkId != PERK_G2 || !cmG2.eyeRevealed) continue;

            // 1차: primary(≤1픽) 처형 및 존재 여부 확인
            bool hasPrimary = false;
            for (uint16 j = 0; j < playerCount; j++) {
                if (i == j) continue;
                Commitment storage tgt = commitments[roundId][_players[roundId][j]];
                if (!tgt.eyeRevealed || !tgt.revealed) continue;
                if (tgt.eyeOrder != cmG2.eyeOrder) continue;
                if (tgt.perkId == PERK_G3) continue;
                if (_popcount16(finalMasks[j]) > 1) continue;
                finalMasks[j] = 0;
                eyeSuccesses[j] = false;
                g2Kills[i]++;
                hasPrimary = true;
            }
            // 2차: primary가 있었으면 ≤2픽 상대도 연쇄 처형
            if (hasPrimary) {
                for (uint16 j = 0; j < playerCount; j++) {
                    if (i == j) continue;
                    Commitment storage tgt2 = commitments[roundId][_players[roundId][j]];
                    if (!tgt2.eyeRevealed || !tgt2.revealed) continue;
                    if (tgt2.eyeOrder != cmG2.eyeOrder) continue;
                    if (tgt2.perkId == PERK_G3) continue;
                    if (finalMasks[j] == 0) continue; // 이미 처형됨
                    if (_popcount16(finalMasks[j]) > 2) continue;
                    finalMasks[j] = 0;
                    eyeSuccesses[j] = false;
                    g2Kills[i]++;
                }
            }
            // 보전용: 충돌로 잃은 픽 배율 합 계산
            uint16 lostMask = cmG2.survivingMask & ~finalMasks[i];
            for (uint8 k = 0; k < 16; k++) {
                if (lostMask & (uint16(1) << k) != 0) g2LostSum[i] += nibbleMult[k];
            }
        }

        // ── D-5 데스페라도: pickedMask에서 상위 2픽으로 압축 + nibble/눈치 겹침 완전 면제 ──
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmD5 = commitments[roundId][_players[roundId][i]];
            if (cmD5.perkId != PERK_D5) continue;
            // nibble겹침·눈치충돌 모두 면제: 원래 4픽(pickedMask)에서 시작
            finalMasks[i] = cmD5.pickedMask;
            eyeSuccesses[i] = cmD5.eyeRevealed && orderCount[cmD5.eyeOrder] == 1;
            // 상위 2픽으로 압축
            while (_popcount16(finalMasks[i]) > 2) {
                uint8 worstNibble = 255; uint8 worstMult = 255;
                for (uint8 k = 0; k < 16; k++) {
                    if (finalMasks[i] & (uint16(1) << k) != 0 && nibbleMult[k] < worstMult) {
                        worstMult = nibbleMult[k]; worstNibble = k;
                    }
                }
                if (worstNibble == 255) break;
                finalMasks[i] &= ~(uint16(1) << worstNibble);
            }
        }

        // ── B-8 집중 도박: finalMasks를 상위 2픽으로 압축 ──────────────
        for (uint16 i = 0; i < playerCount; i++) {
            Commitment storage cmB8 = commitments[roundId][_players[roundId][i]];
            if (cmB8.perkId != PERK_B8) continue;
            // 최저배율 픽을 반복 제거해 2픽만 남김
            while (_popcount16(finalMasks[i]) > 2) {
                uint8 worstNibble = 255;
                uint8 worstMult   = 255;
                for (uint8 k = 0; k < 16; k++) {
                    if (finalMasks[i] & (uint16(1) << k) != 0 && nibbleMult[k] < worstMult) {
                        worstMult = nibbleMult[k]; worstNibble = k;
                    }
                }
                if (worstNibble == 255) break;
                finalMasks[i] &= ~(uint16(1) << worstNibble);
            }
        }

        // ── Phase 2: 점수 계산 ──────────────────────────────────────────
        for (uint16 i = 0; i < playerCount; i++) {
            address    p  = _players[roundId][i];
            Commitment storage cm = commitments[roundId][p];
            if (!cm.revealed) continue;

            // B-3 라스트 스탠드: 겹침→0점, 생존→×3.0 + 최대 눈치 배수, 일반 스코어링 생략
            if (cm.perkId == PERK_B3) {
                if (finalMasks[i] == 0) {
                    cm.score = 0;
                    emit ScoreBreakdownLogged(roundId, p, finalMasks[i], cm.pickedMask, 0, 0, 0, PERK_B3, false);
                } else {
                    uint8 nibbleB3 = 0;
                    for (uint8 k3 = 0; k3 < 16; k3++) {
                        if (finalMasks[i] & (uint16(1) << k3) != 0) { nibbleB3 = k3; break; }
                    }
                    cm.score = uint64(nibbleMult[nibbleB3]) * 3 * _eyeMult(1) / 10;
                    emit ScoreBreakdownLogged(
                        roundId,
                        p,
                        finalMasks[i],
                        0,
                        uint16(nibbleMult[nibbleB3] * 3),
                        uint16(cm.score),
                        0,
                        PERK_B3,
                        true
                    );
                }
                continue;
            }

            uint16 mask       = finalMasks[i];
            bool   eyeSuccess = eyeSuccesses[i];

            // 유효 특전 결정
            uint8 effectivePerk = cm.perkId;

            // C9 순서 교란: B 특전 무력화 (perkId 7~13 범위 + B8)
            if (isBShuffled[i] && (
                    (effectivePerk >= PERK_B1 && effectivePerk <= 13) ||
                    effectivePerk == PERK_B8)) {
                effectivePerk = 0;
            }

            // 생존 nibble 점수합 (×10), G-1/G-4 nibble 함정 배율 절반 적용
            uint32 pickSum = 0;
            for (uint8 k = 0; k < 16; k++) {
                if (mask & (uint16(1) << k) == 0) continue;
                pickSum += nibbleMult[k];
            }

            // F-1 숫자 함정: 함정 nibble을 픽한 경우 생존 픽 전체 배율 -0.3 (×10 단위 -3)
            if (cm.perkId != PERK_G3) {
                for (uint16 gi = 0; gi < playerCount; gi++) {
                    if (gi == i) continue;
                    Commitment storage cmF1 = commitments[roundId][_players[roundId][gi]];
                    if (cmF1.perkId != PERK_F1 || cmF1.trapNibble == 0) continue;
                    if ((cm.pickedMask & (uint16(1) << (cmF1.trapNibble - 1))) == 0) continue;
                    uint32 penalty = uint32(_popcount16(mask)) * 3;
                    pickSum = pickSum > penalty ? pickSum - penalty : 0;
                    break;
                }
            }

            // D-1 연승 가속: 이전 라운드 1등이었으면 생존 픽당 +0.2x
            if (effectivePerk == PERK_D1 && roundId > 1 && _wasTopScorer(roundId - 1, p)) {
                pickSum += uint32(_popcount16(mask)) * 2;
            }

            // ── E 계열: pickSum 보정 (eye 배율 곱 전에 적용) ──────────
            // E-1 서로소 보너스: 4픽 전부 서로소 → 생존 픽당 +0.4x
            if (effectivePerk == PERK_E1 && _allCoprime(cm.pickedMask)) {
                pickSum += uint32(_popcount16(mask)) * 4;
            }
            // E-3 공백 선점: 0회 nibble 3개+ → 생존 zero-nibble 픽당 +0.5x
            if (effectivePerk == PERK_E3) {
                uint8 zeroPickCnt = 0;
                uint8 zeroSurvCnt = 0;
                for (uint8 k = 0; k < 16; k++) {
                    if (nibbleMult[k] == 10) {
                        if (cm.pickedMask & (uint16(1) << k) != 0) zeroPickCnt++;
                        if (mask          & (uint16(1) << k) != 0) zeroSurvCnt++;
                    }
                }
                if (zeroPickCnt >= 3) pickSum += uint32(zeroSurvCnt) * 5;
            }

            // 최종 점수 (×100)
            uint64 score;
            uint64 eyeAppliedScore;
            if (eyeSuccess) {
                // G-1 기세 차단: eyeBlocked → ×1.0 강제
                // G-6 편승: 타겟 effectiveEyeM 사용 (G-3 면역)
                // F-3 순서 함정: eyeMult 1단계 하향은 effectiveEyeM에 사전 반영됨
                uint8 eyeM = effectiveEyeM[i];
                if (cm.perkId == PERK_G6) {
                    uint16 g6TgtIdx = cm.targetPlayer != address(0)
                        ? _findPlayerIdx(roundId, playerCount, cm.targetPlayer)
                        : _randomOpponentIdx(i, playerCount, revealHash);
                    if (g6TgtIdx != type(uint16).max &&
                            commitments[roundId][_players[roundId][g6TgtIdx]].perkId != PERK_G3) {
                        eyeM = effectiveEyeM[g6TgtIdx];
                    }
                }
                // B-8 집중 도박: 1번 단독 성공 시 ×3.5 (G1 차단·F3 함정 우선)
                if (effectivePerk == PERK_B8 && cm.eyeOrder == 1 && !eyeBlocked[i] && !f3Penalized[i]) {
                    eyeM = 35;
                }
                score = uint64(
                    uint32(pickSum) * eyeM +
                    uint32(_eyeBase(cm.eyeOrder)) * 10
                );
                eyeAppliedScore = score;
            } else {
                score = uint64(pickSum * 10);
                eyeAppliedScore = score;
            }

            // ── B 계열: 플랫 점수 보정 (×100) ────────────────────────
            // B-1 극단 선택자: 1번/3번 성공 시 pickSum×3 추가 (eyeMult +0.3 상당)
            if (effectivePerk == PERK_B1 && eyeSuccess && (cm.eyeOrder == 1 || cm.eyeOrder == 3)) {
                score += uint64(pickSum) * 3;
            }
            // B-2 고독한 질주: eyeSuccess + 빈 슬롯 발생 시 +1.5pt
            if (effectivePerk == PERK_B2 && eyeSuccess && hasEmptySlot) {
                score += 150;
            }
            // ── A 계열: 플랫 점수 보정 (×100) ─────────────
            uint16 removedMask  = cm.pickedMask & ~cm.survivingMask;
            uint8  removedCount = _popcount16(removedMask);

            // A-1 군중 속으로: 겹침 3개+ → +0.5pt × 겹친 수
            if (effectivePerk == PERK_A1 && removedCount >= 3) {
                score += uint64(removedCount) * 50;
            }
            // A-2 정밀 타격: 겹침 정확히 1개 → +1.0pt
            if (effectivePerk == PERK_A2 && removedCount == 1) {
                score += 100;
            }
            // A-3 군중 집중: 제거된 픽 중 가장 많은 플레이어가 공유한 nibble의 인원 수 × 0.5pt
            if (effectivePerk == PERK_A3 && removedCount > 0) {
                uint8 maxShared = 0;
                for (uint8 k = 0; k < 16; k++) {
                    if (removedMask & (uint16(1) << k) == 0) continue;
                    uint8 shared = 0;
                    for (uint16 j = 0; j < playerCount; j++) {
                        Commitment storage oth = commitments[roundId][_players[roundId][j]];
                        if (oth.revealed && (oth.pickedMask & (uint16(1) << k) != 0)) shared++;
                    }
                    if (shared > maxShared) maxShared = shared;
                }
                if (maxShared >= 2) score += uint64(maxShared) * 50;
            }
            // A-4 손실 제한: 제거 픽 중 최고배율의 절반 보전
            if (effectivePerk == PERK_A4) {
                uint8 highestMult = 0;
                for (uint8 k = 0; k < 16; k++) {
                    if (removedMask & (uint16(1) << k) != 0 && nibbleMult[k] > highestMult) {
                        highestMult = nibbleMult[k];
                    }
                }
                score += uint64(highestMult) * 5;
            }
            // A-5 최저 보장: 소수자 게임 생존 ≤1개 → +1.0pt
            if (effectivePerk == PERK_A5 && _popcount16(cm.survivingMask) <= 1) {
                score += 100;
            }
            // D-3 올인: ≤1 생존 픽 + 선언 완료 시 발동
            // cm.trapNibble에 선언한 nibble+1 저장 (0=미선언)
            if (effectivePerk == PERK_D3 && cm.trapNibble > 0) {
                uint8 guess     = cm.trapNibble - 1; // 0-15
                uint8 guessMult = nibbleMult[guess];
                if (_popcount16(finalMasks[i]) <= 1) {
                    if (guessMult > 10) {
                        // 성공: 해당 배율 ×1.5 보너스 추가
                        score += uint64(guessMult) * 15;
                    } else {
                        // 실패: 0.5pt 기본
                        score = 50;
                    }
                }
            }

            // G-2 처형 보너스: 처형 성공 시 잃은 픽 배율 합 × 0.5 보전 + 킬 보너스
            if (cm.perkId == PERK_G2 && g2Kills[i] > 0) {
                score += uint64(g2LostSum[i]) * 5; // 잃은 배율 합(×10) × 0.5 → ×5 (score ×100)
                score += g2Kills[i] == 1 ? 50 : 150; // 1킬 +0.5pt, 2킬 +1.5pt
            }

            // D-5 데스페라도: 겹침 결과에 따른 보너스/페널티
            if (effectivePerk == PERK_D5) {
                // 내 2픽 중 몇 발이 상대와 겹쳤는지 (피격된 상대 기준)
                uint8 hitCount = 0;   // 명중한 상대 수
                uint8 hits2Same = 0;  // 같은 1명에게 2발 집중 여부
                uint32 hitMult  = 0;  // 겹친 nibble 배율 합
                for (uint16 j = 0; j < playerCount; j++) {
                    if (i == j) continue;
                    Commitment storage tgtD5 = commitments[roundId][_players[roundId][j]];
                    if (!tgtD5.revealed) continue;
                    uint16 overlap = finalMasks[i] & tgtD5.pickedMask;
                    uint8 overlapCnt = _popcount16(overlap);
                    if (overlapCnt == 0) continue;
                    hitCount++;
                    for (uint8 k = 0; k < 16; k++) {
                        if (overlap & (uint16(1) << k) != 0) hitMult += nibbleMult[k];
                    }
                    if (overlapCnt >= 2) hits2Same = 1;
                }
                if (hitCount == 0) {
                    // 0명 적중: 내 2픽 역제거
                    finalMasks[i] = 0;
                    score = 0;
                } else if (hits2Same == 1) {
                    // 1명에게 2발 집중: 상대 4픽 전부 제거 + 겹친 배율 합 × 1.0 추가
                    for (uint16 j = 0; j < playerCount; j++) {
                        if (i == j) continue;
                        Commitment storage tgtD5b = commitments[roundId][_players[roundId][j]];
                        if (!tgtD5b.revealed) continue;
                        if (_popcount16(finalMasks[i] & tgtD5b.pickedMask) >= 2) {
                            finalMasks[j] = 0;
                            eyeSuccesses[j] = false;
                        }
                    }
                    score += uint64(hitMult) * 10;
                } else if (hitCount >= 2) {
                    // 2명 각 1발: 겹친 배율 합 × 0.5 추가
                    score += uint64(hitMult) * 5;
                } else {
                    // 1명 1발: 겹친 nibble 배율 × 0.5 추가
                    score += uint64(hitMult) * 5;
                }
            }

            // D-4 기회주의: 타인 눈치게임 포기 픽 최고배율 × 0.5
            // eyeDropped = 눈치 전에 살아있다가 겹침으로 포기된 픽 (survivingMask & ~finalMask)
            if (effectivePerk == PERK_D4) {
                uint8 maxDroppedMult = 0;
                for (uint16 j = 0; j < playerCount; j++) {
                    if (i == j) continue;
                    Commitment storage other = commitments[roundId][_players[roundId][j]];
                    if (!other.revealed) continue;
                    uint16 eyeDropped = other.survivingMask & ~finalMasks[j];
                    for (uint8 k = 0; k < 16; k++) {
                        if (eyeDropped & (uint16(1) << k) != 0 && nibbleMult[k] > maxDroppedMult) {
                            maxDroppedMult = nibbleMult[k];
                        }
                    }
                }
                // mult(×10) × 0.5 × 100 = mult × 5  (score 단위 ×100)
                if (maxDroppedMult > 0) score += uint64(maxDroppedMult) * 5;
            }

            cm.score = score;
            emit ScoreBreakdownLogged(
                roundId,
                p,
                finalMasks[i],
                removedMask,
                uint16(pickSum),
                uint16(eyeAppliedScore),
                int32(int256(uint256(score)) - int256(uint256(eyeAppliedScore))),
                effectivePerk,
                eyeSuccess
            );
        }
    }

    // ─────────────────────────────────────────
    // Internal — A-6: 최저 nibble value 1개 제거
    // ─────────────────────────────────────────

    // ─────────────────────────────────────────
    // Internal — G-2/G-4: 구간 마스크 / 픽 수 / 제거
    // ─────────────────────────────────────────

    /// zone: 1=0x0-3, 2=0x4-7, 3=0x8-b, 4=0xc-f
    function _zoneMask(uint8 zone) internal pure returns (uint16) {
        return uint16(0xF) << ((zone - 1) * 4);
    }
    function _countPicksInZone(uint16 mask, uint8 zone) internal pure returns (uint8) {
        return _popcount16(mask & _zoneMask(zone));
    }
    function _removePicksInZone(uint16 mask, uint8 zone) internal pure returns (uint16) {
        return mask & ~_zoneMask(zone);
    }
    function _removeLowestNibble(uint16 mask) internal pure returns (uint16) {
        for (uint8 k = 0; k < 16; k++) {
            if (mask & (uint16(1) << k) != 0) return mask & ~(uint16(1) << k);
        }
        return mask;
    }
    function _forfeitHighestPick(uint16 mask, uint8[16] memory nibbleMult) internal pure returns (uint16) {
        uint8 highestMult = 0; uint8 highestNibble = 255;
        for (uint8 k = 0; k < 16; k++) {
            if (mask & (uint16(1) << k) == 0) continue;
            if (nibbleMult[k] > highestMult) { highestMult = nibbleMult[k]; highestNibble = k; }
        }
        if (highestNibble == 255) return mask;
        return mask & ~(uint16(1) << highestNibble);
    }
    function _forfeitLowestPicks(uint16 mask, uint8[16] memory nibbleMult, uint8 forfeitCount) internal pure returns (uint16) {
        for (uint8 f = 0; f < forfeitCount; f++) {
            uint8 lowestMult = 255; uint8 lowestNibble = 255;
            for (uint8 k = 0; k < 16; k++) {
                if (mask & (uint16(1) << k) == 0) continue;
                if (nibbleMult[k] < lowestMult) { lowestMult = nibbleMult[k]; lowestNibble = k; }
            }
            if (lowestNibble == 255) break;
            mask &= ~(uint16(1) << lowestNibble);
        }
        return mask;
    }
    function _getNibble(bytes32 h, uint8 pos) internal pure returns (uint8) {
        uint8 b = uint8(h[pos / 2]);
        return (pos % 2 == 0) ? (b >> 4) : (b & 0x0f);
    }
    function _computeNibbleMult(bytes32 h) internal pure returns (uint8[16] memory mult) {
        uint8[16] memory cnt;
        for (uint8 pos = 0; pos < 16; pos++) cnt[_getNibble(h, pos)]++;
        for (uint8 v = 0; v < 16; v++) {
            uint8 c = cnt[v];
            if (c == 0) mult[v] = 10; else if (c == 1) mult[v] = 15;
            else if (c == 2) mult[v] = 20; else if (c == 3) mult[v] = 25; else mult[v] = 30;
        }
    }
    function _eyeMult(uint8 order) internal pure returns (uint8) {
        if (order == 1) return 20; if (order == 2) return 15; return 12;
    }
    function _eyeMultDowngrade(uint8 order) internal pure returns (uint8) {
        if (order == 1) return 15; if (order == 2) return 12; return 10;
    }
    function _eyeBase(uint8 order) internal pure returns (uint8) {
        if (order == 1) return 10; if (order == 2) return 7; return 5;
    }
    function _gcd(uint8 a, uint8 b) internal pure returns (uint8) {
        while (b != 0) { uint8 t = b; b = a % b; a = t; } return a;
    }
    function _allCoprime(uint16 mask) internal pure returns (bool) {
        uint8[4] memory picks; uint8 cnt = 0;
        for (uint8 k = 0; k < 16 && cnt < 4; k++)
            if (mask & (uint16(1) << k) != 0) picks[cnt++] = k;
        if (cnt != 4) return false;
        for (uint8 i = 0; i < 4; i++)
            for (uint8 j = i + 1; j < 4; j++)
                if (_gcd(picks[i], picks[j]) != 1) return false;
        return true;
    }
    function _isZoneDistributed(uint16 mask) internal pure returns (bool) {
        return (_popcount16(mask & 0x000F) == 1 && _popcount16(mask & 0x00F0) == 1 &&
                _popcount16(mask & 0x0F00) == 1 && _popcount16(mask & 0xF000) == 1);
    }
    function _removeLowestNibbleInZone(uint16 mask, uint8 zone) internal pure returns (uint16) {
        uint16 zm = _zoneMask(zone); uint16 inZone = mask & zm;
        if (inZone == 0) return mask;
        for (uint8 k = 0; k < 16; k++)
            if (inZone & (uint16(1) << k) != 0) return mask & ~(uint16(1) << k);
        return mask;
    }
    function _popcount16(uint16 mask) internal pure returns (uint8 cnt) {
        for (uint8 k = 0; k < 16; k++) if (mask & (uint16(1) << k) != 0) cnt++;
    }
    function _randomOpponentIdx(uint16 selfIdx, uint16 playerCount, bytes32 seed) internal pure returns (uint16) {
        uint16 count = playerCount - 1;
        uint16 rand = uint16(uint256(keccak256(abi.encodePacked(seed, selfIdx))) % count);
        return rand < selfIdx ? rand : rand + 1;
    }

    /// 주소로 플레이어 인덱스 탐색. 없으면 type(uint16).max 반환.
    function _findPlayerIdx(uint256 roundId, uint16 playerCount, address target) internal view returns (uint16) {
        for (uint16 j = 0; j < playerCount; j++) {
            if (_players[roundId][j] == target) return j;
        }
        return type(uint16).max;
    }

    // ─────────────────────────────────────────
    // Internal — D-1: 이전 라운드 1등 여부
    // ─────────────────────────────────────────

    function _wasTopScorer(uint256 prevRoundId, address player) internal view returns (bool) {
        Round storage pr = rounds[prevRoundId];
        if (pr.state != RoundState.SETTLED) return false;
        uint64 myScore = commitments[prevRoundId][player].score;
        if (myScore == 0) return false;
        for (uint16 i = 0; i < pr.playerCount; i++) {
            address other = _players[prevRoundId][i];
            if (other == player) continue;
            if (commitments[prevRoundId][other].score > myScore) return false;
        }
        return true;
    }

    // ─────────────────────────────────────────
    // Internal — D-2: 이전 라운드 꼴찌 여부
    // ─────────────────────────────────────────

    function _wasLastScorer(uint256 prevRoundId, address player) internal view returns (bool) {
        Round storage pr = rounds[prevRoundId];
        if (pr.state != RoundState.SETTLED) return false;
        if (pr.playerCount < 2) return false;
        uint64 myScore = commitments[prevRoundId][player].score;
        if (myScore == 0) return false; // 미참여
        for (uint16 i = 0; i < pr.playerCount; i++) {
            address other = _players[prevRoundId][i];
            if (other == player) continue;
            uint64 s = commitments[prevRoundId][other].score;
            if (s > 0 && s < myScore) return false; // 더 낮은 점수 있음
        }
        return true;
    }

    /// D2 — 직전 라운드 꼴찌 여부 (프론트엔드용 view)
    function wasLastInPrevRound(uint256 roundId, address player) external view returns (bool) {
        if (roundId <= 1) return false;
        return _wasLastScorer(roundId - 1, player);
    }

    // ─────────────────────────────────────────
    // Internal — 상위 3명 선정
    // 동점 처리: sc > top3Scores[rank] (엄격한 부등호) 이므로 동점 시
    // 먼저 커밋한 플레이어(_players 배열 앞쪽 = 낮은 인덱스)가 높은 순위를 유지.
    // ─────────────────────────────────────────

    function _getTop3(uint256 roundId, uint16 playerCount)
        internal view
        returns (address[3] memory top3, uint64[3] memory top3Scores)
    {
        for (uint16 i = 0; i < playerCount; i++) {
            address    p  = _players[roundId][i];
            Commitment storage cm = commitments[roundId][p];
            uint64 sc = cm.revealed ? cm.score : 0;

            for (uint8 rank = 0; rank < 3; rank++) {
                if (sc > top3Scores[rank]) {
                    for (uint8 j = 2; j > rank; j--) {
                        top3[j]       = top3[j-1];
                        top3Scores[j] = top3Scores[j-1];
                    }
                    top3[rank]       = p;
                    top3Scores[rank] = sc;
                    break;
                }
            }
        }
    }

    // ─────────────────────────────────────────
    // View helpers (프론트용)
    // ─────────────────────────────────────────

    function getRoundInfo(uint256 roundId) external view returns (
        RoundState state,
        uint64     startBlock,
        uint64     lockBlock,
        uint64     revealBlock,
        uint64     eyeLockBlock,
        uint64     eyeRevealBlock,
        uint16     playerCount,
        bytes32    revealHash
    ) {
        Round storage r = rounds[roundId];
        return (
            r.state, r.startBlock, r.lockBlock, r.revealBlock,
            r.eyeLockBlock, r.eyeRevealBlock,
            r.playerCount, r.revealHash
        );
    }

    function getPlayerInfo(uint256 roundId, address player) external view returns (
        bool    hasCommitted,
        bool    revealed,
        bool    eyeRevealed,
        uint8   eyeOrder,
        uint8   perkId,
        uint16  survivingMask,
        uint64  score,
        uint8   declaredOrder
    ) {
        Commitment storage cm = commitments[roundId][player];
        return (
            cm.commitHash != 0,
            cm.revealed,
            cm.eyeRevealed,
            cm.eyeOrder,
            cm.perkId,
            cm.survivingMask,
            cm.score,
            cm.declaredOrder
        );
    }

    function getNibbleMult(uint256 roundId) external view returns (uint8[16] memory) {
        return _computeNibbleMult(rounds[roundId].revealHash);
    }

    /// C2 — 상대 생존 픽 수 열람. 미공개 시 type(uint8).max 반환.
    function getSurvivingCount(uint256 roundId, address target) external view returns (uint8) {
        Commitment storage cm = commitments[roundId][target];
        if (!cm.revealed) return type(uint8).max;
        return uint8(_popcount16(cm.survivingMask));
    }

    /// C3 — 상대 생존 픽 중 최고배율 nibble 열람. 미공개, 전멸 시 type(uint8).max 반환.
    function getOneSurvivingPick(uint256 roundId, address target) external view returns (uint8) {
        Commitment storage cm = commitments[roundId][target];
        if (!cm.revealed) return type(uint8).max;
        if (cm.survivingMask == 0) return type(uint8).max;
        uint8[16] memory mult = _computeNibbleMult(rounds[roundId].revealHash);
        uint8 best     = type(uint8).max;
        uint8 bestMult = 0;
        for (uint8 k = 0; k < 16; k++) {
            if (cm.survivingMask & (uint16(1) << k) != 0 && mult[k] > bestMult) {
                bestMult = mult[k];
                best     = k;
            }
        }
        return best;
    }

    /// C1 — 전체 플레이어 겹친 nibble 비트마스크 반환.
    function getOverlappingNibbles(uint256 roundId) external view returns (uint16 overlapMask) {
        uint16 cnt = rounds[roundId].playerCount;
        uint16 seenOnce = 0;
        for (uint16 i = 0; i < cnt; i++) {
            Commitment storage cm = commitments[roundId][_players[roundId][i]];
            if (!cm.revealed) continue;
            overlapMask |= seenOnce & cm.pickedMask;
            seenOnce    |= cm.pickedMask;
        }
    }

    function getPlayers(uint256 roundId) external view returns (address[] memory) {
        uint16 cnt = rounds[roundId].playerCount;
        address[] memory result = new address[](cnt);
        for (uint16 i = 0; i < cnt; i++) {
            result[i] = _players[roundId][i];
        }
        return result;
    }

    // ─────────────────────────────────────────
    // 인원 부족 만료 — 커밋 윈도우 종료 후 MIN_PLAYERS 미달 시 누구나 호출 가능
    // ─────────────────────────────────────────

    function expireRound(uint256 roundId) external {
        Round storage r = rounds[roundId];

        if (r.state != RoundState.OPEN)          revert RoundNotOpen();
        if (block.number <= r.lockBlock)         revert RoundNotExpired();
        if (r.playerCount >= MIN_PLAYERS)        revert NotEnoughPlayers();

        r.state = RoundState.SETTLED;
        emit RoundCancelled(roundId, address(0));
    }

    // ─────────────────────────────────────────
    // 취소 — OPEN 상태에서 참가자가 라운드 취소
    // ─────────────────────────────────────────

    function cancelRound(uint256 roundId) external {
        Round storage r = rounds[roundId];

        if (r.state != RoundState.OPEN) revert RoundNotOpen();
        if (commitments[roundId][msg.sender].commitHash == 0) revert NotParticipant();

        r.state = RoundState.SETTLED;
        emit RoundCancelled(roundId, msg.sender);
    }
}
