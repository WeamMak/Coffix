# Local cross-application E2E

From the repository root, with the README prerequisites installed:

```bash
corepack pnpm --filter @coffix/e2e exec playwright install --with-deps chromium
bash scripts/e2e-local.sh
```

Both Compose files pin the same Docker Hardened PostgreSQL 17 Alpine image.
Authenticate with `docker login dhi.io` before its first pull. The existing named
volume is mounted directly at `/var/lib/postgresql/17/data`; fresh E2E volumes and
volumes initialized by the previous official PostgreSQL 17 Alpine image both work.

The command creates a unique Compose project, PostgreSQL database and volume,
Redis service and volume, and private temporary media directory. It applies every
migration, seeds fixed role identities and shop/intake settings, starts the real
FastAPI app and admin Vite proxy, and runs Playwright with one worker and no retries.
It requires API readiness, including the current migration revision.

Every test resets business rows, Redis, media, queued fake push results, and the
business clock to **2026-01-05 10:00 UTC**. Fixtures create catalog, commerce, and
service records through the public API. Names, phones, serials, prices, seed user
IDs, and clock inputs are fixed. Runtime UUIDs and auth tokens remain opaque;
assertions compare business outcomes rather than generated identifiers or timings.
There are no intercepted business responses. Worker controls invoke the existing
expiration, outbox, and push-delivery passes, so tests choose exactly when jobs run.
Redis's OTP cooldown uses real TTLs; time-jump tests refresh sessions instead of
sleeping or bypassing authentication.

Success, failure, and Ctrl-C all stop the run's servers and remove its containers,
volumes, and temporary media. No developer database, Redis, or media is reused.
Playwright reports and screenshots use ignored `.local/e2e-results/`; auth traces
and videos are disabled. A failing cleanup makes the command fail.

## Coverage

- OTP, browser session restoration/logout, reset isolation and secret checks.
- Concurrent reservation of the last unit; signed duplicate payment, one purchased
  machine and warranty; full admin refund; unpaid order and inactive cart expiry.
- Manual machine, diagnostic payment, technician assignment, no-cost completion,
  paid additional quote, declined quote, and private technician notes.
- Customer ownership, staff route/API permissions, prohibited cancellation/refund,
  and repair blocked until additional payment.
- Real browser model/category/gallery upload, replacement, ordering, cover, SKU
  association and removal, with customer API reflection.
- Shop contacts/hours and `/app-info`, shipping review/conflict, order/service
  snapshots, and independence from service intake hours.
- People review/invalidation/confirmation, notification failures and queued retry,
  in-app read state, and readable audit actor and before/after values at desktop
  and phone widths.

## Mobile endpoint

```bash
bash scripts/e2e-local.sh serve
```

This prepares the mobile fixture through the same public API and leaves the stack
running. Use `EXPO_PUBLIC_API_URL=http://localhost:5320/api/v1` when starting Expo.
For an Android emulator or a USB-connected Android device, first run:

```bash
adb reverse tcp:5320 tcp:5320
```

The reverse mapping also makes API-generated media URLs reachable. The iOS
simulator can use localhost directly. This task prepares the endpoint; running a
native mobile driver is separate from the API/browser suite.

Seed phones are `0500000001` (admin), `0500000002` (technician), and `0500000003`
(customer), all with fake OTP `123456`. The mobile fixture includes a product,
a manually registered machine, and a request awaiting intake review. Preparing it
uses OTP, so wait for the normal 60-second cooldown before signing in manually.
Stop with Ctrl-C to remove its data.

## Test controls and configuration

Controls exist only in `e2e.server:create_e2e_app`, never in the normal application
entrypoint or OpenAPI client. They require `APP_ENV=test`, fake providers, local
media, matching run-owned database/media identifiers, and a generated secret of
at least 32 characters. Settings reject that secret in local/dev/prod modes.
The runner disables the legacy unsigned local payment helper.

Every `/api/v1/__e2e/*` request requires `X-E2E-Secret`. Controls are:

| Method and path | Behavior |
| --- | --- |
| `POST /reset` | Restore seed, business clock, Redis and media |
| `GET /clock` | Read UTC business time |
| `POST /clock` | Advance by `{ "seconds": 60 }` |
| `POST /payments` | Verify raw fake provider event, HMAC signature and 5-minute timestamp tolerance |
| `POST /push` | Queue a fake provider outcome for a test device |
| `POST /workers` | Run one bounded expiration/outbox/delivery pass |

The `serve` command prints the path to a private secret file, never its value.
Use that file only from the test driver; the customer app does not need it.

`COFFIX_E2E_API_PORT` and `COFFIX_E2E_ADMIN_PORT` override 8320/5320. PostgreSQL
and Redis get random loopback ports. Vite ignores developer `.env` files and uses
the isolated proxy. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed browser.
Use the repository-required Node version and install Chromium's OS libraries.

Focused static checks:

```bash
corepack pnpm --filter @coffix/e2e typecheck
cd backend
.venv/bin/ruff check ../e2e --config pyproject.toml
.venv/bin/ty check --extra-search-path .. ../e2e/server.py ../e2e/test_harness.py
```

## Local hardening commands (task 33)

```bash
bash scripts/smoke-local.sh
bash scripts/e2e-local.sh load
bash scripts/e2e-local.sh resilience
bash scripts/security-local.sh
bash scripts/verify-local.sh
```

The default E2E command includes load and resilience scenarios. Load uses the
agreed 10-client/500-request profile, twenty warmup reads and a strict p95 below
2,000ms with zero errors. Sixteen authenticated customers compete for five units.
The driver includes response consumption in latency and asserts final inventory.

Resilience kills a separate worker after durable outbox claims, then restarts
after the five-minute lease; checks concurrent/reordered payment callbacks; pauses
and restores only the run-owned Redis container; holds all fifteen API database
pool connections and releases them; drains twelve expired carts in batches of
five; and rejects invalid/expired media. Redis uses pause/unpause so its randomly
assigned host port stays stable. Every fault has cleanup on failure. The secret-
protected `/database/hold` and `/database/release` endpoints exist only in the
test entrypoint. Reset and shutdown also release held database connections.

Security scans require Docker, uv/uvx and Corepack. The command downloads a pinned
Trivy image and Bandit version, updates advisory databases and audits both locked
dependency ecosystems. It scans versionable source (including working changes),
secrets and the exact installed PostgreSQL/Redis image archives resolved from
`compose.yaml`, never local env files or media. Reports are private ignored
`.local/security-*` files; any finding at the configured threshold or scanner
failure makes the command fail. Container
findings are not silently waived. Source secret scanning does not scan Git history.
Application images become available in task 35 and need separate scans then.

`verify-local.sh` requires a clean checkout with frozen Python/JS dependencies,
Chromium and the documented local PostgreSQL/Redis test services available. The
backend suite creates disposable databases and includes migration and seed tests.
The script runs all workspace tests, lint/types, smoke, E2E, staff design/operations
browser checks, frontend exports/builds and independent generated-client comparison.
Logs live under `.local/verification`. Do not run other tests against shared test
Redis at the same time. Native owner review remains separate from these checks.

See [task 33 acceptance and delivery tracker](ACCEPTANCE.md) for measured outcomes,
review evidence and open launch gates.

## Task 32 verification (2026-09-15)

Two fresh Compose stacks produced identical passing outcomes: 15 Playwright
scenarios and seven harness/startup checks per run, with no retries. Both stacks
removed their run-owned containers, volumes and media. Focused backend API,
authentication, permission, settings, health and OpenAPI checks passed, along with
backend/E2E lint and types, admin lint/types, and the frozen workspace lockfile.

The suite exposed an outdated readiness migration revision and responses sent
before commits in OTP, machine registration and service commands. Readiness now
expects migration 0017. These commands use the existing transaction finalizer;
regression tests verify that a separate HTTP request can use each response as
soon as it is sent.
