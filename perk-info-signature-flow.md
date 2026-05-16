# Perk Info Signature Flow

## 목적

- 픽 리빌 이후 `눈치게임 커밋 전` 구간에만 유효한 정보 특전을 안전하게 열람한다.
- 일반 세션/쿠키만으로 열람하지 않고, `지갑 서명`으로 권한을 검증한다.
- 캐주얼 게임 수준에서 충분히 강한 접근 제어를 제공한다.

## 적용 대상

- `C2`
- `C3`
- 필요 시 다른 개인 정보형 특전

## 기본 플로우

1. 프론트가 서버에 `nonce`를 요청한다.
2. 서버는 만료 시간이 짧은 `nonce`와 서명 메시지를 반환한다.
3. 유저가 지갑으로 메시지에 서명한다.
4. 프론트가 `address + roundId + infoType + nonce + signature`를 서버에 전송한다.
5. 서버가 서명을 검증한다.
6. 서버가 참가자 여부, 페이즈, 특전 보유 여부를 확인한다.
7. 조건이 맞으면 해당 유저에게 허용된 정보만 반환한다.

## 서명 메시지 예시

```text
HexChain info access
address: 0x1234...
roundId: 12
infoType: c2
nonce: 4b9d1a...
expiresAt: 2026-03-29T16:10:00Z
```

## 프론트 예시

```ts
import { useSignMessage } from 'wagmi'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!

export async function fetchPerkInfoWithSignature({
  address,
  roundId,
  infoType,
  signMessageAsync,
}: {
  address: `0x${string}`
  roundId: bigint
  infoType: 'c1' | 'c2' | 'c3'
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>
}) {
  const nonceRes = await fetch(`${BACKEND_URL}/info-access/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      roundId: roundId.toString(),
      infoType,
    }),
  })

  if (!nonceRes.ok) throw new Error('Failed to get nonce')

  const noncePayload = await nonceRes.json() as {
    nonce: string
    expiresAt: string
    message: string
  }

  const signature = await signMessageAsync({
    message: noncePayload.message,
  })

  const revealRes = await fetch(`${BACKEND_URL}/info-access/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      roundId: roundId.toString(),
      infoType,
      nonce: noncePayload.nonce,
      signature,
    }),
  })

  if (!revealRes.ok) {
    const text = await revealRes.text()
    throw new Error(text || 'Failed to fetch perk info')
  }

  return revealRes.json()
}
```

컴포넌트 예시:

```ts
const { signMessageAsync } = useSignMessage()

const handleOpenC2 = async () => {
  const result = await fetchPerkInfoWithSignature({
    address,
    roundId,
    infoType: 'c2',
    signMessageAsync,
  })

  console.log(result.data)
}
```

## API 예시

### 1. Nonce 요청

`POST /info-access/nonce`

```json
{
  "address": "0xabc...",
  "roundId": "12",
  "infoType": "c2"
}
```

응답:

```json
{
  "nonce": "8f4c1d...",
  "expiresAt": "2026-03-29T16:10:00Z",
  "message": "HexChain info access\naddress: 0xabc...\nroundId: 12\ninfoType: c2\nnonce: 8f4c1d...\nexpiresAt: 2026-03-29T16:10:00Z"
}
```

### 2. 정보 열람 요청

`POST /info-access/reveal`

```json
{
  "address": "0xabc...",
  "roundId": "12",
  "infoType": "c2",
  "nonce": "8f4c1d...",
  "signature": "0x..."
}
```

응답 예시:

```json
{
  "ok": true,
  "data": {
    "target": "0xdef...",
    "survivingCount": 2
  }
}
```

## 백엔드 예시

```ts
import express from 'express'
import crypto from 'crypto'
import { recoverMessageAddress } from 'viem'

const app = express()
app.use(express.json())

const nonces = new Map<string, {
  address: string
  roundId: string
  infoType: string
  expiresAt: number
  used: boolean
}>()

function buildMessage(params: {
  address: string
  roundId: string
  infoType: string
  nonce: string
  expiresAt: string
}) {
  return [
    'HexChain info access',
    `address: ${params.address}`,
    `roundId: ${params.roundId}`,
    `infoType: ${params.infoType}`,
    `nonce: ${params.nonce}`,
    `expiresAt: ${params.expiresAt}`,
  ].join('\n')
}

app.post('/info-access/nonce', async (req, res) => {
  const { address, roundId, infoType } = req.body as {
    address?: string
    roundId?: string
    infoType?: string
  }

  if (!address || !roundId || !infoType) {
    return res.status(400).send('invalid request')
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  const expiresAtMs = Date.now() + 1000 * 60 * 3
  const expiresAt = new Date(expiresAtMs).toISOString()

  nonces.set(nonce, {
    address: address.toLowerCase(),
    roundId,
    infoType,
    expiresAt: expiresAtMs,
    used: false,
  })

  return res.json({
    nonce,
    expiresAt,
    message: buildMessage({ address, roundId, infoType, nonce, expiresAt }),
  })
})

app.post('/info-access/reveal', async (req, res) => {
  const { address, roundId, infoType, nonce, signature } = req.body as {
    address?: string
    roundId?: string
    infoType?: string
    nonce?: string
    signature?: `0x${string}`
  }

  if (!address || !roundId || !infoType || !nonce || !signature) {
    return res.status(400).send('invalid request')
  }

  const nonceRow = nonces.get(nonce)
  if (!nonceRow) return res.status(401).send('invalid nonce')
  if (nonceRow.used) return res.status(401).send('nonce already used')
  if (Date.now() > nonceRow.expiresAt) return res.status(401).send('nonce expired')

  if (
    nonceRow.address !== address.toLowerCase() ||
    nonceRow.roundId !== roundId ||
    nonceRow.infoType !== infoType
  ) {
    return res.status(401).send('nonce mismatch')
  }

  const message = buildMessage({
    address,
    roundId,
    infoType,
    nonce,
    expiresAt: new Date(nonceRow.expiresAt).toISOString(),
  })

  const recovered = await recoverMessageAddress({
    message,
    signature,
  })

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return res.status(401).send('bad signature')
  }

  nonceRow.used = true

  // 추가 검증:
  // 1. 이 주소가 해당 round 참가자인지
  // 2. 현재 페이즈가 정보 열람 가능한 구간인지
  // 3. 이 주소가 해당 infoType 특전을 실제로 보유 중인지

  const allowed = true
  if (!allowed) return res.status(403).send('not allowed')

  if (infoType === 'c2') {
    return res.json({
      ok: true,
      data: {
        target: '0xTarget...',
        survivingCount: 2,
      },
    })
  }

  if (infoType === 'c3') {
    return res.json({
      ok: true,
      data: {
        target: '0xTarget...',
        oneSurvivingPick: 'a',
      },
    })
  }

  return res.json({
    ok: true,
    data: {
      overlap: ['3', '7', 'f'],
    },
  })
})

app.listen(3001)
```

## 서버 검증 체크리스트

- nonce가 존재하는지
- nonce가 1회용인지
- nonce가 만료되지 않았는지
- 서명 주소와 요청 주소가 일치하는지
- 해당 주소가 실제 라운드 참가자인지
- 현재 페이즈가 `픽 리빌 후 ~ 눈치게임 커밋 전`인지
- 해당 주소가 해당 특전을 실제로 보유 중인지
- 대상 선택 규칙이 있으면 그것도 검증하는지

## 보안 메모

- 이 구조는 `열람 권한 인증`이다.
- 개인키로 직접 복호화하는 구조는 아니다.
- 캐주얼 게임 기준으로는 현실적이고 충분히 강한 편이다.
- 평문 정보는 장기 저장보다 짧은 TTL 캐시 또는 메모리 보관이 낫다.
- `localStorage` 같은 영구 저장소에 민감한 정보를 오래 남기지 않는 편이 좋다.
