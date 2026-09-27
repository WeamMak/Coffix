#!/usr/bin/env bash
# Build twice, smoke-test, compare application bytes, scan and save exact artifacts.
set -euo pipefail
cd "$(dirname "$0")/.."
version=${1:?full source Git SHA required}
[[ $version =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full Git SHA' >&2; exit 1; }
output=${2:-.local/release-images}
mkdir -p "$output"
output=$(realpath "$output")
scanner=aquasec/trivy:0.68.2@sha256:05d0126976bdedcd0782a0336f77832dbea1c81b9cc5e4b3a5ea5d2ec863aca7
mkdir -p .local/ci-security/cache
content_container=''
trap 'if [[ -n "$content_container" ]]; then docker rm -f "$content_container" >/dev/null; fi' EXIT
epoch=$(git show -s --format=%ct "$version")
for pass in 1 2; do
  for component in backend admin; do
    image="coffix-$component:$version-$pass"
    docker buildx build --load --no-cache --provenance=false --platform linux/amd64 \
      --build-arg "APP_VERSION=$version" --build-arg "SOURCE_DATE_EPOCH=$epoch" \
      -f "$component/Dockerfile" -t "$image" .
    root=/app
    if [[ $component == admin ]]; then root=/usr/share/nginx/html; fi
    content_container=$(docker create "$image")
    docker cp "$content_container:$root/." - \
      | python3 scripts/image-content.py > "$output/$component-content-$pass.json"
    docker rm "$content_container" >/dev/null
    content_container=''
  done
  bash scripts/smoke-image.sh "coffix-backend:$version-$pass" "coffix-admin:$version-$pass" "$version"
done
for component in backend admin; do
  cmp "$output/$component-content-1.json" "$output/$component-content-2.json"
  image="coffix-$component:$version-1"
  docker tag "$image" "coffix-$component:$version"
  docker save "coffix-$component:$version" -o "$output/$component.tar"
  trivy=(docker run --rm --user "$(id -u):$(id -g)" \
    -v "$output:/artifacts" -v "$PWD/.local/ci-security/cache:/cache" \
    -e TRIVY_CACHE_DIR=/cache "$scanner")
  "${trivy[@]}" image --input "/artifacts/$component.tar" --scanners vuln,secret \
    --severity HIGH,CRITICAL --exit-code 1 --format json --output "/artifacts/$component-scan.json"
  "${trivy[@]}" image --input "/artifacts/$component.tar" --format cyclonedx \
    --output "/artifacts/$component.cdx.json"
done
python3 - "$output" "$version" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
records = {}
for name in ("backend", "admin"):
    with (root / f"{name}.tar").open("rb") as stream:
        records[name] = {"archive_sha256": hashlib.file_digest(stream, "sha256").hexdigest()}
    sbom = json.loads((root / f"{name}.cdx.json").read_text())
    assert sbom.get("components"), f"{name}: empty SBOM"
(root / "build.json").write_text(json.dumps({"source": sys.argv[2], "artifacts": records}, indent=2) + "\n")
PY
echo 'Both builds passed smoke checks; application content matches and image scans passed.'
