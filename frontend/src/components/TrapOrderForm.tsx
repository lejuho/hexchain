'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract } from '@/lib/config'

interface Props {
  roundId: bigint
  onSuccess: () => void
}

const TRAP_ORDER_KEY = (roundId: bigint) => `g3traporder_${roundId}`

const ORDER_LABELS = [
  { order: 1, label: '1번', desc: '가장 먼저 선택' },
  { order: 2, label: '2번', desc: '두 번째 선택' },
  { order: 3, label: '3번', desc: '가장 마지막 선택' },
]

export function TrapOrderForm({ roundId, onSuccess }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [isDone, setIsDone]     = useState(false)

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    const saved = localStorage.getItem(TRAP_ORDER_KEY(roundId))
    if (saved) setIsDone(true)
  }, [roundId])

  useEffect(() => {
    if (isSuccess) {
      localStorage.setItem(TRAP_ORDER_KEY(roundId), String(selected))
      setIsDone(true)
      onSuccess()
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) {
    const saved = localStorage.getItem(TRAP_ORDER_KEY(roundId))
    return (
      <div className="hx-hint green" style={{ margin: '10px 20px 0' }}>
        <span style={{ fontSize: 14 }}>✓</span>
        <div>G3 함정 설정 완료 — {saved ? `${saved}번` : ''} 순서 선택자에게 발동</div>
      </div>
    )
  }

  const handleSet = () => {
    if (selected === null) return
    writeContract({
      ...hexChainContract,
      functionName: 'setTrapOrder',
      args: [roundId, selected],
    })
  }

  return (
    <>
      <div className="hx-sec" style={{ marginTop: 16 }}>G3 — 순서 함정</div>
      <div style={{ padding: '4px 20px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        함정으로 지정할 눈치게임 순서를 선택하세요. 해당 순서를 선택한 상대는 포기 픽 1개가 추가됩니다.
      </div>
      <div style={{ height: 8 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 20px' }}>
        {ORDER_LABELS.map(({ order, label, desc }) => (
          <button
            key={order}
            onClick={() => setSelected(order)}
            style={{
              padding: '14px 8px',
              borderRadius: 10,
              cursor: 'pointer',
              background: selected === order ? 'rgba(192,132,252,.2)' : 'var(--surface2)',
              color: selected === order ? '#c084fc' : 'var(--text)',
              border: selected === order ? '2px solid #c084fc' : '1px solid var(--border)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{desc}</div>
          </button>
        ))}
      </div>
      <div style={{ height: 12 }} />
      <button
        onClick={handleSet}
        disabled={selected === null || isPending || isConfirming}
        className="hx-btn hx-btn-primary"
      >
        {isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : '함정 설정 🪤'}
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
