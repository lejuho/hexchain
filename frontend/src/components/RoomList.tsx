'use client'

import { useOpenRounds } from '@/hooks/useOpenRounds'
import { useRoundInfo } from '@/hooks/useRoundInfo'
import { ROUND_STATE_LABEL } from '@/lib/utils'
import { REGISTRY_ENABLED } from '@/lib/config'

interface Props {
  onJoin: (roundId: bigint) => void
  myRoundId?: bigint
}

function RoomRow({ roundId, onJoin, isMyRoom }: { roundId: bigint; onJoin: () => void; isMyRoom: boolean }) {
  const { roundInfo } = useRoundInfo(roundId)

  if (!roundInfo) return null

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${
      isMyRoom ? 'bg-indigo-950 border-indigo-700' : 'bg-gray-800 border-gray-700'
    }`}>
      <div>
        <div className="text-sm font-mono text-gray-300">Room #{roundId.toString()}</div>
        <div className="text-xs text-gray-500">
          {roundInfo.playerCount}/3명 · {ROUND_STATE_LABEL[roundInfo.state] ?? 'UNKNOWN'}
        </div>
      </div>
      {!isMyRoom && roundInfo.state === 0 && (
        <button
          onClick={onJoin}
          className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          참가
        </button>
      )}
      {isMyRoom && (
        <span className="text-xs text-indigo-400 font-semibold">내 방</span>
      )}
    </div>
  )
}

export function RoomList({ onJoin, myRoundId }: Props) {
  const { openRoundIds, isLoading } = useOpenRounds()

  if (!REGISTRY_ENABLED) return null

  if (isLoading) {
    return (
      <div className="text-gray-500 text-sm text-center py-3 animate-pulse">
        방 목록 불러오는 중...
      </div>
    )
  }

  if (openRoundIds.length === 0) {
    return (
      <div className="text-gray-600 text-sm text-center py-3">
        현재 열린 방이 없습니다
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {openRoundIds.map(rid => (
        <RoomRow
          key={rid.toString()}
          roundId={rid}
          onJoin={() => onJoin(rid)}
          isMyRoom={rid === myRoundId}
        />
      ))}
    </div>
  )
}
