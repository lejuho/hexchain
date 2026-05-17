'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { generateSalt, HEX_LABELS, computeNibbleMult } from '@/lib/utils'
import { buildCommitHash } from '@/lib/poseidon'
import { useLocalCommit } from '@/hooks/useLocalCommit'
import { perkStringToId } from '@/lib/perks'
import type { Perk } from '@/lib/perks'
import { flog } from '@/lib/flog'
import { useInterpolatedChainClock } from '@/hooks/useInterpolatedChainClock'

const MULT_CLS = ['m10', 'm15', 'm20', 'm25', 'm30'] as const
type MultCls = typeof MULT_CLS[number]

function multClassFromVal(v: number): MultCls {
  if (v >= 30) return 'm30'
  if (v >= 25) return 'm25'
  if (v >= 20) return 'm20'
  if (v >= 15) return 'm15'
  return 'm10'
}
function multLabelFromVal(v: number): string {
  return (v / 10).toFixed(1) + '×'
}

interface Props {
  roundId: bigint
  revealHash: `0x${string}`
  equippedPerk: Perk | null
  hideMultipliers?: boolean
  blocksToLock?: bigint
  deadlineBlock?: bigint
  currentBlock?: bigint
  chainId?: number
  onSuccess: () => void
}

function formatCountdownMs(ms: number | null) {
  if (ms === null) return '--:--.---'
  const total = Math.max(0, Math.ceil(ms))
  const mins = Math.floor(total / 60_000)
  const secs = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function CommitForm({ roundId, revealHash, equippedPerk, hideMultipliers = false, blocksToLock, deadlineBlock, currentBlock, chainId, onSuccess }: Props) {
  const { msUntil } = useInterpolatedChainClock(currentBlock, chainId)
  const timeLeft = deadlineBlock !== undefined ? msUntil(deadlineBlock) : null
  const nibbleMult = computeNibbleMult(revealHash)
  const [selected, setSelected] = useState<number[]>([])
  const [isBuilding, setIsBuilding] = useState(false)
  const { saveCommit } = useLocalCommit(roundId)
  const { address } = useAccount()

  const [isDone, setIsDone] = useState(false)
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess) return
    flog(`[CommitForm] TX 확인 완료 — round=${roundId}`)
    setIsDone(true)
    onSuccess()
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) return null

  const toggle = (v: number) => {
    setSelected(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : prev.length < 4 ? [...prev, v] : prev,
    )
  }

  const handleCommit = async () => {
    if (selected.length !== 4) return
    setIsBuilding(true)
    try {
      const salt = generateSalt()
      const saltBigInt = BigInt(salt)
      const commitHash = buildCommitHash(selected, saltBigInt)
      const perkId = perkStringToId(equippedPerk?.id)
      saveCommit({ choices: selected, salt, perkId })
      if (!address) throw new Error('지갑 연결이 필요합니다')
      flog(`[CommitForm] commit 제출 — round=${roundId} addr=${address.slice(0,8)}`)
      writeContract({
        ...hexChainContract,
        functionName: 'commit',
        args: [roundId, commitHash, perkId],
      })
    } finally {
      setIsBuilding(false)
    }
  }

  const isLoading = isBuilding || isPending || isConfirming

  return (
    <>
      {/* 남은 블록 */}
      {blocksToLock !== undefined && blocksToLock > 0n && (
        <div style={{ margin: '12px 20px 0', padding: '8px 12px', borderRadius: 10, background: blocksToLock <= 3n ? 'rgba(239,68,68,.1)' : 'rgba(99,102,241,.1)', border: `1px solid ${blocksToLock <= 3n ? 'rgba(239,68,68,.3)' : 'rgba(99,102,241,.25)'}`, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          ⏱ 커밋 마감까지{' '}
          <span style={{ color: blocksToLock <= 3n ? '#f87171' : '#a5b4fc', fontWeight: 600 }}>{Number(blocksToLock)}블록</span>
          <span style={{ color: 'var(--muted)', marginLeft: 4 }}>({formatCountdownMs(timeLeft)})</span>
          {' '}남음
        </div>
      )}
      {/* 배율 보드 */}
      <div className="hx-sec" style={{ marginTop: 22 }}>
        배율 보드 <span style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>— 블록 해시 기준</span>
      </div>
      <div className="hx-mult-board">
        {HEX_LABELS.map((label, i) => {
          const order = selected.indexOf(i)
          const isSelected = order !== -1
          const isDisabled = !isSelected && selected.length >= 4
          const cls = multClassFromVal(nibbleMult[i])

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => !isDisabled && toggle(i)}
              onKeyDown={e => e.key === 'Enter' && !isDisabled && toggle(i)}
              className={`hx-mb-cell ${cls}${isSelected ? ' selected' : ''}${isDisabled ? ' disabled' : ''}${hideMultipliers && !isSelected ? ' fog' : ''}`}
            >
              <div className="hv">{label}</div>
              <div className="mv">{hideMultipliers && !isSelected ? '?' : mutLabel(nibbleMult[i], isSelected, order)}</div>
            </div>
          )
        })}
      </div>

      {/* 픽 슬롯 */}
      <div className="hx-sec" style={{ marginTop: 16 }}>
        내 픽 선택 <span style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0 }}>({selected.length}/4)</span>
        {selected.length > 0 && (
          <button
            onClick={() => { setSelected([]); reset() }}
            style={{ fontSize: 10, color: 'var(--muted)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            초기화
          </button>
        )}
      </div>
      <div className="hx-pick-slots">
        {[0, 1, 2, 3].map(i => {
          const v = selected[i]
          const filled = v !== undefined
          return (
            <div key={i} className={`hx-pick-slot${filled ? ' filled' : ''}`}>
              {filled ? HEX_LABELS[v] : <span style={{ fontSize: 22, opacity: 0.3 }}>·</span>}
              <span className="slot-order">{i + 1}번째</span>
            </div>
          )
        })}
      </div>

      {/* 장착된 특전 표시 */}
      {equippedPerk && (
        <>
          <div className="hx-sec" style={{ marginTop: 16 }}>장착된 특전</div>
          <div className="hx-perk-slot" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <div className="pn">{equippedPerk.name}</div>
            <div className="ph" style={{ fontSize: 11, lineHeight: 1.5, whiteSpace: 'normal' }}>{equippedPerk.desc}</div>
          </div>
        </>
      )}

      {/* 커밋 버튼 */}
      <div style={{ height: 16 }} />
      <button
        onClick={handleCommit}
        disabled={selected.length !== 4 || isLoading}
        className="hx-btn hx-btn-primary"
      >
        {isBuilding ? '해시 계산 중…' : isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : '커밋하기 🔒'}
      </button>

      {error && (
        <div style={{ margin: '8px 20px 0', fontSize: 12, color: 'var(--red)' }}>
          {(error as { shortMessage?: string }).shortMessage ?? error.message}
        </div>
      )}
      <div style={{ height: 8 }} />
    </>
  )
}

// 선택 순서 또는 배율 표시
function mutLabel(mult: number, isSelected: boolean, order: number): string {
  if (isSelected) return `#${order + 1}`
  return multLabelFromVal(mult)
}
