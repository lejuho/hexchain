import { Injectable } from '@nestjs/common'

export interface ProofData {
  pA:         [string, string]
  pB:         [[string, string], [string, string]]
  pC:         [string, string]
  pubSignals: [string, string]   // [commitHash, pickedMask] as decimal strings
}

export interface StoredProof {
  address: string
  roundId: string
  proof:   ProofData
}

/**
 * ProofService
 *
 * 브라우저가 생성한 Groth16 proof를 저장합니다.
 * choices/salt는 절대 서버에 전송되지 않으며, pubSignals만 공개 정보로 저장됩니다.
 *
 * 인증: address는 pubSignals[0] (commitHash)으로 온체인 검증됩니다.
 *   → 별도 서명 불필요. 잘못된 proof를 올려도 revealFor가 온체인에서 reject합니다.
 */
@Injectable()
export class ProofService {
  // Map<address_lower, Map<roundId_str, ProofData>>
  private readonly store = new Map<string, Map<string, ProofData>>()

  save(roundId: string, address: string, proof: ProofData): void {
    const key = address.toLowerCase()
    if (!this.store.has(key)) this.store.set(key, new Map())
    this.store.get(key)!.set(roundId, proof)
  }

  load(roundId: string, address: string): ProofData | null {
    return this.store.get(address.toLowerCase())?.get(roundId) ?? null
  }

  remove(roundId: string, address: string): void {
    this.store.get(address.toLowerCase())?.delete(roundId)
  }

  listRound(roundId: string): StoredProof[] {
    const entries: StoredProof[] = []
    for (const [address, rounds] of this.store.entries()) {
      const proof = rounds.get(roundId)
      if (proof) entries.push({ address, roundId, proof })
    }
    return entries
  }

  listAll(): StoredProof[] {
    const entries: StoredProof[] = []
    for (const [address, rounds] of this.store.entries()) {
      for (const [roundId, proof] of rounds.entries()) {
        entries.push({ address, roundId, proof })
      }
    }
    return entries
  }
}
