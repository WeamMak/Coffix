# Staff dashboard

The English React dashboard provides phone OTP login for existing administrators
and technicians, session restoration, role-aware navigation, and shared UI
components. Task 25 establishes the shell; the operational pages are added by
tasks 26–28.

## Local development

Use Node.js 22.13 or newer and the repository's pinned Corepack/pnpm version.
Install dependencies with `make bootstrap`, then start the API with `make dev`.
The local database must be migrated and seeded:

```bash
cd backend
uv run alembic upgrade head
uv run coffix-seed
```

From the repository root, start the dashboard:

```bash
corepack pnpm --filter @coffix/admin dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:8000`.
The default `VITE_API_BASE_URL` is `/api/v1`; use `admin/.env.example` when
overriding it. The backend's `ADMIN_PUBLIC_URL` must match the browser origin
(default `http://localhost:5173`). Use `localhost` consistently, rather than
mixing it with an IP address.

The development seed supplies these identities when the backend uses fake OTP:

| Role | Local phone | Code |
|---|---|---|
| Admin | `0500000001` | `123456` |
| Technician | `0500000002` | `123456` |
| Customer (rejected by staff login) | `0500000003` | `123456` |

OTP resend limits apply, including the 60-second resend cooldown. Existing
accounts must be created or promoted by an administrator; staff login never
registers an account.

## Session contract

The generated OpenAPI `WebSession` response carries the access token, user ID,
and authoritative staff role. Access tokens stay in memory. The backend sets
the rotating refresh token as a host-only `coffix_web_refresh` cookie with
`Secure`, `HttpOnly`, `SameSite=Strict`, and path `/api/v1/auth/web`. No refresh
token is returned to JavaScript, and no credentials enter browser storage.

The web endpoints are `POST /api/v1/auth/web/otp/request`, `/otp/verify`,
`/refresh`, and `/logout`. They require the exact configured dashboard `Origin`
and `X-CSRF-Protection: 1`; explicit cross-site fetches are rejected. The client
sends credentials and coordinates cookie commands across tabs using Web Locks.
Requests already in flight are discarded after a change of session, and cached
queries are cleared on logout or a change of user/role. Failed logout remains
visible and can be retried. Mobile body-token endpoints retain their contract.

Production requires HTTPS and a same-site API/dashboard deployment, preferably
an `/api` reverse proxy on the dashboard origin. Local Chromium accepts the
Secure cookie on trusted localhost; do not disable `Secure` for deployment.
Production hosting must serve `index.html` for dashboard navigation paths.
Backend permissions remain authoritative regardless of the route guards.

References: [Starlette cookies](https://starlette.dev/responses/),
[Web Locks](https://www.w3.org/TR/web-locks/), and
[Vite proxy configuration](https://vite.dev/config/server-options#server-proxy).

## Checks

From the repository root:

```bash
corepack pnpm --filter @coffix/admin test
corepack pnpm --filter @coffix/admin lint
corepack pnpm --filter @coffix/admin typecheck
corepack pnpm --filter @coffix/admin build
corepack pnpm --filter @coffix/api-client typecheck
uv run --project backend pytest backend/tests/api/test_web_auth.py backend/tests/api/test_auth.py backend/tests/unit/auth backend/tests/api/test_admin.py backend/tests/api/test_openapi.py backend/tests/api/test_app.py -q
```

For browser smoke checks, run the migrated, seeded local API in fake-provider
mode. Install Chromium and its operating-system dependencies once, then run:

```bash
corepack pnpm --filter @coffix/admin exec playwright install --with-deps chromium
corepack pnpm --filter @coffix/admin test:browser
```

Playwright starts Vite when needed. The tests exercise real local OTP login,
reload, simultaneous tabs, cookie attributes, logout, and technician route
denial at a phone viewport. Reruns within the OTP cooldown may be rate-limited.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an already installed Chromium.
Browser results are ignored; auth traces are disabled to avoid storing tokens.

The unit tests cover native-dialog confirmation semantics using jsdom's modal
method shim; the browser smoke tests focus on staff sessions and navigation.
