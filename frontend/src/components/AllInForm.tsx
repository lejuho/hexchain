'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { HEX_LABELS, computeNibbleMult, d3AllinStorageKey } from '@/lib/utils'

interface Props {
  roundId: bigint
  revealHash: `0x${string}`
  onSuccess: () => void
}

const STORAGE_KEY = d3AllinStorageKey

export function AllInForm({ roundId, revealHash, onSuccess }: Props) {
  const nibbleMult = computeNibbleMult(revealHash)
  const [selected, setSelected] = useState<number | null>(null)
  const [isDone, setIsDone] = useState(false)

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
        <div>
          D3 올인 선언 완료
          {nibble !== null && ` — ${HEX_LABELS[nibble]} (×${(nibbleMult[nibble] / 10).toFixed(1)})`}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="hx-sec" style={{ marginTop: 16 }}>
        🎲 D3 — 올인 선언
        <span style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0, fontSize: 10, fontWeight: 400 }}>
          &nbsp;— 배율 높은 숫자를 찍어라
        </span>
      </div>
      <div style={{ padding: '6px 20px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        생존 픽이 1개 이하일 때 발동 · 해시에 등장(배율 &gt;1.0)하면 ×1.5 보너스 · 미등장이면 0.5pt
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '10px 20px 0' }}>
        {HEX_LABELS.map((label, i) => {
          const mult = nibbleMult[i]
          const inHash = mult > 10
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              style={{
                padding: '10px 4px',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'center',
                background: selected === i ? 'rgba(251,191,36,.2)' : 'var(--surface2)',
                color: selected === i ? '#fbbf24' : inHash ? 'var(--text)' : 'var(--muted)',
                border: selected === i ? '2px solid #fbbf24' : '1px solid var(--border)',
                opacity: inHash ? 1 : 0.5,
              }}
            >
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 10, marginTop: 2 }}>{(mult / 10).toFixed(1)}×</div>
            </button>
          )
        })}
      </div>
      <div style={{ height: 12 }} />
      <button
        onClick={() => writeContract({
          ...hexChainContract,
          functionName: 'declareAllIn',
          args: [roundId, selected as unknown as number],
        })}
        disabled={selected === null || isPending || isConfirming}
        className="hx-btn hx-btn-primary"
      >
        {isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : '올인 선언 🎲'}
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
