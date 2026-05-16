import { Global, Module } from '@nestjs/common'
import { DebugService } from './debug.service'
import { DebugController } from './debug.controller'
import { ProofModule } from '../proof/proof.module'

@Global()
@Module({
  imports:     [ProofModule],
  providers:   [DebugService],
  controllers: [DebugController],
  exports:     [DebugService],
})
export class DebugModule {}
