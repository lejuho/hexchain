'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { HEX_LABELS, computeNibbleMult } from '@/lib/utils'
import { useLocalCommit } from '@/hooks/useLocalCommit'

interface Props {
  roundId: bigint
  revealHash: `0x${string}`
  onSuccess: () => void
}

export function B3CommitForm({ roundId, revealHash, onSuccess }: Props) {
  const nibbleMult = computeNibbleMult(revealHash)
  const [selected, setSelected] = useState<number | null>(null)
  const [isDone, setIsDone] = useState(false)
  const { saveCommit } = useLocalCommit(roundId)

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess && selected !== null) {
      // B3: 단일 픽을 choices에 저장 (이전 게임 stale 데이터 덮어쓰기)
      saveCommit({ choices: [selected], salt: '0x0', perkId: 9 })
      setIsDone(true)
      onSuccess()
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) return null

  return (
    <>
      {/* 배율 보드 */}
      <div className="hx-sec" style={{ marginTop: 22 }}>
        B3 — 라스트 스탠드
        <span style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
          &nbsp;— 픽 1개 공개 선언
        </span>
      </div>
      <div style={{ padding: '4px 20px 8px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        단 1개를 공개합니다. 생존 시 ×3.0 + 최대 눈치 배수. 겹치면 0점.
      </div>
      <div className="hx-mult-board">
        {HEX_LABELS.map((label, i) => {
          const mult = nibbleMult[i]
          const isSelected = selected === i
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(i)}
              onKeyDown={e => e.key === 'Enter' && setSelected(i)}
              className={`hx-mb-cell${isSelected ? ' selected' : ''}`}
              style={{ cursor: 'pointer' }}
            >
              <div className="hv">{label}</div>
              <div className="mv" style={{ fontSize: 9 }}>
                {isSelected ? '★' : `${(mult / 10).toFixed(1)}×`}
              </div>
            </div>
          )
        })}
      </div>

      {/* 선택된 픽 표시 */}
      <div className="hx-sec" style={{ marginTop: 16 }}>
        선언 픽 <span style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0 }}>
          ({selected !== null ? '선택됨' : '미선택'})
        </span>
      </div>
      <div className="hx-pick-slots" style={{ justifyContent: 'center' }}>
        <div className={`hx-pick-slot${selected !== null ? ' filled' : ''}`} style={{ width: 64, height: 64, fontSize: 28 }}>
          {selected !== null ? HEX_LABELS[selected] : '?'}
        </div>
      </div>
      {selected !== null && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {(nibbleMult[selected] / 10).toFixed(1)}× · 생존 시 예상 +{((nibbleMult[selected] * 3 * 20 / 10) / 100).toFixed(2)}pt
        </div>
      )}

      <div style={{ height: 16 }} />
      <button
        onClick={() => writeContract({
          ...hexChainContract,
          functionName: 'commitB3',
          args: [roundId, selected as unknown as number],
        })}
        disabled={selected === null || isPending || isConfirming}
        className="hx-btn hx-btn-primary"
      >
        {isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : '라스트 스탠드 선언 ⚔️'}
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
