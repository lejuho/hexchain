'use client'

import { useState, useEffect } from 'react'
import { ROUND_STATE_LABEL } from '@/lib/utils'

// 컨트랙트 상수 (온체인 값과 동일)
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
  0: { bg: 'rgba(34,197,94,.12)',  border: 'rgba(34,197,94,.35)',  text: '#4ade80' },  // OPEN
  1: { bg: 'rgba(234,179,8,.12)',  border: 'rgba(234,179,8,.35)',  text: '#facc15' },  // LOCKED
  2: { bg: 'rgba(99,102,241,.12)', border: 'rgba(99,102,241,.35)', text: '#818cf8' },  // SEQ_OPEN
  3: { bg: 'rgba(249,115,22,.12)', border: 'rgba(249,115,22,.35)', text: '#fb923c' },  // SEQ_LOCKED
  4: { bg: 'rgba(100,116,139,.12)',border: 'rgba(100,116,139,.35)','text': '#94a3b8' },// SETTLED
}

const NEXT_LABEL: Record<number, string> = {
  0: '커밋 마감',
  1: '리빌 마감까지',
  2: '순서 커밋 마감',
  3: '순서 리빌 마감',
}

function blockSec(chainId?: number) {
  if (chainId === 84532) return 2
  if (chainId === 31337) return 2
  return 12
}

function useSecondsLeft(blocksLeft: bigint, chainId?: number): number {
  const total = Number(blocksLeft) * blockSec(chainId)
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    setSecs(total)
    if (total <= 0) return
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [total])

  return secs
}

function fmtSecs(secs: number) {
  if (secs <= 0) return '지금'
  if (secs >= 60) return `${Math.ceil(secs / 60)}분`
  return `${secs}초`
}

export function RoundStatus({
  roundId,
  state,
  lockBlock,
  revealBlock,
  eyeLockBlock,
  eyeRevealBlock,
  currentBlock,
  chainId,
}: Props) {
  const revealDeadline = revealBlock + REVEAL_WINDOW   // LOCKED → openEyeGame 가능 시점
  const settleBlock    = eyeRevealBlock + EYE_REVEAL_WINDOW

  function blocksLeft(target: bigint) {
    return currentBlock < target ? target - currentBlock : 0n
  }

  // 다음 단계 마감까지 남은 블록
  // state=0(OPEN): lockBlock = startBlock + COMMIT_WINDOW (revealBlock은 아직 0)
  // state=1(LOCKED): revealBlock + REVEAL_WINDOW
  // state=2(SEQ_OPEN): eyeLockBlock (openEyeGame 호출 시 설정)
  // state=3(SEQ_LOCKED): eyeRevealBlock + EYE_REVEAL_WINDOW
  const nextTarget: bigint | null =
    state === 0 ? lockBlock       :
    state === 1 ? revealDeadline  :
    state === 2 ? eyeLockBlock    :
    state === 3 ? settleBlock     :
    null

  const blLeft = nextTarget !== null ? blocksLeft(nextTarget) : 0n
  const secs = useSecondsLeft(blLeft, chainId)
  const color = STATE_COLOR[state] ?? STATE_COLOR[4]

  return (
    <div style={{
      margin: '0 0 16px',
      padding: '20px 20px',
      borderRadius: 16,
      background: color.bg,
      border: `1px solid ${color.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      {/* 현재 단계 */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Round #{roundId.toString()}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: color.text, letterSpacing: '0.02em' }}>
          {ROUND_STATE_LABEL[state] ?? 'UNKNOWN'}
        </div>
      </div>

      {/* 남은 시간 */}
      {state !== 4 && nextTarget !== null && (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.06em' }}>
            {NEXT_LABEL[state] ?? '다음 단계'}까지
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: color.text, lineHeight: 1 }}>
            {blLeft <= 0n ? '지금' : fmtSecs(secs)}
          </div>
          {blLeft > 0n && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {blLeft.toString()} 블록
            </div>
          )}
        </div>
      )}

      {state === 4 && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>게임 종료</div>
      )}
    </div>
  )
}
