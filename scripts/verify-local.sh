#!/usr/bin/env bash
# Run in a clean checkout with locked dependencies and local test services ready.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Verification requires a clean checkout.' >&2
  exit 2
fi
report_dir="$PWD/.local/verification"
mkdir -p "$report_dir"
status=0
run() {
  local name=$1
  shift
  if "$@" >"$report_dir/$name.log" 2>&1; then
    echo "$name: PASS"
  else
    echo "$name: FAIL (see $report_dir/$name.log)"
    tail -n 30 "$report_dir/$name.log"
    status=1
  fi
}
run tests make test
run lint-types make lint
run e2e-python bash -c 'cd backend && .venv/bin/ruff check ../e2e --config pyproject.toml && .venv/bin/ty check --extra-search-path .. ../e2e/server.py ../e2e/test_harness.py ../e2e/resilience/worker.py'
run smoke bash scripts/smoke-local.sh
run e2e bash scripts/e2e-local.sh
run staff-design corepack pnpm --filter @coffix/admin exec playwright test browser/redesign.spec.ts e2e/operations.spec.ts
run admin-build corepack pnpm --filter @coffix/admin build
run mobile-export corepack pnpm --filter @coffix/mobile exec expo export --platform all --output-dir "$report_dir/mobile-export"
run client-generation bash scripts/generate-api-client.sh "$report_dir/api-client"
run openapi-drift cmp packages/api-client/openapi.json "$report_dir/api-client/openapi.json"
run client-drift cmp packages/api-client/src/generated.ts "$report_dir/api-client/src/generated.ts"
run whitespace git diff --check
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Verification changed tracked or unignored source files.'
  status=1
fi
echo "Verification reports: $report_dir"
exit "$status"
