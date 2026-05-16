import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as path from 'path'
import * as fs from 'fs'

// snarkjs는 CommonJS 모듈이라 require로 로드
// eslint-disable-next-line @typescript-eslint/no-require-imports
const snarkjs = require('snarkjs')

export interface RevealProof {
  pA:         [bigint, bigint]
  pB:         [[bigint, bigint], [bigint, bigint]]
  pC:         [bigint, bigint]
  pubSignals: [bigint, bigint]   // [commitHash, pickedMask]
}

@Injectable()
export class ZkService implements OnModuleInit {
  private readonly logger = new Logger(ZkService.name)

  private readonly wasmPath = path.join(__dirname, '../../zk/reveal.wasm')
  private readonly zkeyPath = path.join(__dirname, '../../zk/reveal_0001.zkey')

  onModuleInit() {
    if (!fs.existsSync(this.wasmPath))
      throw new Error(`reveal.wasm not found: ${this.wasmPath}`)
    if (!fs.existsSync(this.zkeyPath))
      throw new Error(`reveal_0001.zkey not found: ${this.zkeyPath}`)
    this.logger.log('ZkService ready — wasm + zkey loaded')
  }

  /**
   * reveal 회로 Groth16 proof 생성
   *
   * @param choices  4개 nibble 값 (0~15, 중복 없음)
   * @param salt     커밋에 사용한 salt (bigint)
   * @param commitHash 온체인에 저장된 poseidon(choices, salt) 값
   * @returns Solidity verifyProof() calldata 형식
   */
  async generateRevealProof(
    choices:    number[],
    salt:       bigint,
    commitHash: bigint,
  ): Promise<RevealProof> {
    const pickedMask = choices.reduce((m, c) => m | (1 << c), 0)

    const input = {
      choices:    choices.map(String),
      salt:       salt.toString(),
      commitHash: commitHash.toString(),
      pickedMask: pickedMask.toString(),
    }

    this.logger.debug(`ZK prove: choices=${choices} salt=${salt} mask=${pickedMask}`)

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      this.wasmPath,
      this.zkeyPath,
    )

    // snarkjs → Solidity calldata 변환
    // G2 좌표는 각 쌍 내에서 순서 반전 필요 ([1][0] 순)
    return {
      pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      pB: [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ],
      pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
      pubSignals: [BigInt(publicSignals[0]), BigInt(publicSignals[1])],
    }
  }
}
