'use client'

import { useEffect, useState } from 'react'

interface Props {
  playerCount: number
  maxPlayers?: number
  onReady?: () => void   // 커밋하기 버튼 콜백 (미커밋 단계)
  readyLabel?: string
}

export function WaitingRoom({ playerCount, maxPlayers = 3, onReady, readyLabel }: Props) {
  const [dots, setDots] = useState('.')

  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '.' : d + '.')
    }, 500)
    return () => clearInterval(id)
  }, [])

  const needed = maxPlayers - playerCount

  return (
    <div style={{
      margin: '24px 20px',
      padding: '28px 20px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      textAlign: 'center',
    }}>
      {/* 플레이어 슬롯 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
        {Array.from({ length: maxPlayers }).map((_, i) => {
          const filled = i < playerCount
          return (
            <div key={i} style={{
              width: 48, height: 48, borderRadius: '50%',
              background: filled ? 'rgba(192,132,252,.2)' : 'var(--surface2)',
              border: filled ? '2px solid #c084fc' : '2px dashed var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
              transition: 'all 0.3s',
            }}>
              {filled ? '⬡' : ''}
            </div>
          )
        })}
      </div>

      {/* 카운트 */}
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        {playerCount} / {maxPlayers}
      </div>

      {/* 상태 메시지 */}
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
        {needed > 0
          ? `${needed}명 더 기다리는 중${dots}`
          : '모든 플레이어 참여 완료!'}
      </div>

      {needed > 0 && (
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', opacity: 0.6 }}>
          다른 플레이어가 같은 라운드에 커밋하면 자동으로 진행됩니다
        </div>
      )}

      {onReady && (
        <button
          className="hx-btn hx-btn-primary"
          onClick={onReady}
          style={{ marginTop: 20, width: '100%' }}
        >
          {readyLabel ?? '커밋하기 ✍️'}
        </button>
      )}
    </div>
  )
}
