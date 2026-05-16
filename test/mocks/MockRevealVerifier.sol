// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev 테스트 전용 — verifyProof 항상 true 반환
contract MockGroth16Verifier {
    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[2] calldata
    ) public pure returns (bool) {
        return true;
    }
}
