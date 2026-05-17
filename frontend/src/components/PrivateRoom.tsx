'use client'

import { useState, useEffect, useRef } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { decodeEventLog } from 'viem'
import { hexChainContract } from '@/lib/config'
import { HEXCHAIN_ABI } from '@/lib/abi'

interface Props {
  onRoomCreated: (roundId: bigint) => void
  onRoomJoined:  (roundId: bigint) => void
}

function encodeCode(roundId: bigint): string {
  return roundId.toString()
}

// 코드 → roundId (숫자 문자열 파싱)
function decodeCode(code: string): bigint | null {
  const n = parseInt(code.trim(), 10)
  if (isNaN(n) || n <= 0) return null
  return BigInt(n)
}

export function PrivateRoom({ onRoomCreated, onRoomJoined }: Props) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const publicClient = usePublicClient()

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    let roundId: bigint | null = null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: HEXCHAIN_ABI, data: log.data, topics: log.topics })
        if (decoded.eventName === 'RoundCreated') {
          roundId = decoded.args.roundId as bigint
          break
        }
      } catch { continue }
    }
    if (roundId !== null) {
      // 비공개 방은 Registry에 등록하지 않음 — 코드를 아는 사람만 입장 가능
      setCreatedCode(encodeCode(roundId))
      onRoomCreated(roundId)
    }
  }, [isSuccess, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    setCreatedCode(null)
    writeContract({ ...hexChainContract, functionName: 'createRound' })
  }

  const handleJoin = async () => {
    setJoinError(null)
    const roundId = decodeCode(codeInput)
    if (roundId === null) {
      setJoinError('올바른 방 코드를 입력해 주세요')
      return
    }
    if (!publicClient) return

    setIsJoining(true)
    try {
      const info = await publicClient.readContract({
        ...hexChainContract,
        functionName: 'getRoundInfo',
        args: [roundId],
      }) as readonly [number, ...unknown[]]

      const state = Number(info[0])
      if (state !== 0) {
        setJoinError('이미 시작되었거나 종료된 방입니다')
        return
      }
      onRoomJoined(roundId)
    } catch {
      setJoinError('존재하지 않는 방 코드입니다')
    } finally {
      setIsJoining(false)
    }
  }

  const handleCopy = () => {
    if (!createdCode) return
    navigator.clipboard.writeText(createdCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      {/* 탭 헤더 */}
      <div className="flex">
        <button
          onClick={() => setTab('create')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            tab === 'create'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          방 만들기
        </button>
        <button
          onClick={() => { setTab('join'); setJoinError(null); setTimeout(() => inputRef.current?.focus(), 50) }}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            tab === 'join'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          코드로 입장
        </button>
      </div>

      <div className="p-4">
        {/* ── 방 만들기 탭 ── */}
        {tab === 'create' && (
          <div className="space-y-3">
            {!createdCode ? (
              <>
                <p className="text-gray-400 text-sm">방을 만들고 바로 내 커밋까지 이어서 시작합니다.</p>
                <button
                  onClick={handleCreate}
                  disabled={isPending || isConfirming}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
                >
                  {isPending ? '지갑 확인 중...' : isConfirming ? '생성 중...' : '비공개 게임 시작'}
                </button>
                {writeError && (
                  <p className="text-red-400 text-xs text-center">
                    {(writeError as { shortMessage?: string }).shortMessage ?? writeError.message}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-gray-400 text-sm text-center">방이 생성되었습니다. 코드를 공유하세요.</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-800 rounded-xl py-4 text-center">
                    <span className={`text-white font-mono font-bold tracking-[0.15em] ${
                      createdCode.length > 6 ? 'text-xl' : 'text-3xl'
                    }`}>
                      {createdCode}
                    </span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="px-4 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm text-gray-300 transition-colors"
                  >
                    {copied ? '✓' : '복사'}
                  </button>
                </div>
                <p className="text-gray-600 text-xs text-center">
                  친구가 이 코드로 입장하면 게임이 시작됩니다
                </p>
              </>
            )}
          </div>
        )}

        {/* ── 코드로 입장 탭 ── */}
        {tab === 'join' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">친구에게 받은 방 코드를 입력하세요.</p>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={12}
              placeholder="42"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setJoinError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
              className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-white font-mono text-2xl text-center tracking-[0.3em] placeholder:text-gray-600 placeholder:tracking-normal"
            />
            {joinError && (
              <p className="text-red-400 text-xs text-center">{joinError}</p>
            )}
            <button
              onClick={handleJoin}
              disabled={!codeInput || isJoining}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
            >
              {isJoining ? '확인 중...' : '입장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
