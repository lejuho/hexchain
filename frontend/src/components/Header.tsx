'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'

interface Props {
  state: number  // -1=없음, 0=OPEN, 1=LOCKED, 2=EYE_OPEN, 3=EYE_LOCKED, 4=SETTLED
  onPerksClick?: () => void
}

const CHIP_CONFIG: Record<number, { label: string; cls: string }> = {
  0: { label: '● OPEN',     cls: 'open' },
  1: { label: '● LOCKED',   cls: 'locked' },
  2: { label: '● 눈치게임', cls: 'eye' },
  3: { label: '● 리빌 대기', cls: 'eye' },
  4: { label: '● 종료',     cls: 'ended' },
}

export function Header({ state, onPerksClick }: Props) {
  const chip = CHIP_CONFIG[state]

  return (
    <header className="hx-hdr" style={{ paddingTop: 'calc(20px + var(--sat))' }}>
      <div className="hx-logo">
        HEX<span>CHAIN</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {chip && (
          <div className={`hx-chip ${chip.cls}`}>
            {chip.label}
          </div>
        )}
        {onPerksClick && (
          <button
            onClick={onPerksClick}
            style={{
              width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10,
              background: 'rgba(139,92,246,.15)',
              border: '1px solid rgba(139,92,246,.3)',
              cursor: 'pointer',
              fontSize: 17,
              flexShrink: 0,
            }}
            title="특전집"
          >
            🎴
          </button>
        )}
        <ConnectButton
          chainStatus="none"
          showBalance={false}
          accountStatus="avatar"
        />
      </div>
    </header>
  )
}
