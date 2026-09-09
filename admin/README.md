# Staff dashboard

The English React dashboard provides phone OTP login for existing administrators
and technicians, session restoration, role-aware navigation, and shared UI
components. Administrators can operate commerce, service, scheduling, people,
configuration, notification failures, and audit history. Technicians have a
responsive workspace containing only their assigned jobs.

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

## Commerce operations

Catalog contains separate Products, Categories, and Inventory pages. Lists use
server search/filtering and 20-record pages. Products support Hebrew copy,
category, type, English label, visibility, and featured status. SKU editors
support text attributes, integer-agorot prices, activation, and optional machine
models. New SKUs can start with tracked or unlimited stock; existing stock is
changed only through Inventory. Stock corrections show the current total,
reserved and available quantities, require a reason, and confirm the proposed
change. Inventory refreshes every five seconds.

Category, product, and SKU edits send the opaque `version` returned by the admin
API. It preserves the database timestamp's microseconds and is compared under a
row lock. A conflicting save preserves the draft; reload explicitly discards it.
Stock corrections use the command's `expected_quantity` contract. No generic
SKU patch changes stock.

Category and service editors list their supported icons in a dropdown and preview
the selected icon before saving. Categories also allow no icon; an unknown legacy
key is preserved until an administrator chooses a replacement. Category photo
uploads and matching mobile vector fallbacks follow in task 28.

Orders open on the paid queue. Detail shows immutable item/address/price
snapshots, shipment tracking, history, and times in `Asia/Jerusalem`. Only
server-authorized actions are shown. Unpaid cancellation and full refund require
an exact order number, a reason, and confirmation of the record, amount, and
effect. Refund retries retain the same idempotency key and body. Pending,
confirmed, and failed outcomes are read from the API and survive reload; only
provider confirmation marks the order refunded. Details poll every five seconds.

The task 26 API additions are admin product list/detail and order detail. Admin
category/inventory/order lists now accept bounded pagination and filters while
retaining their array response shape. Product lists return page metadata. Admin
catalog patch inputs require `version`; customer/mobile schemas are unchanged.
The existing product-create endpoint now loads its empty SKU relationship before
serializing the response.

Run the commerce component tests with `corepack pnpm --filter @coffix/admin test`.
With the seeded local API and fake OTP/payment providers running, run:

```bash
corepack pnpm --filter @coffix/admin test:commerce
```

The browser flow creates uniquely named demo catalog records and orders, reserves
stock through a fresh demo customer, tests a competing edit, processes a shipment,
confirms a full refund through the fake webhook, cancels an unpaid order, and
checks technician UI/API denial. Records remain in the local database for
inspection. Run the session and commerce
browser commands separately; their shared seeded phones are subject to the OTP
cooldown and rate limits. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed
browser when its version differs from Playwright's default. As with session
checks, browser results are ignored and auth traces are disabled.

## Service and staff operations

Service queues use server search, state filters, and pagination. Detail shows
customer contact, machine model/serial, intake description, address and urgency
snapshots, preferred and confirmed appointments, notes, media, quotes, and status
history. Controls come from the API's actor-specific `allowed_actions` and detail
refreshes every five seconds. Diagnostic offers show the base and urgency-adjusted
total before confirmation. Scheduling stays unavailable until payment is recorded.
Additional quotes require an explanation and confirmation; repair waits for the
customer's acceptance and payment. The no-additional-cost route also requires
confirmation. Service cancellation is available only when the API permits it.

Appointment entry uses `Asia/Jerusalem` even when the browser uses another timezone.
A preview checks overlaps before any booking is saved. Overlaps require an explicit
continuation checkbox and confirmation, and the save checks again for concurrent
bookings. Reassignment shows the current technician and requires a reason and
confirmation; a stale assignment is rejected. Completed/cancelled jobs do not count
as overlaps. All terminal status changes require confirmation.

Technicians can open only assigned jobs, perform the permitted operational status
changes, write internal notes, and upload diagnosis/repair photos. Administrators
can add internal or customer-visible notes. Job photos use upload, content transfer,
finalize, and attachment commands. Local uploads go through the configured API
proxy; external storage receives no session credentials. Media download links are
authorized on demand against the current assignment. Losing assignment removes
job detail on the next refresh; previously issued signed links expire normally.

Configuration includes machine metadata, warranty defaults, serial rules, supported
model/service mappings, service icons/tags/indicative starting prices, urgency
names/descriptions/surcharges, weekdays, local slots, booking horizon, and response
hours. Service-type and intake edits return their version to detect conflicts;
drafts remain visible after a failed save. The shop page displays the deployed shop
address and shipping fee from the existing read-only configuration API. Those two
values remain deployment-managed. Model-photo management follows in task 28.
Service edits retain unchanged machine-model links while adding or removing only
the changed mappings, so metadata edits can keep the same supported models.

People supports server name/phone/role/active filters and confirmed access changes
for existing accounts. Overview uses backend revenue, queue counts and today's
appointments without aggregating record lists in the browser. Notification failures
show attempts, errors and retry eligibility; retry queues work for the worker and
does not claim delivery success. Audit filtering runs on the server by action,
actor, target and time range. Audit filter dates explicitly use UTC; displayed
event dates use Israel time.

Run all component checks with `corepack pnpm --filter @coffix/admin test`. With the
seeded local API and fake providers running:

```bash
corepack pnpm --filter @coffix/admin test:service
```

The two Playwright scenarios share staff sessions in memory, create fresh demo
customers and configuration records, and exercise paid/no-cost repairs, explicit
schedule-overlap continuation, technician notes/photos, customer-note visibility,
completion/cancellation, access changes/reassignment, and direct URL/API denials.
They leave demo records in the local database. Run separately from other browser
commands and respect the fake OTP cooldown/rate limits between runs. The existing
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` override also applies to these scenarios.
