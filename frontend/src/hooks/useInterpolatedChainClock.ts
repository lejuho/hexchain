'use client'

import { useEffect, useRef, useState } from 'react'

function nominalBlockMs(chainId?: number) {
  if (chainId === 84532 || chainId === 31337) return 2_000
  return 12_000
}

/**
 * 체인 블록을 권위 있는 기준점으로 두되, 블록 사이 시간은 브라우저 시계로 보간한다.
 * 새 블록을 받으면 즉시 재동기화하고, 관측된 블록 간격으로 추정 블록타임을 천천히 보정한다.
 */
export function useInterpolatedChainClock(currentBlock: bigint | undefined, chainId?: number) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [blockMs, setBlockMs] = useState(() => nominalBlockMs(chainId))
  const anchorRef = useRef<{ block: bigint; atMs: number } | null>(null)

  useEffect(() => {
    setBlockMs(nominalBlockMs(chainId))
  }, [chainId])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 50)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (currentBlock === undefined) return
    const atMs = Date.now()
    const prev = anchorRef.current
    if (prev && currentBlock > prev.block) {
      const deltaBlocks = Number(currentBlock - prev.block)
      const sample = (atMs - prev.atMs) / deltaBlocks
      if (sample >= 250 && sample <= 60_000) {
        setBlockMs(old => old * 0.75 + sample * 0.25)
      }
    }
    anchorRef.current = { block: currentBlock, atMs }
    setNowMs(atMs)
  }, [currentBlock])

  const anchor = anchorRef.current

  function msUntil(targetBlock: bigint) {
    if (!anchor) return null
    const blocks = Number(targetBlock - anchor.block)
    return Math.max(0, blocks * blockMs - (nowMs - anchor.atMs))
  }

  return { blockMs, msUntil }
}
