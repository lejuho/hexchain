import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { recoverMessageAddress } from 'viem'

export interface EyeRevealData {
  order: number        // 1~3
  salt:  `0x${string}` // bytes32
}

export interface StoredEyeReveal {
  address: `0x${string}`
  roundId: string
  data:    EyeRevealData
}

/**
 * EyeRevealService
 *
 * 유저가 API를 통해 제출한 눈치게임 (order, salt) 를 보관합니다.
 * Keeper가 EYE_LOCKED 상태에서 eyeRevealFor() 를 호출할 때 사용합니다.
 *
 * 인증: 지갑 서명으로 address 검증
 *   메시지: "HexChain eye-reveal roundId:{roundId}"
 */
@Injectable()
export class EyeRevealService {
  // Map<address_lower, Map<roundId_str, EyeRevealData>>
  private readonly store = new Map<string, Map<string, EyeRevealData>>()

  async save(
    roundId:   string,
    data:      EyeRevealData,
    signature: `0x${string}`,
  ): Promise<void> {
    const address = await this.recoverAddress(roundId, signature)

    if (!this.store.has(address)) this.store.set(address, new Map())

    if (this.store.get(address)!.has(roundId)) {
      throw new ConflictException('Eye reveal already submitted for this round')
    }

    this.store.get(address)!.set(roundId, data)
  }

  listRound(roundId: string): StoredEyeReveal[] {
    const entries: StoredEyeReveal[] = []
    for (const [address, rounds] of this.store.entries()) {
      const data = rounds.get(roundId)
      if (data) entries.push({ address: address as `0x${string}`, roundId, data })
    }
    return entries
  }

  private async recoverAddress(
    roundId:   string,
    signature: `0x${string}`,
  ): Promise<string> {
    const message = eyeRevealMessage(roundId)
    try {
      return (await recoverMessageAddress({ message, signature })).toLowerCase()
    } catch {
      throw new UnauthorizedException('Invalid signature')
    }
  }
}

export function eyeRevealMessage(roundId: string): string {
  return `HexChain eye-reveal roundId:${roundId}`
}
