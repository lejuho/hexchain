import { Header } from '@/components/Header'

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header state={-1} />

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">⬡ HexChain 게임 룰</h2>
          <p className="text-gray-400 text-sm mt-1">
            소수자 게임 × 커밋-리빌 × 눈치게임 — 3층 구조의 온체인 전략 게임
          </p>
        </div>

        {/* 개요 */}
        <Section title="개요">
          <p className="text-gray-300 text-sm leading-relaxed">
            HexChain은 0~F(16개) 중 4개의 hex 값을 고르고, 블록체인의 블록 해시를 기반으로
            점수를 계산하는 온체인 게임입니다. 3명이 한 라운드를 구성하며, 입장료{' '}
            <Code>0.001 ETH</Code>가 상금 풀이 됩니다.
          </p>
        </Section>

        {/* 진행 순서 */}
        <Section title="진행 순서">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 text-xs flex items-center justify-center font-bold text-gray-300">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{s.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* 점수 계산 */}
        <Section title="점수 계산">
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-white mb-1">1단계 — 블록 해시 배율</p>
              <p className="text-gray-400 text-xs leading-relaxed">
                락 시점의 블록 해시 첫 16 nibble에서 각 hex 값의 등장 횟수를 셉니다.
                등장 횟수가 적을수록 희귀한 값이라 배율이 높습니다.
              </p>
              <div className="mt-2 grid grid-cols-5 gap-1 text-xs text-center">
                {[['0회', '×1.0'], ['1회', '×1.5'], ['2회', '×2.0'], ['3회', '×2.5'], ['4+회', '×3.0']].map(([cnt, mult]) => (
                  <div key={cnt} className="bg-gray-800 rounded p-2">
                    <div className="text-gray-400">{cnt}</div>
                    <div className="font-bold text-yellow-400">{mult}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-semibold text-white mb-1">2단계 — 소수자 게임</p>
              <p className="text-gray-400 text-xs leading-relaxed">
                다른 플레이어와 <span className="text-white">겹친 픽은 제거</span>됩니다.
                나 혼자만 고른 픽만 생존합니다.
              </p>
            </div>

            <div>
              <p className="font-semibold text-white mb-1">3단계 — 눈치게임 보정</p>
              <p className="text-gray-400 text-xs leading-relaxed mb-2">
                1·2·3번 중 순서를 골라 커밋합니다. 같은 번호를 고른 인원이 겹치면
                낮은 배율 픽부터 포기합니다 (겹친 인원 − 1개).
                혼자 고른 번호면 눈치 성공 보너스를 받습니다.
              </p>
              <div className="grid grid-cols-3 gap-1 text-xs text-center">
                {[['1번', '×2.0', '+1.0pt'], ['2번', '×1.5', '+0.7pt'], ['3번', '×1.2', '+0.5pt']].map(([ord, mult, base]) => (
                  <div key={ord} className="bg-gray-800 rounded p-2 space-y-0.5">
                    <div className="font-bold text-white">{ord}</div>
                    <div className="text-blue-400">{mult}</div>
                    <div className="text-gray-400">{base}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-semibold text-white mb-1">최종 점수 공식</p>
              <div className="bg-gray-800 rounded-lg p-3 space-y-1 font-mono text-xs">
                <p className="text-green-400">눈치 성공: 픽배율합 × 눈치배수 + 기본점수</p>
                <p className="text-yellow-400">눈치 겹침/미참여: 픽배율합 × 1.0</p>
                <p className="text-gray-400">생존픽 0 + 눈치 성공: 기본점수만 보장</p>
              </div>
            </div>
          </div>
        </Section>

        {/* 동점 처리 */}
        <Section title="동점 처리">
          <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
            <li>생존 픽 수가 많은 플레이어 우선</li>
            <li>독점 픽의 nibble 배율 합이 높은 플레이어 우선</li>
            <li>픽 값 간 최대 거리(분산도)가 큰 플레이어 우선</li>
          </ol>
        </Section>

        {/* 상금 분배 */}
        <Section title="상금 분배">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[['1위', '60%', 'text-yellow-400'], ['2위', '30%', 'text-gray-300'], ['3위', '10%', 'text-orange-400']].map(([rank, share, color]) => (
              <div key={rank} className="bg-gray-800 rounded-lg p-3">
                <div className={`font-bold text-lg ${color}`}>{rank}</div>
                <div className="text-gray-300 font-semibold">{share}</div>
              </div>
            ))}
          </div>
        </Section>


        {/* 보안 */}
        <Section title="커밋-리빌 보안">
          <p className="text-gray-400 text-sm leading-relaxed">
            픽과 눈치 순서 모두 <Code>keccak256(값, salt)</Code> 해시로 먼저 제출합니다.
            공개 전까지 온체인에서 내용을 알 수 없어 다른 플레이어가 전략을 복사할 수 없습니다.
            salt는 브라우저 로컬스토리지에 저장되니 같은 기기에서 리빌하세요.
          </p>
        </Section>
      </main>
    </div>
  )
}

const STEPS = [
  { title: 'Commit — 픽 봉인', desc: '0~F 중 중복 없이 4개를 고르고 salt와 함께 해시로 제출합니다. 입장료 0.001 ETH를 같이 보냅니다.' },
  { title: 'Lock Round (Keeper)', desc: '커밋 윈도우가 끝나면 Keeper가 블록 해시를 확정합니다.' },
  { title: 'Reveal — 픽 공개', desc: '커밋했던 4개 픽과 salt를 공개합니다. 블록 해시와 대조해 검증됩니다.' },
  { title: 'Open Eye Game (Keeper)', desc: 'Keeper가 소수자 계산을 완료하고 눈치게임을 시작합니다.' },
  { title: 'Seq Commit — 순서 봉인', desc: '1·2·3번 중 원하는 순서를 salt와 함께 해시로 제출합니다.' },
  { title: 'Lock Seq Round (Keeper)', desc: '순서 커밋 윈도우가 끝나면 Keeper가 라운드를 잠급니다.' },
  { title: 'Seq Reveal — 순서 공개', desc: '커밋했던 순서와 salt를 공개합니다.' },
  { title: 'Settle (Keeper)', desc: '최종 점수 계산 후 상금이 NFT 소유자에게 자동 분배됩니다.' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 rounded-xl p-5 border border-gray-800 space-y-3">
      <h3 className="font-bold text-white text-base border-b border-gray-800 pb-2">{title}</h3>
      {children}
    </section>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-800 text-yellow-300 text-xs px-1.5 py-0.5 rounded">{children}</code>
  )
}
