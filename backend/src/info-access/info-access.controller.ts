import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import { InfoAccessService, type InfoType } from './info-access.service'

interface NonceBody {
  address: string
  roundId: string
  infoType: InfoType
}

interface RevealBody extends NonceBody {
  nonce: string
  signature: string
}

@Controller('info-access')
export class InfoAccessController {
  constructor(private readonly infoAccessService: InfoAccessService) {}

  @Post('nonce')
  async createNonce(@Body() body: NonceBody) {
    const { address, roundId, infoType } = body
    if (!address || !roundId || !infoType) {
      throw new BadRequestException('address, roundId, infoType are required')
    }

    return this.infoAccessService.createNonce({
      address: address as `0x${string}`,
      roundId,
      infoType,
    })
  }

  @Post('reveal')
  async reveal(@Body() body: RevealBody) {
    const { address, roundId, infoType, nonce, signature } = body
    if (!address || !roundId || !infoType || !nonce || !signature) {
      throw new BadRequestException('address, roundId, infoType, nonce, signature are required')
    }

    return this.infoAccessService.reveal({
      address: address as `0x${string}`,
      roundId,
      infoType,
      nonce,
      signature: signature as `0x${string}`,
    })
  }
}
