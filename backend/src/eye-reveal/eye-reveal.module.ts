import { Module } from '@nestjs/common'
import { EyeRevealService } from './eye-reveal.service'
import { EyeRevealController } from './eye-reveal.controller'

@Module({
  controllers: [EyeRevealController],
  providers:   [EyeRevealService],
  exports:     [EyeRevealService],
})
export class EyeRevealModule {}
