'use client'

import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { useOpenRounds } from '@/hooks/useOpenRounds'
import { CreateRoundButton } from './GameActions'
import { hexChainContract } from '@/lib/config'
import { REGISTRY_ENABLED } from '@/lib/config'
import { flog, fwarn } from '@/lib/flog'

interface Props {
  onJoined: (roundId: bigint) => void
  onError?: () => void
}

export function QuickMatchButton({ onJoined, onError }: Props) {
  const { openRoundIds, refetch } = useOpenRounds()
  const publicClient = usePublicClient()
  const [status, setStatus] = useState<'idle' | 'finding' | 'waiting'>('idle')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Registry 없으면 항상 createRound
  if (!REGISTRY_ENABLED) {
    return <CreateRoundButton onSuccess={onJoined} onError={onError} />
  }

  const findOpenRoom = async (): Promise<bigint | null> => {
    if (!publicClient) return null
    const [ids, currentBlock] = await Promise.all([
      refetch().then(r => r.data ?? openRoundIds),
      publicClient.getBlockNumber(),
    ])
    flog(`[QM] 후보 방 ${ids.length}개, 현재 블록 ${currentBlock}`)
    for (const rid of ids) {
      const info = await publicClient.readContract({
        ...hexChainContract,
        functionName: 'getRoundInfo',
        args: [rid],
      }) as readonly [number, bigint, bigint, bigint, bigint, bigint, number, `0x${string}`]
      const [state, , lockBlock, , , , playerCount] = info
      const blocksLeft = lockBlock > currentBlock ? lockBlock - currentBlock : 0n
      flog(`[QM] round ${rid}: state=${state} players=${playerCount} lockBlock=${lockBlock} 남은블록=${blocksLeft}`)
      // 커밋 창이 3블록 이상 남은 OPEN 방만 선택
      if (state === 0 && playerCount < 3 && blocksLeft >= 3n) return rid
    }
    return null
  }

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const handleQuickMatch = async () => {
    setStatus('finding')
    flog('[QM] 방 탐색 시작')
    try {
      const rid = await findOpenRoom()
      if (rid !== null) {
        flog(`[QM] 방 발견: round ${rid} → onJoined`)
        setStatus('idle')
        onJoined(rid)
        return
      }
      flog('[QM] 빈 방 없음 — 폴링 대기')
      setStatus('waiting')
      pollRef.current = setInterval(async () => {
        try {
          const found = await findOpenRoom()
          if (found !== null) {
            flog(`[QM] 폴링 중 방 발견: round ${found}`)
            stopPoll()
            setStatus('idle')
            onJoined(found)
          }
        } catch {
          // 네트워크 오류는 무시하고 계속 폴링
        }
      }, 5_000)
    } catch (e) {
      fwarn(`[QM] 오류: ${(e as Error).message}`)
      setStatus('idle')
      onError?.()
    }
  }

  // 언마운트 시 폴링 정리
  useEffect(() => () => stopPoll(), [])

  const isBusy = status !== 'idle'

  return (
    <button
      onClick={isBusy ? undefined : handleQuickMatch}
      disabled={isBusy}
      style={{
        width: '100%',
        padding: '16px 0',
        borderRadius: 16,
        fontSize: 16,
        fontWeight: 800,
        letterSpacing: '0.03em',
        background: isBusy
          ? 'rgba(99,102,241,.4)'
          : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        color: '#fff',
        border: 'none',
        cursor: isBusy ? 'not-allowed' : 'pointer',
        opacity: isBusy ? 0.7 : 1,
        boxShadow: isBusy ? 'none' : '0 4px 24px rgba(99,102,241,.4)',
        transition: 'opacity .2s, box-shadow .2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      {status === 'finding' && <><span style={{ fontSize: 20 }}>🔍</span> 방 탐색 중...</>}
      {status === 'waiting' && <><span style={{ fontSize: 20 }}>⏳</span> 방 대기 중...</>}
      {status === 'idle'    && <><span style={{ fontSize: 20 }}>⚡</span> 빠른 매칭 시작</>}
    </button>
  )
}
