#!/usr/bin/env bash
set -euo pipefail

repository_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
smoke_directory="$(mktemp -d)"
smoke_port="${SMOKE_PORT:-8765}"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -r -- "$smoke_directory"
}
trap cleanup EXIT

APP_ENV=test \
MEDIA_LOCAL_ROOT="$smoke_directory/media" \
UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/coffix-uv-cache}" \
  uv run --project "$repository_root/backend" fastapi run \
    "$repository_root/backend/src/coffix/api/app.py" \
    --host 127.0.0.1 --port "$smoke_port" >"$smoke_directory/server.log" 2>&1 &
server_pid="$!"

for _ in {1..40}; do
  if curl --fail --silent "http://127.0.0.1:$smoke_port/health/live" \
    >"$smoke_directory/live.json"; then
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$smoke_directory/server.log" >&2
    exit 1
  fi
  sleep 0.25
done

curl --fail --silent "http://127.0.0.1:$smoke_port/openapi.json" \
  >"$smoke_directory/openapi.json"
python3 -c '
import json
import sys

live = json.load(open(sys.argv[1], encoding="utf-8"))
schema = json.load(open(sys.argv[2], encoding="utf-8"))
if live.get("status") != "live" or not schema.get("paths"):
    raise SystemExit("backend smoke response was invalid")
' "$smoke_directory/live.json" "$smoke_directory/openapi.json"

printf 'Backend smoke check passed on port %s.\n' "$smoke_port"
