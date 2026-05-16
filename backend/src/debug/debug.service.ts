import { Injectable } from '@nestjs/common'
import type { StoredProof } from '../proof/proof.service'

export interface LogEntry {
  ts:      number   // Date.now()
  level:   'log' | 'warn' | 'error'
  message: string
}

@Injectable()
export class DebugService {
  private readonly logs: LogEntry[] = []
  private readonly MAX = 60

  push(level: LogEntry['level'], message: string) {
    this.logs.push({ ts: Date.now(), level, message })
    if (this.logs.length > this.MAX) this.logs.shift()
  }

  getState(proofEntries: StoredProof[]) {
    return {
      logs:   [...this.logs].reverse(),   // 최신이 위
      proofs: proofEntries.map(e => ({ roundId: e.roundId, address: e.address })),
    }
  }
}
