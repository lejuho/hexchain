import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { ChainService } from '../chain/chain.service'
import { EyeRevealService } from '../eye-reveal/eye-reveal.service'
import { DebugService } from '../debug/debug.service'

/**
 * 수정용 의미없는 문장
 * KeeperService v6 (client-side ZK)
 *
 * 상태 전환:
 *   OPEN(0)       → LOCKED(1)     : block > revealBlock, playerCount >= 2 → lockRound()
 *   OPEN(0)       → SETTLED(4)    : block > lockBlock,  playerCount < 2   → expireRound()
 *   LOCKED(1)     → EYE_OPEN(2)   : block > revealBlock + RW  → openEyeGame()
 *   EYE_OPEN(2)   → EYE_LOCKED(3) : block > eyeRevealBlock    → lockEyeRound()
 *   EYE_LOCKED(3)                 : block <= eyeRevealBlock + ERW → eyeRevealFor()
 *   EYE_LOCKED(3) → SETTLED(4)    : block > eyeRevealBlock + ERW → settle()
 *
 *   LOCKED(1): 유저가 직접 RevealForm에서 ZK proof 생성 후 revealFor 호출 (keeper 개입 없음)
 */
@Injectable()
export class KeeperService {
  private readonly logger = new Logger(KeeperService.name)
  private isBusy = false
  private revealWindow: bigint | null = null
  private eyeRevealWindow: bigint | null = null

  constructor(
    private readonly chain:      ChainService,
    private readonly eyeReveals: EyeRevealService,
private readonly debug:      DebugService,
  ) {}

  private log(msg: string)  { this.logger.log(msg);  this.debug.push('log',   msg) }
  private warn(msg: string) { this.logger.warn(msg); this.debug.push('warn',  msg) }

  @Cron('*/10 * * * * *')
  async tick() {
    if (this.isBusy) return
    this.isBusy = true
    try {
      await this.checkAllRounds()
    } catch (err) {
      this.warn(`tick error: ${(err as Error).message}`)
    } finally {
      this.isBusy = false
    }
  }

  private async checkAllRounds() {
    const [allRoundIds, openRoundIds, block] = await Promise.all([
      this.chain.getAllActiveRoundIds(), // 비공개 방 포함 전체 스캔
      this.chain.getOpenRoundIds(),      // Registry — 빈 슬롯 확인용
      this.chain.getBlockNumber(),
    ])

    if (this.revealWindow === null)
      this.revealWindow = await this.chain.getConstant('REVEAL_WINDOW')
    if (this.eyeRevealWindow === null)
      this.eyeRevealWindow = await this.chain.getConstant('EYE_REVEAL_WINDOW')

    // Registry 기준으로 빈 슬롯 없으면 새 방 생성
    if (openRoundIds.length === 0) {
      await this.tryCreateRoom()
    } else {
      const infos = await Promise.all(openRoundIds.map(id => this.chain.getRoundInfo(id)))
      const hasOpenSlot = infos.some(i => i.state === 0 && i.playerCount < 3)
      if (!hasOpenSlot) await this.tryCreateRoom()
    }

    // 비공개 방 포함 모든 활성 라운드 처리 (nonce 충돌 방지를 위해 순차 처리)
    for (const roundId of allRoundIds) {
      await this.checkRound(roundId, block)
    }
  }

  private async tryCreateRoom() {
    this.log('빈 방 없음 — 새 라운드 생성')
    try {
      const newRoundId = await this.chain.createRound()
      this.log(`새 라운드 생성 완료: ${newRoundId}`)
    } catch (err) {
      this.warn(`createRound 실패: ${(err as Error).message}`)
    }
  }

  private async checkRound(roundId: bigint, block: bigint) {
    const info = await this.chain.getRoundInfo(roundId)
    const rw   = this.revealWindow!
    const erw  = this.eyeRevealWindow!

    // ── OPEN: 인원 부족 만료 ────────────────────────────────────────────
    if (info.state === 0 && block > info.lockBlock && info.playerCount < 2) {
      this.log(`[Round ${roundId}] 인원 부족(${info.playerCount}명) — expireRound 호출`)
      try {
        const hash = await this.chain.expireRound(roundId)
        await this.chain.waitForReceipt(hash)
        this.log(`[Round ${roundId}] expireRound 완료`)
        this.chain.unregisterRound(roundId).catch(() => { /* 비공개 방은 Registry 미등록 */ })
      } catch (err) {
        this.warn(`[Round ${roundId}] expireRound failed: ${(err as Error).message}`)
      }
      return
    }

    // ── OPEN → LOCKED ───────────────────────────────────────────────────
    if (info.state === 0 && block > info.revealBlock) {
      this.log(`[Round ${roundId}] lockRound 호출`)
      try {
        const hash = await this.chain.lockRound(roundId)
        await this.chain.waitForReceipt(hash)
        this.log(`[Round ${roundId}] lockRound 완료`)
      } catch (err) {
        this.warn(`[Round ${roundId}] lockRound failed: ${(err as Error).message}`)
      }
      return
    }

    // ── LOCKED: 유저가 직접 RevealForm으로 reveal — keeper 개입 없음 ──────

    // ── LOCKED → EYE_OPEN ───────────────────────────────────────────────
    if (info.state === 1 && block > info.revealBlock + rw) {
      this.log(`[Round ${roundId}] openEyeGame 호출`)
      try {
        const hash = await this.chain.openEyeGame(roundId)
        await this.chain.waitForReceipt(hash)
        this.log(`[Round ${roundId}] openEyeGame 완료`)
      } catch (err) {
        this.warn(`[Round ${roundId}] openEyeGame failed: ${(err as Error).message}`)
      }
      return
    }

    // ── EYE_OPEN → EYE_LOCKED ───────────────────────────────────────────
    if (info.state === 2 && block > info.eyeRevealBlock) {
      this.log(`[Round ${roundId}] lockEyeRound 호출`)
      try {
        const hash = await this.chain.lockEyeRound(roundId)
        await this.chain.waitForReceipt(hash)
        this.log(`[Round ${roundId}] lockEyeRound 완료`)
      } catch (err) {
        this.warn(`[Round ${roundId}] lockEyeRound failed: ${(err as Error).message}`)
      }
      return
    }

    // ── EYE_LOCKED: 눈치 대리 공개 ──────────────────────────────────────
    if (info.state === 3 && block <= info.eyeRevealBlock + erw) {
      const entries = this.eyeReveals.listRound(roundId.toString())
      for (const entry of entries) {
        try {
          const playerInfo = await this.chain.getPlayerInfo(roundId, entry.address)
          if (playerInfo.eyeRevealed) continue

          const hash = await this.chain.eyeRevealFor(
            roundId, entry.address,
            entry.data.order, entry.data.salt,
          )
          await this.chain.waitForReceipt(hash)
          this.log(`[Round ${roundId}] eyeRevealFor ${entry.address} order=${entry.data.order} 완료: ${hash}`)
        } catch (err) {
          const message = (err as Error).message
          if (!message.includes('AlreadyEyeRevealed')) {
            this.warn(`[Round ${roundId}] eyeRevealFor ${entry.address} failed: ${message}`)
          }
        }
      }
    }

    // ── EYE_LOCKED → SETTLED ────────────────────────────────────────────
    if (info.state === 3 && block > info.eyeRevealBlock + erw) {
      this.log(`[Round ${roundId}] settle 호출`)
      try {
        const hash = await this.chain.settle(roundId)
        await this.chain.waitForReceipt(hash)
        this.log(`[Round ${roundId}] settle 완료`)
        this.chain.unregisterRound(roundId).catch(() => { /* 비공개 방은 Registry 미등록 */ })
      } catch (err) {
        this.warn(`[Round ${roundId}] settle failed: ${(err as Error).message}`)
      }
      return
    }

    this.logger.debug(
      `[Round ${roundId}] state=${info.state} block=${block} ` +
      `revealBlock=${info.revealBlock} eyeRevealBlock=${info.eyeRevealBlock}`
    )
  }
}
