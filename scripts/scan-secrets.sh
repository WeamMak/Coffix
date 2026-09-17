#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
source_dir=$(mktemp -d /tmp/coffix-secrets-XXXXXXXX)
trap 'python3 -c '\''import shutil,sys; shutil.rmtree(sys.argv[1])'\'' "$source_dir"' EXIT
python3 scripts/ci/source.py "$source_dir"
mkdir -p .local/ci-security
# Values never go to the public CI log. Reports are not uploaded as artifacts.
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$source_dir:/source:ro" -v "$PWD/.local/ci-security:/reports" \
  aquasec/trivy:0.68.2@sha256:05d0126976bdedcd0782a0336f77832dbea1c81b9cc5e4b3a5ea5d2ec863aca7 \
  fs --scanners secret --exit-code 1 --format json --output /reports/secrets.json /source
