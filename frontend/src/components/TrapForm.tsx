'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { HEX_LABELS } from '@/lib/utils'

interface Props {
  roundId: bigint
  perkId: string   // 'f1' | 'f2' | 'f4'
  onSuccess: () => void
}

const ZONES = [
  { zone: 1, label: '구간 1', range: '0x0 – 0x3' },
  { zone: 2, label: '구간 2', range: '0x4 – 0x7' },
  { zone: 3, label: '구간 3', range: '0x8 – 0xb' },
  { zone: 4, label: '구간 4', range: '0xc – 0xf' },
]

const TRAP_KEY = (roundId: bigint) => `trap_${roundId}`

export function TrapForm({ roundId, perkId, onSuccess }: Props) {
  const needsNibble = perkId === 'f1' || perkId === 'f4'
  const needsZone   = perkId === 'f2' || perkId === 'f4'

  const [nibble,  setNibble]  = useState<number | null>(null)
  const [zone,    setZone]    = useState<number | null>(null)
  const [isDone,  setIsDone]  = useState(false)

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // 이미 설정된 함정 복원
  useEffect(() => {
    const saved = localStorage.getItem(TRAP_KEY(roundId))
    if (saved) setIsDone(true)
  }, [roundId])

  useEffect(() => {
    if (isSuccess) {
      localStorage.setItem(TRAP_KEY(roundId), JSON.stringify({ nibble, zone }))
      setIsDone(true)
      onSuccess()
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) {
    const saved = JSON.parse(localStorage.getItem(TRAP_KEY(roundId)) ?? '{}')
    return (
      <div className="hx-hint green" style={{ margin: '10px 20px 0' }}>
        <span style={{ fontSize: 14 }}>✓</span>
        <div>
          함정 설정 완료
          {saved.nibble != null && <> — 숫자: <strong>{HEX_LABELS[saved.nibble - 1]}</strong></>}
          {saved.zone   != null && <> / 구간 {saved.zone}</>}
        </div>
      </div>
    )
  }

  const canSubmit = (!needsNibble || nibble !== null) && (!needsZone || zone !== null)

  const handleSet = () => {
    if (!canSubmit) return
    writeContract({
      ...hexChainContract,
      functionName: 'setPickTrap',
      // trapNibble: nibble값+1 (0=없음), trapZone: 1-4 (0=없음)
      args: [roundId, needsNibble ? (nibble! + 1) : 0, needsZone ? zone! : 0],
    })
  }

  return (
    <>
      {needsNibble && (
        <>
          <div className="hx-sec" style={{ marginTop: 16 }}>
            {perkId === 'f4' ? 'F4 — 함정 숫자 (조건 1)' : 'F1 — 함정 숫자'}
          </div>
          <div style={{ padding: '4px 20px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            상대가 이 숫자를 픽했으면 해당 픽 배율이 절반이 됩니다
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, padding: '0 20px' }}>
            {Array.from({ length: 16 }, (_, v) => (
              <button
                key={v}
                onClick={() => setNibble(v)}
                style={{
                  fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700,
                  padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                  background: nibble === v ? 'var(--accent)' : 'var(--surface2)',
                  color: nibble === v ? '#fff' : 'var(--text)',
                  border: nibble === v ? '2px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                {HEX_LABELS[v]}
              </button>
            ))}
          </div>
        </>
      )}

      {needsZone && (
        <>
          <div className="hx-sec" style={{ marginTop: 16 }}>
            {perkId === 'f4' ? 'F4 — 함정 구간 (조건 2)' : 'F2 — 함정 구간'}
          </div>
          <div style={{ padding: '4px 20px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            상대가 이 구간에서 2개 이상 픽했으면 해당 구간 픽을 모두 제거합니다
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '0 20px' }}>
            {ZONES.map(z => (
              <button
                key={z.zone}
                onClick={() => setZone(z.zone)}
                style={{
                  padding: '12px', borderRadius: 10, cursor: 'pointer',
                  background: zone === z.zone ? 'rgba(192,132,252,.2)' : 'var(--surface2)',
                  color: zone === z.zone ? '#c084fc' : 'var(--text)',
                  border: zone === z.zone ? '2px solid #c084fc' : '1px solid var(--border)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700 }}>{z.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{z.range}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {perkId === 'f4' && (
        <div style={{ margin: '10px 20px 0', padding: '8px 12px', borderRadius: 8, background: 'rgba(192,132,252,.08)', border: '1px solid rgba(192,132,252,.2)', fontSize: 11, color: 'var(--muted)' }}>
          ⚠ F4는 두 조건이 <strong>모두</strong> 일치해야 발동합니다. 하나만 일치하면 완전 불발.
        </div>
      )}

      <div style={{ height: 16 }} />
      <button
        onClick={handleSet}
        disabled={!canSubmit || isPending || isConfirming}
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
