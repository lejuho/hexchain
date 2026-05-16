import { Module } from '@nestjs/common'
import { ZkService } from './zk.service'

@Module({
  providers: [ZkService],
  exports:   [ZkService],
})
export class ZkModule {}
