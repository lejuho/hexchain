'use client'

import { useEffect, useState } from 'react'
import { useAccount, useBlockNumber, usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { CONTRACT_ADDRESS } from '@/lib/config'

export interface ScoreBreakdown {
  finalMask: number
  removedMask: number
  basePickSumX10: number
  eyeAppliedScoreX100: number
  adjustmentX100: number
  effectivePerk: number
  eyeSuccess: boolean
  settled: boolean
}

const scoreBreakdownEvent = parseAbiItem(
  'event ScoreBreakdownLogged(uint256 indexed roundId, address indexed player, uint16 finalMask, uint16 removedMask, uint16 basePickSumX10, uint16 eyeAppliedScoreX100, int32 adjustmentX100, uint8 effectivePerk, bool eyeSuccess)'
)

export function useScoreBreakdown(roundId: bigint | undefined) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!publicClient || !address || roundId === undefined || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
        setScoreBreakdown(null)
        return
      }

      const logs = await publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: scoreBreakdownEvent,
        args: { roundId, player: address },
        fromBlock: 0n,
        toBlock: 'latest',
      })

      if (cancelled || logs.length === 0) {
        if (!cancelled) setScoreBreakdown(null)
        return
      }

      const latest = logs[logs.length - 1]
      const args = latest.args
      setScoreBreakdown({
        finalMask: Number(args.finalMask ?? 0),
        removedMask: Number(args.removedMask ?? 0),
        basePickSumX10: Number(args.basePickSumX10 ?? 0),
        eyeAppliedScoreX100: Number(args.eyeAppliedScoreX100 ?? 0),
        adjustmentX100: Number(args.adjustmentX100 ?? 0),
        effectivePerk: Number(args.effectivePerk ?? 0),
        eyeSuccess: Boolean(args.eyeSuccess),
        settled: true,
      })
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [publicClient, address, roundId, blockNumber])

  return { scoreBreakdown }
}
