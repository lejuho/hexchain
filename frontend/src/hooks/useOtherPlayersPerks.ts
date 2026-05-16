import { useReadContract, useAccount } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { perkIdToPerk } from '@/lib/perks'

export interface OtherPlayerInfo {
  address: `0x${string}`
  perkStringId: string | null
  perkName: string | null
  perkDesc: string | null
  perkEffect: string | null
  survivingMask: number
  revealed: boolean
  declaredOrder: number
  eyeOrder: number
  score: bigint
}

export interface AllPlayerInfo extends OtherPlayerInfo {
  isMe: boolean
}

/**
 * 현재 라운드의 모든 플레이어 정보를 조회합니다.
 * - takenPerks: 다른 플레이어들이 이미 장착한 특전 ID 문자열 목록 (PerksOverlay용)
 * - otherPlayersInfo: 나를 제외한 플레이어 상세 정보 (PerkInfoPanel용)
 */
export function useOtherPlayersPerks(roundId: bigint | undefined) {
  const { address } = useAccount()

  const enabled = roundId !== undefined && roundId > 0n

  const { data: players } = useReadContract({
    ...hexChainContract,
    functionName: 'getPlayers',
    args: enabled ? [roundId!] : undefined,
    query: { enabled, refetchInterval: 2000 },
  })

  const playerList = (players as `0x${string}`[] | undefined) ?? []

  const p0 = playerList[0]
  const p1 = playerList[1]
  const p2 = playerList[2]

  const { data: info0 } = useReadContract({
    ...hexChainContract,
    functionName: 'getPlayerInfo',
    args: enabled && p0 ? [roundId!, p0] : undefined,
    query: { enabled: enabled && !!p0, refetchInterval: 2000 },
  })
  const { data: info1 } = useReadContract({
    ...hexChainContract,
    functionName: 'getPlayerInfo',
    args: enabled && p1 ? [roundId!, p1] : undefined,
    query: { enabled: enabled && !!p1, refetchInterval: 2000 },
  })
  const { data: info2 } = useReadContract({
    ...hexChainContract,
    functionName: 'getPlayerInfo',
    args: enabled && p2 ? [roundId!, p2] : undefined,
    query: { enabled: enabled && !!p2, refetchInterval: 2000 },
  })

  type InfoTuple = readonly [boolean, boolean, boolean, number, number, number, bigint, number]

  const raw: Array<{ player: `0x${string}` | undefined; data: unknown }> = [
    { player: p0, data: info0 },
    { player: p1, data: info1 },
    { player: p2, data: info2 },
  ]

  const takenPerks: string[] = []
  const otherPlayersInfo: OtherPlayerInfo[] = []
  const allPlayersInfo: AllPlayerInfo[] = []

  for (const { player, data } of raw) {
    if (!player || !data) continue
    const info = data as InfoTuple
    const perkId = Number(info[4])
    const perk = perkIdToPerk(perkId)
    const isMe = player.toLowerCase() === address?.toLowerCase()

    const entry: AllPlayerInfo = {
      address: player,
      perkStringId: perk?.id ?? null,
      perkName: perk?.name ?? null,
      perkDesc: perk?.desc ?? null,
      perkEffect: perk?.effect ?? null,
      survivingMask: Number(info[5]),
      revealed: info[1],
      eyeOrder: Number(info[3] ?? 0),
      score: BigInt(info[6] ?? 0),
      declaredOrder: Number(info[7] ?? 0),
      isMe,
    }

    allPlayersInfo.push(entry)

    if (!isMe) {
      if (perk) takenPerks.push(perk.id)
      otherPlayersInfo.push(entry)
    }
  }

  return { takenPerks, otherPlayersInfo, allPlayersInfo }
}
