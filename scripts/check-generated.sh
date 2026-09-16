#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
generated_dir=$(mktemp -d /tmp/coffix-generated-XXXXXXXX)
trap 'python3 -c '\''import shutil,sys; shutil.rmtree(sys.argv[1])'\'' "$generated_dir"' EXIT
UV_FROZEN=true bash scripts/generate-api-client.sh "$generated_dir"
diff -u packages/api-client/openapi.json "$generated_dir/openapi.json"
diff -u packages/api-client/src/generated.ts "$generated_dir/src/generated.ts"
