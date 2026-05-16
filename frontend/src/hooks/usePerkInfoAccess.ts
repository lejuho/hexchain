import { useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

export type InfoType = 'c1' | 'c2' | 'c3'

interface NonceResponse {
  nonce: string
  expiresAt: string
  message: string
}

export function usePerkInfoAccess(roundId: bigint | undefined) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const loadInfo = useCallback(async (infoType: InfoType) => {
    if (!BACKEND_URL) throw new Error('NEXT_PUBLIC_BACKEND_URL is not configured')
    if (!address) throw new Error('Wallet not connected')
    if (roundId === undefined) throw new Error('roundId is required')

    const nonceRes = await fetch(`${BACKEND_URL}/info-access/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        roundId: roundId.toString(),
        infoType,
      }),
    })
    if (!nonceRes.ok) throw new Error(await nonceRes.text() || 'Failed to get nonce')

    const noncePayload = await nonceRes.json() as NonceResponse

    const signature = await signMessageAsync({
      message: noncePayload.message,
    })

    const revealRes = await fetch(`${BACKEND_URL}/info-access/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        roundId: roundId.toString(),
        infoType,
        nonce: noncePayload.nonce,
        signature,
      }),
    })
    if (!revealRes.ok) throw new Error(await revealRes.text() || 'Failed to load perk info')

    return revealRes.json()
  }, [address, roundId, signMessageAsync])

  return { loadInfo }
}
