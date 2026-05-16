import { Module } from '@nestjs/common'
import { ChainModule } from '../chain/chain.module'
import { InfoAccessController } from './info-access.controller'
import { InfoAccessService } from './info-access.service'

@Module({
  imports: [ChainModule],
  controllers: [InfoAccessController],
  providers: [InfoAccessService],
})
export class InfoAccessModule {}
