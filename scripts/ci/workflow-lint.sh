#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
tool_dir=$(mktemp -d /tmp/coffix-actionlint-XXXXXXXX)
trap 'python3 -c '\''import shutil,sys; shutil.rmtree(sys.argv[1])'\'' "$tool_dir"' EXIT
curl --fail --silent --show-error --location \
  https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  --output "$tool_dir/actionlint.tar.gz"
printf '%s  %s\n' 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 "$tool_dir/actionlint.tar.gz" | sha256sum --check
tar -xzf "$tool_dir/actionlint.tar.gz" -C "$tool_dir" actionlint
"$tool_dir/actionlint"
# Syntax-check and lint this task's scripts; existing scripts retain their checks.
bash -n scripts/check-migrations.sh scripts/check-generated.sh scripts/scan-secrets.sh scripts/ci/*.sh
docker run --rm -v "$PWD:/source:ro" -w /source koalaman/shellcheck:v0.10.0 \
  scripts/check-migrations.sh scripts/check-generated.sh scripts/scan-secrets.sh scripts/ci/*.sh
