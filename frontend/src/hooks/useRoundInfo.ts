import { useEffect, useRef } from 'react'
import { useReadContract, useBlockNumber } from 'wagmi'
import { hexChainContract } from '@/lib/config'

export function useCurrentRoundId() {
  return useReadContract({
    ...hexChainContract,
    functionName: 'currentRoundId',
    query: { refetchInterval: 4000 },
  })
}

export function useRoundInfo(roundId: bigint | undefined) {
  const acceptedRoundIdRef = useRef<bigint | undefined>(undefined)
  const { data, refetch, isFetching } = useReadContract({
    ...hexChainContract,
    functionName: 'getRoundInfo',
    args: roundId !== undefined ? [roundId] : undefined,
    query: {
      enabled: roundId !== undefined && roundId > 0n,
      refetchInterval: 4000,
    },
  })

  const { data: blockNumber } = useBlockNumber({
    query: { refetchInterval: 4000 },
  })

  useEffect(() => {
    // 존재하는 라운드 응답만 해당 roundId의 정상 데이터로 승인한다.
    // zero struct는 optimistic 생성 직후/잘못된 id 조회에서 올 수 있으므로 stale 차단 해제 근거가 아니다.
    if (data && data[1] > 0n && !isFetching) acceptedRoundIdRef.current = roundId
  }, [data, isFetching, roundId])

  // roundId 전환 때만 stale data를 숨긴다. 같은 라운드의 백그라운드 refetch 중에는
  // 마지막 정상 데이터를 유지해야 타이머/대기실이 깜빡이지 않는다.
  const isSwitchingRound = acceptedRoundIdRef.current !== roundId
  if (!data || (isFetching && isSwitchingRound)) return { roundInfo: null, blockNumber, refetch, isFetching }

  const [
    state, startBlock, lockBlock, revealBlock,
    eyeLockBlock, eyeRevealBlock,
    playerCount, revealHash,
  ] = data

  return {
    roundInfo: {
      state, startBlock, lockBlock, revealBlock,
      eyeLockBlock, eyeRevealBlock,
      playerCount, revealHash,
    },
    blockNumber,
    refetch,
    isFetching,
  }
}
