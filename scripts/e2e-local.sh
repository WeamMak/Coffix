#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Fail before creating resources when the documented Node prerequisite is missing.
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error("E2E requires Node.js 22.13 or newer"); process.exit(1); }'
mode=${1:-test}
if [[ "$mode" != test && "$mode" != serve && "$mode" != load && "$mode" != resilience && "$mode" != smoke ]]; then
  echo 'Usage: bash scripts/e2e-local.sh [test|serve|load|resilience|smoke]' >&2
  exit 2
fi
export COFFIX_E2E_RUN_ID
COFFIX_E2E_RUN_ID=$(openssl rand -hex 8)
export COFFIX_E2E_DB_PASSWORD
COFFIX_E2E_DB_PASSWORD=$(openssl rand -hex 24)
export E2E_CONTROL_SECRET
E2E_CONTROL_SECRET=$(openssl rand -hex 32)
run_dir="/tmp/coffix-e2e-$COFFIX_E2E_RUN_ID"
mkdir -m 700 "$run_dir"
compose=(docker compose -f compose.e2e.yaml -p "coffix-e2e-$COFFIX_E2E_RUN_ID")
api_pid=''
admin_pid=''
cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [[ -n "$admin_pid" ]]; then kill "$admin_pid" 2>/dev/null || true; wait "$admin_pid" 2>/dev/null || true; fi
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; fi
  if (( status != 0 )); then tail -n 60 "$run_dir/api.log" "$run_dir/admin.log" 2>/dev/null || true; fi
  "${compose[@]}" down --volumes --remove-orphans || status=1
  # This exact directory was created above and contains only this run's data.
  python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$run_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" up -d --wait
pg_address=$("${compose[@]}" port postgres 5432)
redis_address=$("${compose[@]}" port redis 6379)
export APP_ENV=test OTP_PROVIDER=fake OTP_DEV_CODE=123456 PAYMENT_PROVIDER=fake PUSH_PROVIDER=fake MEDIA_STORAGE_BACKEND=local EMAIL_PROVIDER=disabled
export DATABASE_URL="postgresql+asyncpg://coffix_e2e:$COFFIX_E2E_DB_PASSWORD@$pg_address/coffix_e2e_$COFFIX_E2E_RUN_ID"
export REDIS_URL="redis://:$E2E_CONTROL_SECRET@$redis_address/0" MEDIA_LOCAL_ROOT="$run_dir/media"
export COFFIX_E2E_API_URL="http://127.0.0.1:${COFFIX_E2E_API_PORT:-8320}"
export COFFIX_E2E_ADMIN_URL="http://localhost:${COFFIX_E2E_ADMIN_PORT:-5320}"
export API_PUBLIC_URL="$COFFIX_E2E_ADMIN_URL" ADMIN_PUBLIC_URL="$COFFIX_E2E_ADMIN_URL"
export JWT_PRIVATE_KEY=local-development-private-key-change-me JWT_PUBLIC_KEY=local-development-public-key-change-me
export SHIPPING_FEE_AGOROT=3000 SHOP_ADDRESS_JSON='{"city":"חיפה","street":"הרצל","building":"1","country":"IL"}'
unset SHOP_PHONE SHOP_WHATSAPP SHOP_HOURS PRIVACY_POLICY_URL SERVICE_TERMS_URL
export PYTHONPATH="$PWD/backend/src:$PWD"
backend/.venv/bin/pytest e2e/test_harness.py -q
(cd backend && .venv/bin/alembic upgrade head)
backend/.venv/bin/uvicorn e2e.server:create_e2e_app --factory --host 127.0.0.1 --port "${COFFIX_E2E_API_PORT:-8320}" --no-access-log >"$run_dir/api.log" 2>&1 &
api_pid=$!
(cd admin && exec node_modules/.bin/vite --config e2e.vite.ts) >"$run_dir/admin.log" 2>&1 &
admin_pid=$!
# Readiness is bounded and a failed process cannot silently reuse another server.
for attempt in {1..60}; do
  kill -0 "$api_pid" "$admin_pid"
  if curl -fsS "$COFFIX_E2E_API_URL/health/ready" >/dev/null 2>&1 && curl -fsS "$COFFIX_E2E_ADMIN_URL" >/dev/null 2>&1; then break; fi
  if (( attempt == 60 )); then echo 'E2E readiness timed out' >&2; curl -sS "$COFFIX_E2E_API_URL/health/ready"; tail -n 30 "$run_dir/api.log" "$run_dir/admin.log"; exit 1; fi
  sleep 1
done
export COFFIX_E2E_OUTPUT="$PWD/.local/e2e-results"
export COFFIX_E2E_REPORT="$COFFIX_E2E_OUTPUT/results.json"
if [[ "$mode" == serve ]]; then
  corepack pnpm --filter @coffix/e2e exec playwright test mobileSetup.spec.ts
  # Secret stays in a private file; never printed or supplied to the mobile app.
  (umask 077; printf '%s' "$E2E_CONTROL_SECRET" > "$run_dir/control-secret")
  echo "Mobile API: $COFFIX_E2E_ADMIN_URL/api/v1"
  echo "For Android USB/emulator: adb reverse tcp:${COFFIX_E2E_ADMIN_PORT:-5320} tcp:${COFFIX_E2E_ADMIN_PORT:-5320}"
  echo "Admin: $COFFIX_E2E_ADMIN_URL; controls secret: $run_dir/control-secret"
  echo 'Press Ctrl-C to stop and remove this isolated stack.'
  wait "$api_pid"
else
  case "$mode" in
    load) corepack pnpm --filter @coffix/e2e exec playwright test load/ ;;
    resilience) corepack pnpm --filter @coffix/e2e exec playwright test resilience/ ;;
    smoke) corepack pnpm --filter @coffix/e2e exec playwright test specs/auth.spec.ts specs/permissions.spec.ts ;;
    test) corepack pnpm --filter @coffix/e2e exec playwright test ;;
  esac
fi
