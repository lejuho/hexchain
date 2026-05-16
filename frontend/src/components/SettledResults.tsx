'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useSettledResults } from '@/hooks/useSettledResults'
import type { AllPlayerInfo } from '@/hooks/useOtherPlayersPerks'

interface Props {
  roundId: bigint
  players: AllPlayerInfo[]
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

// 눈치게임 순서별 등장 딜레이 (ms)
const SEQ_DELAY: Record<number, number> = { 1: 400, 2: 2000, 3: 3800 }
const RANK_REVEAL_DELAY = 5800 // 전원 등장 후 순위 공개

const RANK_EMOJI = ['🥇', '🥈', '🥉']
const SEQ_LABEL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' }

// 점수 카운트업 훅
function useCountUp(target: number, started: boolean, duration = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!started) { setVal(0); return }
    const steps = 40
    const step = target / steps
    const interval = duration / steps
    let cur = 0
    const id = setInterval(() => {
      cur += step
      if (cur >= target) { setVal(target); clearInterval(id) }
      else setVal(cur)
    }, interval)
    return () => clearInterval(id)
  }, [started, target, duration])
  return val
}

// 헥사곤 캐릭터 SVG
function HexChar({ color, label, size = 56 }: { color: string; label: string; size?: number }) {
  const r = size / 2
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6
    return `${r + r * 0.9 * Math.cos(a)},${r + r * 0.9 * Math.sin(a)}`
  }).join(' ')
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon points={pts} fill={color} opacity={0.18} />
      <polygon points={pts} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />
      <text
        x={r} y={r + 1}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.38} fontWeight={700}
        fill={color} fontFamily="monospace"
      >
        {label}
      </text>
    </svg>
  )
}

function PlayerCard({
  player, rank, score, visible, isMe,
}: {
  player: AllPlayerInfo
  rank: number | null
  score: number
  visible: boolean
  isMe: boolean
}) {
  const countedScore = useCountUp(score / 100, visible)
  const seqColor = player.eyeOrder === 1 ? '#4bffb0' : player.eyeOrder === 2 ? '#fbbf24' : '#f87171'
  const charLabel = (player.address.slice(2, 4)).toUpperCase()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.85)',
      transition: 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.2,0.8,0.2,1)',
      flex: 1,
    }}>
      {/* 순서 배지 */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        padding: '2px 8px', borderRadius: 20,
        background: `${seqColor}22`, border: `1px solid ${seqColor}66`,
        color: seqColor, fontFamily: 'var(--mono)',
      }}>
        {player.eyeOrder > 0 ? `${SEQ_LABEL[player.eyeOrder]} seq` : '—'}
      </div>

      {/* 헥사곤 캐릭터 */}
      <div style={{ position: 'relative' }}>
        <HexChar color={isMe ? '#818cf8' : '#c4b5fd'} label={charLabel} size={64} />
        {rank !== null && (
          <div style={{
            position: 'absolute', top: -8, right: -8,
            fontSize: 20, lineHeight: 1,
            filter: 'drop-shadow(0 0 4px rgba(0,0,0,.8))',
          }}>
            {RANK_EMOJI[rank]}
          </div>
        )}
      </div>

      {/* 주소 */}
      <div style={{ fontSize: 11, fontFamily: 'monospace', color: isMe ? '#a5b4fc' : 'var(--muted)' }}>
        {isMe ? 'YOU' : shortAddr(player.address)}
      </div>

      {/* 점수 */}
      <div style={{
        fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)',
        color: isMe ? '#a5b4fc' : 'var(--text)',
        minWidth: 60, textAlign: 'center',
      }}>
        {countedScore.toFixed(2)}
      </div>

      {/* 특전 */}
      {player.perkName && (
        <div style={{
          fontSize: 10, color: 'var(--muted)', textAlign: 'center',
          padding: '2px 8px', borderRadius: 6,
          background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
          maxWidth: 90,
        }}>
          {player.perkName}
        </div>
      )}
    </div>
  )
}

export function SettledResults({ roundId, players }: Props) {
  const { address } = useAccount()
  const results = useSettledResults(roundId, true)

  const [visibleOrders, setVisibleOrders] = useState<Set<number>>(new Set())
  const [showRanks, setShowRanks] = useState(false)

  // 순서별 시차 등장
  useEffect(() => {
    if (!results || results.cancelled) return

    // eyeOrder 기준 순서대로 등장
    const orders = [1, 2, 3]
    const timers: ReturnType<typeof setTimeout>[] = []

    orders.forEach(order => {
      const delay = SEQ_DELAY[order] ?? 400
      timers.push(setTimeout(() => {
        setVisibleOrders(prev => new Set([...prev, order]))
      }, delay))
    })

    timers.push(setTimeout(() => setShowRanks(true), RANK_REVEAL_DELAY))

    return () => timers.forEach(clearTimeout)
  }, [results])

  // 로딩
  if (results === null) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
      순위 불러오는 중...
    </div>
  )

  // 취소
  if (results === false || results.cancelled) return (
    <div style={{ padding: '32px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🚫</div>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>라운드 취소됨</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        {results && 'committedCount' in results && results.committedCount < 2
          ? `인원 부족으로 취소되었습니다 (${results.committedCount}명 참여)`
          : '라운드가 취소되었습니다'}
      </div>
    </div>
  )

  // score 맵 (address → score×100)
  const scoreMap = new Map<string, number>()
  results.top3.forEach((addr, i) => {
    if (addr !== '0x0000000000000000000000000000000000000000')
      scoreMap.set(addr.toLowerCase(), Number(results.scores[i]))
  })

  // rank 맵 (address → 0-based rank)
  const rankMap = new Map<string, number>()
  results.top3.forEach((addr, i) => {
    if (addr !== '0x0000000000000000000000000000000000000000')
      rankMap.set(addr.toLowerCase(), i)
  })

  const myRank = results.myRank

  // eyeOrder 순으로 정렬 (0이면 맨 뒤)
  const sortedPlayers = [...players].sort((a, b) => {
    const oa = a.eyeOrder || 99
    const ob = b.eyeOrder || 99
    return oa - ob
  })

  return (
    <div style={{ padding: '24px 0' }}>
      {/* 내 결과 배너 */}
      <div style={{
        margin: '0 20px 24px',
        padding: '14px 16px',
        borderRadius: 14,
        background: myRank
          ? myRank === 1 ? 'rgba(251,191,36,.12)' : 'rgba(99,102,241,.1)'
          : 'rgba(100,100,120,.1)',
        border: `1px solid ${myRank === 1 ? 'rgba(251,191,36,.35)' : 'rgba(99,102,241,.3)'}`,
        textAlign: 'center',
        opacity: showRanks ? 1 : 0,
        transform: showRanks ? 'scale(1)' : 'scale(0.95)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>
        {myRank ? (
          <>
            <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 6 }}>{RANK_EMOJI[myRank - 1]}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
              {myRank === 1 ? '우승!' : myRank === 2 ? '2위' : '3위'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>순위권 밖</div>
        )}
      </div>

      {/* 플레이어 카드 (순서별 시차 등장) */}
      <div style={{ display: 'flex', gap: 12, padding: '0 20px', marginBottom: 28 }}>
        {sortedPlayers.map(p => {
          const addrLow = p.address.toLowerCase()
          const score = scoreMap.get(addrLow) ?? 0
          const rank = showRanks ? (rankMap.get(addrLow) ?? null) : null
          const isMe = address?.toLowerCase() === addrLow
          const order = p.eyeOrder || 0
          const visible = order > 0 ? visibleOrders.has(order) : visibleOrders.size > 0

          return (
            <PlayerCard
              key={p.address}
              player={p}
              rank={rank}
              score={score}
              visible={visible}
              isMe={isMe}
            />
          )
        })}
      </div>

      {/* 최종 순위 리스트 */}
      <div style={{
        margin: '0 20px',
        opacity: showRanks ? 1 : 0,
        transform: showRanks ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s',
      }}>
        <div className="hx-sec" style={{ marginBottom: 8 }}>최종 순위</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.top3.map((addr, i) => {
            if (addr === '0x0000000000000000000000000000000000000000') return null
            const isMe = address?.toLowerCase() === addr.toLowerCase()
            const score = Number(results.scores[i]) / 100
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 12,
                background: isMe ? 'rgba(99,102,241,.12)' : 'rgba(30,30,40,.6)',
                border: `1px solid ${isMe ? 'rgba(99,102,241,.4)' : 'rgba(100,100,120,.2)'}`,
              }}>
                <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{RANK_EMOJI[i]}</span>
                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, color: isMe ? '#a5b4fc' : 'var(--muted)' }}>
                  {isMe ? 'YOU' : shortAddr(addr)}
                </span>
                <span style={{ fontWeight: 800, fontSize: 18, fontFamily: 'var(--mono)', color: isMe ? '#a5b4fc' : 'var(--text)' }}>
                  {score.toFixed(2)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>pt</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
