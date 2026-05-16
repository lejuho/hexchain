/**
 * Poseidon 해시 유틸리티
 *
 * poseidon-lite — circomlib 호환 BN254 Poseidon 해시 (동기, WASM 불필요)
 *
 * reveal 회로 입력:
 *   commitHash = poseidon5([c0, c1, c2, c3, salt])
 */
import { poseidon5 } from 'poseidon-lite'

/**
 * reveal 회로와 동일한 해시 계산
 * poseidon([choices[0], choices[1], choices[2], choices[3], salt])
 */
export function buildCommitHash(choices: number[], salt: bigint): bigint {
  return poseidon5([
    BigInt(choices[0]),
    BigInt(choices[1]),
    BigInt(choices[2]),
    BigInt(choices[3]),
    salt,
  ])
}
