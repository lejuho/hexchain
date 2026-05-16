'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { keccak256, encodePacked } from 'viem'
import { hexChainContract } from '@/lib/config'
import { generateSalt, eyeCommitStorageKey } from '@/lib/utils'

interface Props {
  roundId: bigint
  equippedPerkId?: string | null
  shuffleEyeCards?: boolean   // C9: 전원 카드 순서 셔플
  fogCards?: boolean          // C7/C9: 배율 내용 안개 처리 (선택 전 가림)
  onSuccess: () => void
}

const EYE_OPTS = [
  { order: 1, mult: '×2.0', base: '+ 1.0pt', sub: '먼저 공개 · 고위험', selCls: 'sel-1' },
  { order: 2, mult: '×1.5', base: '+ 0.7pt', sub: '두 번째 공개',       selCls: 'sel-2' },
  { order: 3, mult: '×1.2', base: '+ 0.5pt', sub: '마지막 공개 · 안전', selCls: 'sel-3' },
]

// roundId 기반 결정론적 셔플 (C9/C10 — 매 라운드 다른 순서, 새로고침 무관)
const PERMS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]] as const
function shuffledOpts(roundId: bigint) {
  const idx = Number(roundId % 6n)
  return PERMS[idx].map(i => EYE_OPTS[i])
}

export function EyeCommitForm({ roundId, equippedPerkId, shuffleEyeCards = false, fogCards = false, onSuccess }: Props) {
  const isC6 = equippedPerkId === 'c6'
  const needsDeclaration = isC6  // B6는 LOCKED 페이즈에서 별도 선언, 여기선 일반 커밋
  const displayOpts = shuffleEyeCards ? shuffledOpts(roundId) : EYE_OPTS
  const [selected, setSelected] = useState<number | null>(null)
  const [declared, setDeclared] = useState<number | null>(null)
  const [isDone, setIsDone] = useState(false)
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) { setIsDone(true); onSuccess() }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isDone) return null

  const handleCommit = async () => {
    if (!selected) return
    if (needsDeclaration && !declared) return
    const salt = generateSalt()
    const eyeCommitHash = keccak256(encodePacked(['uint8', 'bytes32'], [selected, salt]))
    localStorage.setItem(
      eyeCommitStorageKey(roundId),
      JSON.stringify({ order: selected, salt }),
    )
    if (needsDeclaration) {
      writeContract({
        ...hexChainContract,
        functionName: 'eyeCommitWithDeclaration',
        args: [roundId, eyeCommitHash, declared as number],
      })
    } else {
      writeContract({
        ...hexChainContract,
        functionName: 'eyeCommit',
        args: [roundId, eyeCommitHash],
      })
    }
  }

  return (
    <>
      <div className="hx-sec" style={{ marginTop: 22 }}>눈치게임 — 순서 선택</div>

      <div style={{ padding: '4px 20px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.7 }}>
        상대가 몇 개 살았는지 모른 채 순서를 골라야 합니다
      </div>

      {(shuffleEyeCards || fogCards) && (
        <div style={{ margin: '6px 20px 0', padding: '6px 12px', borderRadius: 8, background: 'rgba(192,132,252,.1)', border: '1px solid rgba(192,132,252,.3)', fontSize: 11, color: '#c084fc', textAlign: 'center' }}>
          {shuffleEyeCards && fogCards ? '🌫 안개전 + 순서 교란 — 카드가 섞이고 내용이 가려졌습니다'
            : shuffleEyeCards ? '🌀 전장 혼돈 — 카드 순서가 섞였습니다'
            : '🌫 안개전 — 카드 내용이 가려졌습니다'}
        </div>
      )}

      <div style={{ height: 8 }} />
      <div className="hx-eye-cards">
        {displayOpts.map(opt => {
          const isSel = selected === opt.order
          return (
            <div
              key={opt.order}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(opt.order)}
              onKeyDown={e => e.key === 'Enter' && setSelected(opt.order)}
              className={`hx-eye-card${isSel ? ` ${opt.selCls}` : ''}${fogCards ? ' fog' : ''}`}
            >
              {fogCards ? (
                <div style={{ flex: 1, textAlign: 'center', fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>?</div>
              ) : (
                <>
                  <div className="hx-eye-card-l">
                    <div className="hx-eye-num">{opt.order}</div>
                    <div className="hx-eye-sub">{opt.sub}</div>
                  </div>
                  <div className="hx-eye-card-r">
                    <div className="hx-eye-mult">{opt.mult}</div>
                    <div className="hx-eye-base">{opt.base}</div>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* B6 / C6: 선언 순서 선택 */}
      {needsDeclaration && (
        <>
          <div className="hx-sec" style={{ marginTop: 16 }}>
            C5 — 선제 공개 순서
          </div>
          <div style={{ padding: '4px 20px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            공개할 실제 순서를 선택하세요 — 상대가 알 수 있습니다
          </div>
          <div style={{ height: 8 }} />
          <div className="hx-eye-cards">
            {displayOpts.map(opt => {
              const isSel = declared === opt.order
              return (
                <div
                  key={opt.order}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDeclared(opt.order)}
                  onKeyDown={e => e.key === 'Enter' && setDeclared(opt.order)}
                  className={`hx-eye-card${isSel ? ` ${opt.selCls}` : ''}${fogCards ? ' fog' : ''}`}
                >
                  {fogCards ? (
                    <div style={{ flex: 1, textAlign: 'center', fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>?</div>
                  ) : (
                    <>
                      <div className="hx-eye-card-l">
                        <div className="hx-eye-num">{opt.order}</div>
                        <div className="hx-eye-sub">선언</div>
                      </div>
                      <div className="hx-eye-card-r">
                        <div className="hx-eye-mult">{opt.mult}</div>
                        <div className="hx-eye-base">{opt.base}</div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ height: 16 }} />
      <button
        onClick={handleCommit}
        disabled={!selected || (needsDeclaration && !declared) || isPending || isConfirming}
        className="hx-btn hx-btn-primary"
      >
        {isPending ? '지갑 서명 중…' : isConfirming ? '확인 중…' : '순서 커밋 🔒'}
      </button>

      {error && (
        <div style={{ margin: '8px 20px 0', fontSize: 12, color: 'var(--red)' }}>
          {(error as { shortMessage?: string }).shortMessage ?? error.message}
        </div>
      )}
      <div style={{ height: 8 }} />
    </>
  )
}
