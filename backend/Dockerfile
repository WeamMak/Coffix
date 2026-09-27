FROM ghcr.io/astral-sh/uv:0.11.27@sha256:4d01caf3b22dfd11003455e2e68153da08c4ee1fa54fdbd166c6282d22693419 AS uv
FROM dhi.io/python:3.12-alpine3.24-dev@sha256:7996786060fe7ab62fbe1704a5456c718184388994702813bc921e895ce0ce66 AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/src ./src
RUN uv sync --frozen --no-dev --no-editable --no-cache
# uv's local-project cache metadata contains source mtimes. It is not runtime
# content; remove it and its RECORD entry instead of ignoring changed app bytes.
RUN python - <<'PY'
import csv
from pathlib import Path
for metadata in Path('/app/.venv').glob('lib/python*/site-packages/*.dist-info/uv_cache.json'):
    metadata.unlink()
    record = metadata.with_name('RECORD')
    with record.open(newline='') as source:
        rows = [row for row in csv.reader(source) if not row[0].endswith('/uv_cache.json')]
    with record.open('w', newline='') as target:
        csv.writer(target).writerows(rows)
PY

FROM dhi.io/python:3.12-alpine3.24@sha256:1cf926e6459b3905bde847c4c1ec23c9de0b159913ae3832c2f5d81e0be03101 AS runtime
ARG APP_VERSION
LABEL org.opencontainers.image.title="Coffix API and worker" \
      org.opencontainers.image.revision=$APP_VERSION
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    APP_VERSION=$APP_VERSION MEDIA_LOCAL_ROOT=/tmp/media
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY backend/migrations ./migrations
COPY backend/alembic.ini backend/container-health.py ./
USER 10001:10001
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 CMD ["python", "/app/container-health.py"]
ENTRYPOINT []
CMD ["python", "-m", "uvicorn", "coffix.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "15"]
