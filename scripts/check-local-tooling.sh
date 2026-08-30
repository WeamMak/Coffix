#!/usr/bin/env bash

set -uo pipefail

errors=0
python_bin="${PYTHON_BIN:-python3}"
uv_cache_dir="${UV_CACHE_DIR:-.local/uv-cache}"

fail() {
  printf 'error: %s\n' "$1" >&2
  errors=$((errors + 1))
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$2"
    return 1
  fi
}

require_command "$python_bin" "Python 3.12 or newer is required (set PYTHON_BIN to select it)."
if command -v "$python_bin" >/dev/null 2>&1; then
  if ! "$python_bin" -c 'import sys; raise SystemExit(sys.version_info < (3, 12))'; then
    fail "Python 3.12 or newer is required."
  fi
fi

require_command uv "uv is required for the backend workspace."
require_command node "Node.js 20 or newer is required."
if command -v node >/dev/null 2>&1; then
  if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)'; then
    fail "Node.js 20 or newer is required."
  fi
fi

require_command corepack "Corepack is required to run the pinned pnpm version."
pnpm_available=0
if command -v corepack >/dev/null 2>&1; then
  if corepack pnpm --version >/dev/null 2>&1; then
    pnpm_available=1
  else
    fail "The pinned pnpm version is unavailable; run 'corepack install' with network access."
  fi
fi

docker_available=0
if command -v docker >/dev/null 2>&1; then
  if docker --version >/dev/null 2>&1; then
    docker_available=1
  else
    fail "Docker is installed but unavailable; enable Docker Desktop WSL integration or start the daemon."
  fi
else
  fail "Docker is required for local PostgreSQL and Redis."
fi

if (( docker_available == 1 )) && ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 is required."
fi

for required_file in package.json pnpm-workspace.yaml pnpm-lock.yaml backend/pyproject.toml backend/uv.lock; do
  if [[ ! -f "$required_file" ]]; then
    fail "Missing required workspace file: $required_file"
  fi
done

if command -v uv >/dev/null 2>&1 && [[ -f backend/pyproject.toml && -f backend/uv.lock ]]; then
  if ! UV_CACHE_DIR="$uv_cache_dir" uv lock --project backend --check >/dev/null 2>&1; then
    fail "uv.lock is stale; run 'uv lock --project backend' and commit the result."
  fi
fi

if (( pnpm_available == 1 )) && [[ -f package.json && -f pnpm-lock.yaml ]]; then
  if ! corepack pnpm install --lockfile-only --frozen-lockfile --ignore-scripts >/dev/null 2>&1; then
    fail "pnpm-lock.yaml is stale; run 'corepack pnpm install --lockfile-only' and commit the result."
  fi
fi

if (( errors > 0 )); then
  printf '\nLocal tooling check failed with %d issue(s).\n' "$errors" >&2
  exit 1
fi

printf 'Local tooling and lockfiles are ready.\n'
