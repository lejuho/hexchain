import { useReadContract } from 'wagmi'
import { REGISTRY_ADDRESS, REGISTRY_ENABLED } from '@/lib/config'
import { REGISTRY_ABI } from '@/lib/abi'

/**
 * Registry에서 현재 참여 가능한 라운드 ID 목록을 조회.
 * Registry가 설정되지 않으면 빈 배열 반환.
 */
export function useOpenRounds() {
  const { data, refetch, isLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'getOpenRounds',
    query: {
      enabled: REGISTRY_ENABLED,
      refetchInterval: 10_000,
    },
  })

  return {
    openRoundIds: (data as bigint[] | undefined) ?? [],
    refetch,
    isLoading: REGISTRY_ENABLED && isLoading,
  }
}
