#!/usr/bin/env bash
# dev.sh — 전체 개발 환경 한 번에 시작
#
# 사용법:
#   ./script/dev.sh           # anvil + 배포 + 백엔드 + 프론트엔드
#   ./script/dev.sh --no-deploy   # 배포 건너뛰기 (이미 env에 주소 있을 때)
#   ./script/dev.sh --restart     # 기존 Anvil 강제 종료 후 전체 재시작
#
# 종료: Ctrl+C 한 번으로 전체 종료

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEPLOY=true
RESTART=false
for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=false ;;
    --restart)   RESTART=true ;;
  esac
done

# ── PID 추적 및 정리 ─────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  echo "==> 종료 중..." >&2
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "==> 종료 완료" >&2
}
trap cleanup EXIT INT TERM

# ── 1. Anvil ─────────────────────────────────────────────────────────────────
if [[ "$RESTART" == "true" ]]; then
  echo "==> 기존 Anvil 종료 중..." >&2
  pkill -f 'anvil' 2>/dev/null || true
  sleep 1
fi

if cast block-number --rpc-url http://localhost:8545 >/dev/null 2>&1; then
  echo "==> Anvil 이미 실행 중 — 건너뜀" >&2
else
  echo "==> Anvil 시작 (block-time 10s)" >&2
  anvil --block-time 2 --code-size-limit 100000 > /tmp/anvil.log 2>&1 &
  PIDS+=($!)
  echo "   PID: ${PIDS[-1]}, 로그: /tmp/anvil.log" >&2

  # Anvil 준비 대기 (RPC 응답할 때까지)
  echo "==> Anvil 준비 대기..." >&2
  for i in $(seq 1 20); do
    if cast block-number --rpc-url http://localhost:8545 >/dev/null 2>&1; then
      echo "   Anvil 준비 완료" >&2
      break
    fi
    if [[ $i -eq 20 ]]; then
      echo "ERROR: Anvil이 응답하지 않습니다. /tmp/anvil.log 확인" >&2
      exit 1
    fi
    sleep 0.5
  done
fi

# ── 2. 컨트랙트 배포 ─────────────────────────────────────────────────────────
if [[ "$DEPLOY" == "true" ]]; then
  echo "" >&2
  "$SCRIPT_DIR/deploy_anvil.sh"
  echo "" >&2
fi

# ── 3. 백엔드 ────────────────────────────────────────────────────────────────
echo "==> 백엔드 시작 (NestJS)" >&2
(cd "$ROOT_DIR/backend" && npm run start:dev) > /tmp/backend.log 2>&1 &
PIDS+=($!)
echo "   PID: ${PIDS[-1]}, 로그: /tmp/backend.log" >&2

# ── 4. 프론트엔드 ────────────────────────────────────────────────────────────
echo "==> 프론트엔드 시작 (Next.js)" >&2
(cd "$ROOT_DIR/frontend" && npm run dev) > /tmp/frontend.log 2>&1 &
PIDS+=($!)
echo "   PID: ${PIDS[-1]}, 로그: /tmp/frontend.log" >&2

# ── 실행 중 안내 ─────────────────────────────────────────────────────────────
echo "" >&2
echo "=====================================" >&2
echo "  전체 환경 실행 중" >&2
echo "  프론트엔드: http://localhost:3000" >&2
echo "  백엔드:     http://localhost:3001" >&2
echo "  Anvil RPC:  http://localhost:8545  (Chain ID: 31337)" >&2
echo "" >&2
echo "  MetaMask 개인키 (메인넷 사용 금지)" >&2
echo "  #0  0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" >&2
echo "  #1  0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" >&2
echo "  #2  0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" >&2
echo "  #3  0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" >&2
echo "  #4  0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b" >&2
echo "" >&2
echo "  로그 확인:" >&2
echo "    tail -f /tmp/anvil.log" >&2
echo "    tail -f /tmp/backend.log" >&2
echo "    tail -f /tmp/frontend.log" >&2
echo "" >&2
echo "  종료: Ctrl+C" >&2
echo "=====================================" >&2

# 자식 프로세스 중 하나라도 죽으면 전체 종료
wait "${PIDS[@]}"
