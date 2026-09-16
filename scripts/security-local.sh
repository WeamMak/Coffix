#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p .local
report_dir=$(mktemp -d "$PWD/.local/security-XXXXXXXX")
source_dir=$(mktemp -d /tmp/coffix-security-XXXXXXXX)
cleanup() { python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$source_dir"; }
trap cleanup EXIT
echo "Security reports: $report_dir"
# Copy only versionable source, including current changes. Local credentials,
# dependencies, caches and runtime media never enter the scanner container.
python3 - "$source_dir" <<'PY'
import pathlib
import shutil
import subprocess
import sys

target = pathlib.Path(sys.argv[1])
paths = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"])
for raw in set(paths.split(b"\0")) - {b""}:
    path = pathlib.Path(raw.decode())
    if path.is_file() and not path.is_symlink():
        output = target / path
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, output)
PY
status=0
run() {
  local name=$1
  shift
  if "$@"; then
    echo "$name: PASS" | tee -a "$report_dir/summary.txt"
  else
    echo "$name: FAIL (finding or scanner error; see report)" | tee -a "$report_dir/summary.txt"
    status=1
  fi
}
scanner='aquasec/trivy:0.68.2@sha256:05d0126976bdedcd0782a0336f77832dbea1c81b9cc5e4b3a5ea5d2ec863aca7'
mkdir -p "$report_dir/cache"
trivy=(docker run --rm --user "$(id -u):$(id -g)" -e TRIVY_CACHE_DIR=/cache
  -v "$report_dir/cache:/cache" -v "$source_dir:/source:ro" -v "$report_dir:/reports" "$scanner")
run dependencies "${trivy[@]}" fs --quiet --scanners vuln --include-dev-deps --severity HIGH,CRITICAL --exit-code 1 --format json --output /reports/dependencies.json /source
run secrets "${trivy[@]}" fs --scanners secret --exit-code 1 --format json --output /reports/secrets.json /source
run static-analysis uvx --from bandit==1.8.6 bandit -r backend/src -lll -f json -o "$report_dir/bandit.json"
# pnpm's audit includes the whole locked workspace and development dependencies.
javascript_audit() {
  local audit_status=0
  corepack pnpm audit --json > "$report_dir/pnpm-audit.json" || audit_status=$?
  # pnpm 10's JSON mode returns 1 for moderate findings even with --audit-level
  # high. Validate the report and enforce the threshold without hiding errors.
  python3 - "$report_dir/pnpm-audit.json" "$audit_status" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    report = json.load(source)
if int(sys.argv[2]) not in (0, 1) or report.get("error"):
    raise SystemExit("Dependency audit failed to complete")
counts = report["metadata"]["vulnerabilities"]
if counts["high"] or counts["critical"]:
    raise SystemExit("High or critical JavaScript advisories remain")
print(f'JavaScript audit: {counts["moderate"]} moderate findings; no high/critical findings')
PY
}
run javascript-audit javascript_audit
# Resolve the configured image, then scan that exact local artifact. Report names
# use service names so registry paths and digest-pinned references remain valid.
for name in postgres redis; do
  if image=$(docker compose -f compose.yaml config --images "$name") && [[ -n "$image" ]] &&
    docker image inspect "$image" > "$report_dir/$name-image.json" && docker image save "$image" -o "$report_dir/$name.tar"; then
    run "container-$name" "${trivy[@]}" image --input "/reports/$name.tar" --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --format json --output "/reports/$name.json"
  else
    echo "container-$name: FAIL (configured image unresolved or unavailable locally)" | tee -a "$report_dir/summary.txt"
    status=1
  fi
done
echo 'Application image scan is deferred to task 35: application Dockerfiles do not exist yet.' | tee -a "$report_dir/summary.txt"
exit "$status"
