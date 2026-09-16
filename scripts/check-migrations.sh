#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
uv run --frozen --project backend python scripts/ci/migrations.py
uv run --frozen --project backend pytest backend/tests/integration/test_migrations.py backend/tests/integration/test_seed.py -q
