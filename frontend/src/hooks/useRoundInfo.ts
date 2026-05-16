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
  const { data, refetch } = useReadContract({
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

  if (!data) return { roundInfo: null, blockNumber, refetch }

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
  }
}
