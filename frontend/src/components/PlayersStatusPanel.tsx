'use client'

import type { AllPlayerInfo } from '@/hooks/useOtherPlayersPerks'

interface Props {
  players: AllPlayerInfo[]
  showDeclared?: boolean
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

const ORDER_LABELS = ['', '1번째', '2번째', '3번째']

const CAT_COLOR: Record<string, string> = {
  a: '#f87171', b: '#818cf8', c: '#38bdf8',
  d: '#fbbf24', e: '#34d399', f: '#f472b6', g: '#c084fc',
}

function perkCat(perkStringId: string | null): string | null {
  if (!perkStringId) return null
  return perkStringId[0] // 'a1' → 'a'
}

export function PlayersStatusPanel({ players, showDeclared = false }: Props) {
  if (players.length === 0) return null

  return (
    <div style={{ margin: '16px 20px 0' }}>
      <div className="hx-sec" style={{ marginBottom: 10 }}>참여 플레이어</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {players.map(p => {
          const cat = perkCat(p.perkStringId)
          const accentColor = p.isMe ? '#818cf8' : (cat ? CAT_COLOR[cat] : 'var(--muted)')
          const hasPerk = !!p.perkName

          return (
            <div
              key={p.address}
              style={{
                borderRadius: 16,
                background: p.isMe ? 'rgba(99,102,241,.1)' : 'rgba(25,25,40,.7)',
                border: `1px solid ${p.isMe ? 'rgba(99,102,241,.35)' : 'rgba(100,100,120,.2)'}`,
                overflow: 'hidden',
              }}
            >
              {/* 주소 행 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px',
                borderBottom: hasPerk ? '1px solid rgba(255,255,255,.05)' : 'none',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: accentColor,
                  boxShadow: `0 0 6px ${accentColor}`,
                }} />
                <span style={{
                  fontFamily: 'monospace', fontSize: 13,
                  color: p.isMe ? '#a5b4fc' : 'var(--muted)',
                  fontWeight: p.isMe ? 700 : 400,
                  flex: 1,
                }}>
                  {p.isMe ? `YOU  (${shortAddr(p.address)})` : shortAddr(p.address)}
                </span>
                {showDeclared && p.declaredOrder > 0 && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.3)',
                    color: '#fbbf24', fontWeight: 600,
                  }}>
                    {ORDER_LABELS[p.declaredOrder]}
                  </span>
                )}
              </div>

              {/* 특전 본문 */}
              {hasPerk ? (
                <div style={{ padding: '12px 14px' }}>
                  {/* 특전 이름 */}
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: accentColor,
                    marginBottom: 6,
                  }}>
                    {p.perkName}
                  </div>
                  {/* 설명 */}
                  {p.perkDesc && (
                    <div style={{
                      fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                      marginBottom: p.perkEffect ? 10 : 0,
                    }}>
                      {p.perkDesc}
                    </div>
                  )}
                  {/* 효과 블록 */}
                  {p.perkEffect && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 10,
                      background: `${accentColor}10`,
                      border: `1px solid ${accentColor}25`,
                      fontSize: 12, fontFamily: 'var(--mono)',
                      color: 'var(--text)', lineHeight: 1.9,
                      whiteSpace: 'pre-line',
                    }}>
                      {p.perkEffect}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 14px', fontSize: 12, color: 'rgba(150,150,170,.4)' }}>
                  특전 없음
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
