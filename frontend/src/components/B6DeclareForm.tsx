'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract } from '@/lib/config'

interface Props {
  roundId: bigint
  onSuccess: () => void
}

const OPTS = [
  { order: 1, label: '1번째', sub: '먼저 공개하는 척' },
  { order: 2, label: '2번째', sub: '두 번째 공개하는 척' },
  { order: 3, label: '3번째', sub: '마지막 공개하는 척' },
]

export function B6DeclareForm({ roundId, onSuccess }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [isDone, setIsDone] = useState(false)
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) { setIsDone(true); onSuccess() }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) return (
    <div style={{ margin: '12px 20px', padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.3)', fontSize: 13, color: '#a5b4fc', textAlign: 'center' }}>
      ✓ 페이크 선언 완료 — 상대에게 공개됩니다
    </div>
  )

  const isBusy = isPending || isConfirming

  return (
    <div style={{ margin: '16px 20px 0' }}>
      <div className="hx-sec">C10 — 페이크 선언</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 10 }}>
        상대에게 공개할 허위 공개 순서를 선택하세요
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {OPTS.map(opt => (
          <button
            key={opt.order}
            onClick={() => setSelected(opt.order)}
            style={{
              flex: 1, padding: '12px 6px', borderRadius: 10, border: '1px solid',
              borderColor: selected === opt.order ? '#818cf8' : 'rgba(100,100,120,.3)',
              background: selected === opt.order ? 'rgba(99,102,241,.15)' : 'rgba(30,30,40,.4)',
              color: selected === opt.order ? '#a5b4fc' : 'var(--muted)',
              cursor: 'pointer', fontSize: 13, fontWeight: selected === opt.order ? 600 : 400,
              textAlign: 'center',
            }}
          >
            <div>{opt.label}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>{opt.sub}</div>
          </button>
        ))}
      </div>
      <div style={{ height: 10 }} />
      <button
        className="hx-btn hx-btn-primary"
        style={{ width: '100%' }}
        disabled={!selected || isBusy}
        onClick={() => writeContract({
          ...hexChainContract,
          functionName: 'declareForReveal',
          args: [roundId, selected as number],
        })}
      >
        {isBusy ? '전송 중...' : '페이크 선언하기'}
      </button>
    </div>
  )
}
