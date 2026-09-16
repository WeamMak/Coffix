#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test e2e/load/acceptance.test.js
# Readiness checks migration, PostgreSQL, Redis and media before these real
# authentication/permission journeys. All resources belong to this invocation.
exec bash scripts/e2e-local.sh smoke
