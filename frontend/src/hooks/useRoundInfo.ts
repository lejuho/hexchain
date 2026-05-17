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

  // roundId가 바뀐 직후 wagmi/react-query가 직전 data를 잠깐 유지할 수 있다.
  // 그 찰나의 stale data로 새 방을 만료 임박으로 오판하지 않도록 fetch 중에는 숨긴다.
  if (!data || isFetching) return { roundInfo: null, blockNumber, refetch, isFetching }

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
