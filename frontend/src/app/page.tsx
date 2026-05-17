'use client'

import { useState, useEffect } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useReadContract } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { useRoundInfo } from '@/hooks/useRoundInfo'
import { usePlayerInfo } from '@/hooks/usePlayerInfo'
import { useScoreBreakdown } from '@/hooks/useScoreBreakdown'
import { useInterpolatedChainClock } from '@/hooks/useInterpolatedChainClock'
import { Header } from '@/components/Header'
import { PhaseGuide } from '@/components/PhaseGuide'
import { CommitForm } from '@/components/CommitForm'
import { B3CommitForm } from '@/components/B3CommitForm'
import { ExtraPickForm } from '@/components/ExtraPickForm'
import { RevealForm } from '@/components/RevealForm'
import { EyeCommitForm } from '@/components/EyeCommitForm'
import { EyeRevealForm } from '@/components/EyeRevealForm'
import { HashBreakdown } from '@/components/HashBreakdown'
import { SettledResults } from '@/components/SettledResults'
import { RoundStatus } from '@/components/RoundStatus'
import {
  CreateRoundButton,
  CancelRoundButton,
} from '@/components/GameActions'
import { PrivateRoom } from '@/components/PrivateRoom'
import { QuickMatchButton } from '@/components/QuickMatchButton'
import { PerksOverlay } from '@/components/PerksOverlay'
import { PerkInfoPanel } from '@/components/PerkInfoPanel'
import { TrapForm } from '@/components/TrapForm'
import { TrapOrderForm } from '@/components/TrapOrderForm'
import { TargetForm } from '@/components/TargetForm'
import { AllInForm } from '@/components/AllInForm'
import { WaitingRoom } from '@/components/WaitingRoom'
import { PlayersStatusPanel } from '@/components/PlayersStatusPanel'
import { DebugPanel } from '@/components/DebugPanel'
import { useOtherPlayersPerks } from '@/hooks/useOtherPlayersPerks'
import { commitStorageKey, proofStorageKey, cleanStaleStorage, CommitData } from '@/lib/utils'
import { flog, fwarn } from '@/lib/flog'
import { PERKS, pickRandomPerk, type Perk } from '@/lib/perks'
import { perkIdToPerk } from '@/lib/perks'
import { CONTRACT_ADDRESS } from '@/lib/config'


const S_OPEN       = 0
const S_LOCKED     = 1
const S_EYE_OPEN   = 2
const S_EYE_LOCKED = 3
const S_SETTLED    = 4

if (typeof window !== 'undefined') cleanStaleStorage()

export default function Home() {
  const { isConnected, connector, address } = useAccount()
  const chainId = useChainId()

  // ── state 선언 (hook 순서 고정) ────────────────────────────────────────────
  const [showPerks, setShowPerks] = useState(false)
  const [equippedPerkId, setEquippedPerkId] = useState<string | null>(null)
  const [showCommitForm, setShowCommitForm] = useState(false)
  const [createdRoomPendingSeat, setCreatedRoomPendingSeat] = useState(false)
  const [autoOpenCommitAfterCreate, setAutoOpenCommitAfterCreate] = useState(false)
  const [transitionNote, setTransitionNote] = useState<string | null>(null)
  const [wantsToJoin, setWantsToJoin] = useState(false)
  const [c7BlindActive, setC7BlindActive] = useState(false)
  const [lobbyTab, setLobbyTab] = useState<'quick' | 'private'>('quick')
  const [privateRoomCode, setPrivateRoomCode] = useState<string | null>(null)
  // SETTLED 결과 화면 고정 — 명시적으로 나갈 때까지 유지
  const [stickySettledRoundId, setStickySettledRoundId] = useState<bigint | undefined>(undefined)
  // 내가 명시적으로 선택/생성한 라운드만 추적
  // — 다른 사람이 방을 만들어도 로비 화면에 영향 없음
  const [myRoundId, setMyRoundId] = useState<bigint | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    // 새로고침 복원: 내가 커밋한 가장 최근 라운드 ID
    // 키 형식: hexchain_commit_{contract8}_{roundId}
    const prefix = commitStorageKey(0n).replace('_0', '_')
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix))
    if (!keys.length) return undefined
    return keys
      .map(k => BigInt(k.slice(prefix.length)))
      .reduce((max, id) => id > max ? id : max)
  })
  const [optimisticRoundId, setOptimisticRoundId] = useState<bigint | undefined>(undefined)

  // activeRoundId: optimistic > sticky결과화면 > 내가 선택한 방
  const activeRoundId = optimisticRoundId ?? stickySettledRoundId ?? myRoundId
  const { roundInfo, blockNumber, refetch: refetchRound, isFetching: isRoundInfoFetching } = useRoundInfo(activeRoundId)
  const { playerInfo, refetch: refetchPlayer } = usePlayerInfo(activeRoundId)
  const { scoreBreakdown } = useScoreBreakdown(activeRoundId)
  const { takenPerks, otherPlayersInfo, allPlayersInfo } = useOtherPlayersPerks(activeRoundId)

  // C8: 나 또는 다른 플레이어가 C8 보유 시 배율 전체 숨김
  // C7: 내가 C7 보유 + 블라인드 토글 ON 시 배율 숨김
  const hideMultipliers = equippedPerkId === 'c7' || takenPerks.includes('c7') || c7BlindActive
  // C10: 나 또는 다른 플레이어가 C10 보유 시 눈치게임 카드 순서 셔플
  const shuffleEyeCards = equippedPerkId === 'c9' || takenPerks.includes('c9')

  const state = roundInfo?.state ?? -1

  const { data: overlappingNibbleData } = useReadContract({
    ...hexChainContract,
    functionName: 'getOverlappingNibbles',
    args: activeRoundId ? [activeRoundId] : undefined,
    query: { enabled: !!activeRoundId && state === S_EYE_OPEN, refetchInterval: 5000 },
  })
  const overlappingNibbleMask = overlappingNibbleData !== undefined ? Number(overlappingNibbleData) : 0
  // stickySettledRoundId가 있고 현재 라운드와 다르면 결과 화면 고정 유지
  const isStuckOnSettled = stickySettledRoundId !== undefined

  const hasNoRound   = !activeRoundId || activeRoundId === 0n
  const isSettled    = state === S_SETTLED
  const canCreateRound = hasNoRound && !isStuckOnSettled

  // 커밋 마감까지 남은 블록 (OPEN 상태에서만 유효)
  const blocksToLock =
    state === S_OPEN && roundInfo && blockNumber && roundInfo.lockBlock > blockNumber
      ? roundInfo.lockBlock - blockNumber
      : 0n
  const { msUntil: pageMsUntil } = useInterpolatedChainClock(blockNumber, chainId)
  const commitDeadlineMs = roundInfo ? pageMsUntil(roundInfo.lockBlock) : null
  // 커밋 창 위기 (1~2블록 이내) — 참여해도 커밋 불가
  const isCommitWindowCritical = state === S_OPEN && roundInfo !== null && blockNumber !== undefined && blocksToLock <= 2n
  // 만료 임박 — 인원 부족 + 커밋 창 위기 → Keeper가 곧 expireRound 호출
  const isAboutToExpire = !!roundInfo && roundInfo.startBlock > 0n && isCommitWindowCritical && roundInfo.playerCount < 2

  const leaveSettled = () => {
    setStickySettledRoundId(undefined)
    setMyRoundId(undefined)
  }

  const refetchAll = () => {
    refetchRound()
    refetchPlayer()
  }

  // optimisticRoundId가 체인에서 확인되면 myRoundId로 확정
  useEffect(() => {
    // getRoundInfo의 기본 zero struct(startBlock=0)는 존재하지 않는 라운드/전환 중 응답이다.
    // 이걸 새 방 확인으로 받아들이면 optimistic 방을 즉시 로비로 밀어낸다.
    if (optimisticRoundId !== undefined && roundInfo !== null && roundInfo.startBlock > 0n && !isRoundInfoFetching) {
      flog(`[page] optimistic ${optimisticRoundId} → myRoundId 확정`)
      setMyRoundId(optimisticRoundId)
      setOptimisticRoundId(undefined)
    }
  }, [optimisticRoundId, roundInfo, isRoundInfoFetching])

  const isContractUnset = CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000'

  const hasCommitted    = playerInfo?.hasCommitted ?? false
  const hasRevealed     = playerInfo?.revealed    ?? false
  const hasEyeCommitted = !!(playerInfo?.eyeOrder && playerInfo.eyeOrder > 0)
  const hasEyeRevealed  = playerInfo?.eyeRevealed ?? false
  const eyeOrder        = Number(playerInfo?.eyeOrder ?? 0)
  const waitingRoomPlayerCount = Math.min(
    3,
    (roundInfo?.playerCount ?? 0) + (createdRoomPendingSeat && !hasCommitted ? 1 : 0),
  )

  // 커밋 성공 시 activeRoundId를 myRoundId로 즉시 고정 (race condition 방지)
  // createdRoomPendingSeat 클리어 전에 myRoundId를 확정해야 로비로 안 튕김
  useEffect(() => {
    if (hasCommitted && activeRoundId && !myRoundId) {
      flog(`[page] commit 확인 → myRoundId 앵커 (${activeRoundId})`)
      setMyRoundId(activeRoundId)
    }
  }, [hasCommitted, activeRoundId, myRoundId])

  useEffect(() => {
    // state < 0 은 roundInfo 로딩 중 — 이 경우엔 초기화하지 않음
    if (hasCommitted || (state >= 0 && state !== S_OPEN) || hasNoRound) {
      if (createdRoomPendingSeat || wantsToJoin)
        flog(`[page] seat/join 초기화 — hasCommitted=${hasCommitted} state=${state} hasNoRound=${hasNoRound}`)
      setCreatedRoomPendingSeat(false)
      setAutoOpenCommitAfterCreate(false)
      setWantsToJoin(false)
      if (hasCommitted) setPrivateRoomCode(null)
    }
  }, [hasCommitted, state, hasNoRound]) // eslint-disable-line react-hooks/exhaustive-deps

  // 비공개 방 생성은 빈 껍데기 대신 방장 커밋까지 이어지는 개설 플로우로 취급한다.
  // 실제 revealHash를 읽은 뒤 자동으로 커밋 폼을 열어 0명 방 상태를 오래 두지 않는다.
  useEffect(() => {
    if (autoOpenCommitAfterCreate && activeRoundId && roundInfo && roundInfo.startBlock > 0n && state === S_OPEN && !hasCommitted) {
      setShowCommitForm(true)
      setAutoOpenCommitAfterCreate(false)
    }
  }, [autoOpenCommitAfterCreate, activeRoundId, roundInfo, state, hasCommitted])

  // 내가 참여한 라운드가 SETTLED되면 결과 화면 고정
  useEffect(() => {
    if (state === S_SETTLED && activeRoundId && hasCommitted) {
      setStickySettledRoundId(activeRoundId)
    }
  }, [state, activeRoundId, hasCommitted])

  // 내가 커밋하지 않은 채로 라운드가 종료(SETTLED/만료)되면 로비로 복귀
  useEffect(() => {
    if (state === S_SETTLED && !hasCommitted && myRoundId && !optimisticRoundId) {
      flog(`[page] 미커밋 SETTLED → 로비 복귀 (round ${myRoundId})`)
      setMyRoundId(undefined)
    }
  }, [state, hasCommitted, myRoundId, optimisticRoundId])

  // localStorage 복원된 roundId가 현재 체인에 없으면 초기화 (체인 재시작 대응)
  useEffect(() => {
    if (myRoundId && !optimisticRoundId && !createdRoomPendingSeat && roundInfo && roundInfo.startBlock === 0n) {
      fwarn(`[page] startBlock=0 감지 → myRoundId(${myRoundId}) 초기화`)
      localStorage.removeItem(commitStorageKey(myRoundId))
      setMyRoundId(undefined)
    }
  }, [myRoundId, optimisticRoundId, createdRoomPendingSeat, roundInfo])

  // LOCKED 진입 시 localStorage proof를 백엔드에 재전송 (미리빌된 경우 skip)
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL
  useEffect(() => {
    if (state !== S_LOCKED || !hasCommitted || hasRevealed || !activeRoundId || !address || !BACKEND_URL) return
    const raw = localStorage.getItem(proofStorageKey(activeRoundId))
    if (!raw) return
    let proof: unknown
    try { proof = JSON.parse(raw) } catch { return }
    fetch(`${BACKEND_URL}/proofs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: activeRoundId.toString(), address, ...(proof as object) }),
    }).then(() => flog(`[page] LOCKED proof 재전송 완료 (round ${activeRoundId})`))
      .catch(() => fwarn(`[page] LOCKED proof 재전송 실패 (round ${activeRoundId})`))
  }, [state, hasCommitted, hasRevealed, activeRoundId, address]) // eslint-disable-line react-hooks/exhaustive-deps

  // 커밋 전 대기실에서 방이 만료 임박이면 짧은 전환을 보여준 뒤 로비로 복귀
  useEffect(() => {
    if (!isAboutToExpire || hasCommitted || optimisticRoundId || isRoundInfoFetching) return
    flog(`[page] 만료 임박 → 로비 복귀 (round ${activeRoundId})`)
    setTransitionNote('인원이 부족해 방을 정리하고 로비로 돌아갑니다…')
    const id = window.setTimeout(() => {
      setMyRoundId(undefined)
      setCreatedRoomPendingSeat(false)
      setAutoOpenCommitAfterCreate(false)
      setWantsToJoin(false)
      setPrivateRoomCode(null)
      setTransitionNote(null)
    }, 650)
    return () => window.clearTimeout(id)
  }, [isAboutToExpire, hasCommitted, optimisticRoundId, isRoundInfoFetching, activeRoundId])

  const myCommitData = (() => {
    if (typeof window === 'undefined' || !activeRoundId) return null
    try {
      const raw = localStorage.getItem(commitStorageKey(activeRoundId))
      return raw ? (JSON.parse(raw) as CommitData) : null
    } catch { return null }
  })()
  const myChoices = playerInfo?.revealed && myCommitData ? myCommitData.choices : []
  const mySurvivingMask = Number(playerInfo?.survivingMask ?? 0)
  const myScore = BigInt(playerInfo?.score ?? 0)
  const activePerkLabel = perkIdToPerk(
    Number(scoreBreakdown?.effectivePerk ?? playerInfo?.perkId ?? 0),
  )?.name ?? null

  const equippedPerk: Perk | null = equippedPerkId
    ? (PERKS.find(p => p !== null && p.id === equippedPerkId) ?? null)
    : null

  // 상태 바 dots (5단계: OPEN, LOCKED, EYE_OPEN, EYE_LOCKED, SETTLED)
  const stateDots = [0, 1, 2, 3, 4].map(i => {
    if (state < 0) return ''
    if (i < state) return 'done'
    if (i === state) return 'active'
    return ''
  })

  return (
    <div className="hx-app hx-fade-up">
      <Header state={state} onPerksClick={isConnected ? () => setShowPerks(true) : undefined} />

      {/* 상태 진행 바 */}
      <div className="hx-state-bar">
        {stateDots.map((cls, i) => (
          <div key={i} className={`hx-dot ${cls}`} />
        ))}
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* 컨트랙트 미배포 경고 */}
        {isContractUnset && (
          <div style={{ margin: '16px 20px 0' }} className="hx-hint amber">
            <span style={{ fontSize: 14 }}>⚠</span>
            <div>
              <div style={{ fontWeight: 600 }}>Contract not deployed</div>
              <div style={{ fontSize: 11 }}><code>NEXT_PUBLIC_HEXCHAIN_ADDRESS</code>를 <code>.env.local</code>에 설정하세요.</div>
            </div>
          </div>
        )}

        {/* 지갑 미연결 */}
        {!isConnected && (
          <div style={{
            margin: '40px 20px',
            padding: '40px 20px',
            textAlign: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
              지갑을 연결하면 게임을 시작할 수 있습니다
            </div>
            <ConnectButton />
          </div>
        )}

        {isConnected && (
          <>
            {/* 로비 */}
            {canCreateRound && (
              <div style={{ padding: '0 20px', marginTop: 20 }}>
                {/* 히어로 카드 */}
                <div style={{
                  padding: '28px 24px 24px',
                  borderRadius: 20,
                  background: 'linear-gradient(135deg, rgba(99,102,241,.18) 0%, rgba(139,92,246,.12) 100%)',
                  border: '1px solid rgba(99,102,241,.35)',
                  marginBottom: 20,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12, filter: 'drop-shadow(0 0 12px rgba(129,140,248,.5))' }}>⬡</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#e0e7ff', letterSpacing: '0.04em', marginBottom: 6 }}>
                    HexChain 넘버게임
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    3인 닐블 선택 · ZK 커밋 · 눈치게임 순서 배팅<br />
                    겹치면 제거, 살아남으면 점수
                  </div>

                  {/* 단계 아이콘 흐름 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 6, marginTop: 20, fontSize: 11, color: 'var(--muted)',
                  }}>
                    {[
                      { icon: '✍️', label: '커밋' },
                      { icon: '→', label: null },
                      { icon: '🔒', label: '리빌' },
                      { icon: '→', label: null },
                      { icon: '👁', label: '순서' },
                      { icon: '→', label: null },
                      { icon: '🏆', label: '정산' },
                    ].map((s, i) => s.label === null
                      ? <span key={i} style={{ opacity: 0.3 }}>{s.icon}</span>
                      : (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 18 }}>{s.icon}</span>
                          <span>{s.label}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>


                {/* 탭 토글 */}
                <div style={{
                  display: 'flex', gap: 8, marginBottom: 12,
                  background: 'rgba(20,20,30,.6)', borderRadius: 14,
                  padding: 5, border: '1px solid rgba(100,100,120,.2)',
                }}>
                  {([['quick', '⚡ 빠른 매칭'], ['private', '🔑 비공개 방']] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setLobbyTab(tab)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10,
                        fontSize: 14, fontWeight: 700,
                        background: lobbyTab === tab ? 'rgba(99,102,241,.8)' : 'transparent',
                        color: lobbyTab === tab ? '#fff' : 'var(--muted)',
                        border: 'none', cursor: 'pointer',
                        transition: 'background .2s, color .2s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* 빠른 매칭 */}
                {lobbyTab === 'quick' && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, textAlign: 'center' }}>
                      빈 방을 자동으로 찾거나 없으면 새 방을 만듭니다
                    </div>
                    <QuickMatchButton
                      onJoined={(rid) => {
                        setStickySettledRoundId(undefined)
                        setEquippedPerkId(pickRandomPerk().id)
                        setOptimisticRoundId(rid)
                        setCreatedRoomPendingSeat(true)
                        refetchAll()
                      }}
                      onError={refetchAll}
                    />
                  </>
                )}

                {/* 비공개 방 */}
                {lobbyTab === 'private' && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, textAlign: 'center' }}>
                      방 코드를 공유해 친구와 플레이하세요
                    </div>
                    <PrivateRoom
                      onRoomCreated={(newRoundId) => {
                        setStickySettledRoundId(undefined)
                        setEquippedPerkId(pickRandomPerk().id)
                        setPrivateRoomCode(newRoundId.toString())
                        setOptimisticRoundId(newRoundId)
                        setCreatedRoomPendingSeat(true)
                        setAutoOpenCommitAfterCreate(true)
                        refetchAll()
                      }}
                      onRoomJoined={(rid) => {
                        setStickySettledRoundId(undefined)
                        setEquippedPerkId(pickRandomPerk().id)
                        setOptimisticRoundId(rid)
                        setCreatedRoomPendingSeat(true)
                        refetchAll()
                      }}
                    />
                  </>
                )}
              </div>
            )}

            {/* 라운드 정보 — 커밋 이후부터만 표시 */}
            {hasCommitted && roundInfo && activeRoundId && blockNumber && (
              <div key={`phase-${state}`} className="hx-phase-shell">
                <div style={{ height: 16 }} />
                <RoundStatus
                  roundId={activeRoundId}
                  state={state}
                  startBlock={roundInfo.startBlock}
                  lockBlock={roundInfo.lockBlock}
                  revealBlock={roundInfo.revealBlock}
                  eyeLockBlock={roundInfo.eyeLockBlock}
                  eyeRevealBlock={roundInfo.eyeRevealBlock}
                  playerCount={roundInfo.playerCount}
                  revealHash={roundInfo.revealHash}
                  currentBlock={blockNumber}
                  chainId={chainId}
                />
                <PhaseGuide
                  state={state}
                  hasCommitted={hasCommitted}
                  hasRevealed={hasRevealed}
                  hasEyeRevealed={hasEyeRevealed}
                />
                <PlayersStatusPanel
                  players={allPlayersInfo}
                  showDeclared={state >= S_LOCKED}
                />
              </div>
            )}

            {transitionNote && (
              <div className="hx-transition-note">{transitionNote}</div>
            )}

            {/* ── OPEN ── */}
            {!isStuckOnSettled && (state === S_OPEN || (createdRoomPendingSeat && state < 0)) && activeRoundId && (
              <>
                {!hasCommitted && (roundInfo?.playerCount ?? 0) >= 3 ? (
                  /* 방이 꽉 참 — 참여 불가, 게임 종료 대기 */
                  <StatusHint color="" text="⬡ 현재 게임이 진행 중입니다. 종료 후 매칭할 수 있습니다." />
                ) : !hasCommitted && !(wantsToJoin || createdRoomPendingSeat) ? (
                  isCommitWindowCritical ? (
                    /* 커밋 창 만료 임박 — 참여 의미 없음 */
                    <div style={{ margin: '24px 20px', textAlign: 'center' }}>
                      <StatusHint color="" text="⏰ 커밋 마감이 지나 새 방을 기다리는 중..." />
                      <div style={{ height: 10 }} />
                      <button
                        onClick={() => { setMyRoundId(undefined); setCreatedRoomPendingSeat(false); setWantsToJoin(false) }}
                        className="hx-btn"
                        style={{ width: '100%' }}
                      >
                        ← 로비로 돌아가기
                      </button>
                    </div>
                  ) : (
                    /* 다른 사람이 만든 방 — 참여 여부 선택 */
                    <div style={{ margin: '24px 20px' }}>
                      <StatusHint color="" text={`⬡ 대기 중인 게임이 있습니다 (${roundInfo?.playerCount ?? 0}/3명)`} />
                      <div style={{ height: 10 }} />
                      <button
                        className="hx-btn hx-btn-primary"
                        onClick={() => setWantsToJoin(true)}
                      >
                        참여하기
                      </button>
                    </div>
                  )
                ) : !hasCommitted ? (
                  <>
                    {privateRoomCode && (
                      <div style={{ margin: '12px 20px 0' }}>
                        <div className="text-gray-500 text-xs mb-1">비공개 방 코드 — 친구에게 공유하세요</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-800 rounded-xl py-3 text-center font-mono text-2xl font-bold text-white tracking-[0.15em]">
                            {privateRoomCode}
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(privateRoomCode)}
                            className="px-3 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-xs text-gray-300 transition-colors"
                          >
                            복사
                          </button>
                        </div>
                      </div>
                    )}
                    {showCommitForm ? (
                    /* 커밋 폼 */
                    <>
                      <div style={{ margin: '12px 20px 0' }}>
                        <button
                          onClick={() => setShowCommitForm(false)}
                          style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          ← 대기실로 돌아가기
                        </button>
                      </div>
                      {equippedPerkId === 'b3' ? (
                        <B3CommitForm
                          roundId={activeRoundId}
                          revealHash={roundInfo?.revealHash ?? `0x${'0'.repeat(64)}`}
                          onSuccess={() => { setShowCommitForm(false); refetchAll() }}
                        />
                      ) : (
                        <CommitForm
                          roundId={activeRoundId}
                          revealHash={roundInfo?.revealHash ?? `0x${'0'.repeat(64)}`}
                          equippedPerk={equippedPerk}
                          hideMultipliers={hideMultipliers}
                          blocksToLock={blocksToLock ?? 0n}
                          deadlineBlock={roundInfo?.lockBlock}
                          currentBlock={blockNumber}
                          chainId={chainId}
                          onSuccess={() => { setShowCommitForm(false); refetchAll() }}
                        />
                      )}
                    </>
                  ) : (
                    /* 커밋 전 대기실 — 특전 장착 후 커밋 */
                    <>
                      {/* 커밋 마감 블록 */}
                      {roundInfo && blockNumber && roundInfo.lockBlock > blockNumber && (
                        <div style={{ margin: '12px 20px 0', padding: '8px 12px', borderRadius: 10, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.25)', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                          ⏱ 커밋 마감까지 <span style={{ color: '#a5b4fc', fontWeight: 600 }}>{Number(roundInfo.lockBlock - blockNumber)}블록 · {formatCountdownMs(commitDeadlineMs)}</span> 남음
                        </div>
                      )}
                      <div style={{ margin: '16px 20px 0' }}>
                        <div className="hx-sec">이번 라운드 특전 <span style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0, fontSize: 10, fontWeight: 400 }}>— 랜덤 배정</span></div>
                        <div className={`hx-perk-slot${!equippedPerk ? ' empty' : ''}`} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <div className="pn">{equippedPerk ? equippedPerk.name : '특전 없음'}</div>
                          <div className="ph" style={{ fontSize: 11, lineHeight: 1.5, whiteSpace: 'normal' }}>{equippedPerk ? equippedPerk.desc : ''}</div>
                        </div>
                      </div>
                      {takenPerks.includes('c7') && (
                        <div style={{ margin: '8px 20px 0', padding: '6px 12px', borderRadius: 8, background: 'rgba(100,100,120,.15)', border: '1px solid rgba(100,100,120,.3)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                          🌫 안개전 발동 중 — 배율이 가려진 상태로 커밋됩니다
                        </div>
                      )}
                      <WaitingRoom
                        playerCount={waitingRoomPlayerCount}
                        onReady={() => setShowCommitForm(true)}
                        readyLabel="커밋하기 ✍️"
                      />
                      <div style={{ padding: '0 20px 16px' }}>
                        <button
                          onClick={() => { setMyRoundId(undefined); setCreatedRoomPendingSeat(false); setWantsToJoin(false); setPrivateRoomCode(null) }}
                          className="hx-btn"
                          style={{ width: '100%' }}
                        >
                          ← 로비로 돌아가기
                        </button>
                      </div>
                    </>
                    )}
                  </>
                ) : (roundInfo?.playerCount ?? 0) < 3 ? (
                  /* 커밋 완료, 아직 3명 미만 */
                  <>
                    <WaitingRoom playerCount={roundInfo?.playerCount ?? 1} />
                    <div style={{ padding: '0 20px 16px' }}>
                      <CancelRoundButton roundId={activeRoundId} onSuccess={refetchAll} />
                    </div>
                  </>
                ) : (
                  /* 3명 모두 커밋 완료 */
                  <>
                    {equippedPerkId && ['f1','f2','f4'].includes(equippedPerkId) && (
                      <TrapForm roundId={activeRoundId} perkId={equippedPerkId} onSuccess={refetchAll} />
                    )}
                    {equippedPerkId === 'd2' && roundInfo && (
                      <ExtraPickForm
                        roundId={activeRoundId}
                        revealHash={roundInfo.revealHash}
                        onSuccess={refetchAll}
                      />
                    )}
                    {equippedPerkId === 'd3' && roundInfo && (
                      <AllInForm
                        roundId={activeRoundId}
                        revealHash={roundInfo.revealHash}
                        onSuccess={refetchAll}
                      />
                    )}
                    <StatusHint color="green" text="✓ Committed — lock phase를 기다리는 중" />
                  </>
                )}
              </>
            )}

            {/* ── LOCKED ── */}
            {state === S_LOCKED && activeRoundId && (
              <>
                {hasCommitted && !hasRevealed ? (
                  <RevealForm roundId={activeRoundId} onSuccess={refetchAll} />
                ) : hasRevealed ? (
                  <>
                    <StatusHint color="amber" text="✓ Revealed — 눈치게임 시작을 기다리는 중" />
                  </>
                ) : (
                  <StatusHint color="" text="이번 라운드에 참여하지 않았습니다" />
                )}
              </>
            )}

            {/* ── EYE_OPEN ── */}
            {state === S_EYE_OPEN && activeRoundId && (
              <>
                {hasRevealed && myChoices.length >= 1 && roundInfo && (
                  <div style={{ margin: '16px 20px 0' }}>
                    <HashBreakdown
                      revealHash={roundInfo.revealHash}
                      choices={myChoices}
                      survivingMask={mySurvivingMask}
                      eyeOrder={0}
                      score={0n}
                      perkLabel={activePerkLabel}
                      hideScore
                      hideMultipliers={hideMultipliers}
                    />
                  </div>
                )}
                {/* C1~C5/C7/C9 특전 정보 패널 */}
                {hasCommitted && (
                  <div style={{ margin: '12px 20px 0' }}>
                    <PerkInfoPanel
                      roundId={activeRoundId}
                      equippedPerkId={equippedPerkId}
                      myChoices={myChoices}
                      mySurvivingMask={mySurvivingMask}
                      otherPlayers={otherPlayersInfo}
                      c7BlindActive={c7BlindActive}
                      onC7BlindToggle={() => setC7BlindActive(v => !v)}
                      overlappingNibbleMask={overlappingNibbleMask}
                    />
                  </div>
                )}
                {/* G3: 순서 함정 지정 (EYE_OPEN 페이즈) */}
                {hasCommitted && equippedPerkId === 'f3' && (
                  <TrapOrderForm roundId={activeRoundId} onSuccess={refetchAll} />
                )}
                {/* H1/H4/H6/H7/C9: 타겟 지정 */}
                {hasCommitted && equippedPerkId && ['g1','g4','g6','g7','c8'].includes(equippedPerkId) && (
                  <TargetForm
                    roundId={activeRoundId}
                    perkId={equippedPerkId}
                    players={otherPlayersInfo.map(p => p.address)}
                    onSuccess={refetchAll}
                  />
                )}
                {hasCommitted && !hasEyeCommitted ? (
                  <EyeCommitForm roundId={activeRoundId} equippedPerkId={equippedPerkId} shuffleEyeCards={shuffleEyeCards} fogCards={shuffleEyeCards} onSuccess={refetchAll} />
                ) : hasEyeCommitted ? (
                  <StatusHint color="" text="✓ Seq Committed — lock을 기다리는 중" />
                ) : (
                  <StatusHint color="" text="이번 라운드에 참여하지 않았습니다" />
                )}
              </>
            )}

            {/* ── EYE_LOCKED ── */}
            {state === S_EYE_LOCKED && activeRoundId && (
              <>
                {/* C2/C3/C5 는 EYE_LOCKED에서도 유효 */}
                {hasCommitted && (
                  <div style={{ margin: '12px 20px 0' }}>
                    <PerkInfoPanel
                      roundId={activeRoundId}
                      equippedPerkId={equippedPerkId}
                      myChoices={myChoices}
                      mySurvivingMask={mySurvivingMask}
                      otherPlayers={otherPlayersInfo}
                      c7BlindActive={c7BlindActive}
                      onC7BlindToggle={() => setC7BlindActive(v => !v)}
                      overlappingNibbleMask={overlappingNibbleMask}
                    />
                  </div>
                )}
                {hasCommitted && !hasEyeRevealed ? (
                  <EyeRevealForm roundId={activeRoundId} onSuccess={refetchAll} />
                ) : hasEyeRevealed ? (
                  <StatusHint color="amber" text="✓ Seq Revealed — settle을 기다리는 중" />
                ) : (
                  <StatusHint color="" text="이번 라운드에 참여하지 않았습니다" />
                )}
              </>
            )}

            {/* ── SETTLED (실제 종료 or sticky 고정) ── */}
            {(state === S_SETTLED || isStuckOnSettled) && (stickySettledRoundId ?? activeRoundId) && (
              <>
                <div style={{ height: 20 }} />
                <SettledResults roundId={(stickySettledRoundId ?? activeRoundId)!} players={allPlayersInfo} />

                {hasRevealed && myChoices.length >= 1 && (
                  <HashBreakdown
                    revealHash={roundInfo!.revealHash}
                    choices={myChoices}
                    survivingMask={mySurvivingMask}
                    eyeOrder={eyeOrder}
                    score={myScore}
                    perkLabel={activePerkLabel}
                    scoreBreakdown={scoreBreakdown}
                  />
                )}

                <div style={{ height: 20 }} />
                {isStuckOnSettled ? (
                  /* 다른 사람이 새 게임을 시작한 상태 — 명시적으로 참여 선택 */
                  <div style={{ padding: '0 20px 4px' }}>
                    <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                      새 게임이 시작되었습니다
                    </div>
                    <button
                      className="hx-btn hx-btn-primary"
                      onClick={() => { leaveSettled(); setWantsToJoin(true); refetchAll() }}
                    >
                      새 게임 참여하기
                    </button>
                    <div style={{ marginTop: 8 }}>
                      <button
                        className="hx-btn"
                        style={{ width: '100%' }}
                        onClick={() => leaveSettled()}
                      >
                        ← 로비로 돌아가기
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0 20px 4px' }}>
                    <CreateRoundButton
                      label="한판더하기 🎮"
                      onSuccess={(newRoundId) => {
                        leaveSettled()
                        setOptimisticRoundId(newRoundId)
                        setCreatedRoomPendingSeat(true)
                        refetchAll()
                      }}
                      onError={refetchAll}
                    />
                    <div style={{ marginTop: 8 }}>
                      <PrivateRoom
                        onRoomCreated={(newRoundId) => {
                          setPrivateRoomCode(newRoundId.toString())
                          setEquippedPerkId(pickRandomPerk().id)
                          leaveSettled()
                          setOptimisticRoundId(newRoundId)
                          setCreatedRoomPendingSeat(true)
                          setAutoOpenCommitAfterCreate(true)
                          refetchAll()
                        }}
                        onRoomJoined={(rid) => {
                          leaveSettled()
                          setOptimisticRoundId(rid)
                          setCreatedRoomPendingSeat(true)
                          refetchAll()
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <DebugPanel />

      {/* 특전 오버레이 */}
      {showPerks && (
        <PerksOverlay onClose={() => setShowPerks(false)} />
      )}
    </div>
  )
}

function StatusHint({ color, text }: { color: string; text: string }) {
  return (
    <div
      className={`hx-hint${color ? ` ${color}` : ''}`}
      style={{ margin: '12px 20px 0' }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>
        {color === 'green' ? '✓' : color === 'amber' ? '⏳' : 'ℹ'}
      </span>
      <div>{text}</div>
    </div>
  )
}


function formatCountdownMs(ms: number | null) {
  if (ms === null) return '--:--.---'
  const total = Math.max(0, Math.ceil(ms))
  const mins = Math.floor(total / 60_000)
  const secs = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}
