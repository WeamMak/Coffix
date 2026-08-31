#!/usr/bin/env bash
set -euo pipefail

repository_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
output_directory="${1:-$repository_root/packages/api-client}"
openapi_file="$output_directory/openapi.json"
generated_file="$output_directory/src/generated.ts"

mkdir -p "$output_directory/src"
UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/coffix-uv-cache}" \
  uv run --project "$repository_root/backend" python -c '
import json
import sys

from coffix.api.app import create_app
from coffix.core.settings import Settings

schema = create_app(Settings(app_env="test", app_version="0.1.0", _env_file=None)).openapi()
with open(sys.argv[1], "w", encoding="utf-8") as output:
    json.dump(schema, output, ensure_ascii=False, indent=2, sort_keys=True)
    output.write("\n")
' "$openapi_file"

corepack pnpm --dir "$repository_root/packages/api-client" exec openapi-typescript \
  "$openapi_file" --output "$generated_file" --alphabetize
