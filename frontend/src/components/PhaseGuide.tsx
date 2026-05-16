'use client'

interface Props {
  state: number
  hasCommitted: boolean
  hasRevealed: boolean
  hasEyeRevealed?: boolean
}

// 0=OPEN, 1=LOCKED, 2=EYE_OPEN, 3=EYE_LOCKED, 4=SETTLED
const PHASES = [
  {
    title: 'Commit Phase',
    desc: '다른 플레이어가 볼 수 없도록 hex 값 4개를 골라 암호화 제출합니다.',
    tip: '전략: 남들과 겹치지 않는 희귀 값을 고르세요. 소수자 게임 — 겹친 픽은 점수에서 제외됩니다.',
    tipColor: 'border-green-700 text-green-400',
  },
  {
    title: 'Reveal Phase',
    desc: '블록 해시가 확정되었습니다. 원본 선택값을 제출하면 소수자 게임 결과가 계산됩니다.',
    tip: '이 단계가 끝나면 눈치게임이 시작됩니다.',
    tipColor: 'border-yellow-700 text-yellow-400',
  },
  {
    title: 'Eye Game — Commit',
    desc: '눈치게임: 순서 1·2·3 중 하나를 선택해 비공개로 커밋합니다.',
    tip: '혼자만 고른 번호면 배율이 적용됩니다. 1번: ×2.0 / 2번: ×1.5 / 3번: ×1.2',
    tipColor: 'border-blue-700 text-blue-400',
  },
  {
    title: 'Eye Game — Reveal',
    desc: '커밋한 순서를 공개합니다. 중복 시 낮은 배율 픽부터 포기합니다.',
    tip: '눈치게임에 참여하지 않아도 소수자 게임 점수(×1.0)는 유지됩니다.',
    tipColor: 'border-orange-700 text-orange-400',
  },
  {
    title: 'Round Complete',
    desc: '모든 순서가 공개되고 최종 점수와 순위가 확정되었습니다.',
    tip: '',
    tipColor: '',
  },
]

const STEPS = ['Commit', 'Reveal', 'Seq Commit', 'Seq Reveal', 'Settled']

// 현재 단계 인덱스를 STEPS 기준으로 매핑 (state === step index)
export function PhaseGuide({ state, hasCommitted, hasRevealed, hasEyeRevealed }: Props) {
  const info = PHASES[state] ?? PHASES[4]

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3">
      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-0.5">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-0.5 flex-1">
            <div className="flex flex-col items-center gap-0.5 flex-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${i < state ? 'bg-gray-600 text-gray-400'
                    : i === state ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-600'}`}
              >
                {i < state ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] text-center ${i === state ? 'text-white' : 'text-gray-600'}`}>
                {label}
              </span>
            </div>
            {i < 4 && (
              <div className={`h-px flex-1 mb-4 ${i < state ? 'bg-gray-600' : 'bg-gray-800'}`} />
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              state === 0 ? 'bg-green-400 animate-pulse'
              : state === 1 ? 'bg-yellow-400 animate-pulse'
              : state === 2 ? 'bg-blue-400 animate-pulse'
              : state === 3 ? 'bg-orange-400 animate-pulse'
              : 'bg-gray-500'
            }`}
          />
          <h3 className="text-white text-sm font-medium">{info.title}</h3>
        </div>
        <p className="text-gray-400 text-xs mt-1 ml-3.5">{info.desc}</p>
        {info.tip && (
          <p className={`text-xs mt-2 ml-3.5 pl-2 border-l-2 ${info.tipColor}`}>{info.tip}</p>
        )}
      </div>

      {/* 내 진행 상태 */}
      <div className="flex gap-3 text-xs ml-3.5 flex-wrap">
        <span className={hasCommitted ? 'text-green-400' : 'text-gray-600'}>
          {hasCommitted ? '✓ Committed' : '○ Not committed'}
        </span>
        {state >= 1 && (
          <span className={hasRevealed ? 'text-green-400' : 'text-gray-600'}>
            {hasRevealed ? '✓ Revealed' : '○ Not revealed'}
          </span>
        )}
        {state >= 3 && (
          <span className={hasEyeRevealed ? 'text-green-400' : 'text-gray-600'}>
            {hasEyeRevealed ? '✓ Seq Revealed' : '○ Seq not revealed'}
          </span>
        )}
      </div>
    </div>
  )
}
