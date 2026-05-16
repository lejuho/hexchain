'use client'

import { useState } from 'react'
import { HEX_LABELS } from '@/lib/utils'
import type { OtherPlayerInfo } from '@/hooks/useOtherPlayersPerks'
import { usePerkInfoAccess } from '@/hooks/usePerkInfoAccess'

interface Props {
  roundId: bigint
  equippedPerkId: string | null
  myChoices: number[]          // 내 4픽 nibble values
  mySurvivingMask: number      // nibble-value bitmask
  otherPlayers: OtherPlayerInfo[]
  c7BlindActive: boolean
  onC7BlindToggle: () => void
  overlappingNibbleMask?: number  // C1용: 전체 플레이어 겹친 nibble bitmask
}

function popcount(mask: number): number {
  let n = 0
  for (let k = 0; k < 16; k++) if (mask & (1 << k)) n++
  return n
}

function firstSurvivingNibble(mask: number): number | null {
  for (let k = 0; k < 16; k++) if (mask & (1 << k)) return k
  return null
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export function PerkInfoPanel({
  roundId,
  equippedPerkId,
  myChoices,
  mySurvivingMask,
  otherPlayers,
  c7BlindActive,
  onC7BlindToggle,
  overlappingNibbleMask,
}: Props) {
  if (!equippedPerkId) return null

  const { loadInfo } = usePerkInfoAccess(roundId)
  const [remoteInfo, setRemoteInfo] = useState<unknown>(null)
  const [remoteType, setRemoteType] = useState<string | null>(null)
  const [isLoadingRemote, setIsLoadingRemote] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)

  const id = equippedPerkId

  const loadRemoteInfo = async (infoType: 'c1' | 'c2' | 'c3') => {
    setIsLoadingRemote(true)
    setRemoteError(null)
    try {
      const result = await loadInfo(infoType)
      setRemoteType(infoType)
      setRemoteInfo(result.data)
    } catch (err) {
      setRemoteError((err as Error).message)
    } finally {
      setIsLoadingRemote(false)
    }
  }

  // B3 — 라스트 스탠드
  if (id === 'b3') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">⚔️</span> B3 — 라스트 스탠드
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            픽 1개만 공개 선언합니다.<br/>
            생존 시 해당 배율 ×3.0 + 최대 눈치 배수(×2.0).<br/>
            다른 플레이어와 겹치면 0점.
          </span>
        </div>
      </div>
    )
  }

  // D2 — 언더독
  if (id === 'd2') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🃏</span> D2 — 언더독
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            직전 라운드 꼴찌였다면 5번째 픽을 선언할 수 있습니다.<br/>
            추가 픽도 겹침 판정에 정상 참가합니다.
          </span>
        </div>
      </div>
    )
  }

  // C1 — 겹침 목록 열람
  if (id === 'c1') {
    const mask = remoteType === 'c1' && remoteInfo && typeof remoteInfo === 'object' && remoteInfo !== null
      ? Number((remoteInfo as { overlapMask?: number }).overlapMask ?? 0)
      : (overlappingNibbleMask ?? 0)
    const overlapping = Array.from({ length: 16 }, (_, k) => k).filter(k => mask & (1 << k))
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔍</span> C1 — 겹침 목록 열람
        </div>
        <div className="hx-pip-body">
          <button
            className={`hx-pip-toggle${isLoadingRemote ? ' active' : ''}`}
            onClick={() => void loadRemoteInfo('c1')}
            style={{ marginBottom: 10 }}
          >
            {isLoadingRemote && remoteType !== 'c1' ? '서명 확인 중…' : '지갑 서명으로 정보 조회'}
          </button>
          {remoteError && (
            <div className="hx-pip-hint" style={{ color: '#ff6b6b', marginBottom: 8 }}>{remoteError}</div>
          )}
          {overlapping.length === 0 ? (
            <div>겹침 없음 — 모든 픽 고유</div>
          ) : (
            <>
              <span className="hx-pip-label">겹친 숫자 (2명 이상 동시 픽)</span>
              <div className="hx-pip-chips">
                {overlapping.map(v => (
                  <span key={v} className={`hx-pip-chip${myChoices.includes(v) ? ' red' : ''}`}>{HEX_LABELS[v]}</span>
                ))}
              </div>
              <span className="hx-pip-hint">빨간색 = 내 픽과 겹침 · C4 보유자 제외</span>
            </>
          )}
        </div>
      </div>
    )
  }

  // C2 — 정보 열람 (중)
  if (id === 'c2') {
    const remotePlayers = remoteType === 'c2' && remoteInfo && typeof remoteInfo === 'object' && remoteInfo !== null
      ? ((remoteInfo as { players?: Array<{ address: string; blockedByC4: boolean; revealed: boolean; survivingCount: number | null }> }).players ?? [])
      : []
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔍</span> C2 — 정보 열람
        </div>
        {otherPlayers.length === 0 ? (
          <div className="hx-pip-body">상대 플레이어 없음</div>
        ) : (
          <div className="hx-pip-body">
            <button
              className={`hx-pip-toggle${isLoadingRemote ? ' active' : ''}`}
              onClick={() => void loadRemoteInfo('c2')}
              style={{ marginBottom: 10 }}
            >
              {isLoadingRemote && remoteType !== 'c2' ? '서명 확인 중…' : '지갑 서명으로 정보 조회'}
            </button>
            {remoteError && (
              <div className="hx-pip-hint" style={{ color: '#ff6b6b', marginBottom: 8 }}>{remoteError}</div>
            )}
            {remotePlayers.map((p, i) => {
              return (
                <div key={p.address} className="hx-pip-row">
                  <span className="hx-pip-label">상대 {String.fromCharCode(65 + i)} ({shortAddr(p.address)})</span>
                  {p.blockedByC4
                    ? <span className="hx-pip-chip" style={{ background: 'rgba(255,107,107,.15)', color: '#ff6b6b' }}>🛡 C4 차단</span>
                    : <span className="hx-pip-val">{p.revealed ? `${p.survivingCount ?? 0}개 생존` : '미공개'}</span>
                  }
                </div>
              )
            })}
            {remotePlayers.length === 0 && <span className="hx-pip-hint">아직 조회하지 않았습니다.</span>}
          </div>
        )}
      </div>
    )
  }

  // C3 — 핵심 정보 열람
  if (id === 'c3') {
    const remotePlayers = remoteType === 'c3' && remoteInfo && typeof remoteInfo === 'object' && remoteInfo !== null
      ? ((remoteInfo as { players?: Array<{ address: string; blockedByC4: boolean; revealed: boolean; oneSurvivingPick: number | null }> }).players ?? [])
      : []
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔍</span> C3 — 핵심 정보 열람
        </div>
        {otherPlayers.length === 0 ? (
          <div className="hx-pip-body">상대 플레이어 없음</div>
        ) : (
          <div className="hx-pip-body">
            <button
              className={`hx-pip-toggle${isLoadingRemote ? ' active' : ''}`}
              onClick={() => void loadRemoteInfo('c3')}
              style={{ marginBottom: 10 }}
            >
              {isLoadingRemote && remoteType !== 'c3' ? '서명 확인 중…' : '지갑 서명으로 정보 조회'}
            </button>
            {remoteError && (
              <div className="hx-pip-hint" style={{ color: '#ff6b6b', marginBottom: 8 }}>{remoteError}</div>
            )}
            {remotePlayers.map((p, i) => {
              return (
                <div key={p.address} className="hx-pip-row">
                  <span className="hx-pip-label">상대 {String.fromCharCode(65 + i)} ({shortAddr(p.address)}) 생존 픽 중 하나</span>
                  {p.blockedByC4 ? (
                    <span className="hx-pip-chip" style={{ background: 'rgba(255,107,107,.15)', color: '#ff6b6b' }}>🛡 C4 차단</span>
                  ) : p.revealed ? (
                    p.oneSurvivingPick !== null
                      ? <span className="hx-pip-chip green">{HEX_LABELS[p.oneSurvivingPick]}</span>
                      : <span className="hx-pip-val">픽 전부 제거됨</span>
                  ) : (
                    <span className="hx-pip-val">미공개</span>
                  )}
                </div>
              )
            })}
            {remotePlayers.length === 0 && <span className="hx-pip-hint">아직 조회하지 않았습니다.</span>}
          </div>
        )}
      </div>
    )
  }

  // C4 — 탈락 은폐
  if (id === 'c4') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🛡</span> C4 — 탈락 은폐 활성
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">이번 판 내 겹침 픽 목록이 보호됩니다.<br/>상대의 C1 열람에서 내 정보가 차단됩니다.</span>
        </div>
      </div>
    )
  }

  // C5 — 선제 공개
  if (id === 'c5') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔍</span> C5 — 선제 공개
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            눈치게임 커밋 시 실제 순서를 공개합니다.<br/>
            상대가 알 수 있는 대신 <strong>배수 +0.2</strong>를 획득합니다.
          </span>
          {otherPlayers.some(p => p.perkStringId?.startsWith('b')) && (
            <div className="hx-pip-row" style={{ marginTop: 8 }}>
              <span className="hx-pip-label">주의</span>
              <span className="hx-pip-val">B 계열 특전 보유자가 내 선언을 역이용할 수 있습니다</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // C6 — 핀포인트 블라인드
  if (id === 'c6') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔍</span> C6 — 핀포인트 블라인드
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">상대 1명의 배율 수치를 가릴 수 있습니다.</span>
          <button
            className={`hx-pip-toggle${c7BlindActive ? ' active' : ''}`}
            onClick={onC7BlindToggle}
            style={{ marginTop: 10 }}
          >
            {c7BlindActive ? '🙈 블라인드 ON — 배율 숨김 중' : '👁 블라인드 OFF — 배율 표시 중'}
          </button>
        </div>
      </div>
    )
  }

  // F1 — 숫자 함정
  if (id === 'f1') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🪤</span> F1 — 숫자 함정
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            아래에서 함정 숫자를 선택하세요.<br/>
            상대는 함정이 존재한다는 것만 알고 어떤 숫자인지는 모릅니다.
          </span>
        </div>
      </div>
    )
  }

  // F2 — 구간 함정
  if (id === 'f2') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🪤</span> F2 — 구간 함정
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            함정 구간을 선택하세요.<br/>
            상대가 그 구간에서 2개 이상 픽하면 해당 구간 픽이 전부 제거됩니다.
          </span>
        </div>
      </div>
    )
  }

  // F3 — 순서 함정
  if (id === 'f3') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🪤</span> F3 — 순서 함정
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            눈치게임 순서(1·2·3) 중 하나를 함정으로 지정하세요.<br/>
            해당 순서를 선택한 상대는 포기 픽이 1개 추가됩니다.
          </span>
        </div>
      </div>
    )
  }

  // F4 — 이중 함정
  if (id === 'f4') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🪤</span> F4 — 이중 함정
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            숫자 함정과 구간 함정을 동시에 설정합니다.<br/>
            두 조건이 <strong>모두</strong> 일치해야 발동하며, 하나만 맞으면 완전 불발입니다.
          </span>
        </div>
      </div>
    )
  }

  // C8 — 순서 교란
  if (id === 'c8') {
    const c8targets = otherPlayers.filter(p => p.perkStringId !== 'c8')
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔍</span> C8 — 순서 교란
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            눈치게임 전 상대 1명을 지정해 카드 순서를 섞습니다.<br/>
            B 특전 보유자를 핀포인트로 무력화할 수 있습니다.
          </span>
          {c8targets.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="hx-pip-label">타겟 후보</span>
              {c8targets.map((p, i) => (
                <div key={p.address} className="hx-pip-row" style={{ marginTop: 4 }}>
                  <span className="hx-pip-val">
                    상대 {String.fromCharCode(65 + i)} ({shortAddr(p.address)})
                    {p.perkStringId?.startsWith('b') && (
                      <span className="hx-pip-chip" style={{ marginLeft: 6 }}>B계열</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <span className="hx-pip-hint" style={{ marginTop: 8, display: 'block', color: 'var(--muted)' }}>
            * 아래 타겟 지정 폼에서 설정하세요
          </span>
        </div>
      </div>
    )
  }

  // G1 — 봉쇄
  if (id === 'g1') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔒</span> G1 — 봉쇄
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            눈치게임 시작 후 타겟 1명을 지정합니다.<br/>
            타겟의 특전 효과가 이번 settle에서 완전히 무력화됩니다.<br/>
            <strong>G-3 저지불가</strong> 보유자에게는 효과 없음.
          </span>
          {otherPlayers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="hx-pip-label">타겟 후보</span>
              {otherPlayers.map((p, i) => (
                <div key={p.address} className="hx-pip-row" style={{ marginTop: 4 }}>
                  <span className="hx-pip-val">
                    상대 {String.fromCharCode(65 + i)} ({shortAddr(p.address)})
                    {p.perkStringId === 'g3' && (
                      <span className="hx-pip-chip" style={{ marginLeft: 6, color: '#ff6b6b' }}>G3 면역</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <span className="hx-pip-hint" style={{ marginTop: 8, display: 'block', color: 'var(--muted)' }}>
            * 아래 타겟 지정 폼에서 설정하세요
          </span>
        </div>
      </div>
    )
  }

  // G4 — 강제 교환
  if (id === 'g4') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🔄</span> G4 — 강제 교환
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            타겟의 최고배율 생존 픽 ↔ 내 최저배율 생존 픽 강제 교환.<br/>
            <strong>G-3 저지불가</strong> 보유자에게는 효과 없음.
          </span>
          {otherPlayers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="hx-pip-label">타겟 후보</span>
              {otherPlayers.map((p, i) => (
                <div key={p.address} className="hx-pip-row" style={{ marginTop: 4 }}>
                  <span className="hx-pip-val">
                    상대 {String.fromCharCode(65 + i)} ({shortAddr(p.address)})
                    {p.perkStringId === 'g3' && (
                      <span className="hx-pip-chip" style={{ marginLeft: 6, color: '#ff6b6b' }}>G3 면역</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // G6 — 특전복사
  if (id === 'g6') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🪞</span> G6 — 특전복사
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            타겟의 특전 효과를 자신이 대신 사용합니다.<br/>
            <strong>G-3 저지불가</strong> 또는 <strong>G-1 봉쇄</strong> 대상은 복사 불가 (효과 0).
          </span>
          {otherPlayers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="hx-pip-label">복사 후보</span>
              {otherPlayers.map((p, i) => (
                <div key={p.address} className="hx-pip-row" style={{ marginTop: 4 }}>
                  <span className="hx-pip-val">
                    상대 {String.fromCharCode(65 + i)} ({shortAddr(p.address)})
                    {p.perkStringId && (
                      <span className="hx-pip-chip" style={{ marginLeft: 6 }}>{p.perkStringId.toUpperCase()}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // G7 — 픽미러링
  if (id === 'g7') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🎯</span> G7 — 픽미러링
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            타겟의 최고배율 생존 픽을 탈취합니다.<br/>
            타겟에서 제거되고 자신의 finalMask에 추가됩니다.<br/>
            <strong>G-3 저지불가</strong> 보유자에게는 효과 없음.
          </span>
          {otherPlayers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="hx-pip-label">타겟 후보</span>
              {otherPlayers.map((p, i) => (
                <div key={p.address} className="hx-pip-row" style={{ marginTop: 4 }}>
                  <span className="hx-pip-val">
                    상대 {String.fromCharCode(65 + i)} ({shortAddr(p.address)})
                    {p.perkStringId === 'g3' && (
                      <span className="hx-pip-chip" style={{ marginLeft: 6, color: '#ff6b6b' }}>G3 면역</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // D3 — 올인
  if (id === 'd3') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🎲</span> D3 — 올인
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            생존 픽이 1개 이하일 때 발동.<br/>
            OPEN 단계에서 숫자 하나를 선언합니다.<br/>
            해시에 등장(배율 &gt;1.0) → 해당 배율 ×1.5 추가.<br/>
            미등장 → 0.5pt 기본.
          </span>
        </div>
      </div>
    )
  }

  // C9 — 전장 혼돈
  if (id === 'c9') {
    return (
      <div className="hx-perk-info-panel">
        <div className="hx-pip-title">
          <span className="hx-pip-icon">🌀</span> C9 — 전장 혼돈 활성
        </div>
        <div className="hx-pip-body">
          <span className="hx-pip-hint">
            전원의 눈치게임 카드 순서가 섞입니다.<br/>
            나를 포함한 모든 플레이어에게 적용되며 B 계열 특전을 전부 무력화합니다.
          </span>
          <div className="hx-pip-row" style={{ marginTop: 8 }}>
            <span className="hx-pip-label">영향 범위</span>
            <span className="hx-pip-chip" style={{ background: 'rgba(192,132,252,.18)', color: '#c084fc' }}>전체 ({otherPlayers.length + 1}명)</span>
          </div>
        </div>
      </div>
    )
  }

  return null
}
