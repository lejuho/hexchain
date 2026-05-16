#!/usr/bin/env bash
# E2E 전체 게임 흐름 테스트 (단일 플레이어, Anvil 로컬)
set -euo pipefail

RPC_URL="http://localhost:8545"
BACKEND_URL="http://localhost:4000"

# Anvil 기본 계정
KEEPER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PLAYER_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
KEEPER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
PLAYER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

CONTRACT="0xe7f1725e7734ce288f8367e1bb143e90bb3f0512"

ok() { echo "  [OK] $*"; }
fail() { echo "  [FAIL] $*"; exit 1; }
step() { echo; echo "==> $*"; }

cast_rpc() { cast rpc "$@" --rpc-url "$RPC_URL" 2>/dev/null; }
mine() { cast_rpc evm_mine > /dev/null; }
mine_n() {
  local n=$1
  for ((i=0;i<n;i++)); do mine; done
}

step "1. createRound"
ROUND_ID=$(cast send "$CONTRACT" "createRound()" \
  --rpc-url "$RPC_URL" --private-key "$KEEPER_KEY" --json 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d['logs'][0]['topics'][1],16))")
ok "roundId = $ROUND_ID"

step "2. commit (player)"
# choices = [1,2,3,4], salt = 0x1234
# poseidon5([1,2,3,4,0x1234]) — 미리 계산된 값 사용
# gen_input.js로 계산
COMMIT_HASH=$(node -e "
const { poseidon5 } = require('/home/user/eth-homework/week-06/dev/my-dapp/frontend/node_modules/poseidon-lite')
const h = poseidon5([1n, 2n, 3n, 4n, 0x1234n])
console.log(h.toString())
")
ok "commitHash = $COMMIT_HASH"

cast send "$CONTRACT" "commit(uint256,uint256)" "$ROUND_ID" "$COMMIT_HASH" \
  --rpc-url "$RPC_URL" --private-key "$PLAYER_KEY" \
  --value "0.001ether" --json 2>/dev/null > /dev/null
ok "commit 완료"

step "3. lockRound (mine 10 blocks)"
mine_n 10
cast send "$CONTRACT" "lockRound(uint256)" "$ROUND_ID" \
  --rpc-url "$RPC_URL" --private-key "$KEEPER_KEY" --json 2>/dev/null > /dev/null
ok "lockRound 완료"

step "4. keeper revealFor (ZK proof 생성 + on-chain)"
# snarkjs로 proof 생성
CHOICES_JSON="[1,2,3,4]"
SALT="0x1234"

PROOF_JSON=$(node -e "
const snarkjs = require('/home/user/eth-homework/week-06/dev/my-dapp/backend/node_modules/snarkjs')
const path = require('path')
const { poseidon5 } = require('/home/user/eth-homework/week-06/dev/my-dapp/frontend/node_modules/poseidon-lite')

async function main() {
  const choices = [1,2,3,4]
  const salt = BigInt('0x1234')
  const commitHash = poseidon5(choices.map(BigInt).concat([salt]))
  const pickedMask = choices.reduce((acc,c) => acc | (1 << c), 0)

  const wasmPath = '/home/user/eth-homework/week-06/dev/my-dapp/backend/zk/reveal.wasm'
  const zkeyPath = '/home/user/eth-homework/week-06/dev/my-dapp/backend/zk/reveal_0001.zkey'

  const input = {
    choices: choices.map(String),
    salt: salt.toString(),
    commitHash: commitHash.toString(),
    pickedMask: pickedMask.toString(),
  }
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath)

  // pB 좌표 스왑 (snarkjs -> Solidity)
  const pA = [proof.pi_a[0], proof.pi_a[1]]
  const pB = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]]
  const pC = [proof.pi_c[0], proof.pi_c[1]]
  const pub = publicSignals

  console.log(JSON.stringify({ pA, pB, pC, pub }))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
" 2>/dev/null)

PA0=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pA'][0])")
PA1=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pA'][1])")
PB00=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pB'][0][0])")
PB01=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pB'][0][1])")
PB10=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pB'][1][0])")
PB11=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pB'][1][1])")
PC0=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pC'][0])")
PC1=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pC'][1])")
PUB0=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pub'][0])")
PUB1=$(echo "$PROOF_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pub'][1])")

ok "proof 생성 완료 — pubSignals[0]=$PUB0"

cast send "$CONTRACT" \
  "revealFor(uint256,address,uint256[2],uint256[2][2],uint256[2],uint256[2])" \
  "$ROUND_ID" "$PLAYER_ADDR" \
  "[$PA0,$PA1]" \
  "[[$PB00,$PB01],[$PB10,$PB11]]" \
  "[$PC0,$PC1]" \
  "[$PUB0,$PUB1]" \
  --rpc-url "$RPC_URL" --private-key "$KEEPER_KEY" --json 2>/dev/null > /dev/null
ok "revealFor 완료 (ZK proof 검증됨)"

step "5. openEyeGame"
mine_n 7  # REVEAL_WINDOW 경과
cast send "$CONTRACT" "openEyeGame(uint256)" "$ROUND_ID" \
  --rpc-url "$RPC_URL" --private-key "$KEEPER_KEY" --json 2>/dev/null > /dev/null
ok "openEyeGame 완료"

step "6. eyeCommit (player) — order=1, salt=0xdeadbeef"
EYE_SALT="0xdeadbeef00000000000000000000000000000000000000000000000000000000"
EYE_ORDER=1
EYE_COMMIT_HASH=$(cast keccak "$(cast abi-encode "f(uint8,bytes32)" "$EYE_ORDER" "$EYE_SALT")")
ok "eyeCommitHash = $EYE_COMMIT_HASH"

cast send "$CONTRACT" "eyeCommit(uint256,bytes32)" "$ROUND_ID" "$EYE_COMMIT_HASH" \
  --rpc-url "$RPC_URL" --private-key "$PLAYER_KEY" --json 2>/dev/null > /dev/null
ok "eyeCommit 완료"

step "7. lockEyeRound"
mine_n 7  # EYE_COMMIT_WINDOW
cast send "$CONTRACT" "lockEyeRound(uint256)" "$ROUND_ID" \
  --rpc-url "$RPC_URL" --private-key "$KEEPER_KEY" --json 2>/dev/null > /dev/null
ok "lockEyeRound 완료"

step "8. POST /eye-reveal to backend API"
# 플레이어 서명 생성
SIGN_MSG="HexChain eye-reveal roundId:${ROUND_ID}"
SIG=$(cast wallet sign --private-key "$PLAYER_KEY" "$SIGN_MSG" 2>/dev/null)
ok "signature = ${SIG:0:20}..."

RESP=$(curl -s -X POST "$BACKEND_URL/eye-reveal" \
  -H "Content-Type: application/json" \
  -d "{\"roundId\":\"$ROUND_ID\",\"order\":$EYE_ORDER,\"salt\":\"$EYE_SALT\",\"signature\":\"$SIG\"}")
ok "backend 응답: $RESP"

step "9. 백엔드 keeper가 eyeRevealFor 처리 대기 (3초)"
sleep 3

step "10. settle"
mine_n 7  # EYE_REVEAL_WINDOW 경과
cast send "$CONTRACT" "settle(uint256)" "$ROUND_ID" \
  --rpc-url "$RPC_URL" --private-key "$KEEPER_KEY" --json 2>/dev/null > /dev/null
ok "settle 완료"

step "11. 최종 라운드 정보 확인"
ROUND_INFO=$(cast call "$CONTRACT" "getRoundInfo(uint256)" "$ROUND_ID" --rpc-url "$RPC_URL" 2>/dev/null)
ok "roundInfo: $ROUND_INFO"

echo
echo "============================================"
echo "  E2E 전체 게임 흐름 테스트 통과!"
echo "  roundId: $ROUND_ID"
echo "============================================"
