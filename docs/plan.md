# Coffix Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and operate the Coffix single-vendor commerce and coffee-machine service platform defined in `docs/spec.md`, beginning with complete local workflows and ending with controlled AWS deployment on self-managed Kubernetes.

**Architecture:** Use a FastAPI modular monolith and a separate worker process backed by PostgreSQL and Redis. Expose one versioned REST API to an Expo React Native customer app and a React admin/technician dashboard. Keep providers behind adapters, keep business state in PostgreSQL, and deploy the same immutable containers to isolated development and production namespaces.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL, Redis, pytest, Expo/React Native, React, TypeScript, TanStack Query, React Hook Form, Stripe, Twilio Verify, FCM, S3-compatible storage, Docker, GitHub Actions, Terraform, self-managed Kubernetes on EC2, Helm, OpenTelemetry, Prometheus, Grafana, Loki, and Alertmanager.

## Global constraints

- Create a single-vendor, single-tenant MVP for Israel; do not introduce marketplace or multi-tenant abstractions.
- Use ILS only and represent all monetary values as integer agorot.
- Use phone OTP only; every user has exactly one role: `customer`, `admin`, or `technician`.
- Require login before catalog browsing.
- Make the Expo customer application Hebrew RTL and follow `design/design_handoff_coffeeshop_mobile/` as the visual source of truth.
- Keep the admin dashboard English and make technician job screens responsive.
- Treat `stock_quantity = null` as unlimited and an integer as tracked inventory.
- Reserve tracked stock atomically when it enters a cart; expire inactive carts after 60 minutes and release reservations.
- Keep product-order cancellation and full refunds admin-only; do not implement partial refunds.
- Auto-register app-purchased machines with warranty eligibility; manual registrations have no Coffix warranty.
- Require every service request to reference a registered machine.
- Support service location `bring_in` or `pickup`; do not implement on-site visits.
- Require diagnostic payment before appointment confirmation or work; require accepted additional-cost payment before repair continues.
- Make service payments non-refundable and allow customer cancellation only before diagnostic payment.
- Allow schedule overlaps but warn the admin.
- Keep shipment tracking manual and notifications mandatory in MVP.
- Build and prove local workflows before AWS, Kubernetes, and observability migration.
- Use self-managed Kubernetes on EC2, not EKS.
- Create only `docs/spec.md` and `docs/plan.md` during this planning task; paths below describe files to create during later implementation.

---

## 1. Delivery rules for implementers

1. Execute tasks in order. Do not begin a phase until the prior phase acceptance criteria pass.
2. Use red-green-refactor inside every task: add one focused failing test, run it, add the minimum implementation, rerun focused tests, then run the affected suite.
3. Keep each task in its own commit. Do not mix infrastructure, backend, mobile, and dashboard changes unless the task explicitly spans them.
4. Keep route handlers and UI screens thin. Domain state transitions belong in backend application services; reusable visual behavior belongs in focused components/hooks.
5. Update the generated OpenAPI client only after backend contract tests pass.
6. Use deterministic clocks, provider fakes, and seed fixtures. Tests must never contact production providers.
7. Run `git diff --check` before every commit and review generated files separately from authored files.
8. Stop at a phase gate when a listed blocker is unresolved; do not hide provider, legal, data-loss, or cluster-security risks behind mocks.

## 2. Target repository map

```text
.
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── migrations/
│   ├── src/coffix/
│   │   ├── api/                 # FastAPI app, middleware, routers, error mapping
│   │   ├── core/                # settings, clock, IDs, money, DB, Redis, security
│   │   ├── auth/
│   │   ├── users/
│   │   ├── catalog/
│   │   ├── inventory/
│   │   ├── carts/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── machines/
│   │   ├── service/
│   │   ├── scheduling/
│   │   ├── media/
│   │   ├── notifications/
│   │   ├── admin/
│   │   ├── health/
│   │   └── worker/              # outbox, expiry, delivery, reconciliation loops
│   └── tests/                   # unit, integration, API, provider-contract tests
├── mobile/
│   ├── app/                     # Expo Router stacks and screens
│   ├── src/components/
│   ├── src/features/
│   ├── src/theme/
│   ├── src/api/
│   ├── src/i18n/
│   └── tests/
├── admin/
│   ├── src/app/
│   ├── src/features/
│   ├── src/components/
│   ├── src/api/
│   └── tests/
├── packages/api-client/         # generated OpenAPI types plus fetch adapters
├── infra/
│   ├── terraform/
│   │   ├── bootstrap/
│   │   ├── modules/
│   │   └── environments/{shared,dev,prod}/
│   ├── kubernetes/
│   │   ├── charts/coffix/
│   │   ├── cluster-addons/
│   │   └── environments/{dev,prod}/
│   └── observability/
├── e2e/                         # cross-application fixtures and local flow tests
├── scripts/                     # repeatable development, generation, and smoke commands
├── .github/workflows/
├── compose.yaml
├── Makefile
├── pnpm-workspace.yaml
└── package.json
```

Module rule: each backend domain directory contains `models.py`, `schemas.py`, `repository.py`, `service.py`, `router.py`, and focused policy/state files only when needed. Do not create empty layers or generic utility dumping grounds.

## 3. Stable interfaces between tasks

These names lock cross-task contracts. Implementers may add private helpers but must not rename these without updating all later tasks and the plan.

```python
# backend/src/coffix/core/types.py
type UserId = UUID
type CartId = UUID
type OrderId = UUID
type MachineId = UUID
type ServiceRequestId = UUID

@dataclass(frozen=True)
class Money:
    amount_agorot: int
    currency: Literal["ILS"] = "ILS"

class Clock(Protocol):
    def now(self) -> datetime: ...

class IdGenerator(Protocol):
    def new(self) -> UUID: ...
```

```python
# Provider protocols
class OtpProvider(Protocol):
    async def request_code(self, phone_e164: str) -> str: ...
    async def verify_code(self, phone_e164: str, code: str) -> bool: ...

class PaymentProvider(Protocol):
    async def create_intent(self, *, payment_id: UUID, amount: Money,
                            idempotency_key: str, metadata: dict[str, str]) -> PaymentIntentResult: ...
    async def create_full_refund(self, *, payment_id: UUID,
                                 idempotency_key: str) -> RefundResult: ...
    def verify_webhook(self, raw_body: bytes, signature: str) -> ProviderEvent: ...

class MediaStore(Protocol):
    async def create_upload(self, request: UploadRequest) -> UploadTarget: ...
    async def complete_upload(self, upload_id: UUID) -> StoredMedia: ...
    async def create_download_url(self, object_key: str) -> str: ...

class PushProvider(Protocol):
    async def send(self, message: PushMessage) -> PushResult: ...
```

```typescript
// packages/api-client/src/index.ts
export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  correlationId: string;
  errors?: Record<string, string[]>;
};

export interface TokenStore {
  getAccessToken(): Promise<string | null>;
  setTokens(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}
```

## 4. Environment and configuration matrix

Commit only `.env.example` files containing safe examples. Real secrets use ignored local files, GitHub environment secrets, and the AWS secret-management path.

| Variable | Local default/example | Cloud source | Notes |
|---|---|---|---|
| `APP_ENV` | `local` | ConfigMap | `local`, `test`, `dev`, or `prod` |
| `APP_VERSION` | `dev` | image metadata/ConfigMap | Git SHA in deployments |
| `API_PUBLIC_URL` | `http://localhost:8000` | ConfigMap | Public webhook/API URL |
| `ADMIN_PUBLIC_URL` | `http://localhost:5173` | ConfigMap | CORS allowlist input |
| `DATABASE_URL` | local PostgreSQL DSN | Secret | Separate database/credentials per environment |
| `REDIS_URL` | local Redis DSN | Secret | TLS in cloud |
| `JWT_PRIVATE_KEY` | development-only key | Secret | Never place in frontend config |
| `JWT_PUBLIC_KEY` | matching public key | ConfigMap/Secret | Used to verify access tokens |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | ConfigMap | Short-lived access token |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | ConfigMap | Rotating sessions |
| `OTP_PROVIDER` | `fake` | ConfigMap | `fake` or `twilio` |
| `OTP_DEV_CODE` | `123456` | local/test Secret | Forbidden when `APP_ENV=prod` |
| `TWILIO_ACCOUNT_SID` | unset | Secret | Required only in real mode |
| `TWILIO_AUTH_TOKEN` | unset | Secret | Required only in real mode |
| `TWILIO_VERIFY_SERVICE_SID` | unset | Secret | Required only in real mode |
| `PAYMENT_PROVIDER` | `fake` | ConfigMap | `fake` or `stripe` |
| `STRIPE_SECRET_KEY` | test key or unset | Secret | Backend only |
| `STRIPE_WEBHOOK_SECRET` | test secret or unset | Secret | Backend only |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | test key | Expo environment | Publishable, never secret |
| `MEDIA_STORAGE_BACKEND` | `local` | ConfigMap | `local` or `s3` |
| `MEDIA_LOCAL_ROOT` | `.local/media` | unused | Must be ignored by Git |
| `MEDIA_S3_BUCKET` | unset | ConfigMap | Private bucket |
| `MEDIA_S3_PREFIX` | `local/` | ConfigMap | Separate per environment |
| `MEDIA_PRESIGN_TTL_SECONDS` | `900` | ConfigMap | Short-lived URL |
| `MEDIA_MAX_IMAGE_BYTES` | `10485760` | ConfigMap | 10 MB |
| `MEDIA_MAX_VIDEO_BYTES` | `104857600` | ConfigMap | 100 MB |
| `MEDIA_MAX_SERVICE_FILES` | `5` | ConfigMap | Per service request |
| `PUSH_PROVIDER` | `fake` | ConfigMap | `fake` or `fcm` |
| `FCM_PROJECT_ID` | unset | ConfigMap | Production project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | local credential path if used | mounted Secret/workload identity | Never commit JSON credentials |
| `EMAIL_PROVIDER` | `disabled` | ConfigMap | `disabled` or `resend` |
| `RESEND_API_KEY` | unset | Secret | Optional, not MVP-critical |
| `CART_TTL_SECONDS` | `3600` | ConfigMap | Fixed MVP rule |
| `ORDER_PAYMENT_TTL_SECONDS` | `1800` | ConfigMap | Approved assumption |
| `SHIPPING_FEE_AGOROT` | safe seed value | ConfigMap/admin setting | Final business value is a launch blocker |
| `SHOP_ADDRESS_JSON` | development shop address | Secret/config | Final Hebrew address required for launch |
| `EXPO_PUBLIC_API_URL` | emulator/device-reachable API URL | Expo environment | Non-secret mobile config |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | build environment | Non-secret admin config |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset/local collector | ConfigMap | Required in cluster |
| `LOG_LEVEL` | `INFO` | ConfigMap | No debug logging in prod |

Startup must reject contradictory modes and missing mode-specific variables. Tests must prove that fake provider secrets cannot accidentally enable real calls and that `OTP_DEV_CODE` is rejected in production.

## 5. What is mocked locally

| Integration | Default local behavior | Optional integration test |
|---|---|---|
| Twilio Verify | Record request and accept `OTP_DEV_CODE` for seeded phones. | Twilio test/sandbox account behind an explicit flag. |
| Stripe | Create deterministic intent IDs; expose test helpers to emit signed success, failure, expiry, and refund events. | Stripe test mode and Stripe CLI forwarding. |
| FCM | Persist attempted messages and return deterministic success/invalid-token results. | Dedicated Firebase test project. |
| S3 | Store private files below `MEDIA_LOCAL_ROOT`; generate API-owned local URLs. | MinIO or a dedicated test bucket for S3 contract tests. |
| Resend | Disabled or append outbound email to a test mailbox table/log sink. | Resend test domain only if email enters scope. |
| Time | `FakeClock` controlled by tests and E2E support routes enabled only in test mode. | Real system clock in manual development. |
| Shipping | Admin-entered carrier/tracking values; no provider call. | None in MVP. |

---

# Phase 0: Local foundations

### Task 1: Establish the monorepo and repeatable local runtime

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `Makefile`, `compose.yaml`, `.editorconfig`
- Create: `.env.example`, `backend/.env.example`, `mobile/.env.example`, `admin/.env.example`
- Create: `backend/pyproject.toml`, `backend/src/coffix/__init__.py`
- Create: `mobile/package.json`, `admin/package.json`, `packages/api-client/package.json`
- Modify: `.gitignore`
- Test: `scripts/check-local-tooling.sh`

**Interfaces:**
- Produces `make bootstrap`, `make services`, `make test`, `make lint`, and `make dev` as the stable developer entry points.
- Produces PostgreSQL on `localhost:5432` and Redis on `localhost:6379` with named, non-source-controlled volumes.

- [x] Write `scripts/check-local-tooling.sh` to fail with clear messages when the selected Python environment, package managers, Docker, or Compose are unavailable; make the check validate lockfiles rather than silently updating them.
- [x] Run `bash scripts/check-local-tooling.sh` and confirm it fails before the root manifests exist.
- [x] Add the workspace manifests, backend environment, frontend workspaces, Compose services with health checks, and safe example configuration from the matrix above.
- [x] Add Make targets that call workspace-native commands and never embed real credentials.
- [x] Run `make bootstrap`, `make services`, and `docker compose ps`; expect healthy PostgreSQL and Redis.
- [x] Run `git diff --check`, verify only intended generated lockfiles were added, and commit with `chore: establish local development workspace`.

### Task 2: Create the FastAPI application core and migration baseline

**Files:**
- Create: `backend/src/coffix/api/app.py`, `backend/src/coffix/api/errors.py`, `backend/src/coffix/api/middleware.py`
- Create: `backend/src/coffix/core/settings.py`, `clock.py`, `ids.py`, `types.py`, `database.py`, `redis.py`, `logging.py`
- Create: `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/versions/0001_baseline.py`
- Create: `backend/tests/unit/core/test_money.py`, `backend/tests/unit/core/test_settings.py`
- Create: `backend/tests/integration/test_migrations.py`, `backend/tests/api/test_app.py`

**Interfaces:**
- Produces `create_app(settings: Settings) -> FastAPI`.
- Produces `Money`, `Clock`, `SystemClock`, `FakeClock`, and UUID generation contracts defined in Section 3.
- Produces one async SQLAlchemy session per request and transactional application-service boundaries.

- [x] Write failing tests for negative money, non-ILS money, production fake-OTP rejection, correlation IDs, problem responses, and Alembic upgrade/downgrade/upgrade on a clean database.
- [x] Run `pytest backend/tests/unit/core backend/tests/integration/test_migrations.py backend/tests/api/test_app.py -q`; expect failures caused by missing core modules.
- [x] Implement strict settings validation, core value objects, async database/Redis lifecycles, JSON logging, correlation middleware, and `application/problem+json` exception mapping.
- [x] Create the baseline migration containing shared PostgreSQL extensions/conventions only; domain tables enter with their owning tasks.
- [x] Run the focused tests, then `pytest backend/tests -q`, `ruff check backend`, and the configured Python type checker.
- [x] Commit with `feat: add backend application foundation`.

### Phase 0 acceptance criteria

- A new developer can start PostgreSQL and Redis and run the empty API using documented Make targets embedded in command help.
- Configuration fails fast and does not allow development provider shortcuts in production mode.
- A clean database migrates to the current revision and the API returns a correlation ID and stable problem response.
- Backend, mobile, admin, and generated-client workspaces have lockfiles and test/lint entry points, even though product features are not yet implemented.

---

# Phase 1: Backend identity, authentication, and authorization

### Task 3: Add users, addresses, sessions, and role policies

**Files:**
- Create: `backend/src/coffix/users/{models,schemas,repository,service,router}.py`
- Create: `backend/src/coffix/auth/{models,schemas,tokens,policies}.py`
- Create: `backend/migrations/versions/0002_users_and_sessions.py`
- Test: `backend/tests/unit/users/test_phone.py`, `backend/tests/unit/auth/test_roles.py`
- Test: `backend/tests/integration/users/test_users_repository.py`, `backend/tests/api/test_users.py`

**Interfaces:**
- Produces `normalize_israeli_phone(raw: str) -> str` returning E.164.
- Produces `CurrentActor(user_id: UUID, role: Role)` and dependencies `require_customer`, `require_admin`, `require_technician`.
- Produces customer-owned address CRUD and the invariant of one default address per customer.

- [x] Write failing tests for Israeli local/international formats, invalid numbers, one-role enforcement, ownership denial, inactive users, and default-address replacement.
- [x] Run the focused tests and verify failures identify the missing policies and repositories.
- [x] Add user/session/address tables and constraints in migration `0002`; include unique normalized phone and one active role.
- [x] Implement repositories, application services, schemas, ownership queries, and role dependencies; return `404` when exposing another customer's resource would leak existence.
- [x] Run focused tests, migration tests, the full backend suite, lint, and type checks.
- [x] Commit with `feat: add users addresses and role policies`.

### Task 4: Implement OTP login and rotated sessions

**Files:**
- Create: `backend/src/coffix/auth/{providers,service,router}.py`
- Create: `backend/src/coffix/auth/adapters/{fake,twilio}.py`
- Create: `backend/src/coffix/core/rate_limit.py`
- Test: `backend/tests/unit/auth/test_tokens.py`, `test_otp_service.py`
- Test: `backend/tests/api/test_auth.py`, `backend/tests/contract/test_twilio_adapter.py`

**Interfaces:**
- Implements `OtpProvider` from Section 3.
- Produces `POST /api/v1/auth/otp/request`, `/otp/verify`, `/refresh`, and `/logout`.
- Produces 15-minute access tokens and rotating 30-day refresh-token families; reuse revokes the token family.

- [x] Write failing tests for generic OTP request responses, resend cooldown, per-phone/IP attempt limits, auto-creation as customer only, six-digit validation, refresh rotation, reuse detection, logout, inactive-user rejection, and safe production configuration.
- [x] Run `pytest backend/tests/unit/auth backend/tests/api/test_auth.py -q`; confirm failures precede implementation.
- [x] Implement the deterministic fake provider, Twilio adapter boundary, Redis rate limiter, asymmetric access-token signing, hashed refresh tokens, rotation, and revocation.
- [x] Ensure admin/technician accounts use the same OTP flow but can only receive those roles through admin/bootstrap actions.
- [x] Run focused tests, contract tests without network, full backend tests, lint, and type checks.
- [x] Commit with `feat: implement phone OTP authentication`.

### Phase 1 acceptance criteria

- A seeded or new customer can request and verify a local OTP and receives a usable session.
- A new phone can never self-select admin or technician.
- Refresh-token rotation and reuse detection work, logout revokes the session, and rate limits are covered by deterministic tests.
- Cross-user addresses and role-protected routes are inaccessible.

---

# Phase 2: Catalog, inventory, and carts

### Task 5: Build catalog and machine-model configuration

**Files:**
- Create: `backend/src/coffix/catalog/{models,schemas,repository,service,router}.py`
- Create: `backend/src/coffix/machines/models.py`
- Create: `backend/migrations/versions/0003_catalog_and_machine_models.py`
- Test: `backend/tests/unit/catalog/test_catalog_rules.py`
- Test: `backend/tests/integration/catalog/test_catalog_repository.py`, `backend/tests/api/test_catalog.py`

**Interfaces:**
- Produces authenticated customer reads for categories, lists, and product detail.
- Produces admin CRUD services for categories, products, SKUs, prices, activation, featured state, and machine-model mappings.
- A SKU exposes `price_agorot: int`, `stock_quantity: int | None`, and `machine_model_id: UUID | None`.

- [x] Write failing tests for authenticated browsing, inactive-resource hiding, pagination/filter allowlists, non-negative ILS price, nullable stock, SKU uniqueness, and model warranty defaults.
- [x] Add catalog and machine-model tables plus indexes/constraints in migration `0003`.
- [x] Implement thin customer routes and admin-ready application services; keep stock mutation out of generic catalog updates.
- [x] Run catalog tests, the migration suite, all backend tests, lint, and type checks.
- [x] Commit with `feat: add product catalog and machine models`.

### Task 6: Implement atomic inventory reservations

**Files:**
- Create: `backend/src/coffix/inventory/{models,repository,service}.py`
- Create: `backend/migrations/versions/0004_stock_reservations.py`
- Test: `backend/tests/unit/inventory/test_inventory_rules.py`
- Test: `backend/tests/integration/inventory/test_reservation_concurrency.py`

**Interfaces:**
- Produces `reserve(cart_id, sku_id, desired_quantity, expires_at) -> ReservationResult`.
- Produces `release_cart(cart_id)`, `transfer_to_order(cart_id, order_id, expires_at)`, and `consume_order(order_id)` as idempotent transaction-scoped operations.
- Raises stable conflicts `INSUFFICIENT_STOCK`, `SKU_INACTIVE`, and `RESERVATION_EXPIRED`.

- [x] Write failing unit tests for unlimited stock, tracked stock, increases/decreases, removal, and idempotent release/consume.
- [x] Write a real PostgreSQL concurrency test that starts simultaneous reservations against one SKU and asserts the successful total never exceeds `stock_quantity`.
- [x] Add reservation tables/indexes and implement SKU row locking with short transactions and authoritative active-reservation quantities.
- [x] Run the concurrency test repeatedly, then the inventory and migration suites.
- [x] Add metrics hooks for reserve/release/conflict events without adding the observability backend yet.
- [x] Commit with `feat: enforce atomic stock reservations`.

### Task 7: Implement server-owned carts and expiration

**Files:**
- Create: `backend/src/coffix/carts/{models,schemas,repository,service,router}.py`
- Create: `backend/src/coffix/worker/{main,expiration}.py`
- Create: `backend/migrations/versions/0005_carts.py`
- Test: `backend/tests/unit/carts/test_cart_rules.py`
- Test: `backend/tests/integration/carts/test_cart_expiration.py`, `backend/tests/api/test_cart.py`

**Interfaces:**
- Produces `GET /api/v1/cart`, item add/set/delete routes, server totals, and `expires_at`.
- Produces `expire_carts(now: datetime, batch_size: int) -> ExpirationSummary` using `FOR UPDATE SKIP LOCKED`.
- Cart mutation refreshes `last_activity_at` and `expires_at = now + 60 minutes`.

- [x] Write failing tests for one active cart per customer, authenticated ownership, add/increase/decrease/remove, server price calculation, expired-cart access, inactivity refresh, and synchronous release.
- [x] Add cart/item tables and constraints; implement service methods that call inventory in the same transaction.
- [x] Implement the idempotent expiration batch and worker loop with injectable clock and graceful shutdown.
- [x] Run focused tests with a fake clock, then integration/concurrency tests and the full backend suite.
- [x] Manually use two local customer sessions to confirm insufficient stock reconciles both returned carts correctly.
- [x] Commit with `feat: add expiring reserved carts`.

### Phase 2 acceptance criteria

- Authenticated customers can browse active catalog data and manage one server cart.
- Null stock behaves as unlimited; tracked stock cannot be oversold under concurrent requests.
- Cart mutations extend expiration to one hour, expired carts release reservations synchronously and through the worker, and releases are idempotent.
- Catalog administrators have service-layer operations ready for later dashboard routes without direct inventory bypass.

---

# Phase 3: Product payments, orders, refunds, and purchased machines

### Task 8: Create the provider-independent payment subsystem

**Files:**
- Create: `backend/src/coffix/payments/{models,schemas,providers,repository,service,router}.py`
- Create: `backend/src/coffix/payments/adapters/{fake,stripe}.py`
- Create: `backend/migrations/versions/0006_payments_and_provider_events.py`
- Test: `backend/tests/unit/payments/test_payment_service.py`
- Test: `backend/tests/api/test_payment_webhooks.py`, `backend/tests/contract/test_stripe_adapter.py`

**Interfaces:**
- Implements `PaymentProvider` from Section 3.
- Produces payment phases `order`, `diagnostic`, and `additional` with one idempotent provider-event processor.
- Produces `POST /api/v1/webhooks/stripe` and test-only fake webhook helpers guarded by `APP_ENV=test`.

- [x] Write failing tests for integer amount validation, idempotency-key reuse with mismatched payloads, signature rejection, duplicate events, out-of-order events, pending/confirmed/failed states, and raw-body verification.
- [x] Add payments, refunds, and provider-event tables with unique provider IDs and event IDs.
- [x] Implement the fake provider and Stripe adapter without letting provider objects enter domain services.
- [x] Implement transaction-safe event processing that records every verified event and calls a registered owner-phase handler exactly once.
- [x] Run focused, API, and contract tests using synthetic fixtures; do not require network access.
- [x] Commit with `feat: add idempotent payment processing`.

### Task 9: Implement checkout, order lifecycle, tracking, cancellation, and full refund

**Files:**
- Create: `backend/src/coffix/orders/{models,schemas,state_machine,repository,service,router}.py`
- Create: `backend/migrations/versions/0007_orders.py`
- Extend: `backend/src/coffix/worker/expiration.py`, `backend/src/coffix/payments/service.py`
- Test: `backend/tests/unit/orders/test_order_state_machine.py`, `test_totals.py`
- Test: `backend/tests/integration/orders/test_checkout_transaction.py`, `backend/tests/api/test_orders.py`

**Interfaces:**
- Produces idempotent `POST /api/v1/checkout`, customer order list/detail, and admin order commands.
- Transfers cart reservations to `pending_payment` orders for 30 minutes; payment success consumes stock exactly once.
- Produces admin-only processing/shipping/delivery/cancel/full-refund actions and one shipment per order.

- [x] Write failing tests for immutable item/address/price snapshots, server totals, flat shipping, reservation transfer, unpaid expiry, duplicate checkout, payment success/failure, customer cancellation denial, admin transitions, tracking validation, and full-refund confirmation.
- [x] Add order, item, history, and shipment tables; index customer/time, state/age, order number, and payment deadline.
- [x] Implement checkout and order payment handler so payment confirmation, stock consumption, history, and outbox records share one transaction.
- [x] Implement admin-only state commands; require reason and confirmation context for cancellation/refund; mark refunded only after provider confirmation.
- [x] Extend the worker to expire unpaid orders and add reconciliation entry points for unknown provider outcomes.
- [x] Run focused tests, repeated webhook/idempotency tests, the backend suite, lint, and types.
- [x] Commit with `feat: implement product checkout and orders`.

### Task 10: Auto-register purchased coffee machines

**Files:**
- Create: `backend/src/coffix/machines/{schemas,repository,service}.py`
- Create: `backend/migrations/versions/0008_registered_machines.py`
- Extend: `backend/src/coffix/orders/service.py`
- Test: `backend/tests/unit/machines/test_warranty.py`
- Test: `backend/tests/integration/machines/test_order_registration.py`

**Interfaces:**
- Produces one `registered_machines` row per purchased machine unit after order payment confirmation.
- Snapshots model warranty duration with default 12 months and supports `serial_pending` until completed.
- Provides idempotent `register_order_machines(order_id) -> list[MachineId]`.

- [x] Write failing tests for multi-quantity purchases, non-machine SKUs, duplicate payment events, warranty date snapshots, later model-policy changes, and serial-pending records.
- [x] Add machine-registration tables and unique model/serial constraint when serial exists.
- [x] Implement idempotent registration in the order-finalization transaction and append auditable source linkage to order items.
- [x] Run focused tests, order webhook tests, migrations, and the full backend suite.
- [x] Commit with `feat: register machines from paid orders`.

### Phase 3 acceptance criteria

- A reserved cart becomes an immutable pending order and cannot lose its stock during the 30-minute payment window.
- Verified payment finalizes exactly once, consumes tracked stock, closes the cart, and creates qualifying machine registrations.
- Unpaid orders expire and release holds; unknown provider results stay pending for reconciliation.
- Customers cannot cancel orders; admins can process, ship, deliver, cancel unpaid orders, and request only full refunds.

---

# Phase 4: Media, manual machines, and complete service workflow

### Task 11: Add private media storage and upload authorization

**Files:**
- Create: `backend/src/coffix/media/{models,schemas,store,service,router}.py`
- Create: `backend/src/coffix/media/adapters/{local,s3}.py`
- Create: `backend/migrations/versions/0009_media.py`
- Test: `backend/tests/unit/media/test_media_policy.py`
- Test: `backend/tests/contract/media/test_local_store.py`, `test_s3_store.py`, `backend/tests/api/test_media.py`

**Interfaces:**
- Implements `MediaStore` from Section 3.
- Produces authenticated create-upload and complete-upload endpoints plus authorized download URLs.
- Enforces five service files, 10 MB images, 100 MB videos, and allowed MIME/signature combinations.

- [x] Write failing tests for size/count/type rejection, object-key traversal, wrong-owner completion/download, incomplete upload cleanup, short-lived URLs, and production public-bucket rejection.
- [x] Add upload/media metadata tables with ownership and lifecycle states.
- [x] Implement local private storage and S3 presigned operations behind the same contract; use generated opaque object keys.
- [x] Add route/service ownership policies and safe cleanup jobs for abandoned uploads.
- [x] Run unit/API/contract tests using local storage and an S3 fake or MinIO contract target.
- [x] Commit with `feat: add private media uploads`.

### Task 12: Add manual machine registration and ownership APIs

**Files:**
- Extend: `backend/src/coffix/machines/{schemas,repository,service}.py`
- Create: `backend/src/coffix/machines/router.py`
- Test: `backend/tests/unit/machines/test_manual_registration.py`
- Test: `backend/tests/api/test_machines.py`

**Interfaces:**
- Produces customer machine list/detail/create/update-serial operations and service history projection.
- Manual registrations always have no Coffix warranty.
- Duplicate model/serial returns `MACHINE_SERIAL_ALREADY_REGISTERED` without leaking the existing owner.

- [x] Write failing tests for ownership, supported active models, normalized serial uniqueness, optional purchase date/media, manual no-warranty rule, serial completion, and hidden foreign machines.
- [x] Implement registration and queries, including admin resolution hooks for disputed serials.
- [x] Ensure app-purchased warranty snapshots cannot be overwritten through customer updates.
- [x] Run machine/API tests, full backend suite, lint, and types.
- [x] Commit with `feat: add customer machine registration`.

### Task 13: Implement service types, requests, fees, state machine, and notes

**Files:**
- Create: `backend/src/coffix/service/{models,schemas,state_machine,repository,service,router}.py`
- Create: `backend/migrations/versions/0010_service_requests.py`
- Test: `backend/tests/unit/service/test_state_machine.py`, `test_fee_snapshot.py`
- Test: `backend/tests/api/test_service_requests.py`

**Interfaces:**
- Produces customer service create/list/detail/cancel APIs and admin service-type configuration.
- Produces the exact states in `docs/spec.md` Section 8.2 and actor-specific `allowed_actions`.
- A request snapshots diagnostic amount, shop/pickup address, preferred window, and machine/customer ownership.

- [x] Write a table-driven failing test for every allowed and forbidden state transition by customer, admin, technician, and system.
- [x] Write failing tests for registered-machine ownership, supported service/model combinations, location/address rules, diagnostic-fee snapshot, preferred window, prepayment-only cancellation, note visibility, and media ownership.
- [x] Add service type/mapping, request, quote, note, media-link, and history tables with state/age indexes.
- [x] Implement create/read/cancel operations and one transition service that always writes history and outbox records transactionally.
- [x] Return `allowed_actions` from request projections and stable errors for invalid transitions.
- [x] Run state/API/migration tests and the full backend suite.
- [x] Commit with `feat: add machine service request lifecycle`.

### Task 14: Add two-phase service payment, scheduling, quotes, and technician jobs

**Files:**
- Create: `backend/src/coffix/scheduling/{schemas,repository,service}.py`
- Extend: `backend/src/coffix/service/{service,router}.py`
- Extend: `backend/src/coffix/payments/service.py`
- Test: `backend/tests/unit/service/test_quote_decisions.py`
- Test: `backend/tests/integration/service/test_service_payments.py`, `backend/tests/api/test_admin_service.py`, `test_technician_jobs.py`

**Interfaces:**
- Produces diagnostic PaymentIntent creation, quote accept/decline, additional PaymentIntent creation, and phase-specific webhook handlers.
- Produces admin appointment confirmation/assignment with overlap warnings but no blocking.
- Produces assigned-technician job list/detail, allowed status changes, notes, and media.

- [x] Write failing tests proving appointment/assignment/diagnosis cannot occur before diagnostic payment and repair cannot occur before required additional payment.
- [x] Write failing tests for diagnostic non-refundability, one active quote, accept then payment, decline then cancellation/fee retention, no-cost repair, overlapping schedule warning, unassigned technician denial, and technician transition restrictions.
- [x] Implement payment phase handlers, quote commands, appointment/assignment service, overlap query, and technician projections.
- [x] Require admin/system control for money-gated transitions and preserve all provider/admin/technician history.
- [x] Run focused tests, duplicate/out-of-order webhook tests, the full backend suite, lint, and types.
- [x] Commit with `feat: complete service payments and scheduling`.

### Phase 4 acceptance criteria

- Customers can manually register owned machines and submit service requests with protected media, location, address, and preferred window.
- Diagnostic payment gates review/scheduling/work, and service payment is never routed through refund code.
- Additional cost can be accepted and paid or declined and cancelled with diagnostic fee retained.
- Admin schedule overlaps produce a warning but remain allowed; technicians see only assigned jobs and permitted actions.
- All service transitions are auditable and return actor-specific next actions.

---

# Phase 5: Notifications, admin APIs, seed data, and backend contract freeze

### Task 15: Implement the outbox, in-app notifications, and push delivery

**Files:**
- Create: `backend/src/coffix/notifications/{models,schemas,providers,repository,service,router}.py`
- Create: `backend/src/coffix/notifications/adapters/{fake,fcm}.py`
- Create: `backend/src/coffix/worker/{outbox,notifications}.py`
- Create: `backend/migrations/versions/0011_notifications_outbox_audit.py`
- Test: `backend/tests/unit/notifications/test_notification_mapping.py`
- Test: `backend/tests/integration/notifications/test_outbox_delivery.py`, `backend/tests/api/test_notifications.py`

**Interfaces:**
- Implements `PushProvider` from Section 3.
- Produces notification list/unread count/mark-read and device-token registration APIs.
- Produces at-least-once outbox claiming with idempotent notification creation and bounded delivery retries.

- [x] Write failing tests for each material order/service/payment event, unread counts, ownership, duplicate outbox delivery, retry/backoff, invalid-token deactivation, dead-letter visibility, and mandatory-notification behavior.
- [x] Add notification, delivery, device-token, outbox, and audit tables.
- [x] Implement transactional outbox writes in earlier services, `SKIP LOCKED` claiming, fake/FCM providers, retry policy, and safe payload logging.
- [x] Run focused tests, worker-restart tests, and the full backend suite.
- [x] Commit with `feat: add durable notifications and push delivery`.

### Task 16: Complete admin APIs, health, metrics hooks, seed data, and OpenAPI

**Files:**
- Create: `backend/src/coffix/admin/{schemas,queries,router}.py`
- Create: `backend/src/coffix/health/{schemas,router,checks}.py`
- Create: `backend/src/coffix/core/metrics.py`, `backend/src/coffix/seed.py`
- Extend: `backend/src/coffix/api/app.py`
- Create: `backend/tests/api/test_admin.py`, `test_health.py`, `test_openapi.py`
- Create: `backend/tests/integration/test_seed.py`
- Create: `packages/api-client/openapi.json`, `packages/api-client/src/generated.ts`, `scripts/generate-api-client.sh`

**Interfaces:**
- Produces `/health/live`, `/health/ready`, worker heartbeat/readiness, admin dashboard/queue queries, user/role management, stock corrections, configuration, and audit lookup.
- Produces deterministic seed identities and data documented by command output, not hard-coded into production startup.
- Freezes `/api/v1` OpenAPI names used by mobile/admin and generates TypeScript types.

- [x] Write failing tests for liveness without dependencies, readiness with database/migration failure, worker lag, admin-only access, audit creation, dashboard state counts, safe role changes, stock correction, and idempotent seed execution.
- [x] Implement admin query/read models and commands by calling domain services; do not duplicate transition logic in the admin module.
- [x] Implement health and instrumentation hooks, including build/migration version and dependency timeouts.
- [x] Add a deterministic seed command for initial admin, technician, customer, catalog, models, services, machines, orders, requests, and all meaningful UI states.
- [x] Generate OpenAPI and TypeScript types; add a drift test that fails when generated content is stale.
- [x] Run all backend tests, migration/seed twice, OpenAPI drift, lint, type checks, and a local smoke script.
- [x] Commit with `feat: stabilize backend API and development data`.

### Phase 5 acceptance criteria

- Every material state change creates an in-app notification and durable push attempt without coupling provider availability to the transaction.
- Admin APIs cover all MVP operational capabilities and call domain services rather than bypassing rules.
- Health endpoints distinguish liveness, readiness, and worker lag; metric hooks exist for later collection.
- Seed data is repeatable and includes every mobile/admin state needed for implementation.
- The versioned OpenAPI contract passes drift tests and is stable enough for frontend work.

---

# Phase 6: Expo mobile foundation, design system, navigation, and authentication

### Task 17: Scaffold Expo and encode the design handoff as reusable primitives

**Files:**
- Create: `mobile/app/_layout.tsx`, `mobile/app/(auth)/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`
- Create: `mobile/src/theme/{colors,typography,spacing,radii,shadows,index}.ts`
- Create: `mobile/src/components/{Screen,Text,Button,Input,Card,Pill,IconButton,BottomTabs}.tsx`
- Create: `mobile/src/i18n/he.ts`, `mobile/src/platform/rtl.ts`
- Create: `mobile/tests/theme.test.ts`, `mobile/tests/components/rtl.test.tsx`
- Modify: `mobile/app.json`, `mobile/package.json`

**Interfaces:**
- Produces the five tabs `בית`, `חנות`, `שירות`, `הזמנות`, and `פרופיל`, each with an independent stack.
- Produces design tokens matching the Warm & Artisanal handoff and logical RTL layout primitives.
- Expo starts with RTL enabled before authenticated screens render.

- [x] Write failing tests that assert exact approved color tokens, core type scale, logical start/end spacing, RTL tab order, Hebrew labels, accessible button/input roles, and supported text scaling.
- [x] Run the mobile test command and confirm failures are caused by missing theme/navigation components.
- [x] Configure Expo Router, fonts, splash assets, app scheme, RTL initialization, and the shared design system; use the handoff HTML only as reference.
- [x] Implement tab and stack shells with instant tab changes and RTL push transitions matching the handoff.
- [x] Render primitives in a development gallery route excluded from production navigation and visually compare them on iOS and Android against the design handoff.
- [x] Run mobile tests, lint, TypeScript, and an Expo configuration check.
- [x] Commit with `feat: establish Hebrew RTL mobile design system`.

### Task 18: Add generated API transport and OTP authentication screens

**Files:**
- Create: `packages/api-client/src/{client,auth,index}.ts`
- Create: `mobile/src/api/{client,queryClient,errors}.ts`
- Create: `mobile/src/features/auth/{store,api,useSession}.ts`
- Create: `mobile/app/(auth)/{index,welcome,phone,otp}.tsx`
- Create: `mobile/tests/auth/{phone,otp,session}.test.tsx`

**Interfaces:**
- Consumes the Phase 5 OpenAPI types and `TokenStore` contract.
- Uses Expo SecureStore for mobile refresh/access material and refreshes once on `401` without retry loops.
- Produces authenticated route guards and logout that clears local credentials/query data.

- [x] Write failing tests for `+972` normalization feedback, OTP six-box focus/auto-submit, resend timer, generic server errors, secure persistence, boot refresh, expired/revoked refresh, logout, and new-customer navigation.
- [x] Implement the shared generated client wrapper, ApiProblem mapping to reviewed Hebrew copy, and correlation-ID capture for support screens.
- [x] Implement Splash, Welcome, Phone, and OTP to match the handoff's layout, typography, RTL digit behavior, button feedback, and keyboard handling.
- [x] Run component tests with the fake API, then connect to the local backend fake OTP and verify one real device/emulator login.
- [x] Run mobile tests, TypeScript, lint, and accessibility assertions.
- [x] Commit with `feat: add mobile OTP authentication`.

### Phase 6 acceptance criteria

- The Expo app starts on iOS and Android in Hebrew RTL with the exact five-tab shell and approved Warm & Artisanal tokens.
- Authentication uses the real local FastAPI contract and fake OTP provider; sessions survive restart in SecureStore and refresh safely.
- Common components meet accessible role, contrast, target-size, and text-scaling expectations.
- No production screen imports prototype HTML or remote implementation code.

---

# Phase 7: Mobile commerce, checkout, and orders

### Task 19: Implement home, categories, product list, and product detail

**Files:**
- Create: `mobile/app/(tabs)/(home)/{_layout,index}.tsx`
- Create: `mobile/app/(tabs)/(shop)/{_layout,index,categories,products/[categoryId],product/[productId]}.tsx`
- Create: `mobile/src/features/catalog/{api,queries,types}.ts`
- Create: `mobile/src/features/catalog/useDebouncedSearch.ts`
- Create: `mobile/src/components/{ProductCard,ProductGrid,QuantityStepper,EmptyState,ErrorState}.tsx`
- Test: `mobile/tests/catalog/{api,home,categories,productSearch,productList,productDetail}.test.tsx`
- Modify: `backend/src/coffix/catalog/{models,schemas,repository,router}.py`
- Modify: `backend/src/coffix/seed.py`
- Test: `backend/tests/{api/test_catalog,integration/catalog/test_catalog_repository}.py`

**Interfaces:**
- Consumes authenticated catalog and activity-summary endpoints from the frozen client.
- Extends the product collection with optional server-side `q` search and category responses with persisted icon metadata plus computed active-product counts.
- Product detail passes only SKU ID and desired quantity to cart mutation; it never supplies authoritative price or stock.

- [x] Write failing tests for loading/error/empty states, product search, inactive/unavailable presentation, pagination, source-aware navigation, category counts/images/icons, product imagery/accessibility, quantity limits, and authentication expiry.
- [x] Implement the default Editorial home, searchable category grid, product list, and detail using design tokens and handoff copy/spacing; keep categories API-driven and seed six representative demo categories.
- [x] Add query keys and cache invalidation scoped by user and resource; clear private cache on logout.
- [x] Compare screenshots at representative iOS/Android sizes to the handoff and record review results in the task/PR, not a new planning document.
- [x] Run mobile tests, TypeScript, lint, and local API smoke navigation.
- [x] Commit with `feat: build mobile catalog experience`.

### Task 20: Implement reserved cart and checkout payment

**Files:**
- Create: `mobile/app/(tabs)/(shop)/{cart,checkout,confirmation}.tsx`
- Create: `mobile/src/features/cart/{api,queries,mutations,expiry}.ts`
- Create: `mobile/src/features/payments/{stripe,fake,usePayment}.ts`
- Create: `mobile/src/features/addresses/{api,form}.ts`
- Test: `mobile/tests/cart/{cart,expiration,conflict}.test.tsx`
- Test: `mobile/tests/checkout/{address,payment,confirmation}.test.tsx`

**Interfaces:**
- Consumes server cart totals and `expires_at`; countdown is informational and server reconciliation is authoritative.
- Uses `Idempotency-Key` for checkout/payment creation and Stripe React Native SDK only when provider mode requires it.

- [x] Write failing tests for optimistic quantity update, server rollback on `INSUFFICIENT_STOCK`, removal, expiry/reload, price change, address validation, duplicate submit prevention, pending/declined/unknown/success payment, and confirmation deep link.
- [x] Implement cart presentation from the handoff, with a visible expiration explanation and serialized mutations per SKU to prevent local races.
- [x] Implement Israeli address selection/form and server-authoritative order summary.
- [x] Implement fake and Stripe payment confirmation paths; never mark success until the order endpoint reflects verified payment.
- [x] Run component tests and one local end-to-end purchase using fake provider events, including an intentional duplicate success event.
- [x] Run mobile tests, lint, types, and accessibility checks.
- [x] Commit with `feat: add mobile cart and checkout`.

### Task 21: Implement product order list and tracking detail

**Files:**
- Create: `mobile/app/(tabs)/(orders)/{_layout,index,[orderId]}.tsx`
- Create: `mobile/src/features/orders/{api,queries,status}.ts`
- Create: `mobile/src/components/{StatusTimeline,OrderCard,TrackingCard}.tsx`
- Test: `mobile/tests/orders/{list,detail}.test.tsx`

**Interfaces:**
- Consumes customer-only order list/detail and status histories.
- Exposes no cancel/refund action; tracking URL opens only after scheme/host validation by the backend and safe client handling.

- [x] Write failing tests for order filters, status Hebrew labels, immutable item snapshots, missing/manual tracking, timeline ordering, pull-to-refresh, foreign-order errors, and absence of cancel controls.
- [x] Implement order list/detail and confirmation navigation to match handoff hierarchy and status styling.
- [x] Add notification-driven invalidation for changed order IDs without replacing pull-to-refresh.
- [x] Run focused tests and verify paid, processing, shipped, delivered, expired, and refunded seed states locally.
- [x] Commit with `feat: add mobile order tracking`.

### Phase 7 acceptance criteria

- A logged-in customer can complete the entire local commerce path from catalog to verified order confirmation.
- Cart conflicts and expiry reconcile cleanly with the server; prices and stock are never trusted from client state.
- Order history and manual tracking render correctly, and the mobile app offers no customer cancellation/refund path.
- Representative commerce screens closely match the existing high-fidelity design on iOS and Android.

---

# Phase 8: Mobile machines, service, notifications, and profile

### Task 22: Implement machines and manual registration

**Files:**
- Create: `mobile/app/(tabs)/(service)/{_layout,index,machines/[machineId],register}.tsx`
- Create: `mobile/src/features/machines/{api,queries,form,warranty}.ts`
- Create: `mobile/src/features/media/{picker,uploader}.ts`
- Test: `mobile/tests/machines/{list,detail,register}.test.tsx`

**Interfaces:**
- Consumes machine list/detail/create/serial-completion APIs and media upload lifecycle.
- Displays server-provided warranty status; never calculates eligibility solely on device.

- [ ] Write failing tests for empty/list states, order/manual badges, warranty/no-warranty/pending-serial display, supported-model selection, duplicate serial error, photo upload progress/retry, and ownership failures.
- [ ] Implement machines list/detail and registration screens to match the handoff, including service history and Hebrew validation.
- [ ] Implement image selection/compression/normalization, upload completion, cancellation cleanup, and accessibility descriptions.
- [ ] Run focused tests and register both manual and serial-pending purchased machines against local seed data.
- [ ] Commit with `feat: add mobile machine management`.

### Task 23: Implement service intake, two payments, and status tracking

**Files:**
- Create: `mobile/app/(tabs)/(service)/request/{machineId,type,issue,location,review,confirmation}.tsx`
- Create: `mobile/app/(tabs)/(service)/requests/[requestId].tsx`
- Create: `mobile/src/features/service/{api,queries,intakeStore,status,payments}.ts`
- Create: `mobile/src/components/{ServiceStepper,AppointmentCard,QuoteCard,MediaGrid}.tsx`
- Test: `mobile/tests/service/{intake,diagnosticPayment,quote,status}.test.tsx`

**Interfaces:**
- Consumes `allowed_actions` from the backend and does not reproduce transition authorization locally.
- Preferred time is labeled as a request; confirmed appointment appears only after admin action.
- Uses distinct diagnostic and additional payment commands/idempotency keys.

- [ ] Write failing tests for supported service types, issue/media limits, bring-in/pickup address rules, preferred-window wording, fee snapshot review, prepayment cancel, diagnostic gate, quote accept/decline, additional-payment gate, and all status timeline states.
- [ ] Implement the handoff's default stepper variant with persisted draft state scoped to the selected machine; clear it after submission/logout.
- [ ] Implement service detail actions strictly from server `allowed_actions`, with non-refundable payment copy and explicit quote decision confirmation.
- [ ] Connect media uploads and payment flows; reconcile unknown results by refetching rather than assuming failure or success.
- [ ] Run tests and local flows for no-extra-cost repair, paid extra cost, declined quote, and attempted forbidden transition.
- [ ] Commit with `feat: add mobile service workflow`.

### Task 24: Implement notifications, profile, addresses, and mobile quality pass

**Files:**
- Create: `mobile/app/notifications.tsx`, `mobile/app/(tabs)/(profile)/{_layout,index,addresses}.tsx`
- Create: `mobile/src/features/notifications/{api,push,queries}.ts`
- Extend: `mobile/src/features/addresses/`
- Test: `mobile/tests/notifications/notifications.test.tsx`, `mobile/tests/profile/profile.test.tsx`
- Test: `mobile/tests/accessibility/app.test.tsx`, `mobile/tests/visual/criticalScreens.test.tsx`

**Interfaces:**
- Registers/deactivates FCM device tokens after session changes and uses push payloads only as invalidation hints.
- Produces unread badge, list/read behavior, saved-address management, profile display, and logout.

- [ ] Write failing tests for unread count, mark-read, duplicate push, invalid token, deep links, session-bound device tokens, address ownership/defaults, logout cleanup, RTL traversal order, text scaling, and reduced-motion behavior.
- [ ] Implement notifications/profile screens from the handoff and safe deep-link routing that verifies ownership through the API.
- [ ] Add FCM/Expo notification permission flow without an MVP opt-out setting; handle OS denial with an explanatory state.
- [ ] Run the full mobile suite and visual/accessibility review across all 21 handoff screens and meaningful backend states.
- [ ] Fix design drift in shared tokens/components before applying screen-specific exceptions.
- [ ] Commit with `feat: complete customer mobile MVP`.

### Phase 8 acceptance criteria

- A customer can register a machine, submit media, choose bring-in/pickup and a preferred window, pay diagnostic/additional fees, and track service to completion.
- Warranty and allowed actions are server-owned and displayed accurately.
- Notifications update unread state and deep-link safely; profile/address/logout behavior is complete.
- All 21 handoff screens or their specified equivalents pass Hebrew RTL, accessibility, and representative visual review.

---

# Phase 9: React admin and technician dashboard

### Task 25: Scaffold the dashboard, web OTP session, permissions, and application shell

**Files:**
- Create: `admin/src/{main,router}.tsx`, `admin/src/app/{AppShell,AuthGuard,RoleGuard}.tsx`
- Create: `admin/src/api/{client,queryClient,errors}.ts`
- Create: `admin/src/features/auth/{api,OtpLogin,useWebSession}.tsx`
- Create: `admin/src/components/{DataTable,FormField,ConfirmAction,ProblemBanner,StatusBadge}.tsx`
- Test: `admin/tests/auth.test.tsx`, `admin/tests/permissions.test.tsx`

**Interfaces:**
- Consumes generated OpenAPI types and uses OTP for admin/technician.
- Keeps access token in memory and refresh token in a Secure, HttpOnly, SameSite cookie issued by the backend web-session flow.
- Route guards improve UX; backend authorization remains authoritative.

- [ ] Write failing tests for admin/technician OTP login, customer rejection, refresh/logout, CSRF/origin behavior, hidden routes, direct unauthorized navigation, stable error rendering, and destructive confirmation semantics.
- [ ] Add the backend web refresh-cookie option and CSRF/origin tests without weakening mobile token behavior.
- [ ] Implement the React application shell, accessible navigation, generated client, table/form primitives, and role guards.
- [ ] Run admin unit tests, backend auth regressions, types, lint, and one local browser login per staff role.
- [ ] Commit with `feat: establish staff dashboard foundation`.

### Task 26: Build catalog, inventory, and order operations

**Files:**
- Create: `admin/src/features/catalog/{CategoryList,ProductList,ProductEditor,SkuEditor}.tsx`
- Create: `admin/src/features/inventory/{StockList,StockAdjustment}.tsx`
- Create: `admin/src/features/orders/{OrderList,OrderDetail,ShipmentForm,RefundAction}.tsx`
- Test: `admin/tests/catalog.test.tsx`, `inventory.test.tsx`, `orders.test.tsx`
- Test: `admin/tests/e2e/commerce.spec.ts`

**Interfaces:**
- Uses domain command endpoints for stock adjustment and order transitions, never generic record patches.
- Destructive/monetary actions show record, amount, effect, and require a reason when the API requires one.

- [ ] Write failing tests for category/product/SKU validation, nullable stock, reservation visibility, concurrent edit conflict, paid-order queues, tracking, forbidden transition, customer-cancel absence, and full-refund confirmation/outcome.
- [ ] Implement catalog editors and inventory views with server pagination/filtering and optimistic-concurrency versions.
- [ ] Implement order queues/detail/status history, shipment entry, cancellation, and full refund with provider-pending handling.
- [ ] Run component tests and Playwright commerce operations against local seed/API.
- [ ] Verify a technician cannot access any commerce route via UI or direct API.
- [ ] Commit with `feat: add admin commerce operations`.

### Task 27: Build service, scheduling, technician, configuration, and dashboard operations

**Files:**
- Create: `admin/src/features/service/{ServiceQueue,ServiceDetail,QuoteForm,AppointmentForm,AssignmentForm}.tsx`
- Create: `admin/src/features/technicians/{TechnicianList,AssignedJobs,JobDetail}.tsx`
- Create: `admin/src/features/config/{MachineModels,ServiceTypes,ShopSettings}.tsx`
- Create: `admin/src/features/dashboard/Overview.tsx`
- Create: `admin/src/features/operations/{NotificationFailures,AuditLog}.tsx`
- Test: `admin/tests/service.test.tsx`, `technician.test.tsx`, `dashboard.test.tsx`
- Test: `admin/tests/e2e/service.spec.ts`, `permissions.spec.ts`

**Interfaces:**
- Admin service controls render from `allowed_actions`; schedule overlap warnings allow explicit continuation.
- Technician routes show only assigned jobs and permitted operational transitions.

- [ ] Write failing tests for diagnostic-payment gate, fee snapshot, appointment confirmation, overlap warning/continue, assignment, quote creation, additional-payment wait, no-cost path, internal/customer note visibility, dashboard counts, notification retry, and audit filtering.
- [ ] Implement service queues/detail/configuration and force confirmations for quotes, schedule overlaps, assignment changes, and terminal transitions.
- [ ] Implement responsive technician list/detail with assigned-only data, notes/media, and status controls.
- [ ] Implement overview and operations screens using backend read models; no client-side aggregation of authoritative statistics.
- [ ] Run component and Playwright flows for admin and technician roles, including direct unauthorized URL/API attempts.
- [ ] Commit with `feat: complete admin and technician dashboard`.

### Phase 9 acceptance criteria

- Admins can perform every MVP catalog, stock, order, refund, service, pricing, schedule, assignment, configuration, role, notification, and audit operation without database access.
- Technicians can use assigned jobs comfortably on a mobile browser and cannot access other jobs or admin capabilities.
- Payment and destructive actions require explicit confirmations and show pending provider outcomes safely.
- Backend authorization tests and browser permission tests agree for every role.

---

# Phase 10: Full local end-to-end verification and hardening

### Task 28: Build deterministic cross-application E2E fixtures

**Files:**
- Create: `e2e/fixtures/{users,catalog,commerce,service}.ts`
- Create: `e2e/helpers/{clock,fakeProviders,dbReset}.ts`
- Create: `scripts/e2e-local.sh`, `compose.e2e.yaml`
- Test: `e2e/specs/auth.spec.ts`, `commerce.spec.ts`, `service.spec.ts`, `permissions.spec.ts`

**Interfaces:**
- Produces one command that starts isolated services, migrates, seeds, runs backend/admin flows, and prepares a deterministic mobile E2E endpoint.
- Test-only clock/provider controls require `APP_ENV=test` and a separate secret; production startup rejects them.

- [ ] Write the E2E harness test that initially fails because the isolated stack and reset contract do not exist.
- [ ] Implement isolated database/Redis/media volumes, migration/seed reset, deterministic clock, and signed fake provider events.
- [ ] Add end-to-end scenarios for OTP, stock contention, paid order/machine registration, unpaid expiry, admin refund, manual machine, diagnostic/no-extra-cost service, paid extra cost, declined quote, notifications, and technician assignment.
- [ ] Add negative scenarios for cross-customer access, technician escalation, customer order cancellation, service cancellation after payment, service refund, and repair before extra payment.
- [ ] Run the entire local suite twice from clean state and verify identical results.
- [ ] Commit with `test: add deterministic local end-to-end flows`.

### Task 29: Perform local performance, resilience, security, and design acceptance

**Files:**
- Create: `e2e/load/{inventory,api}.js`
- Create: `e2e/resilience/{workerRestart,redisOutage,duplicateWebhook}.spec.ts`
- Create: `scripts/security-local.sh`, `scripts/smoke-local.sh`
- Modify: affected backend/mobile/admin tests and implementation files based on findings

**Interfaces:**
- Produces repeatable smoke, concurrency-load, dependency-failure, and local security commands for CI reuse.

- [ ] Establish and record command-level acceptance: concurrent reservations never oversell; normal local API p95 stays below two seconds under the agreed test profile; worker restart does not lose outbox events.
- [ ] Run duplicate/out-of-order webhooks, worker termination, temporary Redis loss, PostgreSQL connection exhaustion simulation, expired-cart backlog, and media rejection scenarios.
- [ ] Run dependency, secret, static-analysis, and container scans locally; fix high/critical findings or record a launch-blocking exception in the delivery tracker.
- [ ] Complete product-owner visual review of the 21 mobile screens and operations review of admin/technician flows against the approved spec.
- [ ] Run all backend, mobile, admin, E2E, migration, seed, lint, type, and generated-client drift commands from a clean checkout.
- [ ] Commit verified fixes with `fix: harden local end-to-end workflows`.

### Phase 10 acceptance criteria

- All critical commerce and service flows pass locally using mocks from a clean checkout.
- Stock, webhook, outbox, payment, and state-transition invariants survive concurrency and retry tests.
- The customer design is approved against the handoff and staff confirms the dashboard supports daily operations.
- No unresolved critical security finding, data-integrity defect, or provider-state ambiguity remains before CI/cloud work.

---

# Phase 11: CI, image builds, and release artifacts

### Task 30: Add pull-request CI and supply-chain checks

**Files:**
- Create: `.github/workflows/{backend-ci,frontend-ci,e2e-ci,infra-ci}.yml`
- Create: `.github/dependabot.yml`
- Create: `scripts/{check-migrations,check-generated,scan-secrets}.sh`
- Modify: root Make targets and lockfiles only when required

**Interfaces:**
- Produces required checks `backend`, `mobile`, `admin`, `local-e2e`, and `infra-validate`.
- CI uses service containers and fake providers; it has no AWS, Stripe live, Twilio live, or production database credentials.

- [ ] Add a deliberately failing branch test for each workflow path filter to prove backend, frontend, E2E, and infrastructure checks trigger when their owned files change.
- [ ] Configure locked installs, caching keyed by lockfile, formatting, linting, typing, unit/integration tests, OpenAPI drift, migrations, and seed-twice checks.
- [ ] Add mobile/admin component tests and browser E2E; use an emulator-independent mobile component gate here and run full device E2E in the release workflow or approved hosted runner.
- [ ] Add Terraform format/validate/test/security, Kubernetes render/schema/policy, dependency, container-file, license, and secret scans.
- [ ] Set least-privilege workflow permissions, pin third-party actions by immutable commit SHA, and cancel superseded PR runs.
- [ ] Run workflows on a pull request or local workflow runner, verify required status names, then commit with `ci: validate application and infrastructure changes`.

### Task 31: Build immutable application and mobile artifacts

**Files:**
- Create: `backend/Dockerfile`, `admin/Dockerfile`, `.dockerignore`
- Create: `.github/workflows/{build-images,mobile-build}.yml`
- Create: `scripts/smoke-image.sh`
- Modify: `mobile/eas.json`, `mobile/app.json`

**Interfaces:**
- Produces API, worker, and admin images tagged by Git SHA and referenced by digest.
- Produces signed Expo internal-distribution builds; store submission remains human-approved.

- [ ] Write image smoke checks for non-root user, read-only-compatible filesystem, liveness command, build-version endpoint, no dev dependencies/secrets, and graceful termination.
- [ ] Create multi-stage minimal images using one backend image with distinct API/worker commands and one static admin image.
- [ ] Generate SBOMs, scan images, sign or attest provenance, and fail on unresolved critical vulnerabilities.
- [ ] Configure Expo development/preview/production profiles with environment-specific non-secret public values and protected signing credentials.
- [ ] Build all artifacts twice from the same source inputs and verify application content/version identity; reference images by digest in deployment output.
- [ ] Commit with `ci: build immutable release artifacts`.

### Phase 11 acceptance criteria

- Every pull request runs deterministic application, migration, generated-client, security, and infrastructure checks.
- Main-branch builds produce scanned, traceable, non-root images and internal mobile builds without embedding secrets.
- GitHub Actions has minimal permissions and no long-lived AWS credentials.
- Failed tests, stale generated code, unsafe migrations, critical scan results, or manifest-policy violations block merge.

---

# Phase 12: AWS infrastructure with Terraform

### Task 32: Bootstrap remote state, provider conventions, and environment tests

**Files:**
- Create: `infra/terraform/bootstrap/{main,variables,outputs,versions}.tf`
- Create: `infra/terraform/environments/{shared,dev,prod}/{backend,main,variables,outputs,versions}.tf`
- Create: `infra/terraform/tests/{bootstrap,environments}.tftest.hcl`
- Create: `infra/terraform/Makefile`

**Interfaces:**
- Produces encrypted remote state with locking and environment-separated state keys.
- Produces provider default tags: project, environment, owner, managed-by, and cost center.
- GitHub uses OIDC roles; no access keys are output.

- [ ] Write Terraform tests asserting encryption, public-access blocks, versioning, state locking, least-privilege trust conditions, required tags, and production deletion safeguards.
- [ ] Run `terraform fmt -check`, `terraform init -backend=false`, `terraform validate`, and `terraform test`; confirm initial failures.
- [ ] Implement the one-time bootstrap state resources and environment roots with explicit provider/version constraints selected and recorded in lockfiles.
- [ ] Create GitHub OIDC plan/deploy roles restricted by repository, branch/environment, and action; separate read-only plan from mutation roles.
- [ ] Apply bootstrap only after AWS account, region, naming, billing-alert owner, and break-glass access are approved.
- [ ] Re-run tests/security scans and commit with `infra: bootstrap Terraform state and environments`.

### Task 33: Provision networking, databases, Redis, media, and backups

**Files:**
- Create: `infra/terraform/modules/vpc/*.tf`, `modules/security/*.tf`
- Create: `infra/terraform/modules/postgresql/*.tf`, `modules/redis/*.tf`, `modules/media/*.tf`
- Create: `infra/terraform/modules/secrets/*.tf`, `modules/backup/*.tf`
- Create: `infra/terraform/tests/{networking,data}.tftest.hcl`
- Modify: `infra/terraform/environments/{shared,dev,prod}/*.tf`

**Interfaces:**
- Produces a three-AZ-capable VPC, public load-balancer subnets, private application/data subnets, controlled egress, and VPC endpoints where cost-effective.
- Produces separate dev/prod RDS databases/credentials, Redis resources/credentials, private media buckets/prefixes, and Secrets Manager paths.

- [ ] Write Terraform tests for no public database/Redis access, encryption, backups, production deletion protection, security-group directionality, bucket public-access block, lifecycle/CORS restrictions, and separate environment credentials.
- [ ] Implement VPC/subnets/routes/NAT or approved egress design; log rejected/accepted flows at a cost-appropriate level.
- [ ] Implement PostgreSQL with automated backups and maintenance settings, Redis with TLS/auth, private S3 media with lifecycle rules, KMS keys, and Secrets Manager values generated without plaintext output.
- [ ] Configure production backup retention and AWS Backup or equivalent snapshots; configure smaller but nonzero development retention.
- [ ] Run plan in dev and prod accounts/workspaces, review cost and replacements, then apply development only.
- [ ] Test connection from a temporary authorized private test host/job, remove that access, and commit with `infra: provision AWS data services`.

### Task 34: Provision ECR, DNS/TLS, IAM, and Kubernetes EC2 topology

**Files:**
- Create: `infra/terraform/modules/ecr/*.tf`, `modules/dns/*.tf`, `modules/iam/*.tf`
- Create: `infra/terraform/modules/kubernetes_compute/*.tf`
- Create: `infra/terraform/tests/{ecr,dns,kubernetes_compute}.tftest.hcl`
- Modify: `infra/terraform/environments/{shared,dev,prod}/*.tf`

**Interfaces:**
- Produces ECR repositories with immutable tags/scanning/lifecycle, Route 53 records/TLS prerequisites, and least-privilege workload/deploy roles.
- Produces three control-plane EC2 instances behind a private/controlled Kubernetes API NLB and distinct dev/prod worker groups across Availability Zones.
- Nodes are private, managed through SSM, use encrypted volumes, IMDSv2, hardened images, and no shared SSH key.

- [ ] Write Terraform tests for immutable/scanned ECR, private nodes, IMDSv2, encrypted disks, API-source restrictions, multi-AZ placement, SSM access, distinct worker roles/taints, and no wildcard secret access.
- [ ] Implement ECR and lifecycle policies, DNS zones/records, ACM or selected ingress TLS prerequisites, and CI push/deploy IAM roles.
- [ ] Implement the Kubernetes API load balancer, control-plane instances, environment-specific worker groups, security groups, SSM, autoscaling boundaries, and KMS/secret-prefix permissions.
- [ ] Produce explicit monthly cost output/estimate for shared control plane, dev/prod data services, NAT, nodes, logging, and load balancers; obtain business approval before production apply.
- [ ] Apply to the development/shared infrastructure, validate SSM-only access and network reachability, and commit with `infra: provision Kubernetes compute and delivery services`.

### Phase 12 acceptance criteria

- Terraform reproducibly provisions remote state, networking, private data services, media, registries, IAM, DNS/TLS prerequisites, backups, and EC2 cluster topology.
- Development and production have separate databases, Redis credentials/resources, secret paths, media prefixes/buckets, and deployment roles.
- No database, Redis, node SSH, media bucket, or unrestricted Kubernetes API is publicly exposed.
- Terraform tests, plans, security scans, replacement review, and approved cost estimates pass before production resources are created.

---

# Phase 13: Self-managed Kubernetes on EC2

### Task 35: Bootstrap and validate the kubeadm cluster

**Files:**
- Create: `infra/kubernetes/cluster-addons/bootstrap/{control-plane,worker}.sh`
- Create: `infra/kubernetes/cluster-addons/kubeadm/{init,control-plane-join,worker-join}.yaml`
- Create: `infra/kubernetes/cluster-addons/{cilium,aws-cloud-controller,ebs-csi,metrics-server,ingress-nginx,external-dns,secrets-store-csi}/`
- Create: `scripts/{cluster-bootstrap,cluster-upgrade,cluster-validate}.sh`
- Test: `infra/kubernetes/tests/cluster-security.sh`, `cluster-ha.sh`

**Interfaces:**
- Produces a version-pinned kubeadm cluster with HA control plane, etcd backup hooks, Cilium networking/NetworkPolicy, AWS cloud integration, EBS CSI, ingress, DNS, and secrets-store support.
- Join credentials are short-lived, transported through SSM/approved secret channels, and removed after bootstrap.

- [ ] Write validation checks for three ready control-plane nodes, multi-AZ workers, encrypted Kubernetes Secrets at rest, API audit logs, NodeRestriction, restricted Pod Security defaults, CNI policy enforcement, DNS, CSI, ingress, and node drain/replacement.
- [ ] Harden and pin containerd, kubelet, kubeadm, kubectl, kernel settings, time sync, audit policy, and control-plane encryption configuration in idempotent bootstrap scripts.
- [ ] Initialize the first control plane through SSM, join remaining control planes/workers with short-lived tokens, and delete/bootstrap-lock credentials afterward.
- [ ] Install pinned add-ons in dependency order and validate AWS load balancer, Route 53, EBS volume, and S3/Secrets Manager access through least-privilege worker roles.
- [ ] Back up etcd, restore it into an isolated validation cluster or nodes, and record the verified command/output in the release evidence.
- [ ] Drain and replace one worker, then one non-leading control-plane node; all tests must continue to pass.
- [ ] Commit with `infra: bootstrap self-managed Kubernetes cluster`.

### Task 36: Package application workloads and namespace isolation

**Files:**
- Create: `infra/kubernetes/charts/coffix/{Chart,values}.yaml`
- Create: `infra/kubernetes/charts/coffix/templates/{namespace,serviceaccount,configmap,secretproviderclass,migration,deployment-api,deployment-worker,deployment-admin,service,ingress,hpa,pdb,networkpolicy,resourcequota}.yaml`
- Create: `infra/kubernetes/environments/{dev,prod}/values.yaml`
- Create: `infra/kubernetes/tests/{render,policy,namespace-isolation}.sh`

**Interfaces:**
- Produces `coffix-dev` and `coffix-prod` releases with separate service accounts, configuration, secrets, data endpoints, ingress hosts, resource quotas, and network policies.
- Migration is a release gate Job; API/worker start only with a compatible schema.
- Production manifests reference image digests and cannot use `latest`.

- [ ] Write failing render/policy tests for missing limits/probes, root containers, mutable tags, unrestricted traffic, secret literals, cross-namespace selectors, missing disruption budgets, and environment data reuse.
- [ ] Implement the Helm chart with startup/liveness/readiness probes, graceful shutdown, API/worker/admin workloads, Services, ingress, HPA, PDB, migration Job, service accounts, quotas, and topology spread.
- [ ] Implement default-deny ingress/egress and narrow DNS, ingress, PostgreSQL, Redis, S3/provider, metrics, and API-to-service allowances.
- [ ] Mount environment secrets through the AWS secrets-store path; bind dev/prod workloads to their matching tainted worker groups and forbid cross-environment placement through admission/policy rules.
- [ ] Deploy dev by digest, run migrations and smoke/E2E tests, force a bad-readiness rollout to prove deployment stops, then restore the good digest.
- [ ] Verify a dev pod/service account cannot read production Secrets, reach production data endpoints, select production pods, or consume production ingress.
- [ ] Commit with `infra: deploy isolated Coffix workloads`.

### Task 37: Add Kubernetes deployment promotion and rollback controls

**Files:**
- Create: `.github/workflows/{deploy-dev,promote-prod}.yml`
- Create: `scripts/{deploy,verify-rollout,rollback-app}.sh`
- Create: `infra/kubernetes/tests/release-gates.sh`

**Interfaces:**
- Development deploys automatically after successful main image build.
- Production consumes the same digests, requires GitHub environment approval, verifies backup/migration compatibility, and records deployment evidence.

- [ ] Write workflow tests/static checks proving production cannot accept a branch build, mutable image, unapproved environment, or missing backup/migration preflight.
- [ ] Implement OIDC authentication, digest resolution, Helm diff/render/policy checks, migration Job wait, rollout health gate, and post-deploy smoke tests.
- [ ] Implement application rollback to the prior digest and explicitly block automatic rollback when a non-backward-compatible migration is detected.
- [ ] Deploy two compatible dev versions and roll backward/forward while processing outbox jobs and API traffic.
- [ ] Configure production approval ownership and concurrency so only one production deployment can run.
- [ ] Commit with `ci: promote releases through Kubernetes environments`.

### Phase 13 acceptance criteria

- Kubernetes runs on EC2 through kubeadm, not EKS, with a tested HA control plane, cluster add-ons, etcd backup/restore, and node replacement procedure.
- `coffix-dev` and `coffix-prod` are isolated by credentials, databases, Redis, media, RBAC, network policies, quotas, nodes/taints, and ingress.
- Workloads are non-root, resource-bounded, probe-protected, disruption-aware, and deployed by immutable digest.
- Development deployment and production approval/rollback gates are proven before production traffic.

---

# Phase 14: Logs, metrics, traces, dashboards, and alerts

### Task 38: Instrument API, worker, mobile, and admin telemetry

**Files:**
- Create: `backend/src/coffix/core/telemetry.py`
- Create: `mobile/src/observability/{logging,errors,performance}.ts`
- Create: `admin/src/observability/{logging,errors,performance}.ts`
- Extend: domain services and worker metric hooks created earlier
- Test: `backend/tests/unit/core/test_telemetry.py`, `backend/tests/api/test_metrics.py`
- Test: `mobile/tests/observability.test.ts`, `admin/tests/observability.test.ts`

**Interfaces:**
- Emits OpenTelemetry-compatible traces/metrics and structured logs with service, environment, build, route template, correlation ID, and safe actor/entity references.
- Never records OTPs, tokens, secrets, card data, raw private media URLs, or sensitive free text.

- [ ] Write failing tests for correlation propagation across API/outbox/provider jobs, route-template cardinality, payment/reservation/service metrics, log redaction, and client error correlation IDs.
- [ ] Instrument FastAPI, SQLAlchemy, Redis, outbound providers, worker jobs, and critical domain counters/histograms without placing customer identifiers in metric labels.
- [ ] Add privacy-safe mobile/admin error and performance capture with environment/build metadata and backend correlation IDs.
- [ ] Run load/E2E tests and confirm telemetry volume/cardinality remain bounded.
- [ ] Commit with `feat: instrument platform telemetry`.

### Task 39: Deploy the observability stack and retention storage

**Files:**
- Create: `infra/observability/{otel-collector,prometheus,grafana,loki,tempo,alertmanager}/values.yaml`
- Create: `infra/kubernetes/cluster-addons/observability/`
- Create: `infra/terraform/modules/observability_storage/*.tf`
- Test: `infra/observability/tests/{render,ingestion,retention}.sh`

**Interfaces:**
- Produces OpenTelemetry Collector, Prometheus, Grafana, Loki, Tempo, Alertmanager, kube-state metrics, node metrics, and protected ingress/access.
- Production logs/traces use private S3-backed retention; metrics use encrypted persistent storage and tested retention/capacity settings.

- [ ] Write tests for authenticated dashboards, private buckets, encryption, retention, resource limits, anti-affinity, scrape discovery, log/trace correlation, and environment labels.
- [ ] Provision observability storage and install pinned stack charts with separate dev/prod labels and restricted access.
- [ ] Configure collectors, sampling, redaction, retention, compaction, backups where needed, and cost controls.
- [ ] Generate test API/error/job/payment events and prove they are discoverable from a correlation ID across metrics, logs, and traces.
- [ ] Simulate storage/collector failure and confirm application business transactions continue while health/alerts show telemetry degradation.
- [ ] Commit with `infra: deploy platform observability stack`.

### Task 40: Create operational dashboards, alerts, and runbooks

**Files:**
- Create: `infra/observability/grafana/dashboards/{platform,commerce,service,payments,workers,postgres-redis,kubernetes}.json`
- Create: `infra/observability/prometheus/{recording-rules,alerts}.yaml`
- Create: `infra/observability/runbooks/{api-unavailable,high-errors,payment-webhooks,reservation-lag,worker-backlog,database,redis,kubernetes,certificate}.md`
- Test: `infra/observability/tests/{dashboards,alerts,runbooks}.sh`

**Interfaces:**
- Produces actionable alerts with owner, severity, environment, customer impact, dashboard, and runbook link.
- Implements initial thresholds from the spec: 5xx above 5% for five minutes, p95 above two seconds for ten minutes, and expiration lag above five minutes.

- [ ] Write validation tests for valid dashboard JSON, existing metric names, bounded variables, alert syntax, runbook links, owner/severity labels, and missing-data behavior.
- [ ] Build overview, commerce funnel, service funnel, payment/webhook, worker/outbox, data-service, and cluster dashboards using recorded metrics.
- [ ] Add alerts for availability, latency, error rate, webhook failure/lag, reservation/payment expiration lag, worker backlog/dead letters, RDS/Redis pressure, pod/node health, unavailable replicas, deployment failure, and certificate expiry.
- [ ] Write concise runbooks with impact, verification, safe mitigation, escalation, rollback boundaries, and post-incident evidence.
- [ ] Fire every alert in development using controlled failure/load and verify routing, deduplication, recovery notification, dashboard links, and runbook accuracy.
- [ ] Commit with `ops: add dashboards alerts and runbooks`.

### Phase 14 acceptance criteria

- Operators can trace a request/domain event across API logs, worker delivery, provider handling, and client-visible failure using one correlation ID.
- Required platform, commerce, service, payment, worker, data, and Kubernetes dashboards use real emitted metrics.
- Every high-priority alert has tested routing, clear ownership, a working dashboard, and a usable runbook.
- Observability failure does not corrupt or block core business transactions, and telemetry contains no prohibited sensitive data.

---

# Phase 15: Production readiness and launch

### Task 41: Validate provider, legal, security, backup, and disaster-recovery readiness

**Files:**
- Create: `scripts/{verify-providers,restore-database,reconcile-payments,production-smoke}.sh`
- Create: `infra/operations/{backup-restore,incident-response,access-review,cluster-upgrade}.md`
- Test: `e2e/production-readiness/{providerSandbox,backupRestore,reconciliation,failover}.spec.ts`

**Interfaces:**
- Produces evidence that production provider accounts, restore, reconciliation, access, and incident procedures work before accepting customers.

- [ ] Confirm Stripe can accept required ILS product/diagnostic/additional payments and full product refunds; verify signed webhook delivery/retry against pre-production.
- [ ] Confirm Twilio Verify delivery and rate limits for representative Israeli numbers, FCM for iOS/Android production credentials, S3 media lifecycle, final DNS/TLS, and app-store accounts.
- [ ] Obtain approved Hebrew copy, privacy/service/refund terms, Israeli tax/invoice decision, shop address, shipping fee, support contacts, media policy, and warranty policy.
- [ ] Restore the latest production-shaped database backup into an isolated environment, verify row counts/checksums and core reads, then destroy the isolated data through the approved process.
- [ ] Exercise payment reconciliation, etcd restore, node replacement, lost-worker recovery, secret rotation, access review, incident escalation, and cluster upgrade in development.
- [ ] Complete penetration/security review and resolve all critical/high findings or block launch with a named owner and decision.
- [ ] Commit with `ops: establish production readiness procedures`.

### Task 42: Perform staged production release and acceptance

**Files:**
- Modify only defects/configuration discovered by release rehearsal
- Record release evidence in the delivery system and GitHub deployment records rather than creating another project-plan document

**Interfaces:**
- Produces an approved production deployment using the exact digests tested in development and signed mobile release candidates.

- [ ] Freeze the release candidate, deploy exact digests to development, run migrations, full smoke/E2E, load/resilience subset, scans, and observability alert checks.
- [ ] Back up production, review Terraform/Helm diff and migration compatibility, obtain product/operations/security approval, and promote the same digests.
- [ ] Run production-safe smoke tests for health, OTP, authenticated catalog, fake/non-charging validation path where available, media, admin login, and notification registration.
- [ ] Release to internal mobile testers, then staged store cohorts; monitor payment, error, latency, worker, reservation, and service dashboards through each cohort.
- [ ] Stop or roll back application rollout on a failed gate; do not reverse a destructive migration automatically.
- [ ] Obtain final acceptance from the product owner, operations/admin representative, technician representative, and security/engineering owner.
- [ ] Tag the release and commit any final non-secret configuration fix with `release: launch Coffix MVP`.

### Phase 15 acceptance criteria

- Commercial provider accounts and Israeli legal/business policies are explicitly approved, not assumed from local mocks.
- Backup restore, reconciliation, incident response, secret rotation, cluster upgrade, and access review are rehearsed.
- Production uses the exact tested image digests, passes health/smoke/observability gates, and has a controlled mobile rollout.
- Product, operations, technician, and engineering/security owners accept the MVP.

---

## 6. Phase dependency and release summary

| Phase | Deliverable | Blocking gate |
|---|---|---|
| 0 | Repeatable local workspace and backend core | Local services, migrations, settings tests pass |
| 1 | OTP identity, sessions, users, roles | Auth abuse/ownership tests pass |
| 2 | Catalog, atomic inventory, expiring cart | Concurrency test proves no oversell |
| 3 | Product payments, orders, refunds, purchased machines | Duplicate/out-of-order payment tests pass |
| 4 | Media and full machine service domain | All payment/state gates pass |
| 5 | Notifications, admin APIs, health, seed, OpenAPI | Backend contract freeze passes |
| 6 | Expo RTL shell and authentication | iOS/Android auth and design primitives pass |
| 7 | Mobile commerce | Local paid-order flow passes |
| 8 | Mobile service/account | Full customer service flows and 21-screen review pass |
| 9 | Admin/technician dashboard | Operations and permission E2E pass |
| 10 | Full local platform | Clean-checkout E2E, resilience, security pass |
| 11 | CI and immutable artifacts | Required checks and scanned builds pass |
| 12 | Terraform AWS platform | Security, cost, plan, backup controls approved |
| 13 | EC2 Kubernetes and deployment | HA, isolation, migration, rollback tests pass |
| 14 | Observability | All dashboards/alerts/runbooks validated |
| 15 | Production launch | Provider/legal/security/DR and stakeholder sign-off |

## 7. Risks and blockers requiring explicit decisions

| Blocker | Decision deadline | Evidence required | Safe response if unresolved |
|---|---|---|---|
| Stripe account supports ILS and business model | Before Task 20 real-payment integration; final before Phase 15 | Successful test-mode flows and provider/account confirmation | Continue fake adapter locally; select and implement an approved payment-provider adapter before launch. |
| Twilio Verify supports approved Israeli delivery | Before production OTP configuration | Representative-number delivery tests, sender/account approval, cost/abuse limits | Keep fake OTP outside production; choose an approved OTP provider before launch. |
| Israeli tax invoice/accounting obligations | Before admin/order contract freeze if API changes are needed | Written accountant/legal decision | Block paid production launch or add the required invoicing scope through an approved spec change. |
| Non-refundable diagnostic/additional service terms | Before service copy approval and production payments | Reviewed Hebrew terms and explicit customer acknowledgement | Block service payment launch; keep service workflow non-charging in internal environments. |
| Final shipping fee, shop address, warranty policy, support contact | Before production seed/config | Product-owner written values | Block store/service launch; never invent production values. |
| Product catalog, photos, machine models, serial rules, service types/fees | Before Phase 10 acceptance | Approved import/seed dataset and asset rights | Use demo data only; do not publish catalog. |
| Apple/Google/Firebase signing and store accounts | Before Phase 11 mobile release build | Working internal signed builds and push credentials | Continue development builds; do not promise public mobile release date. |
| AWS accounts, DNS, quotas, budget, and on-call owner | Before Phase 12 apply | Approved account structure, region, billing alarms, domain control, cost estimate | Stop at local/CI delivery; do not create production cloud resources. |
| Shared-cluster risk acceptance | Before production worker nodes and namespace deployment | Security/operations sign-off on controls and migration trigger to separate clusters | Use dev only or provision separate production cluster/account through a spec amendment. |
| Self-managed Kubernetes operating capability | Before Phase 13 | Named owner, kubeadm upgrade/restore/node-replacement rehearsal | Do not route production traffic; obtain expertise or revisit the no-EKS constraint. |
| Media privacy, retention, and malware decision | Before public uploads | Legal/security retention limits and risk decision | Restrict file types/size or disable video until controls are accepted. |
| Design asset/font/photo licensing and final Hebrew copy | Before Phase 8 design acceptance | Rights confirmation and product-owner copy review | Use licensed local placeholders internally; block store submission. |

## 8. Final definition of done

Coffix MVP is complete only when all of the following are true:

- Every requirement in `docs/spec.md` maps to a passing implementation task and acceptance gate above.
- A clean checkout can start local dependencies, migrate, seed, run the API/worker/mobile/admin, and complete deterministic E2E flows.
- Automated tests prove inventory, payment, refund, warranty, service-state, permissions, and notification invariants under retries and concurrency.
- The mobile application matches the approved Hebrew RTL handoff and passes iOS/Android accessibility review.
- Admin and technician users can operate their full workflows without database access or excess permissions.
- CI protects the main branch and produces scanned immutable artifacts.
- Terraform, self-managed EC2 Kubernetes, dev/prod isolation, secrets, deployments, backups, and recovery are tested.
- Logs, metrics, traces, dashboards, alerts, health checks, and runbooks are live and exercised.
- All provider, legal, business-data, security, cost, and operational blockers have named approvals.
- Production and staged mobile releases pass acceptance without unresolved critical or high-severity defects.

## 9. Implementation handoff

Execute one task at a time using the required implementation workflow named in the header. Start with Task 1, stop at every phase gate, and preserve the local-first order. If a requirement changes, update `docs/spec.md` first, review the affected state/data/API decisions, and then revise this plan before coding beyond the changed gate.
