import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common'
import { recoverMessageAddress } from 'viem'

export interface CommitData {
  choices: number[]
  salt:    `0x${string}`
}

export interface StoredCommit {
  address: `0x${string}`
  roundId: string
  data: CommitData
}

/**
 * CommitService
 *
 * Salt + Choices를 지갑 서명으로 인증한 뒤 서버에 저장합니다.
 * 현재는 in-memory Map 사용. 재시작 시 초기화됩니다.
 *
 * 교체 포인트:
 *   - save / load / remove를 DB 레이어(TypeORM + SQLite 등)로 교체하면 됩니다.
 *   - 스키마: (address TEXT, roundId TEXT, choices TEXT, salt TEXT, UNIQUE(address, roundId))
 */
@Injectable()
export class CommitService {
  // Map<address_lower, Map<roundId_str, CommitData>>
  private readonly store = new Map<string, Map<string, CommitData>>()

  // ── 서명 검증 헬퍼 ─────────────────────────────────────────────────────────

  /**
   * 서명으로부터 address를 복구합니다.
   * 메시지 형식: "HexChain {action} roundId:{roundId}"
   * 프론트에서 동일한 형식으로 signMessage 호출해야 합니다.
   */
  async recoverAddress(
    roundId: string,
    action: 'save' | 'load',
    signature: `0x${string}`,
  ): Promise<`0x${string}`> {
    const message = commitMessage(roundId, action)
    try {
      return await recoverMessageAddress({ message, signature })
    } catch {
      throw new UnauthorizedException('Invalid signature')
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async save(
    roundId: string,
    data: CommitData,
    signature: `0x${string}`,
  ): Promise<void> {
    const address = (await this.recoverAddress(roundId, 'save', signature)).toLowerCase()

    if (!this.store.has(address)) {
      this.store.set(address, new Map())
    }
    this.store.get(address)!.set(roundId, data)
  }

  async load(
    roundId: string,
    signature: `0x${string}`,
  ): Promise<CommitData> {
    const address = (await this.recoverAddress(roundId, 'load', signature)).toLowerCase()

    const data = this.store.get(address)?.get(roundId)
    if (!data) throw new NotFoundException('Commit data not found')
    return data
  }

  async remove(
    roundId: string,
    signature: `0x${string}`,
  ): Promise<void> {
    const address = (await this.recoverAddress(roundId, 'load', signature)).toLowerCase()
    this.store.get(address)?.delete(roundId)
  }

  listRound(roundId: string): StoredCommit[] {
    const entries: StoredCommit[] = []

    for (const [address, rounds] of this.store.entries()) {
      const data = rounds.get(roundId)
      if (!data) continue

      entries.push({
        address: address as `0x${string}`,
        roundId,
        data,
      })
    }

    return entries
  }
}

/**
 * 프론트에서 signMessage에 넘길 메시지 (공개 상수).
 * 프론트 utils.ts와 동일한 형식을 사용해야 합니다.
 */
export function commitMessage(roundId: string, action: 'save' | 'load'): string {
  return `HexChain ${action} roundId:${roundId}`
}
