# HexChain ZK 전환 계획 (Circom/Groth16/snarkjs)

## 배경

Noir/UltraPlonk 방식의 Solidity verifier 2개가 합산 ~28KB → EVM 24KB 제한 초과.
Groth16 verifier는 ~8KB로 여유 있음.

## 최종 구조

| 항목 | 변경 전 (Noir) | 변경 후 |
|------|----------------|---------|
| reveal 회로 | Noir UltraPlonk | Circom Groth16 |
| eye_reveal 회로 | Noir UltraPlonk | **ZK 제거** (keeper plain reveal) |
| 커밋 해시 | poseidon2 (Noir) | poseidon (circomlib 호환) |
| eye 커밋 해시 | keccak256 | keccak256 (변경 없음) |
| Verifier 컨트랙트 | 2개 (~28KB) | 1개 (~8KB) |

## 유저 트랜잭션 (2개)

```
유저: commit(roundId, poseidon(choices, salt))   ← tx 1
유저: eyeCommit(roundId, keccak256(order, salt)) ← tx 2

유저→Keeper API: POST /eye-reveal { roundId, order, salt }  ← off-chain (가스 없음)
```

Keeper가 처리:
- `lockRound()`
- `revealFor(roundId, player, proof, pubSignals)` — ZK 검증 후 pickedMask 저장
- `openEyeGame()`
- `lockEyeRound()`
- `eyeRevealFor(roundId, player, order, salt)` — 유저에게 받은 값으로 대리 공개
- `settle()`

---

## STEP 1 — 환경 설정

```bash
# circom 설치 (rust 필요)
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
git clone https://github.com/iden3/circom.git
cd circom && cargo build --release && cargo install --path circom

# snarkjs 설치
npm install -g snarkjs

# circomlib (회로 라이브러리)
cd circuits/reveal
npm init -y
npm install circomlib
```

---

## STEP 2 — Circom 회로 작성

**파일:** `circuits/reveal/reveal.circom`

```circom
pragma circom 2.0.0;
include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// private: choices[4], salt
// public:  commitHash, pickedMask
template Reveal() {
    signal input choices[4];   // private: 0~15
    signal input salt;         // private
    signal input commitHash;   // public: poseidon(choices[0..3], salt)
    signal input pickedMask;   // public: 비트마스크

    // 1. poseidon 해시 검증
    component hasher = Poseidon(5);
    for (var i = 0; i < 4; i++) { hasher.inputs[i] <== choices[i]; }
    hasher.inputs[4] <== salt;
    hasher.out === commitHash;

    // 2. choices 범위 검증 (0~15 → 4비트)
    component n2b[4];
    for (var i = 0; i < 4; i++) {
        n2b[i] = Num2Bits(4);
        n2b[i].in <== choices[i];
    }

    // 3. 중복 없음 + pickedMask 검증
    //    각 choice가 서로 다른 비트를 set 하는지 확인
    //    (상세 구현은 아래 참고)
}
component main { public [commitHash, pickedMask] } = Reveal();
```

> 중복 검증: `choices[i] != choices[j]` (i != j) → 각 쌍에 대해 차이가 0이 아님을 IsZero로 검증
> pickedMask 검증: `(1 << choices[i])` 각각을 합산 == pickedMask (비트 OR)

**circomlib Poseidon과 프론트 poseidon-lite 호환성:**
둘 다 BN128 필드 위 동일 Poseidon 스펙 → 해시값 일치 확인 필요 (STEP 7에서 단위 테스트)

---

## STEP 3 — Trusted Setup

```bash
cd circuits/reveal

# Phase 1: Powers of Tau (범용, 회로 독립적)
# 제약 수 추정: ~1000개 → pot12 (2^12 = 4096) 충분
snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="hexchain-local" -e="random entropy"
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v

# Phase 2: 회로별 setup
snarkjs groth16 setup reveal.r1cs pot12_final.ptau reveal_0000.zkey
snarkjs zkey contribute reveal_0000.zkey reveal_0001.zkey --name="hexchain-local" -e="random entropy"
snarkjs zkey export verificationkey reveal_0001.zkey verification_key.json

# 검증
snarkjs zkey verify reveal.r1cs pot12_final.ptau reveal_0001.zkey
```

> 로컬/테스트넷용 단일 contributor로 충분
> 메인넷 배포 시 다자간 ceremony (hermez 등) 필요

**생성 파일:**
```
circuits/reveal/
  reveal.r1cs          — 회로 제약
  reveal_js/
    reveal.wasm        — witness 생성용 (keeper + 단위 테스트용)
  reveal_0001.zkey     — proving key (keeper 전용)
  verification_key.json
```

---

## STEP 4 — Solidity Verifier 생성

```bash
snarkjs zkey export solidityverifier reveal_0001.zkey contracts/RevealVerifier.sol
```

**예상 크기:** ~8KB
**인터페이스:**
```solidity
function verifyProof(
    uint[2] calldata _pA,
    uint[2][2] calldata _pB,
    uint[2] calldata _pC,
    uint[2] calldata _pubSignals   // [commitHash, pickedMask]
) public view returns (bool)
```

---

## STEP 5 — HexChain.sol 수정

### 5-1. import 추가
```solidity
import "./RevealVerifier.sol";
```

### 5-2. 상태 변수 추가
```solidity
RevealVerifier public immutable revealVerifier;

constructor(address _revealVerifier) {
    operator = msg.sender;
    revealVerifier = RevealVerifier(_revealVerifier);
}
```

### 5-3. revealFor() 수정 — ZK proof 검증 추가
```solidity
function revealFor(
    uint256 roundId,
    address player,
    uint[2] calldata pA,
    uint[2][2] calldata pB,
    uint[2] calldata pC,
    uint[2] calldata pubSignals   // [commitHash, pickedMask]
) external {
    if (msg.sender != operator) revert NotOperator();
    // ... 기존 상태 검증 ...

    // ZK proof 검증
    require(
        revealVerifier.verifyProof(pA, pB, pC, pubSignals),
        "Invalid proof"
    );

    // commitHash 일치 검증
    require(pubSignals[0] == cm.commitHash, "CommitHash mismatch");

    uint16 pickedMask = uint16(pubSignals[1]);
    cm.pickedMask = pickedMask;
    cm.revealed   = true;
    emit Revealed(roundId, player);
}
```

### 5-4. eyeRevealFor() 추가 — operator 전용
```solidity
function eyeRevealFor(
    uint256 roundId,
    address player,
    uint8   order,
    bytes32 salt
) external {
    if (msg.sender != operator) revert NotOperator();

    Round      storage r  = rounds[roundId];
    Commitment storage cm = commitments[roundId][player];

    if (r.state != RoundState.EYE_LOCKED)                    revert RoundNotEyeLocked();
    if (block.number > r.eyeRevealBlock + EYE_REVEAL_WINDOW) revert EyeRevealWindowClosed();
    if (cm.eyeCommitHash == bytes32(0))                       revert NotCommitted();
    if (cm.eyeRevealed)                                       revert AlreadyEyeRevealed();
    if (order == 0 || order > 3)                              revert InvalidEyeOrder();
    if (keccak256(abi.encodePacked(order, salt)) != cm.eyeCommitHash) revert InvalidEyeReveal();

    cm.eyeOrder    = order;
    cm.eyeRevealed = true;
    emit EyeRevealed(roundId, player, order);
}
```

### 5-5. eyeReveal() — 유지 (유저 자가 공개 옵션)
변경 없음. 유저가 직접 공개하고 싶을 경우 대비.

### 5-6. commit() — 유지
commitHash 타입 `uint256` 유지 (poseidon 결과값).

---

## STEP 6 — Backend (Keeper) 수정

### 6-1. 패키지 추가
```bash
cd backend
npm install snarkjs
```

### 6-2. 파일 구조
```
backend/
  zk/
    reveal.wasm          ← circuits/reveal/reveal_js/ 에서 복사
    reveal_0001.zkey     ← circuits/reveal/ 에서 복사
  src/
    zk.service.ts        ← proof 생성 서비스
    chain.service.ts     ← 기존 (revealFor 시그니처 수정)
    eye-reveal.route.ts  ← 유저 order+salt 수신 API
```

### 6-3. zk.service.ts
```typescript
import * as snarkjs from 'snarkjs'
import path from 'path'

const WASM_PATH = path.join(__dirname, '../zk/reveal.wasm')
const ZKEY_PATH = path.join(__dirname, '../zk/reveal_0001.zkey')

export async function generateRevealProof(
  choices: number[],
  salt: bigint,
  commitHash: bigint,
  pickedMask: number,
): Promise<{
  pA: [bigint, bigint]
  pB: [[bigint, bigint], [bigint, bigint]]
  pC: [bigint, bigint]
  pubSignals: [bigint, bigint]
}> {
  const input = {
    choices: choices.map(String),
    salt: salt.toString(),
    commitHash: commitHash.toString(),
    pickedMask: pickedMask.toString(),
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input, WASM_PATH, ZKEY_PATH
  )

  return {
    pA:         [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    pB:         [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
                 [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]],
    pC:         [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    pubSignals: [BigInt(publicSignals[0]), BigInt(publicSignals[1])],
  }
}
```

> pB 좌표 순서(x[1], x[0]) 주의 — snarkjs calldata 변환 방식과 동일하게 맞춤

### 6-4. eye-reveal.route.ts — 유저 order+salt 수신
```typescript
// POST /api/eye-reveal
// body: { roundId, player, order, salt }
// → DB에 저장, EYE_LOCKED 상태 되면 eyeRevealFor() 호출
```

### 6-5. chain.service.ts — revealFor 시그니처 수정
```typescript
async revealFor(
  roundId: bigint,
  player: string,
  proof: { pA, pB, pC, pubSignals }
): Promise<void> {
  await hexChain.write.revealFor([
    roundId, player,
    proof.pA, proof.pB, proof.pC, proof.pubSignals
  ])
}
```

---

## STEP 7 — Frontend 수정

### 변경 사항 요약
| 파일 | 변경 내용 |
|------|-----------|
| `lib/poseidon.ts` | 유지 (buildCommitHash 그대로 사용) |
| `lib/prover.ts` | **삭제** |
| `CommitForm.tsx` | 유지 |
| `EyeCommitForm.tsx` | 유지 |
| `EyeRevealForm.tsx` | on-chain tx → keeper API 호출로 교체 |
| `RevealForm.tsx` | **삭제** (keeper가 처리) |
| `GameActions.tsx` | RevealForm 제거, EyeRevealForm 동작 변경 |

### EyeRevealForm 변경
```
기존: eyeReveal(roundId, order, salt) 트랜잭션 전송
변경: POST /api/eye-reveal { roundId, order, salt } 호출
      → "순서가 Keeper에 전달되었습니다" 표시
      → EYE_LOCKED 이후 keeper가 자동으로 eyeRevealFor() 호출
```

---

## STEP 8 — 배포 스크립트 수정

```solidity
// script/Deploy.s.sol
RevealVerifier verifier = new RevealVerifier();
HexChain hexchain = new HexChain(address(verifier));
```

---

## STEP 9 — 테스트

### 9-1. 회로 단위 테스트
```bash
cd circuits/reveal

# 컴파일
circom reveal.circom --r1cs --wasm --sym -o .

# 테스트 witness 생성
cat > input.json << 'EOF'
{
  "choices": ["3", "7", "11", "15"],
  "salt": "12345678",
  "commitHash": "<poseidon 계산값>",
  "pickedMask": "36872"
}
EOF

node reveal_js/generate_witness.js reveal_js/reveal.wasm input.json witness.wtns
snarkjs groth16 prove reveal_0001.zkey witness.wtns proof.json public.json
snarkjs groth16 verify verification_key.json public.json proof.json

# poseidon 해시값 일치 확인 (circomlib vs poseidon-lite)
node -e "
  const { buildPoseidon } = require('circomlibjs');
  buildPoseidon().then(p => {
    const h = p([3, 7, 11, 15, 12345678n]);
    console.log('circomlib:', p.F.toString(h));
  });
"
```

### 9-2. Forge 테스트
```bash
# RevealVerifier 단위 테스트
forge test --match-contract RevealVerifierTest -vvv

# HexChain 통합 테스트
forge test --match-contract HexChainTest -vvv
```

### 9-3. E2E 흐름
```
1. createRound()                          [keeper]
2. commit(roundId, poseidon(choices,salt)) [user×3]
3. lockRound()                            [keeper]
4. revealFor(player, proof, pubSignals)   [keeper×3] ← ZK proof
5. openEyeGame()                          [keeper]
6. eyeCommit(roundId, keccak(order,salt)) [user×3]
7. lockEyeRound()                         [keeper]
8. POST /api/eye-reveal {order, salt}     [user×3] ← API, 가스 없음
9. eyeRevealFor(player, order, salt)      [keeper×3]
10. settle()                              [keeper]
```

---

## 주의사항

- **zkey 파일 보안**: `reveal_0001.zkey`는 proving key로 proof 생성에 필요. 공개해도 되지만 keeper 서버에서만 사용.
- **ptau 재사용**: 동일 `pot12_final.ptau`로 다른 회로 setup 가능 (제약 수 4096 이하).
- **pB 좌표 순서**: snarkjs proof → Solidity calldata 변환 시 G2 좌표 순서 반전 필요 (위 코드 참고).
- **circomlib poseidon vs poseidon-lite 호환성**: 반드시 STEP 9-1에서 해시값 일치 확인 후 진행.
