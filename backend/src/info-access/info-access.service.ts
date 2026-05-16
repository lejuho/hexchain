import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import { recoverMessageAddress } from 'viem'
import { ChainService } from '../chain/chain.service'

export type InfoType = 'c1' | 'c2' | 'c3'

interface NonceRecord {
  address: string
  roundId: string
  infoType: InfoType
  expiresAt: number
  used: boolean
}

interface CreateNonceParams {
  address: `0x${string}`
  roundId: string
  infoType: InfoType
}

interface RevealParams extends CreateNonceParams {
  nonce: string
  signature: `0x${string}`
}

const INFO_PERK_ID: Record<InfoType, number> = {
  c1: 14,
  c2: 15,
  c3: 16,
}

const PERK_C4 = 17
const STATE_EYE_OPEN = 2
const NONCE_TTL_MS = 1000 * 60 * 3

@Injectable()
export class InfoAccessService {
  private readonly nonces = new Map<string, NonceRecord>()

  constructor(private readonly chain: ChainService) {}

  async createNonce(params: CreateNonceParams) {
    const nonce = randomBytes(16).toString('hex')
    const expiresAt = Date.now() + NONCE_TTL_MS

    this.nonces.set(nonce, {
      address: params.address.toLowerCase(),
      roundId: params.roundId,
      infoType: params.infoType,
      expiresAt,
      used: false,
    })

    return {
      nonce,
      expiresAt: new Date(expiresAt).toISOString(),
      message: infoAccessMessage({
        address: params.address,
        roundId: params.roundId,
        infoType: params.infoType,
        nonce,
        expiresAt: new Date(expiresAt).toISOString(),
      }),
    }
  }

  async reveal(params: RevealParams) {
    const nonceRow = this.nonces.get(params.nonce)
    if (!nonceRow) throw new UnauthorizedException('Invalid nonce')
    if (nonceRow.used) throw new UnauthorizedException('Nonce already used')
    if (Date.now() > nonceRow.expiresAt) throw new UnauthorizedException('Nonce expired')

    if (
      nonceRow.address !== params.address.toLowerCase() ||
      nonceRow.roundId !== params.roundId ||
      nonceRow.infoType !== params.infoType
    ) {
      throw new UnauthorizedException('Nonce mismatch')
    }

    const message = infoAccessMessage({
      address: params.address,
      roundId: params.roundId,
      infoType: params.infoType,
      nonce: params.nonce,
      expiresAt: new Date(nonceRow.expiresAt).toISOString(),
    })

    const recovered = await recoverMessageAddress({ message, signature: params.signature })
    if (recovered.toLowerCase() !== params.address.toLowerCase()) {
      throw new UnauthorizedException('Invalid signature')
    }

    nonceRow.used = true

    const roundId = BigInt(params.roundId)
    const [roundInfo, players] = await Promise.all([
      this.chain.getRoundInfo(roundId),
      this.chain.getPlayers(roundId),
    ])

    if (roundInfo.state !== STATE_EYE_OPEN) {
      throw new ForbiddenException('Info access is only allowed during EYE_OPEN')
    }

    const normalizedAddress = params.address.toLowerCase()
    const player = players.find(addr => addr.toLowerCase() === normalizedAddress)
    if (!player) throw new ForbiddenException('Not a participant in this round')

    const myInfo = await this.chain.getPlayerInfo(roundId, player)
    if (myInfo.perkId !== INFO_PERK_ID[params.infoType]) {
      throw new ForbiddenException('Perk holder mismatch')
    }

    if (params.infoType === 'c1') {
      const overlapMask = await this.chain.getOverlappingNibbles(roundId)
      return {
        ok: true,
        data: {
          overlapMask,
        },
      }
    }

    const others = players.filter(addr => addr.toLowerCase() !== normalizedAddress)
    if (others.length === 0) throw new NotFoundException('No other players found')

    const snapshots = await Promise.all(
      others.map(async addr => {
        const info = await this.chain.getPlayerInfo(roundId, addr)
        const blockedByC4 = info.perkId === PERK_C4

        if (params.infoType === 'c2') {
          return {
            address: addr,
            blockedByC4,
            revealed: info.revealed,
            survivingCount: blockedByC4 || !info.revealed
              ? null
              : popcount16(Number(info.survivingMask)),
          }
        }

        return {
          address: addr,
          blockedByC4,
          revealed: info.revealed,
          oneSurvivingPick: blockedByC4 || !info.revealed
            ? null
            : firstSurvivingNibble(Number(info.survivingMask)),
        }
      }),
    )

    return {
      ok: true,
      data: {
        players: snapshots,
      },
    }
  }
}

function popcount16(mask: number) {
  let n = 0
  for (let i = 0; i < 16; i++) if (mask & (1 << i)) n++
  return n
}

function firstSurvivingNibble(mask: number) {
  for (let i = 0; i < 16; i++) if (mask & (1 << i)) return i
  return null
}

export function infoAccessMessage(params: {
  address: `0x${string}`
  roundId: string
  infoType: InfoType
  nonce: string
  expiresAt: string
}) {
  return [
    'HexChain info access',
    `address: ${params.address}`,
    `roundId: ${params.roundId}`,
    `infoType: ${params.infoType}`,
    `nonce: ${params.nonce}`,
    `expiresAt: ${params.expiresAt}`,
  ].join('\n')
}
