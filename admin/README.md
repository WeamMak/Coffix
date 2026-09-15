# Staff dashboard

The Hebrew RTL React dashboard provides phone OTP login for existing administrators
and technicians, session restoration, role-aware navigation, and shared UI
components. Administrators can operate commerce, service, scheduling, people,
configuration, notification failures, and audit history. Technicians have a
responsive workspace containing only their assigned jobs.

The shared design uses cream surfaces, forest-green actions, locally bundled
Heebo fonts, and a right-side navigation drawer on phones. Desktop tables become
labeled record cards on phones without hiding fields or actions. Order and
service details use supporting columns that stack on smaller screens. Technical
values such as phone numbers, OTPs, SKUs and references are direction-isolated.
Forms, status labels, dialogs and known API errors use Hebrew; stored English
metadata and API codes are preserved. Unknown errors show a safe Hebrew message
and the support correlation reference.

Heebo font files are extracted unchanged from the approved export. Its
[SIL Open Font License](public/fonts/Heebo-OFL.txt), obtained from the
[Google Fonts Heebo source](https://github.com/google/fonts/tree/main/ofl/heebo),
ships with the dashboard at `/fonts/Heebo-OFL.txt`.

The approved reference, route mapping, scope differences, and visual acceptance
record are in [`design/admin/README.md`](../design/admin/README.md).

## Local development

Use Node.js 22.13 or newer and the repository's pinned Corepack/pnpm version.
Install dependencies with `make bootstrap`, then start the API with `make dev`.
The local database must be migrated and seeded:

```bash
cd backend
uv run alembic upgrade head
uv run coffix-shop-settings-init
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

The component tests cover command bodies and permissions as well as native-dialog
confirmation using jsdom's modal method shim. Real Chromium checks cover focus
placement, keyboard movement, Escape, focus return, busy dialogs and safe errors.

For visual/state checks without a running API or database:

```bash
corepack pnpm --filter @coffix/admin exec playwright test browser/redesign.spec.ts
```

That file intercepts every API request and captures desktop (1440px) and phone
(390px) routes, editors, icon previews, confirmations, loading/empty/error states,
payment waits and stale drafts. It checks viewport overflow, Hebrew document
attributes, mixed-direction values, technician restrictions and request bodies.
Screenshots are written to ignored `admin/test-results/` folders. Inspect these
against the approved export and `design/admin/screenshots/`; fixture values are
test data, not reporting data. The handoff records the page-by-page comparison
and differences that require later tasks.

Real session, commerce and service flows below must use an isolated test database
for design acceptance. Configure a separate API with fake providers, separate
media storage and Redis database, then point a separate Vite proxy at it. Match
the API's `ADMIN_PUBLIC_URL` to that dashboard origin and set the Playwright
configuration's `use.baseURL` to it. The shared staff fixtures inherit that URL.
These flows create records; do not run them against production or delete existing
local records to prepare a run.

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
key is preserved until an administrator chooses a replacement. Category photo uploads and matching mobile vector fallbacks are described below.

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
drafts remain visible after a failed save. The shop page edits saved shipping, address, contact details and opening hours;
see Shop settings below. Model photos use the image editor described below.
Service edits retain unchanged machine-model links while adding or removing only
the changed mappings, so metadata edits can keep the same supported models.

People supports server name/phone/role/active filters and confirmed access changes
for existing accounts. Overview uses backend revenue, queue counts and today's
appointments without aggregating record lists in the browser. A separate bounded
request displays four recently updated orders; it does not supply the counts.
Notification failures
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

## Image management

Apply migration `0016_admin_images`, then regenerate the shared client with
`bash scripts/generate-api-client.sh`. Models and categories have one optional
photo; products have an ordered gallery whose first image is the cover. Gallery
images can be associated with a SKU and require Hebrew alternative text.
`MEDIA_MAX_PRODUCT_IMAGES` sets the server limit (default 10).

Save a new record before adding its images. Select a JPEG or PNG, follow the
upload/verification progress, inspect the preview, then save the image or gallery.
HEIC must be normalized to JPEG/PNG before using the dashboard. Removal requires
confirmation. Gallery ordering, replacement, SKU associations and alternative
text are saved together. A failed save preserves the current image and draft.
For a stale category/gallery, use the explicit reload action before saving again;
image saves update the metadata editor's version without replacing its draft.

Closing/navigating away discards newly uploaded, unattached images owned by the
current administrator. The API refuses deletion of referenced files, including
legacy object-key references. The existing media worker also reclaims expired
uploads and completed unreferenced business images after a day. Customer and
service attachment authorization remains independent. Image changes are audited
without saving expiring download URLs in the audit payload.

Category icons are the generated API contract: coffee, coffee bean, capsule,
settings, sparkles, wrench, or none. An unknown legacy icon can be preserved by
omitting it from a metadata update; choose a supported icon to replace it. Photos
have priority over the customer's bundled vector fallback. Mobile's new drawings
use `react-native-svg` 15.15.4, the version pinned by the installed Expo SDK; see
[Expo SVG support](https://docs.expo.dev/versions/latest/sdk/svg/). Rebuild a native
development client after installing this native dependency.

Local storage uses `MEDIA_STORAGE_BACKEND=local` and the ignored
`MEDIA_LOCAL_ROOT`. The browser sends bytes to the API-issued local content path
through the configured API/proxy origin, then finalizes the upload. API commands
in this flow commit their shared transaction before sending success, so an
immediate next command can use the newly created record or image. The scoped
finalizer follows [FastAPI dependency lifetime rules](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/#early-exit-and-scope).

For cloud storage configure the backend with:

```dotenv
MEDIA_STORAGE_BACKEND=s3
MEDIA_S3_BUCKET=coffix-dev-media-example
MEDIA_S3_PREFIX=dev/
AWS_DEFAULT_REGION=il-central-1
MEDIA_PRESIGN_TTL_SECONDS=900
MEDIA_MAX_IMAGE_BYTES=10485760
MEDIA_MAX_PRODUCT_IMAGES=10
```

Use separate private dev/prod buckets or isolated prefixes and IAM permissions.
The backend/worker use the AWS SDK's default credential chain: a scoped local
profile for a deliberate sandbox test, or the deployment's IAM role. Credentials
never enter dashboard/mobile environment variables. The role needs object
upload/read/delete permissions within its own prefix; production startup also
checks the bucket's public-access configuration. Infrastructure provisioning
remains task 37.

Configure bucket CORS for the exact dashboard origin. For example, replace the
example origin with the deployed dashboard's origin:

```json
[
  {
    "AllowedOrigins": ["https://admin.example.invalid"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "x-amz-*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

The dashboard sends bytes directly to the presigned S3 URL with the provider's
headers, including encryption headers, and without Coffix tokens or cookies.
Finalization and image assignment still go through Coffix. Reads receive
short-lived generated URLs; private keys and arbitrary external URLs are never
accepted as new image assignments. Local/S3 contract tests use fake providers
and require no AWS account.

Run the isolated browser flow with local PostgreSQL/Redis available:

```bash
corepack pnpm --filter @coffix/admin test:images
```

This command starts an API on port 8299 and a dashboard on port 5299, creates a
random `coffix_test_images_...` database and temporary media directory, and removes
both when its servers shut down, including failed test runs. It never uses the
seed/application database. Test identities use real signed access tokens; only
browser session restoration is intercepted. Production code contains no test
session endpoint. The test fixture owns that endpoint on its disposable server.
Do not run another service on those ports. The existing
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` override can select an installed Chromium.
Screenshots in `admin/test-results/images-*.png` cover the model editor and
desktop/phone galleries.


## Shop settings

After every migration and before starting API/worker processes, run
`uv run --project backend coffix-shop-settings-init` from the repository root.
The command imports shipping, shop address, phone, WhatsApp and hours once from
backend environment settings; email starts empty. Repeated/concurrent initialization,
seed runs and redeployments preserve admin edits. Migration creates only schema.
Without initialization, dependent reads return `503 SHOP_SETTINGS_UNAVAILABLE`.
Incomplete legacy addresses remain readable and must be completed before saving.

Open **הגדרות → הגדרות החנות**. Enter the flat product shipping fee in shekels
(up to two decimal digits; zero means free shipping), street/building/city,
optional postal code, international E.164 phone/WhatsApp, optional email, and
multiline opening hours in Israel local time. Blank contact/hour fields clear
those values. The adjacent preview shows customer-facing details. Review the
before/after values and snapshot effects, then confirm. Failed or stale saves
retain the draft; explicit reload discards it and loads the current version.

Customers see these details in Profile → Contact, refreshed on focus and pull to
refresh. Phone, WhatsApp and email actions appear only when configured. Existing
privacy/service-policy links remain deployment-managed. Opening hours are display
text and never affect service slots, booking horizons or expected response hours.

New carts/checkouts use the saved shipping fee. Checkout compares the customer's
last displayed shipping amount and rejects a changed fee before creating an order
or payment. The app refreshes totals and waits for another Pay action with a new
idempotency key. Pending/paid orders and retries keep their original prices;
existing bring-in requests keep their address snapshot. New bring-in requests
and service options use the current shop address.

Run the isolated browser/API flow:

```bash
corepack pnpm --filter @coffix/admin test:shop-settings
```

This uses the shared disposable fixture on ports 8299/5299. Its test database
and temporary media directory are removed after success or failure; it does not
change the user's development settings or seed data. It covers every editable
field, mobile public data, checkout review/replay, service snapshots and role
restrictions, with desktop/phone captures in ignored `admin/test-results/`.
