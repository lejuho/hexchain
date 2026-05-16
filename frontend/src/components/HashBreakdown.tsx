'use client'

import { HEX_LABELS, getNibble, computeNibbleMult } from '@/lib/utils'
import type { ScoreBreakdown } from '@/hooks/useScoreBreakdown'

interface Props {
  revealHash: `0x${string}`
  choices: number[]       // 4 picks (nibble values 0-15)
  survivingMask: number   // nibble-value bitmask (bit v = nibble v survived)
  eyeOrder: number        // 0=no eye, 1/2/3=eye order
  score: bigint
  perkLabel?: string | null
  scoreBreakdown?: ScoreBreakdown | null
  hideScore?: boolean
  hideMultipliers?: boolean  // C7/C8: 배율 수치를 ?로 가림
}

const EYE_MULT_LABEL: Record<number, string> = { 1: '×2.0 +1.0pt', 2: '×1.5 +0.7pt', 3: '×1.2 +0.5pt' }

function formatScore(score: bigint | number): string {
  return (Number(score) / 100).toFixed(2)
}

function eyeBaseRaw(order: number): number {
  if (order === 1) return 100
  if (order === 2) return 70
  if (order === 3) return 50
  return 0
}

function eyeMultRaw(order: number): number {
  if (order === 1) return 20
  if (order === 2) return 15
  if (order === 3) return 12
  return 10
}

export function HashBreakdown({ revealHash, choices, survivingMask, eyeOrder, score, perkLabel, scoreBreakdown, hideScore, hideMultipliers }: Props) {
  const nibbleMult = computeNibbleMult(revealHash)
  const displayFinalMask = scoreBreakdown?.settled ? scoreBreakdown.finalMask : survivingMask
  const survivedChoices = choices.filter(v => (displayFinalMask & (1 << v)) !== 0)
  const removedChoices = scoreBreakdown?.settled
    ? choices.filter(v => (scoreBreakdown.removedMask & (1 << v)) !== 0)
    : choices.filter(v => (survivingMask & (1 << v)) === 0)
  const basePickSumRaw = scoreBreakdown?.settled
    ? scoreBreakdown.basePickSumX10
    : survivedChoices.reduce((sum, v) => sum + nibbleMult[v], 0)
  const rawScore = Number(score)
  const noEyeRaw = basePickSumRaw * 10
  const eyeAppliedRaw = scoreBreakdown?.settled ? scoreBreakdown.eyeAppliedScoreX100 : null
  const eyeSuccessRaw = eyeOrder > 0 ? basePickSumRaw * eyeMultRaw(eyeOrder) + eyeBaseRaw(eyeOrder) : null
  const inferredEyeApplied = scoreBreakdown?.settled
    ? scoreBreakdown.eyeSuccess
    : eyeSuccessRaw !== null && rawScore >= eyeSuccessRaw
  const inferredAdjustmentRaw = scoreBreakdown?.settled
    ? scoreBreakdown.adjustmentX100
    : inferredEyeApplied
      ? rawScore - (eyeSuccessRaw ?? 0)
      : rawScore - noEyeRaw
  const survivedSummary = survivedChoices.length > 0
    ? `${survivedChoices.map(v => `${HEX_LABELS[v]}(${(nibbleMult[v] / 10).toFixed(1)}x)`).join(' + ')} = ${formatScore(basePickSumRaw * 10)}pt`
    : '생존 픽 없음 = 0.00pt'
  const removedSummary = removedChoices.length > 0
    ? removedChoices.map(v => `${HEX_LABELS[v]}(${(nibbleMult[v] / 10).toFixed(1)}x)`).join(', ')
    : '없음'
  const eyeSummary = eyeOrder > 0
    ? inferredEyeApplied
      ? `${eyeOrder}번 성공식 적용: (${formatScore(basePickSumRaw * 10)} × ${(eyeMultRaw(eyeOrder) / 10).toFixed(1)}) + ${(eyeBaseRaw(eyeOrder) / 100).toFixed(2)} = ${formatScore(eyeAppliedRaw ?? eyeSuccessRaw ?? 0)}pt`
      : `${eyeOrder}번 선택 기록 있음, 성공 여부는 프론트에서 확정 불가`
    : '미참여 또는 추가 배수 없음'
  const adjustmentSummary = perkLabel
    ? `${perkLabel}${inferredAdjustmentRaw !== 0 ? ` 포함 추정: ${inferredAdjustmentRaw > 0 ? '+' : ''}${formatScore(inferredAdjustmentRaw)}pt` : ' 보정 없음'}`
    : inferredAdjustmentRaw !== 0
      ? `기타 보정 ${inferredAdjustmentRaw > 0 ? '+' : ''}${formatScore(inferredAdjustmentRaw)}pt`
      : '없음'

  // 첫 16 nibble (배율 결정에 쓰인 부분)
  const first16 = Array.from({ length: 16 }, (_, i) => getNibble(revealHash, i))

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 space-y-4">
      <div>
        <h3 className="text-white font-semibold">Score Breakdown</h3>
        <p className="text-gray-500 text-xs mt-1">
          블록 해시 첫 16 nibble 등장 횟수 → 배율 / 소수자 게임 생존 픽 / 눈치게임 결과
        </p>
      </div>

      {/* 배율 테이블 — 16 nibble 값 × 배율 */}
      <div>
        <p className="text-gray-400 text-xs font-medium mb-2">Nibble 배율 (블록 해시 첫 16 nibble 기준)</p>
        <div className="grid grid-cols-8 gap-1 font-mono text-xs">
          {nibbleMult.map((mult, v) => {
            const isChosen = choices.includes(v)
            const multLabel = hideMultipliers ? '?' : `${(mult / 10).toFixed(1)}x`
            return (
              <div
                key={v}
                className={`rounded-lg p-2 text-center space-y-0.5
                  ${isChosen
                    ? 'bg-indigo-800 ring-2 ring-indigo-400'
                    : 'bg-gray-800'}`}
              >
                <div className={`font-bold text-sm ${isChosen ? 'text-white' : 'text-gray-400'}`}>
                  {HEX_LABELS[v]}
                </div>
                <div className={`text-[10px] ${hideMultipliers ? 'text-gray-600'
                  : mult === 30 ? 'text-yellow-400'
                  : mult >= 20 ? 'text-green-400'
                  : mult >= 15 ? 'text-blue-400'
                  : 'text-gray-500'}`}>
                  {multLabel}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 첫 16 nibble 시각화 */}
      <div>
        <p className="text-gray-400 text-xs font-medium mb-2">Hash 첫 16 nibble</p>
        <div className="flex gap-1 flex-wrap font-mono text-xs">
          {first16.map((nib, i) => (
            <span key={i} className="bg-gray-800 text-gray-400 w-6 h-6 flex items-center justify-center rounded">
              {HEX_LABELS[nib]}
            </span>
          ))}
        </div>
      </div>

      {/* 내 픽 상태 */}
      <div>
        <p className="text-gray-400 text-xs font-medium mb-2">내 4 picks</p>
        <div className="grid grid-cols-4 gap-2">
          {choices.map((v, i) => {
            const survived = (displayFinalMask & (1 << v)) !== 0
            const mult = nibbleMult[v]
            return (
              <div
                key={i}
                className={`rounded-xl p-3 text-center space-y-1 border
                  ${survived ? 'bg-green-950 border-green-700' : 'bg-gray-800 border-gray-700'}`}
              >
                <div className={`font-mono font-bold text-xl ${survived ? 'text-green-300' : 'text-gray-500'}`}>
                  {HEX_LABELS[v]}
                </div>
                <div className="text-[10px] text-gray-400">{(mult / 10).toFixed(1)}x</div>
                <div className={`text-[10px] font-medium ${survived ? 'text-green-400' : 'text-gray-600'}`}>
                  {survived ? '생존' : '제거됨'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!hideScore && (
        <div>
          <p className="text-gray-400 text-xs font-medium mb-2">계산 과정</p>
          <div className="space-y-2 text-sm">
            <div className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="text-gray-400 text-xs mb-1">생존 픽 합계</div>
              <div className="text-white">{survivedSummary}</div>
            </div>
            <div className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="text-gray-400 text-xs mb-1">제거된 픽</div>
              <div className="text-white">{removedSummary}</div>
            </div>
            <div className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="text-gray-400 text-xs mb-1">눈치게임 적용</div>
              <div className="text-white">{eyeSummary}</div>
            </div>
            <div className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="text-gray-400 text-xs mb-1">특전/추가 보정</div>
              <div className="text-white">{adjustmentSummary}</div>
            </div>
          </div>
        </div>
      )}

      {/* 눈치게임 + 최종 점수 */}
      {!hideScore && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2.5">
            <span className="text-gray-400 text-sm">눈치게임 순서</span>
            <span className="text-white font-bold">
              {eyeOrder > 0 ? `${eyeOrder}번 ${EYE_MULT_LABEL[eyeOrder]}` : '미참여'}
            </span>
          </div>
          <div className="flex items-center justify-between bg-indigo-950 rounded-lg px-4 py-2.5 border border-indigo-800">
            <span className="text-white text-sm font-medium">최종 점수</span>
            <span className="text-white font-bold text-xl">{formatScore(score)}pt</span>
          </div>
        </div>
      )}

      <p className="text-gray-600 text-xs">
        * 배율: 0회→×1.0 / 1회→×1.5 / 2회→×2.0 / 3회→×2.5 / 4+회→×3.0
      </p>
    </div>
  )
}
