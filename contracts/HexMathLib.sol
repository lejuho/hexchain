// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * HexMathLib — HexChain 순수 계산 함수 외부 라이브러리
 * 별도 배포 후 HexChain에 링크됨 (EIP-170 크기 절감)
 */
library HexMathLib {

    function zoneMask(uint8 zone) public pure returns (uint16) {
        return uint16(0xF) << ((zone - 1) * 4);
    }

    function countPicksInZone(uint16 mask, uint8 zone) public pure returns (uint8) {
        return popcount16(mask & zoneMask(zone));
    }

    function removePicksInZone(uint16 mask, uint8 zone) public pure returns (uint16) {
        return mask & ~zoneMask(zone);
    }

    function removeLowestNibble(uint16 mask) public pure returns (uint16) {
        for (uint8 k = 0; k < 16; k++) {
            if (mask & (uint16(1) << k) != 0) {
                return mask & ~(uint16(1) << k);
            }
        }
        return mask;
    }

    function forfeitHighestPick(
        uint16           mask,
        uint8[16] memory nibbleMult
    ) public pure returns (uint16) {
        uint8 highestMult   = 0;
        uint8 highestNibble = 255;
        for (uint8 k = 0; k < 16; k++) {
            if (mask & (uint16(1) << k) == 0) continue;
            if (nibbleMult[k] > highestMult) {
                highestMult   = nibbleMult[k];
                highestNibble = k;
            }
        }
        if (highestNibble == 255) return mask;
        return mask & ~(uint16(1) << highestNibble);
    }

    function forfeitLowestPicks(
        uint16           mask,
        uint8[16] memory nibbleMult,
        uint8            forfeitCount
    ) public pure returns (uint16) {
        for (uint8 f = 0; f < forfeitCount; f++) {
            uint8 lowestMult   = 255;
            uint8 lowestNibble = 255;
            for (uint8 k = 0; k < 16; k++) {
                if (mask & (uint16(1) << k) == 0) continue;
                if (nibbleMult[k] < lowestMult) {
                    lowestMult   = nibbleMult[k];
                    lowestNibble = k;
                }
            }
            if (lowestNibble == 255) break;
            mask &= ~(uint16(1) << lowestNibble);
        }
        return mask;
    }

    function getNibble(bytes32 h, uint8 pos) public pure returns (uint8) {
        uint8 b = uint8(h[pos / 2]);
        return (pos % 2 == 0) ? (b >> 4) : (b & 0x0f);
    }

    function computeNibbleMult(bytes32 h) public pure returns (uint8[16] memory mult) {
        uint8[16] memory cnt;
        for (uint8 pos = 0; pos < 16; pos++) {
            cnt[getNibble(h, pos)]++;
        }
        for (uint8 v = 0; v < 16; v++) {
            uint8 c = cnt[v];
            if      (c == 0) mult[v] = 10;
            else if (c == 1) mult[v] = 15;
            else if (c == 2) mult[v] = 20;
            else if (c == 3) mult[v] = 25;
            else             mult[v] = 30;
        }
    }

    function eyeMult(uint8 order) public pure returns (uint8) {
        if (order == 1) return 20;
        if (order == 2) return 15;
        return 12;
    }

    function eyeMultDowngrade(uint8 order) public pure returns (uint8) {
        if (order == 1) return 15;
        if (order == 2) return 12;
        return 10;
    }

    function eyeBase(uint8 order) public pure returns (uint8) {
        if (order == 1) return 10;
        if (order == 2) return 7;
        return 5;
    }

    function gcd(uint8 a, uint8 b) public pure returns (uint8) {
        while (b != 0) { uint8 t = b; b = a % b; a = t; }
        return a;
    }

    function allCoprime(uint16 mask) public pure returns (bool) {
        uint8[4] memory picks;
        uint8 cnt = 0;
        for (uint8 k = 0; k < 16 && cnt < 4; k++) {
            if (mask & (uint16(1) << k) != 0) picks[cnt++] = k;
        }
        if (cnt != 4) return false;
        for (uint8 i = 0; i < 4; i++) {
            for (uint8 j = i + 1; j < 4; j++) {
                if (gcd(picks[i], picks[j]) != 1) return false;
            }
        }
        return true;
    }

    function isZoneDistributed(uint16 mask) public pure returns (bool) {
        return (
            popcount16(mask & 0x000F) == 1 &&
            popcount16(mask & 0x00F0) == 1 &&
            popcount16(mask & 0x0F00) == 1 &&
            popcount16(mask & 0xF000) == 1
        );
    }

    function removeLowestNibbleInZone(uint16 mask, uint8 zone) public pure returns (uint16) {
        uint16 zm = zoneMask(zone);
        uint16 inZone = mask & zm;
        if (inZone == 0) return mask;
        for (uint8 k = 0; k < 16; k++) {
            if (inZone & (uint16(1) << k) != 0) return mask & ~(uint16(1) << k);
        }
        return mask;
    }

    function popcount16(uint16 mask) public pure returns (uint8 cnt) {
        for (uint8 k = 0; k < 16; k++) {
            if (mask & (uint16(1) << k) != 0) cnt++;
        }
    }

    function randomOpponentIdx(
        uint16 selfIdx,
        uint16 playerCount,
        bytes32 seed
    ) public pure returns (uint16) {
        uint16 count = playerCount - 1;
        uint16 rand  = uint16(uint256(keccak256(abi.encodePacked(seed, selfIdx))) % count);
        return rand < selfIdx ? rand : rand + 1;
    }
}
