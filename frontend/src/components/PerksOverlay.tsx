'use client'

import { useState } from 'react'
import { PERKS, CATS, type Perk, type PerkCat } from '@/lib/perks'

interface Props {
  onClose: () => void
}

const CAT_COLOR: Record<PerkCat, string> = {
  a: '#f87171', b: '#818cf8', c: '#38bdf8',
  d: '#fbbf24', e: '#34d399', f: '#f472b6', g: '#c084fc',
}
const CAT_BG: Record<PerkCat, string> = {
  a: 'rgba(248,113,113,.12)', b: 'rgba(129,140,248,.12)', c: 'rgba(56,189,248,.12)',
  d: 'rgba(251,191,36,.12)', e: 'rgba(52,211,153,.1)', f: 'rgba(244,114,182,.1)', g: 'rgba(192,132,252,.1)',
}
const CAT_BORDER: Record<PerkCat, string> = {
  a: 'rgba(248,113,113,.3)', b: 'rgba(129,140,248,.3)', c: 'rgba(56,189,248,.3)',
  d: 'rgba(251,191,36,.3)', e: 'rgba(52,211,153,.25)', f: 'rgba(244,114,182,.25)', g: 'rgba(192,132,252,.25)',
}

const STR_LABEL: Record<string, string> = { str: '강', mid: '중', wk: '약' }
const STR_COLOR: Record<string, string> = { str: '#f87171', mid: '#fbbf24', wk: '#94a3b8' }
const PHASE_LABEL: Record<string, string> = { p1: '페이즈1', p2: '페이즈2', p12: '1+2', pf: '진입전' }

const CATS_ORDER: PerkCat[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

function PerkDetail({ perk, catColor, onBack }: { perk: Perk; catColor: string; onBack: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg)',
      animation: 'hx-slide-in-right 0.28s cubic-bezier(0.2,0.8,0.2,1)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* 상단바 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(20px + var(--sat)) 20px 16px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--muted)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          ← 목록
        </button>
        <div style={{ flex: 1 }} />
        <div style={{
          fontSize: 11, padding: '3px 9px', borderRadius: 20,
          background: `${catColor}20`, border: `1px solid ${catColor}40`,
          color: catColor, fontWeight: 600,
        }}>
          {CATS[perk.cat].icon} {perk.cat.toUpperCase()}
        </div>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        {/* 특전 이름 */}
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 8, lineHeight: 1.2 }}>
          {perk.name}
        </div>

        {/* 메타 뱃지 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
          <span style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 20,
            background: `${STR_COLOR[perk.str]}18`, border: `1px solid ${STR_COLOR[perk.str]}40`,
            color: STR_COLOR[perk.str], fontWeight: 600,
          }}>
            강도 {STR_LABEL[perk.str]}
          </span>
          <span style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 20,
            background: 'rgba(148,163,184,.1)', border: '1px solid rgba(148,163,184,.2)',
            color: '#94a3b8', fontWeight: 600,
          }}>
            {PHASE_LABEL[perk.phase]}
          </span>
          {perk.isNew && (
            <span style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(52,211,153,.12)', border: '1px solid rgba(52,211,153,.3)',
              color: '#34d399', fontWeight: 600,
            }}>NEW</span>
          )}
          {perk.isDef && (
            <span style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.25)',
              color: '#38bdf8', fontWeight: 600,
            }}>방어형</span>
          )}
        </div>

        {/* 설명 */}
        <div style={{
          fontSize: 15, color: 'var(--text)', lineHeight: 1.7,
          marginBottom: 20,
        }}>
          {perk.desc}
        </div>

        {/* 효과 상세 */}
        {perk.effect && (
          <div style={{
            padding: '16px 18px',
            borderRadius: 14,
            background: `${catColor}0d`,
            border: `1px solid ${catColor}30`,
          }}>
            <div style={{ fontSize: 11, color: catColor, fontWeight: 700, marginBottom: 10, letterSpacing: '0.06em' }}>
              EFFECT
            </div>
            <div style={{
              fontSize: 13, fontFamily: 'var(--mono)',
              color: 'var(--text)', lineHeight: 2,
              whiteSpace: 'pre-line',
            }}>
              {perk.effect}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function PerksOverlay({ onClose }: Props) {
  const [activecat, setActiveCat] = useState<PerkCat | null>(null)
  const [selectedPerk, setSelectedPerk] = useState<Perk | null>(null)

  const catPerks = (cat: PerkCat) =>
    PERKS.filter((p): p is Perk => p !== null && p.cat === cat)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      maxWidth: 430, margin: '0 auto',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      animation: 'hx-slide-up 0.3s cubic-bezier(0.2,0.8,0.2,1)',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(20px + var(--sat)) 20px 16px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.04em' }}>
          🎴 특전 도감
        </div>
        <button
          onClick={onClose}
          style={{
            width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10, background: 'var(--surface2)',
            border: '1px solid var(--border)',
            fontSize: 16, color: 'var(--muted)', cursor: 'pointer',
          }}
        >✕</button>
      </div>

      {/* 본문 스크롤 */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

        {/* 카테고리 그리드 — 선택 전 */}
        {activecat === null && (
          <div style={{ padding: '20px 20px 0' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
              카테고리를 선택하면 해당 특전 목록을 볼 수 있습니다.<br />
              이번 라운드 특전은 게임 참가 시 랜덤 배정됩니다.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CATS_ORDER.map(cat => {
                const { icon, name, desc } = CATS[cat]
                const count = catPerks(cat).length
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCat(cat)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '16px 18px', borderRadius: 16,
                      background: CAT_BG[cat], border: `1px solid ${CAT_BORDER[cat]}`,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      fontSize: 24, width: 44, height: 44, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${CAT_COLOR[cat]}18`, flexShrink: 0,
                    }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: CAT_COLOR[cat], marginBottom: 3 }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                      {count}개 →
                    </div>
                  </button>
                )
              })}
            </div>
            <div style={{ height: 32 }} />
          </div>
        )}

        {/* 특전 목록 — 카테고리 선택 후 */}
        {activecat !== null && (
          <div>
            {/* 카테고리 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}>
              <button
                onClick={() => setActiveCat(null)}
                style={{
                  fontSize: 13, color: 'var(--muted)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                ← 카테고리
              </button>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: CAT_COLOR[activecat] }}>
                {CATS[activecat].icon} {CATS[activecat].name}
              </div>
            </div>

            {/* 카드 목록 */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {catPerks(activecat).map(perk => (
                <button
                  key={perk.id}
                  onClick={() => setSelectedPerk(perk)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '16px 18px', borderRadius: 14,
                    background: 'var(--surface)',
                    border: `1px solid var(--border)`,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                      {perk.name}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                      {perk.desc}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 12,
                      background: `${STR_COLOR[perk.str]}18`,
                      color: STR_COLOR[perk.str], fontWeight: 600,
                    }}>
                      {STR_LABEL[perk.str]}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>→</span>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ height: 24 }} />
          </div>
        )}
      </div>

      {/* 상세 슬라이드 */}
      {selectedPerk && (
        <PerkDetail
          perk={selectedPerk}
          catColor={CAT_COLOR[selectedPerk.cat]}
          onBack={() => setSelectedPerk(null)}
        />
      )}
    </div>
  )
}
