'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { hexChainContract } from '@/lib/config'
import { HEX_LABELS, proofStorageKey } from '@/lib/utils'
import { buildCommitHash } from '@/lib/poseidon'
import { useLocalCommit } from '@/hooks/useLocalCommit'
import { generateRevealProof } from '@/lib/prover'
import type { RevealProof } from '@/lib/prover'
import { flog, fwarn } from '@/lib/flog'

interface Props {
  roundId: bigint
  onSuccess: () => void
}

export function RevealForm({ roundId, onSuccess }: Props) {
  const { address } = useAccount()
  const { loadCommit } = useLocalCommit(roundId)
  const commit = loadCommit()

  const [proof, setProof] = useState<RevealProof | null>(null)
  const [proofPct, setProofPct] = useState(0)
  const [proofStage, setProofStage] = useState('')
  const [proofErr, setProofErr] = useState<string | null>(null)
  const [isDone, setIsDone] = useState(false)
  const generatingRef = useRef(false)

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // localStorage에서 proof 로드 or 직접 생성
  useEffect(() => {
    if (!commit) return

    // 이미 생성된 proof가 있으면 사용
    try {
      const raw = localStorage.getItem(proofStorageKey(roundId))
      if (raw) {
        flog(`[RevealForm] localStorage에서 proof 로드 (round ${roundId})`)
        setProof(JSON.parse(raw) as RevealProof)
        return
      }
    } catch { /* ignore */ }

    // 없으면 직접 생성
    if (generatingRef.current) return
    generatingRef.current = true
    flog(`[RevealForm] ZK proof 생성 시작 (round ${roundId})`)
    setProofPct(1)
    setProofStage('초기화 중')

    const commitHash = buildCommitHash(commit.choices, BigInt(commit.salt))
    const t0 = Date.now()

    generateRevealProof(commit.choices, BigInt(commit.salt), commitHash, (pct, stage) => {
      setProofPct(pct)
      setProofStage(stage)
    })
      .then((p: RevealProof) => {
        flog(`[RevealForm] ZK proof 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
        localStorage.setItem(proofStorageKey(roundId), JSON.stringify(p))
        setProof(p)
        setProofPct(100)
        setProofStage('완료')
      })
      .catch((e: unknown) => {
        fwarn(`[RevealForm] ZK proof 생성 실패: ${(e as Error).message}`)
        setProofErr((e as Error).message)
      })
      .finally(() => {
        generatingRef.current = false
      })
  }, [roundId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isSuccess) { setIsDone(true); onSuccess() }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!commit) {
    return (
      <div className="hx-hint red" style={{ margin: '0 20px' }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>커밋 데이터 없음</div>
          <div style={{ fontSize: 11 }}>이 브라우저에 원본 선택지가 없습니다. 다른 기기에서 커밋했나요?</div>
        </div>
      </div>
    )
  }

  if (isDone) return null

  const handleReveal = () => {
    if (!proof || !address) return
    flog(`[RevealForm] revealFor 제출 — round=${roundId} addr=${address.slice(0,8)}`)
    writeContract({
      ...hexChainContract,
      functionName: 'revealFor',
      args: [
        roundId,
        address,
        proof.pA.map(BigInt) as [bigint, bigint],
        proof.pB.map(r => r.map(BigInt)) as [[bigint, bigint], [bigint, bigint]],
        proof.pC.map(BigInt) as [bigint, bigint],
        proof.pubSignals.map(BigInt) as [bigint, bigint],
      ],
    })
  }

  const isSubmitting = isPending || isConfirming
  const canReveal = !!proof && !!address && !isSubmitting

  return (
    <>
      <div className="hx-sec" style={{ marginTop: 22 }}>픽 공개</div>

      <div className="hx-info-card">
        <div className="hx-info-row">
          <div className="hx-info-label">내 픽</div>
          <div className="hx-info-val">
            <div className="hx-chip-row">
              {commit.choices.map((v, i) => (
                <span key={i} className="hx-pick-chip">{HEX_LABELS[v]}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="hx-info-divider" />
        <div className="hx-info-row">
          <div className="hx-info-label">ZK Proof</div>
          <div className="hx-info-val" style={{ color: proof ? 'var(--green)' : proofErr ? 'var(--red)' : 'var(--amber)' }}>
            {proof ? '✓ 준비됨' : proofErr ? '✗ 생성 실패' : `⏳ ${proofPct}%`}
          </div>
        </div>
      </div>

      {/* proof 생성 중 진행바 */}
      {!proof && !proofErr && (
        <div style={{ margin: '10px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>
            <span>{proofStage || '초기화 중...'}</span>
            <span style={{ fontFamily: 'var(--mono)', color: '#a5b4fc', fontWeight: 700 }}>{proofPct}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 5, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 5,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              width: `${proofPct}%`,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(150,150,170,.5)', textAlign: 'center' }}>
            브라우저에서 영지식 증명 생성 중 — 잠시 기다려 주세요
          </div>
        </div>
      )}

      {proofErr && (
        <div className="hx-hint red" style={{ margin: '8px 20px 0' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <div style={{ fontSize: 11 }}>proof 생성 실패: {proofErr}</div>
        </div>
      )}

      <div style={{ height: 12 }} />

      <div style={{ padding: '0 20px' }}>
        <button
          onClick={handleReveal}
          disabled={!canReveal}
          className="hx-btn hx-btn-primary"
          style={{ width: '100%' }}
        >
          {isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : !proof ? 'proof 생성 대기 중…' : '공개하기 🔓'}
        </button>
        {error && (
          <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>
            {(error as { shortMessage?: string }).shortMessage ?? error.message}
          </p>
        )}
      </div>

      <div className="hx-hint" style={{ margin: '8px 20px 0' }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>ℹ</span>
        <div style={{ fontSize: 11 }}>
          각 플레이어가 직접 자신의 픽을 공개합니다. 공개 후 눈치게임으로 넘어갑니다.
        </div>
      </div>
      <div style={{ height: 8 }} />
    </>
  )
}
