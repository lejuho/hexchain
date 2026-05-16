import {
  Controller, Post, Get, Delete,
  Param, Body, Headers,
  BadRequestException,
} from '@nestjs/common'
import { CommitService } from './commit.service'

interface SaveBody {
  roundId:   string
  choices:   number[]
  salt:      string
  signature: string
}

/**
 * POST   /commits          — commit data 저장
 * GET    /commits/:roundId — commit data 조회 (서명 필요)
 * DELETE /commits/:roundId — commit data 삭제 (정산 후 정리용)
 *
 * 인증: 모든 요청은 지갑 서명 포함.
 *   - POST body.signature
 *   - GET/DELETE header: x-signature
 */
@Controller('commits')
export class CommitController {
  constructor(private readonly commitService: CommitService) {}

  @Post()
  async save(@Body() body: SaveBody) {
    const { roundId, choices, salt, signature } = body

    if (!roundId || !choices || !salt || !signature) {
      throw new BadRequestException('roundId, choices, salt, signature are required')
    }
    if (!Array.isArray(choices) || choices.length !== 4) {
      throw new BadRequestException('choices must be an array of 4 numbers')
    }

    await this.commitService.save(
      roundId,
      { choices, salt: salt as `0x${string}` },
      signature as `0x${string}`,
    )

    return { ok: true }
  }

  @Get(':roundId')
  async load(
    @Param('roundId') roundId: string,
    @Headers('x-signature') signature: string,
  ) {
    if (!signature) throw new BadRequestException('x-signature header is required')

    return this.commitService.load(roundId, signature as `0x${string}`)
  }

  @Delete(':roundId')
  async remove(
    @Param('roundId') roundId: string,
    @Headers('x-signature') signature: string,
  ) {
    if (!signature) throw new BadRequestException('x-signature header is required')

    await this.commitService.remove(roundId, signature as `0x${string}`)
    return { ok: true }
  }
}
