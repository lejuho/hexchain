'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { HEX_LABELS, computeNibbleMult, d2ExtraStorageKey } from '@/lib/utils'

interface Props {
  roundId: bigint
  revealHash: `0x${string}`
  onSuccess: () => void
}

const STORAGE_KEY = d2ExtraStorageKey

export function ExtraPickForm({ roundId, revealHash, onSuccess }: Props) {
  const { address } = useAccount()
  const nibbleMult = computeNibbleMult(revealHash)
  const [selected, setSelected] = useState<number | null>(null)
  const [isDone, setIsDone] = useState(false)

  const { data: wasLast } = useReadContract({
    ...hexChainContract,
    functionName: 'wasLastInPrevRound',
    args: address ? [roundId, address] : undefined,
    query: { enabled: !!address },
  })

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY(roundId))) setIsDone(true)
  }, [roundId])

  useEffect(() => {
    if (isSuccess) {
      localStorage.setItem(STORAGE_KEY(roundId), String(selected))
      setIsDone(true)
      onSuccess()
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) {
    const saved = localStorage.getItem(STORAGE_KEY(roundId))
    const nibble = saved !== null ? Number(saved) : null
    return (
      <div className="hx-hint green" style={{ margin: '10px 20px 0' }}>
        <span style={{ fontSize: 14 }}>✓</span>
        <div>D2 추가 픽 선언 완료{nibble !== null ? ` — ${HEX_LABELS[nibble]}` : ''}</div>
      </div>
    )
  }

  if (wasLast === false) {
    return (
      <div className="hx-hint" style={{ margin: '10px 20px 0' }}>
        <span style={{ fontSize: 14 }}>ℹ</span>
        <div style={{ fontSize: 12 }}>
          D2 언더독 — 직전 라운드 꼴찌일 때 5번째 픽을 선언할 수 있습니다.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="hx-sec" style={{ marginTop: 16 }}>
        D2 — 언더독 추가 픽
        <span style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0, fontSize: 10, fontWeight: 400 }}>
          &nbsp;— 직전 꼴찌 보너스
        </span>
      </div>
      <div style={{ padding: '4px 20px 0', fontSize: 12, color: '#fbbf24', textAlign: 'center', fontWeight: 600 }}>
        ✓ 직전 라운드 꼴찌 확인 — 5번째 픽을 선언하세요
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '10px 20px 0' }}>
        {HEX_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            style={{
              padding: '10px 4px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
              background: selected === i ? 'rgba(34,197,94,.2)' : 'var(--surface2)',
              color: selected === i ? '#22c55e' : 'var(--text)',
              border: selected === i ? '2px solid #22c55e' : '1px solid var(--border)',
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 10, marginTop: 2 }}>{(nibbleMult[i] / 10).toFixed(1)}×</div>
          </button>
        ))}
      </div>
      <div style={{ height: 12 }} />
      <button
        onClick={() => writeContract({
          ...hexChainContract,
          functionName: 'declareExtraPick',
          args: [roundId, selected as unknown as number],
        })}
        disabled={selected === null || isPending || isConfirming}
        className="hx-btn hx-btn-primary"
      >
        {isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : '5번째 픽 선언 🃏'}
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
