#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
umask 077
source_dir=$(mktemp -d /tmp/coffix-infra-XXXXXXXX)
trap 'python3 -c '\''import shutil,sys; shutil.rmtree(sys.argv[1])'\'' "$source_dir"' EXIT
python3 scripts/ci/source.py "$source_dir"
mkdir -p .local/ci-security/cache "$source_dir/backend/.venv"
scanner=aquasec/trivy:0.68.2@sha256:05d0126976bdedcd0782a0336f77832dbea1c81b9cc5e4b3a5ea5d2ec863aca7
trivy=(docker run --rm --user "$(id -u):$(id -g)" -e TRIVY_CACHE_DIR=/reports/cache
  -v "$source_dir:/source:ro" -v "$PWD/.local/ci-security:/reports" "$scanner")
# Includes Dockerfiles, Compose, Terraform, Kubernetes, and GitHub workflow config.
"${trivy[@]}" config --severity HIGH,CRITICAL --exit-code 1 \
  --format json --output /reports/config.json /source
# The pinned Trivy does not read pnpm 10's installed license metadata. Feed pnpm's
# complete inventory through its SBOM scanner; retain full Python/source scanning.
corepack pnpm licenses list --json > .local/ci-security/pnpm-licenses.json
python3 scripts/ci/license-bom.py .local/ci-security/pnpm-licenses.json .local/ci-security/javascript.cdx.json
"${trivy[@]}" sbom --scanners license --format json --output /reports/javascript-licenses.json /reports/javascript.cdx.json
docker run --rm --user "$(id -u):$(id -g)" \
  -e TRIVY_CACHE_DIR=/reports/cache \
  -v "$source_dir:/source:ro" \
  -v "$PWD/backend/.venv:/source/backend/.venv:ro" \
  -v "$PWD/.local/ci-security:/reports" "$scanner" \
  fs --scanners license --license-full --include-dev-deps --exit-code 0 \
  --format json --output /reports/licenses.json /source

uv run --frozen --project backend python - <<'PYLICENSE'
import json
from pathlib import Path
for name in ('licenses', 'javascript-licenses'):
    report = json.loads(Path(f'.local/ci-security/{name}.json').read_text())
    licenses = [item for result in report.get('Results', []) for item in result.get('Licenses', [])]
    assert licenses, f'{name}: license scan returned no inventory'
    violations = [item for item in licenses if item['Severity'] in {'HIGH', 'CRITICAL'}]
    assert not violations, f'{name}: {len(violations)} restricted license findings; inspect private report'
    unknown = sum(item['Severity'] == 'UNKNOWN' for item in licenses)
    print(f'{name}: {len(licenses)} entries, {unknown} unclassified; no HIGH/CRITICAL findings')
PYLICENSE

# No AWS credentials or backend initialization: plans/applies belong to later tasks.
mapfile -t tf_dirs < <(find infra/terraform -type d -name .terraform -prune -o -name '*.tf' -printf '%h\n' 2>/dev/null | sort -u)
if (( ${#tf_dirs[@]} )); then
  docker run --rm -v "$PWD:/source" -w /source hashicorp/terraform:1.15.8 fmt -check -recursive infra/terraform
  for directory in "${tf_dirs[@]}"; do
    tf=(docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/source" -w "/source/$directory" hashicorp/terraform:1.15.8)
    "${tf[@]}" init -backend=false -input=false -lockfile=readonly
    "${tf[@]}" validate
    "${tf[@]}" test
    mkdir -p .local/ci-tflint-plugins
    lint=(docker run --rm --user "$(id -u):$(id -g)" -e TFLINT_PLUGIN_DIR=/plugins
      -v "$PWD/.local/ci-tflint-plugins:/plugins" -v "$PWD:/source" -w "/source/$directory" ghcr.io/terraform-linters/tflint:v0.61.0)
    "${lint[@]}" --init
    "${lint[@]}" --minimum-failure-severity=warning
  done
else
  echo 'Terraform: no configuration exists yet (starts in task 36).'
fi

mapfile -t charts < <(find infra/kubernetes -name Chart.yaml -printf '%h\n' 2>/dev/null | sort -u)
for chart in "${charts[@]}"; do
  helm=(docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/source:ro" -w /source alpine/helm:3.19.0)
  "${helm[@]}" lint --strict "$chart"
  # Render defaults and every environment override; no deployment or credentials.
  values=('')
  while IFS= read -r value; do values+=("$value"); done < <(find infra/kubernetes/environments -name values.yaml 2>/dev/null | sort)
  index=0
  for value in "${values[@]}"; do
    args=()
    if [[ -n "$value" ]]; then args=(-f "$value"); fi
    rendered="$source_dir/rendered-$index.yaml"
    "${helm[@]}" template coffix "$chart" "${args[@]}" > "$rendered"
    docker run --rm -v "$source_dir:/source:ro" ghcr.io/yannh/kubeconform:v0.7.0 \
      -strict -summary -kubernetes-version 1.34.0 "/source/rendered-$index.yaml"
    "${trivy[@]}" config --severity HIGH,CRITICAL --exit-code 1 "/source/rendered-$index.yaml"
    index=$((index + 1))
  done
done
if (( ${#charts[@]} == 0 )); then echo 'Helm: no charts exist yet (starts in task 40).'; fi
# Validate plain manifests as well as rendered charts; CRD schemas must be supplied
# when introduced, never silently ignored.
mapfile -t manifests < <(find infra/kubernetes -type f \( -name '*.yaml' -o -name '*.yml' \) ! -path '*/charts/*' ! -name values.yaml 2>/dev/null)
if (( ${#manifests[@]} )); then
  docker run --rm -v "$PWD:/source:ro" -w /source ghcr.io/yannh/kubeconform:v0.7.0 \
    -strict -summary -kubernetes-version 1.34.0 "${manifests[@]}"
fi
