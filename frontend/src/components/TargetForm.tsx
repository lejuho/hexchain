'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract } from '@/lib/config'

interface Props {
  roundId: bigint
  perkId: string   // 'g1' | 'g6' | 'g7'
  players: string[]
  onSuccess: () => void
}

const TARGET_KEY = (roundId: bigint) => `target_${roundId}`

const PERK_LABELS: Record<string, { icon: string; title: string; hint: string }> = {
  g1: {
    icon: '🔒',
    title: 'G1 — 봉쇄',
    hint: '타겟 플레이어의 특전 효과를 이번 라운드에서 완전히 무력화합니다.',
  },
  g6: {
    icon: '🪞',
    title: 'G6 — 특전복사',
    hint: '타겟 플레이어의 특전을 자신이 대신 사용합니다. (G-3 보유자 복사 불가)',
  },
  g7: {
    icon: '🎯',
    title: 'G7 — 픽미러링',
    hint: '타겟 플레이어의 최고배율 생존 픽을 탈취합니다. (G-3 보유자 면역)',
  },
  g4: {
    icon: '🔄',
    title: 'G4 — 강제 교환',
    hint: '타겟의 최고배율 생존 픽과 내 최저배율 생존 픽을 강제로 교환합니다. (G-3 보유자 면역)',
  },
  c8: {
    icon: '🔀',
    title: 'C8 — 순서 교란',
    hint: '타겟 플레이어의 B 특전 효과를 무력화합니다. (G-3 보유자 면역)',
  },
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export function TargetForm({ roundId, perkId, players, onSuccess }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [isDone, setIsDone]     = useState(false)

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    const saved = localStorage.getItem(TARGET_KEY(roundId))
    if (saved) setIsDone(true)
  }, [roundId])

  useEffect(() => {
    if (isSuccess) {
      localStorage.setItem(TARGET_KEY(roundId), selected ?? '')
      setIsDone(true)
      onSuccess()
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) {
    const saved = localStorage.getItem(TARGET_KEY(roundId)) ?? ''
    return (
      <div className="hx-hint green" style={{ margin: '10px 20px 0' }}>
        <span style={{ fontSize: 14 }}>✓</span>
        <div>타겟 지정 완료 — {saved ? shortAddr(saved) : '(주소 없음)'}</div>
      </div>
    )
  }

  const info = PERK_LABELS[perkId]
  if (!info) return null

  const handleSet = () => {
    if (!selected) return
    writeContract({
      ...hexChainContract,
      functionName: 'setTarget',
      args: [roundId, selected as `0x${string}`],
    })
  }

  return (
    <>
      <div className="hx-sec" style={{ marginTop: 16 }}>
        {info.icon} {info.title}
      </div>
      <div style={{ padding: '4px 20px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        {info.hint}
      </div>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 20px' }}>
        {players.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
            상대 플레이어 없음
          </div>
        ) : (
          players.map(addr => (
            <button
              key={addr}
              onClick={() => setSelected(addr)}
              style={{
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                background: selected === addr ? 'rgba(192,132,252,.2)' : 'var(--surface2)',
                color: selected === addr ? '#c084fc' : 'var(--text)',
                border: selected === addr ? '2px solid #c084fc' : '1px solid var(--border)',
                fontFamily: 'var(--mono)', fontSize: 13,
              }}
            >
              {addr}
            </button>
          ))
        )}
      </div>
      <div style={{ height: 16 }} />
      <button
        onClick={handleSet}
        disabled={!selected || isPending || isConfirming}
        className="hx-btn hx-btn-primary"
      >
        {isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : '타겟 지정 🎯'}
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
