# Coffix

Coffix is a single-vendor commerce and coffee-machine service platform for an Israeli coffee shop.

Customers use a Hebrew RTL mobile application to purchase products, register machines, request service, make payments, and track progress. Administrators and technicians use an English web dashboard to manage commerce and service operations.

## Project Status

Coffix is under active development.

Current milestone: Phase 0 — local development foundations.

See [`docs/plan.md`](docs/plan.md) for implementation progress.

## Repository Structure

- `backend/` — FastAPI API, worker, migrations, and backend tests.
- `mobile/` — Expo React Native customer application.
- `admin/` — React administrator and technician dashboard.
- `packages/api-client/` — shared generated TypeScript API client.
- `design/` — customer mobile design handoff.
- `docs/spec.md` — product requirements and business rules.
- `docs/plan.md` — ordered implementation tasks.
- `AGENTS.md` — repository workflow and agent instructions.

## Prerequisites

- Python 3.12 or newer
- uv
- Node.js 20 or newer
- Corepack with the pinned pnpm version
- Docker with Docker Compose v2
- GNU Make

Validate the local tools with:

```bash
bash scripts/check-local-tooling.sh
```

## Local Setup

Install the locked Python and JavaScript dependencies:

```bash
make bootstrap
```

Start PostgreSQL and Redis:

```bash
make services
```

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

- [Product specification](docs/spec.md)
- [Implementation plan](docs/plan.md)
- [Mobile design handoff](design/design_handoff_coffeeshop_mobile/README.md)

The specification defines expected behavior. The implementation plan defines task order and file-level work.

## Development Workflow

Read [`AGENTS.md`](AGENTS.md) before making changes.

Each implementation-plan task uses its own branch. A new task begins only after the previous task has been merged into `main`.

Codex may create commits but must never push. The repository owner pushes and merges changes manually.
