# Coffix

Coffix is a single-vendor commerce and coffee-machine service platform for an Israeli coffee shop.

Customers use a Hebrew RTL mobile application to purchase products, register machines, request service, make payments, and track progress. Administrators and technicians use a responsive Hebrew RTL web dashboard to manage commerce and service operations, with separate role permissions and an assigned-job workspace for technicians.

## Project Status

Coffix is under active development.

Current milestone: Phase 12 — AWS infrastructure foundations.

See [`docs/plan.md`](docs/plan.md) for implementation progress.

## Repository Structure

- `backend/` — FastAPI API, worker, migrations, and backend tests.
- `mobile/` — Expo React Native customer application.
- `admin/` — React administrator and technician dashboard.
- `packages/api-client/` — shared generated TypeScript API client.
- `design/` — customer mobile and staff dashboard design handoffs.
- `docs/spec.md` — product requirements and business rules.
- `docs/plan.md` — ordered implementation tasks.
- `infra/terraform/` — AWS bootstrap, networking, private storage and secrets.
- `AGENTS.md` — repository workflow and agent instructions.

## Prerequisites

- Python 3.12 or newer
- uv
- Node.js 22.13 or newer
- Corepack with the pinned pnpm version
- Docker with Docker Compose v2
- GNU Make

PostgreSQL and Redis use digest-pinned Docker Hardened Images. Authenticate once
with a Docker account to pull the free Community images:

```bash
docker login dhi.io
```

Validate the local tools with:

```bash
bash scripts/check-local-tooling.sh
```

## Local Setup

Install the locked Python and JavaScript dependencies:

```bash
make bootstrap
```

For an existing Redis volume, perform the ownership update described below before
starting the new image. Start PostgreSQL and Redis:

```bash
make services
```

The PostgreSQL 17 volume keeps its existing contents. Compose mounts that volume
at `/var/lib/postgresql/17/data`, the hardened image's data directory; no data
relocation or volume deletion is needed when upgrading from the previous local
Alpine image. Run `make services` to recreate the service with the pinned image.

Redis 7.4.11 runs as UID/GID `65532:65532` and continues to store data in `/data`.
Fresh volumes work automatically. Before restarting with an existing volume from
the previous `redis:7-alpine` image, stop Redis and update that volume's ownership
once. For the default Compose project, first confirm `coffix_redis_data` is the
existing volume with `docker volume inspect coffix_redis_data`, then run:

```bash
docker compose stop redis
docker run --rm --network none --user 0 \
  --mount type=volume,source=coffix_redis_data,target=/data \
  --entrypoint chown \
  redis:7-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499 \
  -R 65532:65532 /data
docker compose up -d --wait redis
```

Use your actual volume name if you customized the Compose project. This changes
file ownership in place; keep the existing volume and its contents. The helper
uses the old image's `chown` because the hardened Redis runtime has no shell or
file-management tools. The development service retains its existing
unauthenticated Redis access; E2E uses its generated password.

Verify that both services are healthy:

```bash
docker compose ps
```

Start the API with automatic reload:

```bash
make dev
```

List the available development commands:

```bash
make help
```

## Testing and Validation

Run the project tests:

```bash
make test
```

Run deterministic API and staff-browser journeys on disposable services:

```bash
bash scripts/e2e-local.sh
```

See [the E2E guide](e2e/README.md) for browser prerequisites and the mobile endpoint.

Run linting and type checks:

```bash
make lint
```

## Environment Configuration

Safe configuration examples are provided in:

- `.env.example`
- `backend/.env.example`
- `mobile/.env.example`
- `admin/.env.example`

Copy the relevant example before running an application locally. Never commit local `.env` files or real credentials.

Local development uses fake providers by default and must not contact production payment, OTP, push-notification, or storage services.

## Documentation

- [Local Android development guide](docs/README.md)
- [Product specification](docs/spec.md)
- [Implementation plan](docs/plan.md)
- [Infrastructure setup and cost assumptions](infra/terraform/README.md)
- [Mobile design handoff](design/design_handoff_coffeeshop_mobile/README.md)
- [Staff dashboard guide](admin/README.md)
- [Staff dashboard design handoff](design/admin/README.md)

The specification defines expected behavior. The implementation plan defines task order and file-level work.

## Development Workflow

Read [`AGENTS.md`](AGENTS.md) before making changes.

Each implementation-plan task uses its own branch. A new task begins only after the previous task has been merged into `main`.

Codex may create commits but must never push. The repository owner pushes and merges changes manually.
