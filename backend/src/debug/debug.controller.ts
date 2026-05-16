import { Controller, Get } from '@nestjs/common'
import { DebugService } from './debug.service'
import { ProofService } from '../proof/proof.service'

@Controller('debug')
export class DebugController {
  constructor(
    private readonly debug:  DebugService,
    private readonly proofs: ProofService,
  ) {}

  @Get()
  state() {
    const allProofs = this.proofs.listAll()
    return this.debug.getState(allProofs)
  }
}
