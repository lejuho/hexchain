// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * HexChainRegistry — 퍼미션리스 방 목록 관리
 *
 * HexChain 컨트랙트를 직접 읽어 상태를 검증하므로 별도 권한 없이 누구나 동기화 가능.
 * - register(roundId)   : HexChain에서 해당 round가 OPEN임을 확인 후 목록에 추가
 * - unregister(roundId) : HexChain에서 해당 round가 더 이상 OPEN이 아닐 때 목록에서 제거
 *
 * Keeper가 RoundCreated / RoundLocked / RoundCancelled 이벤트를 감지해 호출하거나,
 * 프론트엔드에서 직접 호출해도 무방.
 */

interface IHexChain {
    function rounds(uint256 roundId)
        external view returns (
            bytes32 revealHash,
            uint64  startBlock,
            uint64  lockBlock,
            uint64  revealBlock,
            uint64  eyeLockBlock,
            uint64  eyeRevealBlock,
            uint16  playerCount,
            uint8   state  // 0=OPEN, 1=LOCKED, 2=EYE_OPEN, 3=EYE_LOCKED, 4=SETTLED
        );
}

contract HexChainRegistry {

    address public game;
    address public owner;

    // OPEN 상태 roundId 목록 (순서 유지 불필요 → swap-and-pop)
    uint256[] private _openRounds;
    mapping(uint256 => uint256) private _index; // roundId → 인덱스+1 (0=미등록)

    event RoundRegistered  (uint256 indexed roundId);
    event RoundUnregistered(uint256 indexed roundId);

    error NotOwner();
    error AlreadyRegistered();
    error NotRegistered();
    error RoundNotOpen();
    error RoundStillOpen();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _game) {
        owner = msg.sender;
        game  = _game;
    }

    /// @notice owner가 game 주소 재설정
    function setGame(address _game) external onlyOwner {
        game = _game;
    }

    /// @notice OPEN 방 등록 — HexChain round state == OPEN(0) 인지 검증
    function register(uint256 roundId) external {
        if (_index[roundId] != 0) revert AlreadyRegistered();
        (, , , , , , , uint8 state) = IHexChain(game).rounds(roundId);
        if (state != 0) revert RoundNotOpen(); // 0 = OPEN
        _openRounds.push(roundId);
        _index[roundId] = _openRounds.length;
        emit RoundRegistered(roundId);
    }

    /// @notice OPEN 방 제거 — HexChain round state != OPEN 인지 검증
    function unregister(uint256 roundId) external {
        uint256 idx1 = _index[roundId];
        if (idx1 == 0) revert NotRegistered();
        (, , , , , , , uint8 state) = IHexChain(game).rounds(roundId);
        if (state == 0) revert RoundStillOpen(); // 아직 OPEN이면 제거 불가
        _remove(roundId, idx1 - 1);
    }

    /// @notice 내부 swap-and-pop 제거
    function _remove(uint256 roundId, uint256 idx) internal {
        uint256 last = _openRounds.length - 1;
        if (idx != last) {
            uint256 lastId = _openRounds[last];
            _openRounds[idx] = lastId;
            _index[lastId] = idx + 1;
        }
        _openRounds.pop();
        delete _index[roundId];
        emit RoundUnregistered(roundId);
    }

    /// @notice 현재 참여 가능한 모든 방 ID 반환
    function getOpenRounds() external view returns (uint256[] memory) {
        return _openRounds;
    }

    /// @notice 특정 방이 목록에 있는지 확인
    function isOpen(uint256 roundId) external view returns (bool) {
        return _index[roundId] != 0;
    }
}
