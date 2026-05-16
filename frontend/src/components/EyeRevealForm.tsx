'use client'

import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { eyeCommitStorageKey, EyeCommitData } from '@/lib/utils'

interface Props {
  roundId: bigint
  onSuccess: () => void
}

const ORDER_META = [
  null,
  { mult: '×2.0', sub: '먼저 공개 · 고위험', selCls: 'sel-1' },
  { mult: '×1.5', sub: '두 번째 공개',       selCls: 'sel-2' },
  { mult: '×1.2', sub: '마지막 공개 · 안전', selCls: 'sel-3' },
]

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? ''

/**
 * EyeRevealForm
 *
 * 유저가 직접 트랜잭션을 보내는 대신,
 * keeper 백엔드에 order + salt를 서명과 함께 전송합니다.
 * Keeper가 EYE_LOCKED 이후 eyeRevealFor()를 대신 호출합니다.
 */
export function EyeRevealForm({ roundId, onSuccess }: Props) {
  const [commitData, setCommitData] = useState<EyeCommitData | null>(null)
  const [status, setStatus] = useState<'idle' | 'signing' | 'sending' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(eyeCommitStorageKey(roundId))
      if (raw) setCommitData(JSON.parse(raw) as EyeCommitData)
    } catch { /* ignore */ }
  }, [roundId])

  useEffect(() => {
    if (status === 'done') onSuccess()
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'done') return null

  if (!commitData) {
    return (
      <div className="hx-hint red" style={{ margin: '0 20px' }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>SEQ commit 데이터 없음</div>
          <div style={{ fontSize: 11 }}>이 브라우저에서 seqCommit을 하지 않았거나 데이터가 삭제되었습니다.</div>
        </div>
      </div>
    )
  }

  const handleReveal = async () => {
    if (!address || !commitData) return
    setErrorMsg('')

    try {
      // 1. 지갑 서명 — 백엔드가 address 검증에 사용
      setStatus('signing')
      const message = `HexChain eye-reveal roundId:${roundId.toString()}`
      const signature = await signMessageAsync({ message })

      // 2. Keeper API로 order + salt 전송
      setStatus('sending')
      const res = await fetch(`${BACKEND_URL}/eye-reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId:   roundId.toString(),
          order:     commitData.order,
          salt:      commitData.salt,
          signature,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message ?? `HTTP ${res.status}`)
      }

      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg((err as Error).message)
    }
  }

  const isLoading = status === 'signing' || status === 'sending'
  const meta = ORDER_META[commitData.order]

  return (
    <>
      <div className="hx-sec" style={{ marginTop: 22 }}>순서 공개 (Eye Reveal)</div>

      <div className="hx-info-card">
        <div className="hx-info-row">
          <div className="hx-info-label">선택 순서</div>
          <div className="hx-info-val accent">봉인됨 🔒</div>
        </div>
        <div className="hx-info-divider" />
        <div className="hx-info-row">
          <div className="hx-info-label">내 생존 픽</div>
          <div className="hx-info-val green">—</div>
        </div>
      </div>

      {meta && (
        <>
          <div style={{ height: 12 }} />
          <div className="hx-eye-cards">
            <div className={`hx-eye-card ${meta.selCls}`} style={{ cursor: 'default' }}>
              <div className="hx-eye-card-l">
                <div className="hx-eye-num">{commitData.order}</div>
                <div className="hx-eye-sub">{meta.sub}</div>
              </div>
              <div className="hx-eye-card-r">
                <div className="hx-eye-mult">{meta.mult}</div>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ height: 12 }} />
      <div className="hx-hint" style={{ margin: '0 20px' }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>ℹ</span>
        <div>서명 후 keeper에게 전달됩니다. Keeper가 SEQ_LOCKED 이후 대신 공개합니다. (가스 없음)</div>
      </div>

      <div style={{ height: 16 }} />
      <button
        onClick={handleReveal}
        disabled={isLoading || !BACKEND_URL}
        className="hx-btn hx-btn-primary"
      >
        {status === 'signing' ? '지갑 서명 중…'
          : status === 'sending' ? 'Keeper에 전송 중…'
          : '순서 전달하기 →'}
      </button>

      {!BACKEND_URL && (
        <div style={{ margin: '8px 20px 0', fontSize: 12, color: 'var(--muted)' }}>
          NEXT_PUBLIC_BACKEND_URL이 설정되지 않았습니다.
        </div>
      )}
      {status === 'error' && (
        <div style={{ margin: '8px 20px 0', fontSize: 12, color: 'var(--red)' }}>
          {errorMsg}
        </div>
      )}
      <div style={{ height: 8 }} />
    </>
  )
}
