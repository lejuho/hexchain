pragma circom 2.0.0;

/*
 * HexChain reveal circuit — Groth16 (Circom)
 *
 * 증명 내용:
 *   1. poseidon(choices[0..3], salt) == commitHash
 *   2. choices[i] ∈ [0, 15]  (4비트 범위)
 *   3. choices 중복 없음
 *   4. pickedMask == (1<<c0) | (1<<c1) | (1<<c2) | (1<<c3)
 *
 * Public inputs  : commitHash, pickedMask
 * Private inputs : choices[4], salt
 *
 * 해시 함수: circomlib Poseidon(5)
 *   → 프론트엔드는 poseidon-lite / circomlibjs 사용 (동일 BN254 스펙)
 */

include "./node_modules/circomlib/circuits/poseidon.circom";
include "./node_modules/circomlib/circuits/comparators.circom";
include "./node_modules/circomlib/circuits/bitify.circom";

/*
 * Pow2_4: 4비트 값 v 에 대해 2^v 를 계산
 *
 * 원리: v = b3*8 + b2*4 + b1*2 + b0 이므로
 *   2^v = 2^(8*b3) · 2^(4*b2) · 2^(2*b1) · 2^b0
 *       = (1 or 256) · (1 or 16) · (1 or 4) · (1 or 2)
 *
 * Num2Bits(4) 가 내부적으로 v ∈ [0,15] 범위 제약을 걸어줌
 */
template Pow2_4() {
    signal input  in;   // 4비트 값 (0~15)
    signal output out;  // 2^in

    component bits = Num2Bits(4);
    bits.in <== in;

    // 단계별 누적 곱 — 각 단계는 독립적인 quadratic constraint
    signal f01;
    signal f012;

    // f0 = 2^b0 = 1 + b0  (b0=0 → 1, b0=1 → 2)
    // f01 = f0 · 2^(2·b1) = (1 + b0) · (1 + 3·b1)
    f01  <== (1 + bits.out[0]) * (1 + 3  * bits.out[1]);

    // f012 = f01 · 2^(4·b2) = f01 · (1 + 15·b2)
    f012 <== f01 * (1 + 15  * bits.out[2]);

    // out = f012 · 2^(8·b3) = f012 · (1 + 255·b3)
    out  <== f012 * (1 + 255 * bits.out[3]);
}

template Reveal() {
    // ── Private inputs ──────────────────────────────────────
    signal input choices[4];   // 0~15, 중복 불가
    signal input salt;         // 임의의 Field 원소

    // ── Public inputs ───────────────────────────────────────
    signal input commitHash;   // poseidon(choices[0..3], salt)
    signal input pickedMask;   // (1<<c0)|(1<<c1)|(1<<c2)|(1<<c3)

    // ────────────────────────────────────────────────────────
    // 1. 해시 검증: poseidon(c0, c1, c2, c3, salt) == commitHash
    // ────────────────────────────────────────────────────────
    component hasher = Poseidon(5);
    for (var i = 0; i < 4; i++) {
        hasher.inputs[i] <== choices[i];
    }
    hasher.inputs[4] <== salt;
    hasher.out === commitHash;

    // ────────────────────────────────────────────────────────
    // 2. 범위 검증 (0~15) + 2^choices[i] 계산
    //    Pow2_4 내부의 Num2Bits(4) 가 범위를 제약
    // ────────────────────────────────────────────────────────
    component p[4];
    for (var i = 0; i < 4; i++) {
        p[i] = Pow2_4();
        p[i].in <== choices[i];
    }

    // ────────────────────────────────────────────────────────
    // 3. 중복 없음 검증: 모든 쌍 (i, j) 에 대해 choices[i] ≠ choices[j]
    //    IsEqual().out === 0  →  같으면 proof 실패
    // ────────────────────────────────────────────────────────
    component eq[6];
    var k = 0;
    for (var i = 0; i < 4; i++) {
        for (var j = i + 1; j < 4; j++) {
            eq[k] = IsEqual();
            eq[k].in[0] <== choices[i];
            eq[k].in[1] <== choices[j];
            eq[k].out === 0;
            k++;
        }
    }

    // ────────────────────────────────────────────────────────
    // 4. pickedMask 검증
    //    중복이 없으므로 각 2^choices[i] 는 서로 다른 비트 →
    //    합산 = bitwise OR = pickedMask
    // ────────────────────────────────────────────────────────
    p[0].out + p[1].out + p[2].out + p[3].out === pickedMask;
}

component main { public [commitHash, pickedMask] } = Reveal();
