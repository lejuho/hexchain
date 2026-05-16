#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Base Sepolia 배포 예시:
#   RPC_URL=https://sepolia.base.org PRIVATE_KEY=0x... ./script/deploy_anvil.sh
RPC_URL="${RPC_URL:-http://localhost:8545}"
PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

echo "==> Building contracts" >&2
forge build --quiet >&2

# 로그는 모두 stderr — stdout에는 주소만
deploy_no_args() {
  local label="$1"
  local contract="$2"

  echo "==> Deploying ${label}" >&2
  local bytecode
  bytecode="$(forge inspect "${contract}" bytecode 2>/dev/null)"

  local receipt
  if ! receipt="$(cast send \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --create "$bytecode" \
    --json 2>/tmp/cast_err)"; then
    echo "  ERROR: cast send failed for ${label}" >&2
    cat /tmp/cast_err >&2
    exit 1
  fi

  local address
  address="$(printf '%s' "$receipt" | python3 -c "import sys,json; print(json.load(sys.stdin)['contractAddress'])")"
  echo "  Deployed: ${address}" >&2
  echo "$address"
}

deploy_with_args() {
  local label="$1"
  local contract="$2"
  local constructor_sig="$3"
  shift 3

  echo "==> Deploying ${label}" >&2
  local bytecode
  bytecode="$(forge inspect "${contract}" bytecode 2>/dev/null)"

  local encoded_args
  encoded_args="$(cast abi-encode "${constructor_sig}" "$@" 2>/dev/null | sed 's/^0x//')"

  local receipt
  if ! receipt="$(cast send \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --create "${bytecode}${encoded_args}" \
    --json 2>/tmp/cast_err)"; then
    echo "  ERROR: cast send failed for ${label}" >&2
    cat /tmp/cast_err >&2
    exit 1
  fi

  local address
  address="$(printf '%s' "$receipt" | python3 -c "import sys,json; print(json.load(sys.stdin)['contractAddress'])")"
  echo "  Deployed: ${address}" >&2
  echo "$address"
}

# ── 1. RevealVerifier ─────────────────────────────────────────────────────────
VERIFIER_ADDRESS="$(deploy_no_args \
  "RevealVerifier" \
  "contracts/RevealVerifier.sol:Groth16Verifier")"

# ── 2. HexChain ───────────────────────────────────────────────────────────────
HEXCHAIN_ADDRESS="$(deploy_with_args \
  "HexChain" \
  "contracts/HexChain.sol:HexChain" \
  "constructor(address)" \
  "$VERIFIER_ADDRESS")"

# ── 3. HexChainRegistry ───────────────────────────────────────────────────────
REGISTRY_ADDRESS="$(deploy_with_args \
  "HexChainRegistry" \
  "contracts/HexChainRegistry.sol:HexChainRegistry" \
  "constructor(address)" \
  "$HEXCHAIN_ADDRESS")"

# ── 4. .env 자동 업데이트 ─────────────────────────────────────────────────────
BACKEND_ENV="$ROOT_DIR/backend/.env"
FRONTEND_ENV="$ROOT_DIR/frontend/.env.local"

update_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  if [ -f "$file" ]; then
    if grep -q "^${key}=" "$file"; then
      sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
      echo "${key}=${value}" >> "$file"
    fi
    echo "  Updated ${file##*/}: ${key}=${value}" >&2
  else
    echo "  Skipped (not found): $file" >&2
  fi
}

echo "==> Updating env files" >&2
update_env "$BACKEND_ENV"  "CONTRACT_ADDRESS"               "$HEXCHAIN_ADDRESS"
update_env "$BACKEND_ENV"  "REGISTRY_ADDRESS"               "$REGISTRY_ADDRESS"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_HEXCHAIN_ADDRESS"   "$HEXCHAIN_ADDRESS"
update_env "$FRONTEND_ENV" "NEXT_PUBLIC_REGISTRY_ADDRESS"   "$REGISTRY_ADDRESS"

cat <<EOF

=== Deployment summary ===
  RevealVerifier (Groth16) : $VERIFIER_ADDRESS
  HexChain                 : $HEXCHAIN_ADDRESS
  HexChainRegistry         : $REGISTRY_ADDRESS

=== Env files updated ===
  backend/.env
  frontend/.env.local
EOF
