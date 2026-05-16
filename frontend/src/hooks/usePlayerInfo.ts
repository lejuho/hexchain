import { useReadContract, useAccount } from 'wagmi'
import { hexChainContract } from '@/lib/config'

export function usePlayerInfo(roundId: bigint | undefined) {
  const { address } = useAccount()

  const enabled = roundId !== undefined && roundId > 0n && !!address

  // getPlayerInfo: hasCommitted / revealed / eyeRevealed / eyeOrder / survivingMask / score
  const { data, refetch } = useReadContract({
    ...hexChainContract,
    functionName: 'getPlayerInfo',
    args: enabled ? [roundId!, address!] : undefined,
    query: { enabled, refetchInterval: 4000 },
  })

  if (!data) return { playerInfo: null, refetch }

  const [hasCommitted, revealed, eyeRevealed, eyeOrder, perkId, survivingMask, score, declaredOrder] = data

  return {
    playerInfo: { hasCommitted, revealed, eyeRevealed, eyeOrder, perkId: Number(perkId), survivingMask, score, declaredOrder: Number(declaredOrder) },
    refetch,
  }
}
