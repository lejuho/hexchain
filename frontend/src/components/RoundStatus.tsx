'use client'

import { ROUND_STATE_LABEL } from '@/lib/utils'
import { useInterpolatedChainClock } from '@/hooks/useInterpolatedChainClock'

const REVEAL_WINDOW     = 30n
const EYE_REVEAL_WINDOW = 30n

interface Props {
  roundId: bigint
  state: number
  startBlock: bigint
  lockBlock: bigint
  revealBlock: bigint
  eyeLockBlock: bigint
  eyeRevealBlock: bigint
  playerCount: number
  revealHash: `0x${string}`
  currentBlock: bigint
  chainId?: number
}

const STATE_COLOR: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: 'rgba(34,197,94,.12)',  border: 'rgba(34,197,94,.35)',  text: '#4ade80' },
  1: { bg: 'rgba(234,179,8,.12)',  border: 'rgba(234,179,8,.35)',  text: '#facc15' },
  2: { bg: 'rgba(99,102,241,.12)', border: 'rgba(99,102,241,.35)', text: '#818cf8' },
  3: { bg: 'rgba(249,115,22,.12)', border: 'rgba(249,115,22,.35)', text: '#fb923c' },
  4: { bg: 'rgba(100,116,139,.12)',border: 'rgba(100,116,139,.35)', text: '#94a3b8' },
}

const NEXT_LABEL: Record<number, string> = {
  0: '커밋 마감',
  1: '리빌 마감',
  2: '순서 커밋 마감',
  3: '순서 리빌 마감',
}

function fmtMs(ms: number | null) {
  if (ms === null) return '--:--.---'
  if (ms <= 0) return '00:00.000'
  const total = Math.ceil(ms)
  const mins = Math.floor(total / 60_000)
  const secs = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function RoundStatus({
  roundId,
  state,
  lockBlock,
  revealBlock,
  eyeLockBlock,
  eyeRevealBlock,
  playerCount,
  currentBlock,
  chainId,
}: Props) {
  const revealDeadline = revealBlock + REVEAL_WINDOW
  const settleBlock    = eyeRevealBlock + EYE_REVEAL_WINDOW
  const { blockMs, msUntil } = useInterpolatedChainClock(currentBlock, chainId)

  const nextTarget: bigint | null =
    state === 0 ? lockBlock       :
    state === 1 ? revealDeadline  :
    state === 2 ? eyeLockBlock    :
    state === 3 ? settleBlock     :
    null

  const nextBlocksLeft = nextTarget !== null && currentBlock < nextTarget ? nextTarget - currentBlock : 0n
  const nextMs = nextTarget !== null ? msUntil(nextTarget) : null
  const transitionPending = nextTarget !== null && currentBlock > nextTarget
  const transitionLabel =
    state === 0 && playerCount < 2 ? '인원 부족 확인 대기' :
    state === 0 ? '커밋 마감 · 잠금 대기' :
    state === 1 ? '리빌 마감 · 눈치게임 개시 대기' :
    state === 2 ? '순서 커밋 마감 · 잠금 대기' :
    state === 3 ? '순서 리빌 마감 · 정산 대기' :
    ''
  const color = transitionPending
    ? { bg: 'rgba(255,184,75,.12)', border: 'rgba(255,184,75,.42)', text: '#ffb84b' }
    : STATE_COLOR[state] ?? STATE_COLOR[4]
  const phaseStart =
    state === 0 ? currentBlock < lockBlock ? lockBlock - 30n : lockBlock :
    state === 1 ? revealBlock :
    state === 2 ? eyeLockBlock > 30n ? eyeLockBlock - 30n : 0n :
    state === 3 ? eyeRevealBlock :
    0n
  const phaseTotalBlocks = nextTarget !== null && nextTarget > phaseStart ? Number(nextTarget - phaseStart) : 0
  const phaseLeftBlocks = Number(nextBlocksLeft)
  const progress = phaseTotalBlocks > 0
    ? Math.min(1, Math.max(0, (phaseTotalBlocks - phaseLeftBlocks) / phaseTotalBlocks))
    : state === 4 ? 1 : 0

  const stages = [
    { label: 'Commit', target: lockBlock },
    { label: 'Reveal', target: revealBlock > 0n ? revealDeadline : 0n },
    { label: 'Seq Commit', target: eyeLockBlock },
    { label: 'Seq Reveal', target: eyeRevealBlock > 0n ? settleBlock : 0n },
  ]

  return (
    <div className="hx-phase-card" style={{
      margin: '0 0 16px',
      padding: '20px 20px',
      borderRadius: 16,
      background: color.bg,
      border: `1px solid ${color.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Round #{roundId.toString()}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: color.text, letterSpacing: '0.02em' }}>
            {ROUND_STATE_LABEL[state] ?? 'UNKNOWN'}
          </div>
        </div>

        {state !== 4 && nextTarget !== null ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.06em' }}>
              {transitionPending ? '전환 상태' : `${NEXT_LABEL[state] ?? '다음 단계'}까지`}
            </div>
            <div style={{ fontSize: transitionPending ? 16 : 24, fontWeight: 800, fontFamily: transitionPending ? 'var(--sans)' : 'var(--mono)', color: color.text, lineHeight: 1.15 }}>
              {transitionPending ? transitionLabel : <span className="hx-countdown">{fmtMs(nextMs)}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {transitionPending ? 'Keeper / 체인 반영을 기다리는 중' : `${nextBlocksLeft.toString()} 블록 · 추정 ${(blockMs / 1000).toFixed(2)}s/block`}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>게임 종료</div>
        )}
      </div>

      {transitionPending && (
        <div className="hx-transition-pending">
          마감은 지났습니다. 체인 트랜잭션이 반영되면 자동으로 다음 단계로 넘어갑니다.
        </div>
      )}

      {state !== 4 && nextTarget !== null && (
        <div className={`hx-progress-wrap${transitionPending ? ' pending' : ''}`}>
          <div className="hx-progress-track">
            <div className="hx-progress-fill" style={{ width: `${progress * 100}%`, background: color.text }} />
            <div className="hx-progress-glow" style={{ left: `${progress * 100}%`, background: color.text }} />
          </div>
          <div className="hx-progress-meta">
            <span>{Math.round(progress * 100)}%</span>
            <span>{phaseLeftBlocks} blocks left</span>
          </div>
        </div>
      )}

      <div className="hx-stage-grid">
        {stages.map(({ label, target }, i) => {
          const unavailable = target === 0n
          const done = i < state
          const activePending = i === state && transitionPending
          const targetReached = !unavailable && currentBlock > target
          const left = unavailable ? null : currentBlock < target ? target - currentBlock : 0n
          return (
            <div key={label} className={`hx-stage-row${i === state ? ' active' : ''}${done ? ' done' : ''}${activePending ? ' pending' : ''}`}>
              <span>{label}</span>
              <strong>{unavailable ? '대기' : done ? '완료' : activePending || targetReached ? '전환 대기' : fmtMs(msUntil(target))}</strong>
              <em>{unavailable ? '—' : `${left?.toString() ?? '0'} blk`}</em>
            </div>
          )
        })}
      </div>
    </div>
  )
}
