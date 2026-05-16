'use client'

import { useEffect, useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract, REGISTRY_ADDRESS, REGISTRY_ENABLED } from '@/lib/config'
import { decodeEventLog } from 'viem'
import { HEXCHAIN_ABI, REGISTRY_ABI } from '@/lib/abi'

interface ButtonProps {
  label: string
  onClick: () => void
  isPending: boolean
  isConfirming: boolean
  isDone: boolean
  error: Error | null
  variant?: 'primary' | 'secondary'
}

function ActionButton({
  label, onClick, isPending, isConfirming, isDone, error, variant = 'primary',
}: ButtonProps) {
  if (isDone) return null  // 성공 후 즉시 숨김 (refetch 완료 전에도)

  const cls =
    variant === 'primary'
      ? 'bg-indigo-600 hover:bg-indigo-500'
      : 'bg-gray-700 hover:bg-gray-600'

  return (
    <div>
      <button
        onClick={onClick}
        disabled={isPending || isConfirming}
        className={`w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-40 ${cls}`}
      >
        {isPending ? 'Sign in wallet…' : isConfirming ? 'Confirming…' : label}
      </button>
      {error && (
        <p className="text-red-400 text-xs mt-1 break-words">
          {(error as { shortMessage?: string }).shortMessage ?? error.message}
        </p>
      )}
    </div>
  )
}

export function CreateRoundButton({
  onSuccess,
  onError,
  label = '매칭 시작',
}: {
  onSuccess?: (roundId: bigint) => void
  onError?: () => void
  label?: string
}) {
  const [isDone, setIsDone] = useState(false)
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { writeContract: registryWrite } = useWriteContract()
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !receipt) return

    let createdRoundId: bigint | null = null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: HEXCHAIN_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'RoundCreated') {
          createdRoundId = decoded.args.roundId as bigint
          break
        }
      } catch {
        continue
      }
    }

    setIsDone(true)
    if (createdRoundId !== null) {
      // Registry가 설정된 경우 register() 호출 (permissionless)
      if (REGISTRY_ENABLED) {
        registryWrite({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: 'register',
          args: [createdRoundId],
        })
      }
      onSuccess?.(createdRoundId)
    }
  }, [isSuccess, receipt, onSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (error) onError?.()
  }, [error, onError])

  return (
    <ActionButton
      label={label}
      onClick={() => writeContract({ ...hexChainContract, functionName: 'createRound' })}
      isPending={isPending}
      isConfirming={isConfirming}
      isDone={isDone}
      error={error}
      variant="primary"
    />
  )
}

export function CancelRoundButton({ roundId, onSuccess }: { roundId: bigint; onSuccess?: () => void }) {
  const [isDone, setIsDone] = useState(false)
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) { setIsDone(true); onSuccess?.() }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ActionButton
      label="나가기 (라운드 취소)"
      onClick={() => writeContract({ ...hexChainContract, functionName: 'cancelRound', args: [roundId] })}
      isPending={isPending}
      isConfirming={isConfirming}
      isDone={isDone}
      error={error}
      variant="secondary"
    />
  )
}
