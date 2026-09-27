#!/usr/bin/env bash
# Usage: smoke-image.sh BACKEND_IMAGE ADMIN_IMAGE GIT_SHA
# Disposable services only; never reads the developer's .env or database.
set -euo pipefail
backend=${1:?backend image required}
admin=${2:?admin image required}
version=${3:?Git SHA required}
prefix="coffix-image-smoke-$$"
containers=()
cleanup() {
  for container in "${containers[@]}"; do docker rm -f "$container" >/dev/null 2>&1 || true; done
  docker network rm "$prefix" >/dev/null 2>&1 || true
}
trap cleanup EXIT
for image in "$backend" "$admin"; do
  docker image inspect "$image" >/dev/null
  user=$(docker image inspect --format '{{.Config.User}}' "$image")
  [[ "$user" =~ ^[1-9][0-9]*(:[1-9][0-9]*)?$ ]] || { echo 'Image must declare a numeric non-root user' >&2; exit 1; }
  [[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$version" ]]
done
docker run --rm --network none --read-only --entrypoint sh "$admin" -ec '
    test "$(id -u)" != 0
    ! command -v node
    ! command -v uv
    ! command -v gcc
    test ! -e /app/.env
    test ! -e /app/.git
    test ! -e /app/tests
  '
docker run --rm --network none --read-only --entrypoint python "$backend" -c '
import importlib.util, os, pathlib, shutil
assert os.getuid() != 0
for tool in ("node", "uv", "gcc", "sh", "pip"):
    assert shutil.which(tool) is None, tool
for name in (".env", ".git", "tests"):
    assert not pathlib.Path("/app", name).exists(), name
for module in ("pytest", "ruff", "ty", "pip"):
    assert importlib.util.find_spec(module) is None, module
'
docker network create "$prefix" >/dev/null
containers+=("$prefix-db" "$prefix-redis")
docker run -d --name "$prefix-db" --network "$prefix" --network-alias db \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke \
  dhi.io/postgres:17-alpine3.24@sha256:de165bfe11cdc8fd5cda469b02c1aacb94e7c6cd017841470347c81ce8ea2343 >/dev/null
docker run -d --name "$prefix-redis" --network "$prefix" --network-alias redis redis:7-alpine >/dev/null
for _attempt in {1..60}; do
  if docker exec "$prefix-db" pg_isready -U smoke -d smoke >/dev/null 2>&1; then break; fi
  sleep 1
done
runtime=(--network "$prefix" --read-only --tmpfs '/tmp:rw,noexec,nosuid,size=64m' \
  --cap-drop ALL --security-opt no-new-privileges \
  -e APP_ENV=test -e MEDIA_LOCAL_ROOT=/tmp/media \
  -e DATABASE_URL=postgresql+asyncpg://smoke:smoke@db:5432/smoke \
  -e REDIS_URL=redis://redis:6379/0)
docker run --rm "${runtime[@]}" "$backend" alembic upgrade head
containers+=("$prefix-api" "$prefix-worker" "$prefix-admin")
docker run -d --name "$prefix-api" "${runtime[@]}" "$backend" >/dev/null
docker run -d --name "$prefix-worker" "${runtime[@]}" \
  -e COFFIX_PROCESS=worker "$backend" python -m coffix.worker.main >/dev/null
docker run -d --name "$prefix-admin" --network "$prefix" --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m --cap-drop ALL --security-opt no-new-privileges "$admin" >/dev/null
for container in "$prefix-api" "$prefix-worker" "$prefix-admin"; do
  healthy=false
  for _attempt in {1..90}; do
    if [[ $(docker inspect --format '{{.State.Health.Status}}' "$container") == healthy ]]; then healthy=true; break; fi
    sleep 1
  done
  if [[ $healthy != true ]]; then docker logs "$container"; echo "$container unhealthy" >&2; exit 1; fi
done
docker exec "$prefix-api" python -c '
import json, sys, time, urllib.error, urllib.request
for endpoint in ("live", "ready", "worker"):
    for attempt in range(30):
        try:
            with urllib.request.urlopen("http://localhost:8000/health/" + endpoint, timeout=5) as response:
                assert json.load(response)["version"] == sys.argv[1]
            break
        except urllib.error.HTTPError as error:
            if attempt == 29:
                raise AssertionError(endpoint + ": " + error.read().decode()) from error
            time.sleep(1)
' "$version"
docker exec "$prefix-admin" sh -ec '
  test "$(wget -qO- http://127.0.0.1:8080/version.json)" = "{\"version\":\"$1\"}"
  wget -qO /tmp/index http://127.0.0.1:8080/
  wget -qO /tmp/deep-link http://127.0.0.1:8080/orders/example
  cmp /tmp/index /tmp/deep-link
  ! wget -qO- http://127.0.0.1:8080/api/v1/missing 2>/dev/null
' sh "$version"
for container in "$prefix-api" "$prefix-worker" "$prefix-admin"; do
  docker stop --timeout 20 "$container" >/dev/null
  [[ $(docker inspect --format '{{.State.ExitCode}}' "$container") == 0 ]] || {
    docker logs "$container"; echo 'Container did not shut down gracefully' >&2; exit 1;
  }
done
echo 'Image smoke checks passed: non-root, read-only, health/version, runtime contents, migrations, shutdown.'
