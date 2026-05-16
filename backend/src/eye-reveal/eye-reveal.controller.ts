import {
  Controller, Post, Body, BadRequestException,
} from '@nestjs/common'
import { EyeRevealService } from './eye-reveal.service'

interface EyeRevealBody {
  roundId:   string
  order:     number
  salt:      string   // bytes32 hex
  signature: string
}

/**
 * POST /eye-reveal
 *
 * 유저가 눈치게임 order + salt를 제출합니다.
 * Keeper가 EYE_LOCKED 이후 eyeRevealFor()를 대신 호출합니다.
 *
 * Body:
 *   roundId   — 라운드 ID
 *   order     — 눈치 순서 (1~3)
 *   salt      — eyeCommit에 사용한 bytes32 salt (0x...)
 *   signature — signMessage("HexChain eye-reveal roundId:{roundId}")
 */
@Controller('eye-reveal')
export class EyeRevealController {
  constructor(private readonly eyeRevealService: EyeRevealService) {}

  @Post()
  async save(@Body() body: EyeRevealBody) {
    const { roundId, order, salt, signature } = body

    if (!roundId || order == null || !salt || !signature) {
      throw new BadRequestException('roundId, order, salt, signature are required')
    }
    if (order < 1 || order > 3) {
      throw new BadRequestException('order must be 1, 2, or 3')
    }
    if (!salt.startsWith('0x') || salt.length !== 66) {
      throw new BadRequestException('salt must be a 0x-prefixed bytes32 hex string')
    }

    await this.eyeRevealService.save(
      roundId,
      { order, salt: salt as `0x${string}` },
      signature as `0x${string}`,
    )

    return { ok: true }
  }
}
