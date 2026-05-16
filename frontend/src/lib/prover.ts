/**
 * 브라우저에서 Groth16 ZK proof를 생성합니다.
 *
 * reveal 회로: poseidon(choices, salt) == commitHash 를 증명하면서
 * pickedMask = OR(1 << choices[i]) 를 공개합니다.
 *
 * 파일 위치: /public/zk/reveal.wasm, /public/zk/reveal_0001.zkey
 */

import { flog, fwarn } from './flog'

export interface RevealProof {
  pA:         [string, string]
  pB:         [[string, string], [string, string]]
  pC:         [string, string]
  pubSignals: [string, string]   // [commitHash, pickedMask] as decimal strings
}

export type ProofProgressCallback = (pct: number, stage: string) => void

// snarkjs가 내부적으로 출력하는 메시지 → 진행률 매핑
// 순서대로 매칭: 먼저 일치하는 항목이 우선
const SNARKJS_STAGE_PCT: Array<[string, number]> = [
  ['Reading Wtns',           30],
  ['Preparing Wtns',         35],
  ['Reading Zkey',           40],
  ['Building ABC',           50],
  ['Building Coefficients',  56],
  ['Building H',             63],
  ['MSM A',                  70],
  ['MSM B1',                 76],
  ['MSM B2',                 82],
  ['MSM C',                  87],
  ['MSM H',                  92],
]

function makeSnarkLogger(onProgress: ProofProgressCallback) {
  const debug = (msg: string) => {
    const matched = SNARKJS_STAGE_PCT.find(([pattern]) => msg.includes(pattern))
    if (matched) {
      const [stage, pct] = matched
      flog(`[ZK] ${pct}% — ${stage}`)
      onProgress(pct, stage)
    } else {
      flog(`[ZK] ${msg}`)
    }
  }
  return {
    debug,
    info:  (msg: string) => flog(`[ZK] ${msg}`),
    warn:  (msg: string) => fwarn(`[ZK WARN] ${msg}`),
    error: (msg: string) => fwarn(`[ZK ERROR] ${msg}`),
  }
}

export async function generateRevealProof(
  choices:    number[],    // 4개 nibble (0~15)
  salt:       bigint,
  commitHash: bigint,
  onProgress?: ProofProgressCallback,
): Promise<RevealProof> {
  const progress = onProgress ?? (() => {})

  progress(2, 'snarkjs 로드 중')
  flog('[ZK] 2% — snarkjs 로드 중')
  const snarkjs = await import('snarkjs')

  progress(8, '입력 준비')
  flog('[ZK] 8% — 입력 준비')
  const pickedMask = choices.reduce((m, c) => m | (1 << c), 0)
  const input = {
    choices:    choices.map(String),
    salt:       salt.toString(),
    commitHash: commitHash.toString(),
    pickedMask: pickedMask.toString(),
  }

  progress(12, 'WASM witness 계산 시작')
  flog('[ZK] 12% — WASM witness 계산 시작')

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    '/zk/reveal.wasm',
    '/zk/reveal_0001.zkey',
  )

  progress(98, '결과 직렬화')
  flog('[ZK] 98% — 결과 직렬화')

  const result: RevealProof = {
    pA: [proof.pi_a[0] as string, proof.pi_a[1] as string],
    pB: [
      [proof.pi_b[0][1] as string, proof.pi_b[0][0] as string],
      [proof.pi_b[1][1] as string, proof.pi_b[1][0] as string],
    ],
    pC: [proof.pi_c[0] as string, proof.pi_c[1] as string],
    pubSignals: [publicSignals[0] as string, publicSignals[1] as string],
  }

  progress(100, '완료')
  flog('[ZK] 100% — 완료')
  return result
}
