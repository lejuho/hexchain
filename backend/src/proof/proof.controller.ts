import { Controller, Post, Body, BadRequestException, Logger } from '@nestjs/common'
import { ProofService, ProofData } from './proof.service'
import { DebugService } from '../debug/debug.service'

interface SaveProofBody {
  roundId:    string
  address:    string
  pA:         [string, string]
  pB:         [[string, string], [string, string]]
  pC:         [string, string]
  pubSignals: [string, string]
}

/**
 * POST /proofs — ZK proof 저장 (브라우저가 commit 후 백그라운드로 전송)
 *
 * 인증 없음: pubSignals는 공개 정보이며, 잘못된 proof는 온체인 revealFor에서 revert됩니다.
 */
@Controller('proofs')
export class ProofController {
  private readonly logger = new Logger(ProofController.name)
  constructor(
    private readonly proofService: ProofService,
    private readonly debug: DebugService,
  ) {}

  @Post()
  save(@Body() body: SaveProofBody) {
    const { roundId, address, pA, pB, pC, pubSignals } = body

    if (!roundId || !address || !pA || !pB || !pC || !pubSignals) {
      throw new BadRequestException('roundId, address, pA, pB, pC, pubSignals are required')
    }

    const proof: ProofData = { pA, pB, pC, pubSignals }
    this.proofService.save(roundId, address, proof)
    const msg = `[Proof] 저장: round=${roundId} addr=${address.slice(0,8)}…`
    this.logger.log(msg)
    this.debug.push('log', msg)
    return { ok: true }
  }
}
