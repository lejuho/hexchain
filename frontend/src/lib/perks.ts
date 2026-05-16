export type PerkStrength = 'wk' | 'mid' | 'str'
export type PerkPhase = 'p1' | 'p2' | 'p12' | 'pf'
export type PerkCat = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'

export interface Perk {
  id: string
  cat: PerkCat
  name: string
  str: PerkStrength
  phase: PerkPhase
  isNew: boolean
  isDef: boolean
  desc: string
  effect: string
}

export const CATS: Record<PerkCat, { icon: string; name: string; desc: string }> = {
  a: { icon: '💥', name: '카테고리 A — 겹침 역전형', desc: '기본 룰(겹치면 손해)을 역전합니다.' },
  b: { icon: '👁', name: '카테고리 B — 눈치게임형', desc: '눈치게임 순서 선택과 직결됩니다.' },
  c: { icon: '🔍', name: '카테고리 C — 정보 교란형', desc: '획득→방어→공개→차단→교란 전 사이클을 커버합니다.' },
  d: { icon: '🎲', name: '카테고리 D — 역전/도박형', desc: '불리한 상황을 레버리지로 삼습니다.' },
  e: { icon: '∑', name: '카테고리 E — 규칙 조작형', desc: '수학적 조건을 스스로 부과합니다.' },
  f: { icon: '🪤', name: '카테고리 F — 함정형', desc: '커밋 단계에서 조건을 설정, 자동 발동합니다.' },
  g: { icon: '🌀', name: '카테고리 G — 상태이상형', desc: '기절·처형·저지불가·강탈·복사 등을 게임 문법으로 번역했습니다.' },
}

/** 유효한 perk(null 제외) 중 랜덤 1개 반환 */
export function pickRandomPerk(): Perk {
  const valid = PERKS.filter((p): p is Perk => p !== null)
  return valid[Math.floor(Math.random() * valid.length)]
}

/** string id ('a1' 등) → uint8 perkId (0=없음, 1~N=배열 인덱스+1)
 *  PERKS 배열에 null 플레이스홀더가 있어도 올바른 컨트랙트 ID를 반환합니다. */
export function perkStringToId(stringId: string | null | undefined): number {
  if (!stringId) return 0
  const idx = PERKS.findIndex(p => p !== null && p.id === stringId)
  return idx === -1 ? 0 : idx + 1
}

/** uint8 perkId → Perk 객체 (0, 범위 초과, 삭제된 슬롯이면 null) */
export function perkIdToPerk(perkId: number): Perk | null {
  if (perkId <= 0 || perkId > PERKS.length) return null
  return PERKS[perkId - 1]
}

export function isPerkImplemented(_perkId: string): boolean {
  return true
}

// 배열 인덱스+1 = 컨트랙트 perkId. 삭제된 슬롯은 null로 유지해 ID 정합성 보장.
export const PERKS: (Perk | null)[] = [
  // A 카테고리 (perkId 1~6)
  { id: 'a1', cat: 'a', name: '군중 속으로', str: 'mid', phase: 'p1', isNew: false, isDef: false, desc: '3개 이상 겹치면 겹친 픽 수만큼 +0.5pt 보너스.', effect: '겹침 3개 → +1.5pt\n기본 룰 완전 역전 — 겹침이 이득' },
  { id: 'a2', cat: 'a', name: '정밀 타격', str: 'wk', phase: 'p1', isNew: false, isDef: false, desc: '정확히 1개만 겹쳤을 때 +1.0pt.', effect: '겹침 = 1 → +1.0pt\n겹침 0 또는 2+ → 효과 없음' },
  { id: 'a3', cat: 'a', name: '군중 집중', str: 'mid', phase: 'p1', isNew: true, isDef: false, desc: '내 픽 중 가장 많은 플레이어가 공유한 nibble의 인원 수 × +0.5pt.', effect: '제거된 nibble에 3명 모두 몰림 → +1.5pt' },
  { id: 'a4', cat: 'a', name: '손실 제한', str: 'wk', phase: 'p1', isNew: true, isDef: true, desc: '겹침으로 제거되는 픽 중 최고배율 1개는 배율의 절반을 점수로 보전.', effect: '제거된 최고배율 픽 a(3.0배) → 1.5pt 회수' },
  { id: 'a5', cat: 'a', name: '최저 보장', str: 'wk', phase: 'p1', isNew: true, isDef: true, desc: '생존 픽이 1개 이하일 때 자동 발동. 기본 +1.0pt 추가 보장.', effect: '생존 0~1개 → 자동 발동\n완전히 망해도 최소 1.0pt 보장' },
  { id: 'a6', cat: 'a', name: '역겹침', str: 'mid', phase: 'p1', isNew: true, isDef: false, desc: '나와 겹친 상대의 픽도 추가로 1개 더 제거.', effect: '나와 겹침 발생 시 → 상대 다른 픽 1개 추가 제거' },
  // B 카테고리 (perkId 7~13)
  { id: 'b1', cat: 'b', name: '극단 선택자', str: 'mid', phase: 'p2', isNew: false, isDef: false, desc: '눈치게임 1번 또는 3번 성공 시 배수 +0.3.', effect: '1번 성공 → ×2.0 → ×2.3\n3번 성공 → ×1.2 → ×1.5' },
  { id: 'b2', cat: 'b', name: '고독한 질주', str: 'mid', phase: 'p2', isNew: false, isDef: false, desc: '아무도 선택하지 않은 순서를 골랐을 때 +1.5pt.', effect: '빈 순서 발생 시 보너스 지급' },
  { id: 'b3', cat: 'd', name: '라스트 스탠드', str: 'str', phase: 'p2', isNew: false, isDef: false, desc: '픽 1개만 커밋. 성공 시 배율 ×3.0.', effect: '선언 → 픽 1개만 (공개됨)\n생존 → ×3.0 + 눈치 배수 최대\n겹침 → 0점' },
  { id: 'b4', cat: 'b', name: '선제 희생', str: 'mid', phase: 'p12', isNew: true, isDef: true, desc: '최고배율 픽 강제 포기 → 눈치게임 겹침 완전 면제.', effect: '최고배율 픽 포기 → 이번 눈치게임 겹침 면제' },
  null, // perkId 11: b5 삭제됨
  null, // perkId 12: c10 삭제됨
  null, // perkId 13: b7 삭제됨
  // C 카테고리 (perkId 14~22, c4/c5/c6/c8 삭제)
  { id: 'c1', cat: 'c', name: '겹침 목록 열람', str: 'wk', phase: 'p2', isNew: false, isDef: false, desc: '눈치게임 시작 전 겹친 숫자 목록을 볼 수 있습니다.', effect: '공개: "겹친 숫자: 3, 7, f"\n상대 픽 간접 추론 가능' },
  { id: 'c2', cat: 'c', name: '정보 열람 (중)', str: 'mid', phase: 'p2', isNew: false, isDef: false, desc: '특정 플레이어 1명의 생존 픽 수를 확인합니다.', effect: '"A는 2개 살았다" — 어떤 픽인지는 비공개' },
  { id: 'c3', cat: 'c', name: '핵심 정보 열람', str: 'str', phase: 'p2', isNew: false, isDef: false, desc: '특정 플레이어 1명의 생존 픽 중 1개를 알 수 있습니다.', effect: '"A의 생존 픽 중 하나는 a"' },
  null, // perkId 17: c4 삭제됨
  null, // perkId 18: c5 삭제됨
  null, // perkId 19: c6 삭제됨
  { id: 'c7', cat: 'c', name: '안개전', str: 'mid', phase: 'p1', isNew: true, isDef: false, desc: '전원의 픽 선택 화면에서 배율 수치를 가림. 나도 포함.', effect: '대상: 전체 (나 포함)\nC-1,2,3 정보 특전 간접 무력화' },
  null, // perkId 21: c8 삭제됨
  { id: 'c9', cat: 'c', name: '전장 혼돈', str: 'str', phase: 'p2', isNew: true, isDef: false, desc: '전원의 눈치게임 카드 순서를 섞음. B 계열 특전 전체 카운터.', effect: '대상: 전체 (나 포함)\nB 계열 특전 전부 무력화' },
  // D 카테고리 (perkId 23~26)
  { id: 'd1', cat: 'd', name: '연승 가속', str: 'wk', phase: 'p1', isNew: false, isDef: false, desc: '직전 판 1등이었다면 이번 판 모든 픽 배율 +0.2.', effect: '연승 → 최고 배율 3.0 → 3.2' },
  { id: 'd2', cat: 'd', name: '언더독', str: 'mid', phase: 'p1', isNew: false, isDef: false, desc: '직전 판 꼴찌였다면 이번 판 픽 1개 추가 (5픽).', effect: '직전 꼴찌 → 4픽 → 5픽' },
  { id: 'd3', cat: 'd', name: '올인', str: 'str', phase: 'p1', isNew: false, isDef: false, desc: '생존 픽 0~1개일 때 발동. 숫자 하나 찍어서 해시에 있으면 역전.', effect: '성공 → 해당 배율 ×1.5 추가\n실패 → 기본 0.5pt' },
  { id: 'd4', cat: 'd', name: '기회주의', str: 'mid', phase: 'p2', isNew: true, isDef: false, desc: '다른 플레이어 눈치게임 포기 픽 최고배율 1개를 절반 가져옴.', effect: '타인 포기 픽 최고배율 × 0.5 점수 반영' },
  // E 카테고리 (perkId 27~32, e6 삭제)
  { id: 'e1', cat: 'e', name: '서로소 보너스', str: 'mid', phase: 'p1', isNew: false, isDef: false, desc: '4픽이 모두 서로소이면 생존 픽 전체 배율 +0.4.', effect: '[3,5,7,b] → 서로소 → +0.4' },
  null, // perkId 28: e2 삭제됨
  { id: 'e3', cat: 'e', name: '공백 선점', str: 'mid', phase: 'p1', isNew: false, isDef: false, desc: '해시에 없는 숫자(0회)를 3개 이상 고르면 생존 공백 픽당 배율 +0.5.', effect: '0회 등장 = 기본 1.0배인데 추가 보너스' },
  null, // perkId 30: e4 삭제됨
  null, // perkId 31: e5 삭제됨
  null, // perkId 32: e6 삭제됨
  // F 카테고리 (perkId 33~36, f4 삭제)
  { id: 'f1', cat: 'f', name: '숫자 함정', str: 'mid', phase: 'p1', isNew: true, isDef: false, desc: 'hex 숫자 1개를 함정으로 지정. 상대가 그 숫자를 픽했으면 상대 생존 픽 전체 배율 -0.3.', effect: '조건 일치 → 생존 픽 전체 배율 -0.3\n상대는 함정 존재는 알지만 어떤 숫자인지 모름' },
  { id: 'f2', cat: 'f', name: '구간 함정', str: 'mid', phase: 'p1', isNew: true, isDef: false, desc: '자신의 픽 구간 중 랜덤 1구간이 함정으로 선택됨. 상대가 그 구간에서 2개 이상 픽하면 발동.', effect: '조건 일치 → 상대 해당 구간 픽 전부 제거\n전원 불발 시 자신도 해당 구간 픽 1개 제거' },
  { id: 'f3', cat: 'f', name: '순서 함정', str: 'mid', phase: 'p2', isNew: true, isDef: false, desc: '특정 눈치게임 순서를 함정으로 지정. 상대가 그 순서를 선택하면 발동.', effect: '조건 일치 → 상대 눈치배수 1단계 하향 (×2.0→×1.5, ×1.5→×1.2, ×1.2→×1.0)' },
  null, // perkId 36: f4 삭제됨
  // G 카테고리 (perkId 37~43, g7 삭제)
  { id: 'g1', cat: 'g', name: '기세 차단', str: 'str', phase: 'p2', isNew: true, isDef: false, desc: '상대 1명의 눈치게임 배수를 ×1.0으로 강제 하향. 어떤 순서를 골랐든 무효화.', effect: '1번 순서(×2.0) → ×1.0 강제\n특전 종류와 무관하게 항상 유효' },
  { id: 'g2', cat: 'g', name: '처형', str: 'str', phase: 'p2', isNew: true, isDef: false, desc: '눈치게임 충돌 후 처형 조건: 같은 순서에 상대 1명이면 최종 1픽 이하일 때 처형. 상대 2명이면 1명이 반드시 1픽 이하여야 하며, 나머지 1명은 2픽이어도 연쇄 처형. 성공 시 잃은 픽 배율 50% 보전 + 킬 보너스.', effect: '상대 1명 → 최종 ≤1픽 시 처형\n상대 2명 → 1명이 ≤1픽이면 2픽 상대도 연쇄 처형\n1킬 +0.5pt / 2킬 연쇄 +1.5pt\n내 잃은 픽 배율 합 × 0.5 보전' },
  { id: 'g3', cat: 'g', name: '저지불가', str: 'mid', phase: 'p12', isNew: true, isDef: true, desc: '상대 특전이 나에게 미치는 모든 효과를 무효화. 단, 내 공격적 특전도 발동 불가.', effect: '정보 열람 · 함정 · 봉쇄 전부 차단\n내 공격 특전도 동시에 봉인' },
  { id: 'g4', cat: 'g', name: '강제 교환', str: 'mid', phase: 'p2', isNew: true, isDef: false, desc: '상대 생존 픽 1개와 내 픽 1개를 강제 교환.', effect: '상대 고배율 픽과 내 저배율 픽 교환' },
  null, // perkId 41: g5 삭제됨
  { id: 'g6', cat: 'g', name: '편승', str: 'mid', phase: 'p2', isNew: true, isDef: false, desc: '내가 눈치게임에 단독 성공하면, 내 배수 대신 상대 1명의 배수를 사용. 상대가 G3이면 무효.', effect: '내 3번(×1.2) 단독 성공 + 상대 1번(×2.0) → 내 배수 ×2.0으로 교체\n내 성공 여부는 내 순서 기준, 배수만 교체' },
  null, // perkId 43: g7 삭제됨
  // B 카테고리 추가 (perkId 44)
  { id: 'b8', cat: 'b', name: '집중 도박', str: 'str', phase: 'p2', isNew: true, isDef: false, desc: '픽 2개만 유효. 1번 순서 단독 성공 시 배수 ×3.5. G1 차단·F3 함정에 취약.', effect: '4픽 커밋해도 상위 2픽만 스코어\n1번 단독 성공 → ×3.5\nG1 기세 차단 → ×1.0 강제' },
  // D 카테고리 추가 (perkId 45)
  { id: 'd5', cat: 'd', name: '데스페라도', str: 'str', phase: 'p1', isNew: true, isDef: false, desc: '4픽 커밋 후 상위 2픽만 유지. nibble·눈치 겹침 완전 면제. 대신 적중 수에 따라 보너스/페널티.', effect: '0명 적중 → 내 2픽 역제거 (score=0)\n1명 1발 → 겹친 배율 × 0.5 추가\n2명 각 1발 → 겹친 배율 합 × 0.5 추가\n1명 2발 집중 → 상대 4픽 전부 제거 + 겹친 배율 합 × 1.0 추가' },
]
