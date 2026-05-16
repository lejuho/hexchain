import { usePublicClient, useAccount } from 'wagmi'
import { useEffect, useState } from 'react'
import { parseAbiItem } from 'viem'
import { CONTRACT_ADDRESS } from '@/lib/config'

export interface SettledData {
  top3: readonly [`0x${string}`, `0x${string}`, `0x${string}`]
  scores: readonly [bigint, bigint, bigint]
  myRank: 1 | 2 | 3 | null
  committedCount: number
  revealedCount: number
  cancelled?: boolean   // expireRound / cancelRound으로 종료된 경우
}

/** null = 로딩 중, false = 로드 완료(이벤트 없음), SettledData = 정상 */
export function useSettledResults(roundId: bigint | undefined, isSettled: boolean) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [data, setData] = useState<SettledData | null | false>(null)

  useEffect(() => {
    if (!roundId || !isSettled || !publicClient) return
    setData(null)

    Promise.all([
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem(
          'event Settled(uint256 indexed roundId, address[3] top3, uint64[3] scores)',
        ),
        args: { roundId },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem(
          'event Committed(uint256 indexed roundId, address indexed player, uint256 tokenId)',
        ),
        args: { roundId },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem(
          'event Revealed(uint256 indexed roundId, uint256 indexed tokenId, address indexed player)',
        ),
        args: { roundId },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem(
          'event RoundCancelled(uint256 indexed roundId, address indexed by)',
        ),
        args: { roundId },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
    ])
      .then(([settledLogs, committedLogs, revealedLogs, cancelledLogs]) => {
        // 취소된 라운드 (인원 부족 or 방장 취소)
        if (settledLogs.length === 0 && cancelledLogs.length > 0) {
          setData({
            top3: ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'],
            scores: [0n, 0n, 0n],
            myRank: null,
            committedCount: committedLogs.length,
            revealedCount: 0,
            cancelled: true,
          })
          return
        }
        if (settledLogs.length === 0) {
          setData(false)
          return
        }
        const { top3, scores } = settledLogs[0].args as {
          top3: readonly [`0x${string}`, `0x${string}`, `0x${string}`]
          scores: readonly [bigint, bigint, bigint]
        }
        const idx = address
          ? top3.findIndex(a => a.toLowerCase() === address.toLowerCase())
          : -1
        setData({
          top3,
          scores,
          myRank: idx >= 0 ? ((idx + 1) as 1 | 2 | 3) : null,
          committedCount: committedLogs.length,
          revealedCount: revealedLogs.length,
        })
      })
      .catch(() => setData(false))
  }, [roundId, isSettled, publicClient, address])

  return data
}
