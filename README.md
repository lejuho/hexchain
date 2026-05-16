# HexChain

HexChain은 **소수자 게임**과 **눈치게임**을 결합한 온체인 전략 게임입니다.  
플레이어는 0x0~0xf 중 4개를 고르지만, 라운드 중에는 그 선택을 숨깁니다. 대신 나중에 **영지식 증명(ZK proof)** 으로 “처음 커밋한 선택과 같은 선택을 공개했다”는 사실만 증명합니다.

핵심 아이디어는 단순합니다.

> **전략은 비공개로 남기고, 정산은 검증 가능하게 만든다.**

## 게임은 어떻게 진행되나

한 라운드는 크게 두 층으로 움직입니다.

```text
1. Minority game
   4개의 hex 값을 비공개로 고른다
   → 남들과 겹친 값은 탈락

2. Eye game
   공개 순서 1 / 2 / 3 중 하나를 다시 비공개로 고른다
   → 혼자 고른 순서면 더 높은 배율을 얻는다
```

전체 페이즈는 다음과 같습니다.

```text
OPEN
  ↓
LOCKED
  ↓
EYE_OPEN
  ↓
EYE_LOCKED
  ↓
SETTLED
```

조금 더 사람 말로 풀면:

1. 플레이어가 4개의 hex 값을 고르고 `commit` 합니다.
2. 라운드가 잠기면 각 플레이어는 자신이 처음 고른 값과 같은 값을 들고 있다는 **ZK proof** 를 생성해 `revealFor`로 제출합니다.
3. 컨트랙트는 각 플레이어가 고른 값의 집합만 받아 겹친 픽을 제거합니다.
4. 이후 플레이어는 눈치게임에서 공개 순서 `1 / 2 / 3` 중 하나를 다시 비공개로 커밋합니다.
5. 선택한 순서는 keeper에게 서명으로 전달되고, keeper가 대신 공개합니다.
6. 최종 점수와 순위가 온체인에서 확정됩니다.

## ZK는 어디에 들어가나

HexChain의 ZK는 **첫 번째 선택 공개 단계** 에만 들어갑니다.

플레이어가 처음 커밋할 때는:

```text
commitHash = Poseidon(choices[4], salt)
```

라운드가 잠긴 뒤 브라우저는 로컬에서 Groth16 proof를 만듭니다.

```text
private input
  - choices[4]
  - salt

public output
  - commitHash
  - pickedMask
```

이 proof는 다음을 보장합니다.

- 지금 제출한 선택이 처음 커밋한 해시와 일치한다
- 각 선택은 유효한 4-bit hex 값이다
- 공개되는 `pickedMask`가 실제 선택 집합과 일치한다

즉, 체인은 **어떤 4개를 골랐는지 직접 받지 않고도**  
그 선택 집합이 처음 커밋과 일치한다는 사실을 검증할 수 있습니다.

```text
브라우저
  choices + salt
      │
      ├─ Poseidon hash → commitHash
      └─ Groth16 proof 생성
              │
              ▼
컨트랙트
  verifyProof(...)
  commitHash 일치 확인
  pickedMask만 저장
```

### 왜 눈치게임에는 ZK를 쓰지 않나

눈치게임의 `order`는 두 번째 미니게임의 선택값입니다.  
여기서는 ZK 대신:

```text
eyeCommitHash = keccak256(order, salt)
```

로 커밋하고, 이후 사용자가 keeper에게 `order + salt`를 서명해서 전달합니다.  
keeper가 `eyeRevealFor()`를 대신 호출하므로 사용자는 마지막 공개 단계에서 별도 가스를 내지 않아도 됩니다.

이 설계는:

- 첫 번째 게임의 전략 은닉은 강하게 유지하고
- 두 번째 게임은 UX와 컨트랙트 크기를 더 가볍게 유지하는

현실적인 절충입니다.

## 사용자 경험

플레이어가 체감하는 흐름은 이렇게 설계되어 있습니다.

### 1. 로비

- 빠른 매칭 또는 비공개 방으로 입장
- 방이 없으면 keeper가 새 라운드를 자동 생성

### 2. 첫 번째 선택

- 배율 보드를 보고 hex 4개를 고름
- 특전을 장착할 수 있음
- `커밋하기` 한 번으로 선택을 봉인

### 3. Reveal

- 라운드가 잠기면 브라우저가 자동으로 ZK proof를 생성
- 화면에 proof 진행률이 표시됨
- 사용자는 `공개하기`만 누르면 됨

### 4. 눈치게임

- 상대의 상황을 완전히 알 수 없는 상태에서 순서 `1 / 2 / 3` 중 하나 선택
- 더 공격적인 순서일수록 높은 보상
- 일부 특전은 정보 공개, 카드 교란, 함정, 타깃 지정 같은 심리전을 추가

### 5. 마지막 공개

- 사용자는 지갑 서명만 하고 keeper에게 순서를 전달
- keeper가 대리 공개하므로 마지막 단계는 가스리스에 가깝게 느껴짐

### 6. 결과

- 컨트랙트가 생존 픽, 눈치게임 성공 여부, 특전 효과를 반영해 점수 정산
- 최종 순위와 점수 breakdown을 화면에서 확인

## 시스템 구성

```text
frontend/
  Next.js UI
  - 픽 선택
  - 브라우저 내 proof 생성
  - 지갑 연결과 게임 UX

backend/
  NestJS keeper
  - 라운드 상태 자동 전환
  - eye reveal 대리 제출
  - 특전 정보 접근 서명 검증

contracts/
  Solidity
  - 라운드 상태 머신
  - Groth16 proof 검증
  - 점수 계산과 정산

circuits/
  Circom + Groth16
  - reveal 회로
  - proving / verification assets
```

## 설계 포인트

- **Client-side ZK**: proof는 브라우저에서 생성됩니다. 선택 원문과 salt는 서버로 보내지지 않습니다.
- **On-chain verifiability**: 컨트랙트는 verifier로 proof를 직접 검증합니다.
- **Keeper-assisted UX**: 상태 전환과 eye reveal 대리 제출을 keeper가 맡아, 사용자의 반복 트랜잭션 부담을 줄입니다.
- **Information asymmetry**: 일부 특전은 정보 접근을 열어주되, 지갑 서명과 페이즈 검증으로 제한합니다.
- **Hybrid privacy model**: 모든 것을 숨기기보다, 게임성에 필요한 곳만 정확히 숨깁니다.

## 실행 모드

프로젝트는 크게 두 방식으로 실행합니다.

### 1. Anvil 로컬 모드

로컬 체인까지 한 번에 띄우는 개발 모드입니다.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
./script/dev.sh
```

이 스크립트는 Anvil을 시작하고, 컨트랙트를 새로 배포한 뒤, `backend/.env`와 `frontend/.env.local`의 컨트랙트 주소를 자동으로 갱신합니다.

### 2. Base Sepolia 모드

이미 배포된 테스트넷 컨트랙트에 붙는 모드입니다.

```bash
cp backend/.env.base-sepolia.example backend/.env
cp frontend/.env.base-sepolia.example frontend/.env.local
```

그다음:

```bash
# backend/.env
OPERATOR_PRIVATE_KEY=<HexChain operator 지갑 키>
CORS_ORIGIN=<실제 프론트엔드 URL>

# frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=<실제 백엔드 URL>
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<프로젝트 ID>
```

로컬에서 Base Sepolia를 바라보며 띄울 때는:

```bash
cd backend && npm run start:dev
cd frontend && npm run dev
```

Vercel/Render 배포에서는 파일을 복사하지 말고, 같은 값을 각 서비스의 환경변수 UI에 넣는 편이 안전합니다.

`OPERATOR_PRIVATE_KEY`는 백엔드 전용 비밀값입니다. 프론트엔드 env에 두면 안 됩니다.

## 기술 스택

프로젝트는 대략 다음 구성으로 실행됩니다.

```text
Solidity contracts  +  Foundry
Frontend            +  Next.js
Backend             +  NestJS
Circuit             +  Circom / snarkjs
```

환경변수 예시는 아래 파일을 참고하세요.

```text
backend/.env.example
backend/.env.base-sepolia.example
frontend/.env.local.example
frontend/.env.base-sepolia.example
```

---

HexChain은 완전한 익명성보다 **게임으로서의 긴장감과 검증 가능성의 균형**을 겨냥합니다.  
플레이어는 감추고, 체인은 확인하고, keeper는 흐름을 매끄럽게 이어줍니다.
