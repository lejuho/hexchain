import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { ChainModule } from './chain/chain.module'
import { EyeRevealModule } from './eye-reveal/eye-reveal.module'
import { InfoAccessModule } from './info-access/info-access.module'
import { KeeperModule } from './keeper/keeper.module'
import { ProofModule } from './proof/proof.module'
import { DebugModule } from './debug/debug.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ChainModule,
    EyeRevealModule,
    InfoAccessModule,
    KeeperModule,
    ProofModule,
    DebugModule,
  ],
})
export class AppModule {}
