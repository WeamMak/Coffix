# CoffeeShop Commerce and Machine Service Platform Specification

## 1. Project overview

CoffeeShop is a single-vendor mobile commerce and machine-service platform for an Israeli coffee shop business. Customers use a Hebrew, right-to-left mobile application to purchase coffee machines, beans, capsules, spare parts, and accessories. The same application lets customers register coffee machines, request service, submit issue media, pay service fees, and follow a repair through completion.

The platform also provides an English web dashboard. Administrators operate the catalog, inventory, orders, service workflow, pricing, scheduling, technician assignment, and reporting. Technicians use a restricted, mobile-friendly dashboard experience to manage only their assigned service jobs.

The machine-service workflow is the product's main differentiator. Commerce orders and service requests share users, machines, payments, notifications, and audit capabilities, but remain separate business records with separate lifecycles.

## 2. Problem statement

The business currently needs one reliable system for two related customer journeys:

1. Buying coffee products and tracking fulfillment.
2. Registering a coffee machine and coordinating diagnosis and repair.

A standard online store does not support the second journey well. Service intake requires machine ownership, media evidence, service-location selection, two-phase payments, administrative review, manual scheduling, technician work, and customer-visible progress. Splitting these activities across phone calls, chat, spreadsheets, and payment links produces inconsistent records and limited visibility for both customers and staff.

CoffeeShop will make both journeys traceable in one platform while keeping the first release small enough to develop and verify locally before adding cloud infrastructure.

## 3. Goals

### 3.1 MVP goals

- Provide passwordless phone OTP authentication for every role.
- Deliver a high-fidelity Hebrew RTL customer experience based on the existing mobile design handoff.
- Support an authenticated, single-vendor product catalog and server-owned shopping cart.
- Reserve tracked stock atomically when items enter a cart.
- Take product-order payments and provide order status and manual shipment tracking.
- Let customers register machines manually and automatically register eligible machines purchased through the app.
- Support the complete bring-in or pickup service workflow from request through completion.
- Enforce diagnostic and additional-cost payment rules in the backend.
- Give administrators practical tools for daily catalog, stock, order, service, pricing, scheduling, and technician operations.
- Give technicians a narrow workflow for assigned jobs, status changes, notes, and media.
- Provide automated tests, repeatable database migrations, seed data, CI/CD, environment isolation, health checks, and operational visibility.
- Make all core workflows run locally before migrating them to AWS.

### 3.2 Success criteria

- A customer can authenticate, reserve an in-stock item, pay, and see the resulting order without staff intervention.
- Concurrent cart additions cannot reserve more than the available tracked stock.
- An inactive cart expires after one hour and releases its reservations.
- A purchased machine is registered automatically after a qualifying paid order is finalized.
- A customer can register a machine, submit a service request with media, pay the diagnostic fee, receive a confirmed appointment, and follow the service through completion.
- Repair cannot continue when an additional cost is awaiting payment or has been declined.
- Role and ownership checks prevent access to another user's or technician's records.
- Administrators can complete the operational tasks required by the MVP without direct database access.
- The local end-to-end suite covers the critical commerce and service paths.
- Development and production deployments are reproducible from versioned configuration and expose actionable health, logs, metrics, dashboards, and alerts.

## 4. Non-goals

The following are outside the MVP:

- Marketplace or multi-vendor behavior.
- Multi-tenancy or white-label storefronts.
- Guest catalog browsing or guest checkout.
- Password or social-login authentication.
- Customer-initiated product-order cancellation or refunds.
- Partial refunds, store credit, exchanges, or return-merchandise workflows.
- Subscription coffee plans, loyalty points, coupons, gift cards, reviews, or wish lists.
- Multiple currencies, languages, or countries.
- Live shipping-provider rates, labels, or tracking APIs.
- On-site technician visits.
- Automated technician optimization or enforcement of scheduling capacity.
- Customer notification preferences or opt-out controls.
- Warranty coverage for manually registered machines.
- A customer-to-technician chat channel.
- Offline-first mobile operation.
- Microservices, event streaming, or independent scaling of individual domain modules.

## 5. Users and roles

One user has exactly one role. Role changes are administrative actions and are audited.

| Role | Primary interface | Permissions |
|---|---|---|
| Customer | Expo React Native mobile app | Manage own profile and addresses; browse catalog; manage own cart; pay for and view own orders; register and view own machines; create, pay for, and view own service requests; upload media; view notifications. |
| Admin | English React web dashboard | Manage catalog, stock, pricing, orders, refunds, shipment tracking, machine models, service types, diagnostic fees, additional costs, schedules, technicians, notifications, and dashboard statistics. |
| Technician | Restricted responsive area of the React dashboard | View only assigned jobs; update allowed job states; add internal/service notes and job media. No catalog, payment, refund, customer-role, or global scheduling access. |

Customer registration is self-service after successful OTP verification. Admin and technician accounts are created or promoted only by an existing admin. The initial admin is bootstrapped through a controlled seed or deployment command.

## 6. MVP scope

### 6.1 Customer mobile application

- Splash, welcome, phone entry, and six-digit OTP verification.
- Authenticated home dashboard with active order and service summaries.
- Categories, product lists, product details, availability, and quantity controls.
- Cart with quantity changes, removal, pricing summary, and expiration behavior.
- Checkout with Israeli delivery address, payment, confirmation, and order number.
- Orders list and detail with status history and manually entered carrier/tracking information.
- Machines list, machine detail, manual registration, warranty display, and service history.
- Service request creation with service type, description, media, location mode, address when needed, and preferred appointment window.
- Service request detail with status history, diagnostic payment, additional-cost approval/payment, and completion information.
- Notifications list, unread count, and push-driven refresh.
- Profile, saved addresses, and logout.

### 6.2 Admin dashboard

- Dashboard totals and operational queues.
- Category, product, variant/SKU, image, price, activation, and featured-product management.
- Nullable stock management and reservation visibility.
- Order search, detail, status processing, shipment tracking, cancellation, and full refund.
- Machine-model and supported-service-type management.
- Diagnostic-fee configuration by supported service type, with the charged value snapshotted on a request.
- Service-request review, additional-cost entry, preferred-window review, confirmed scheduling, technician assignment, state changes, and notes.
- User and technician lookup with controlled role management.
- Basic notification-event visibility and retry status.
- Audit-log lookup for sensitive administrative actions.

### 6.3 Technician dashboard

- Assigned-job list and job detail.
- Customer and machine information required to perform the job.
- Confirmed appointment and bring-in/pickup details.
- Allowed job-status updates.
- Service notes and job-photo uploads.

### 6.4 Platform capabilities

- PostgreSQL schema and versioned migrations.
- Deterministic development seed data.
- Local mock providers and production provider adapters.
- Background work for cart expiration and outbound notifications.
- Automated tests and CI checks.
- Container images and deployment automation.
- AWS infrastructure managed with Terraform.
- Self-managed Kubernetes on EC2 with isolated development and production namespaces.
- Centralized logs, metrics, dashboards, and alerts.

## 7. Business rules

### 7.1 General

- CoffeeShop is a single vendor and a single tenant.
- The MVP operates only in Israel and uses ILS for all monetary amounts.
- Money is stored as integer agorot; floating-point values are not used for prices or totals.
- Customer-facing text is Hebrew and rendered RTL. Administrative text may be English.
- Catalog browsing requires authentication.
- All server timestamps are stored in UTC and rendered in `Asia/Jerusalem` for users and staff.
- Business state changes are authorized and validated by the backend, never trusted from a client.

### 7.2 Authentication and roles

- Phone OTP is the only login method; there are no passwords.
- Phone numbers are normalized to E.164 format, including Israeli `+972` numbers.
- OTP requests and verification attempts are rate-limited by phone number, IP address, and device/session signal.
- A successful OTP for a new phone creates a customer account. It never creates an admin or technician.
- A user has exactly one active role.

### 7.3 Catalog and stock

- A sellable SKU has `stock_quantity = null` for unlimited stock or a non-negative integer for tracked stock.
- An inactive product or SKU cannot be newly added to a cart.
- Adding or increasing a cart item for tracked stock creates or updates a reservation in the same PostgreSQL transaction.
- The transaction locks the relevant SKU inventory row and rejects the change when unreserved stock is insufficient.
- An active cart expires after one hour without cart or checkout activity. A successful cart mutation or checkout attempt refreshes the activity timestamp.
- Expiration releases all tracked-stock reservations. Expiration is enforced both by a background job and synchronously whenever an expired cart is accessed.
- Decreasing or removing a cart item releases the corresponding reservation immediately.
- Unlimited-stock items are present in the cart without consuming a tracked-stock reservation.
- Checkout uses server-calculated current totals. Clients cannot provide authoritative prices, discounts, stock, or totals.

### 7.4 Product checkout, orders, and refunds

- Checkout creates a pending order snapshot and transfers the cart's reservations to that order for the payment window. This prevents a delayed payment webhook from referring to an expired cart.
- A pending order that remains unpaid for 30 minutes expires and releases its transferred reservations. This 30-minute window is an explicit MVP assumption.
- A successful, verified Stripe payment finalizes the order exactly once, decrements tracked stock, consumes reservations, and closes the cart in one database transaction.
- Payment finalization is idempotent across API retries and duplicate webhooks.
- A customer cannot cancel a product order.
- Only an admin can cancel an unpaid order or initiate a refund for a paid order.
- Product refunds are full refunds only. The local order is marked refunded only after Stripe confirms the refund outcome.
- An admin manually enters the carrier name, tracking number, and optional tracking URL.
- The customer can see fulfillment state and tracking data but cannot change them.

### 7.5 Machine registration and warranty

- A customer can manually register a supported machine using model, serial number, purchase date, and optional media.
- A serial number is unique per machine model. An admin resolves disputed or duplicate ownership.
- A manually registered machine has no CoffeeShop warranty, regardless of the entered purchase date.
- A qualifying coffee-machine SKU purchased through the app auto-registers one machine per purchased unit after payment succeeds. If a serial number is unavailable at purchase time, the generated record is marked as requiring customer or admin serial completion.
- App-purchased machines are warranty-eligible. The warranty duration is snapshotted from the machine model at purchase; the initial default is 12 months. This duration is a clearly marked MVP assumption and remains administratively configurable for future sales.
- Existing warranty snapshots do not change when a model's future warranty duration changes.

### 7.6 Service requests

- A service request belongs to exactly one registered machine owned by the requesting customer.
- A service location is either `bring_in` or `pickup`. On-site service is not offered.
- Pickup requires a valid saved or one-time Israeli address. Bring-in uses the shop address configured by the admin.
- The customer may supply a preferred appointment window during intake. It is not a confirmed booking.
- The admin confirms the actual appointment only after diagnostic payment.
- The diagnostic fee is determined from admin configuration and snapshotted when the service request is submitted.
- The diagnostic fee must be paid before scheduling, technician assignment for active work, or diagnosis begins.
- The customer may cancel only while the request is awaiting diagnostic payment. No service payment has occurred at that point.
- Service payments are non-refundable.
- After diagnosis, an admin may set one optional additional cost with a customer-visible explanation.
- Repair cannot continue until the customer accepts and pays the additional cost.
- If the customer declines the additional cost, the request is cancelled, no additional payment is taken, and the diagnostic fee is retained.
- If no additional cost is required, the admin may move the diagnosed request directly into repair.
- Scheduling is manual. Overlapping technician appointments are allowed and shown to the admin as a warning rather than blocked.
- Technicians can change only the operational states allowed for their assigned jobs. Payment-gated and administrative transitions remain admin/system controlled.

### 7.7 Notifications

- The system creates in-app notifications for material order, payment, service, scheduling, and assignment events.
- Push delivery through FCM is attempted asynchronously and does not control the underlying business transaction.
- Failed push attempts are retryable and visible operationally.
- There is no notification opt-out in the MVP.

## 8. State models

Explicit state machines prevent clients and staff from skipping business rules. Every accepted transition appends a status-history record with actor, time, source, and optional reason.

### 8.1 Product order states

| State | Meaning | Typical next states |
|---|---|---|
| `pending_payment` | Snapshot and reservations exist; payment is incomplete. | `paid`, `cancelled`, `payment_expired` |
| `paid` | Payment confirmed and stock consumed. | `processing`, `refunded` |
| `processing` | Staff is preparing the order. | `shipped`, `refunded` |
| `shipped` | Manual tracking may be present. | `delivered`, `refunded` |
| `delivered` | Fulfillment completed. | `refunded` |
| `payment_expired` | Payment window elapsed and reservations were released. | Terminal |
| `cancelled` | Admin cancelled before successful payment. | Terminal |
| `refunded` | Full refund confirmed by provider. | Terminal |

Refund authorization remains admin-only even when an order is delivered. Operational policy may restrict when staff should issue it, but the MVP does not implement partial refunds.

### 8.2 Service request states

| State | Meaning | Controlled by |
|---|---|---|
| `awaiting_diagnostic_payment` | Request submitted; customer may pay or cancel. | Customer/system |
| `awaiting_admin_review` | Diagnostic fee paid; request awaits review and appointment confirmation. | Admin |
| `scheduled` | Appointment and technician assignment are confirmed. | Admin |
| `received` | Machine was brought in or collected. | Admin/assigned technician |
| `diagnosing` | Diagnosis is underway. | Admin/assigned technician |
| `awaiting_additional_decision` | Admin quoted an additional repair cost. | Customer |
| `awaiting_additional_payment` | Customer accepted the quote; payment is incomplete. | Customer/system |
| `repair_in_progress` | No added cost was needed or additional payment succeeded. | Admin/assigned technician/system |
| `ready_for_return` | Work is complete and the machine awaits return/collection. | Admin/assigned technician |
| `completed` | Machine returned and request closed. | Admin |
| `cancelled` | Cancelled before diagnostic payment or after an additional-cost decline. | Customer/system/admin under allowed rule |

The backend exposes the allowed next actions for the current actor so clients can render valid controls without reimplementing the state machine.

## 9. Main user flows

### 9.1 Register and sign in

1. User enters an Israeli phone number.
2. Backend normalizes the number and asks Twilio Verify, or the local mock, to send an OTP.
3. User enters the six-digit OTP.
4. Backend verifies the challenge and creates a customer if the phone is new.
5. Backend issues a short-lived access token and a rotated refresh token.
6. Mobile stores tokens using Expo SecureStore and loads the authenticated home screen.

### 9.2 Purchase products

1. Authenticated customer browses categories and SKUs.
2. Customer adds a quantity to the cart.
3. Backend atomically checks and reserves tracked stock, then returns the server cart and expiry time.
4. Customer supplies or chooses a delivery address and starts checkout.
5. Backend revalidates the cart, calculates totals, creates the pending order, transfers reservations, and creates a Stripe PaymentIntent.
6. Mobile confirms payment using Stripe's React Native SDK.
7. A verified webhook finalizes payment and the order idempotently.
8. Customer sees confirmation and receives notifications as staff processes, ships, and delivers the order.
9. Any qualifying machine units create linked machine registrations.

### 9.3 Register a machine manually

1. Customer selects a supported machine model.
2. Customer enters serial number and purchase date and may attach a photo.
3. Backend validates ownership uniqueness and creates a manual registration.
4. The machine appears with `no CoffeeShop warranty` and becomes eligible for service requests.

### 9.4 Request machine service

1. Customer selects an owned registered machine.
2. Customer selects a supported service type and describes the issue.
3. Customer uploads allowed photos or videos.
4. Customer chooses bring-in or pickup, supplies a pickup address when needed, and enters a preferred time window.
5. Backend snapshots the configured diagnostic fee and creates the request in `awaiting_diagnostic_payment`.
6. Customer either cancels before payment or pays the diagnostic fee.
7. Verified payment moves the request to `awaiting_admin_review`.
8. Admin reviews the preferred window, confirms the actual appointment, and assigns a technician.
9. Staff receives the machine and performs diagnosis.
10. If no additional cost is needed, repair begins. If a cost is required, the customer receives a quote.
11. A declined quote cancels the request while retaining the diagnostic fee. An accepted quote must be paid before repair begins.
12. Technician records work and media, marks the machine ready, and the admin completes the request after return.

### 9.5 Admin product-order handling

1. Admin reviews the paid-order queue.
2. Admin moves the order to processing.
3. Admin records carrier and tracking information and marks it shipped.
4. Admin marks it delivered when confirmed.
5. If a full refund is needed, admin supplies a reason and initiates it; webhook confirmation updates the final state.

## 10. Architecture

### 10.1 Architectural style

The backend is a modular monolith: one deployable FastAPI application whose domain modules have explicit interfaces and ownership of their tables and rules. A separate worker process imports the same application modules for background jobs. This provides simple local development and transactional consistency without turning the codebase into an unstructured monolith.

Modules communicate through application-service interfaces and transaction-local domain events. Provider-independent jobs are written to a PostgreSQL outbox in the same transaction as the business change. A worker delivers notifications and other external side effects asynchronously. Redis supports job coordination, locks where appropriate, rate-limit counters, and short-lived caching; it is not the business source of truth.

### 10.2 Runtime components

```text
Expo mobile app ───────┐
                      ├── HTTPS/JSON ── FastAPI API ── PostgreSQL
React web dashboard ──┘                    │   │
                                           │   └── Redis
Stripe/Twilio webhooks ────────────────────┤
                                           └── object storage

Background worker ── PostgreSQL outbox/Redis ── FCM, email, expiration jobs
```

The mobile and web clients never access the database or private storage directly. Cloud media uploads use short-lived presigned URLs followed by an API finalize call. Local development uses the same media interface backed by a local directory.

### 10.3 Repository shape to be implemented

The implementation plan will use one repository with independently runnable workspaces:

- `backend/`: FastAPI application, worker, migrations, backend tests, and provider adapters.
- `mobile/`: Expo React Native application and mobile tests.
- `admin/`: React dashboard and web tests.
- `infra/terraform/`: reusable AWS infrastructure modules and environment roots.
- `infra/kubernetes/`: Helm charts or Kustomize overlays, policies, and observability configuration.
- Root-level developer orchestration, CI configuration, and shared documentation.

This structure is a planning target; the current repository contains only the design handoff and project skills.

## 11. Backend modules

| Module | Responsibility | Key dependencies |
|---|---|---|
| `auth` | OTP challenges, token issuance/rotation/revocation, rate limiting, sessions. | Twilio adapter, Redis, users |
| `users` | User profile, role, addresses, device registrations. | PostgreSQL |
| `catalog` | Categories, products, SKUs, product images, machine-product mapping, visibility. | Media |
| `inventory` | Nullable stock, atomic reservations, reservation transfer/consumption/release. | Catalog, PostgreSQL |
| `carts` | Active cart, cart items, activity/expiry, server totals. | Catalog, inventory |
| `orders` | Checkout snapshots, order state machine, fulfillment, tracking, machine-registration trigger. | Carts, inventory, payments, machines |
| `payments` | PaymentIntent/refund orchestration, webhook verification, provider event idempotency. | Stripe adapter |
| `machines` | Machine models, ownership registrations, serial uniqueness, warranty snapshots, service history. | Catalog, orders, media |
| `service` | Service types, requests, fee snapshots, state machine, quote decision, notes, history. | Machines, payments, scheduling, media |
| `scheduling` | Preferred windows, confirmed appointments, technician assignment, overlap warnings. | Users, service |
| `media` | Upload authorization, metadata, ownership, storage abstraction, access URLs. | Local/S3 adapter |
| `notifications` | In-app notification records, device tokens, delivery jobs, unread counts. | FCM adapter, optional email adapter |
| `admin` | Admin-oriented queries, dashboards, audit trail, protected operational commands. | Domain modules |
| `health` | Liveness, readiness, dependency checks, build/version information. | Runtime dependencies |

Each module owns validation and state transitions for its domain. Route handlers remain thin: authenticate, parse, call an application service, and map the result to an API response.

## 12. Data model

All primary keys use UUIDs. Mutable tables include `created_at` and `updated_at`; event/history tables are append-only. Monetary columns use integer agorot plus `currency = ILS`. Sensitive actions include actor and correlation identifiers.

### 12.1 Identity and access

| Entity | Important fields and constraints |
|---|---|
| `users` | `id`, unique normalized `phone_e164`, `role`, display name, active flag, timestamps. Role is one of customer/admin/technician. |
| `auth_sessions` | User, hashed refresh-token family/current token data, expiry, revocation, device metadata. |
| `addresses` | Owner, Hebrew recipient/contact fields, street, building, apartment, city, postal code, country fixed to `IL`, default flag. |
| `device_tokens` | User, platform, FCM token, last seen, active flag; token unique across active registrations. |

### 12.2 Catalog, inventory, and carts

| Entity | Important fields and constraints |
|---|---|
| `categories` | Name in Hebrew, slug, image key, sort order, active flag. |
| `products` | Category, Hebrew name/description, optional admin English label, product type, featured/active flags. |
| `product_skus` | Product, SKU code, attributes JSON, price agorot, nullable stock quantity, active flag, optional linked machine model. |
| `product_media` | Product/SKU owner, object key, media type, sort order, alt text. |
| `carts` | Customer, status, last activity, `expires_at`, version; at most one active cart per customer. |
| `cart_items` | Cart, SKU, quantity, latest displayed price; unique cart/SKU. Price remains revalidated at checkout. |
| `stock_reservations` | Tracked SKU, owning cart or pending order, quantity, expiry, state; indexed for active reservation sums and expiration. |

### 12.3 Orders and payments

| Entity | Important fields and constraints |
|---|---|
| `orders` | Customer, human-readable order number, state, subtotal/shipping/total agorot, currency, immutable address snapshot, payment deadline. |
| `order_items` | Order, SKU reference, immutable product/SKU/name/attribute/price snapshots, quantity, optional machine-model snapshot. |
| `order_status_history` | Order, from/to state, actor/source, reason, timestamp. |
| `shipments` | Order, carrier, tracking number, optional validated tracking URL, shipped/delivered times. One shipment per order in MVP. |
| `payments` | Owner type/id, phase (`order`, `diagnostic`, `additional`), amount, currency, provider IDs, state, idempotency key. |
| `refunds` | Product-order payment, full amount, reason, provider refund ID, state, requesting admin. Service payments cannot reference refunds. |
| `provider_events` | Provider, unique external event ID, type, received/processed timestamps, result/error metadata. |

### 12.4 Machines and service

| Entity | Important fields and constraints |
|---|---|
| `machine_models` | Manufacturer, model name, serial rules, default warranty months, active flag. |
| `registered_machines` | Customer, model, normalized serial or serial-pending flag, source (`manual`/`order`), linked order item when purchased, purchase date, warranty start/end snapshot. Unique model/serial when present. |
| `service_types` | Hebrew customer label, English admin label, diagnostic fee agorot, active flag, supported model mapping. |
| `service_requests` | Human-readable reference, customer, machine, service type and fee snapshot, state, description, location mode, address/shop snapshot, preferred window, confirmed appointment, assigned technician, timestamps. |
| `service_quotes` | Service request, additional amount, customer-visible explanation, admin author, decision and decision time. At most one active quote in MVP. |
| `service_notes` | Request, author, visibility (`internal` or `customer`), body, timestamp. Technician notes default to internal unless explicitly marked customer-visible by an admin. |
| `service_media` | Request, optional note, uploader, object key, media type, purpose (`issue`/`diagnosis`/`repair`), timestamp. |
| `service_status_history` | Request, from/to state, actor/source, reason, timestamp. |

### 12.5 Notifications and operations

| Entity | Important fields and constraints |
|---|---|
| `notifications` | Recipient, type, Hebrew title/body, related entity, read time, created time. |
| `outbox_events` | Unique event ID, type, aggregate reference, JSON payload, availability time, attempt count, processing/result fields. |
| `notification_deliveries` | Notification, channel, provider result, attempts, final state. |
| `audit_logs` | Actor, action, target, before/after safe JSON, IP/request metadata, correlation ID, time. Sensitive secrets and full payment data are excluded. |

## 13. API design approach

- RESTful JSON API under `/api/v1` with an OpenAPI document generated by FastAPI.
- Resource-oriented customer endpoints and command-oriented admin actions where a state transition is clearer than generic updates.
- OAuth2-style bearer access tokens and rotated refresh tokens; the OTP flow has dedicated request and verify endpoints.
- Stable machine-readable error codes using `application/problem+json`, with localized display messages kept separate from codes.
- Cursor pagination for event/history feeds and standard page/limit pagination for small admin tables.
- Explicit filtering and sorting allowlists to prevent accidental expensive queries.
- `Idempotency-Key` is required for checkout, payment creation, refunds, and other externally consequential commands.
- Stripe and Twilio webhooks use dedicated unauthenticated routes protected by provider signature verification, replay protection, and event idempotency.
- Optimistic concurrency versions protect admin edits where lost updates would be harmful.
- API responses return allowed next actions for stateful resources.
- OpenAPI-generated TypeScript clients are consumed by mobile and admin applications to reduce contract drift.
- Dates use ISO 8601 with offsets; identifiers are opaque strings; monetary values are integer agorot.
- Customer endpoints always derive ownership from the authenticated user rather than accepting a trusted customer ID.

Representative endpoint groups include:

- `/auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`
- `/catalog/categories`, `/catalog/products`, `/catalog/products/{id}`
- `/cart`, `/cart/items`, `/checkout`, `/orders`, `/orders/{id}`
- `/machines`, `/machines/{id}`, `/machines/{id}/service-requests`
- `/service-requests/{id}`, `/service-requests/{id}/diagnostic-payment`, `/service-requests/{id}/quote-decision`, `/service-requests/{id}/additional-payment`
- `/media/uploads`, `/media/uploads/{id}/complete`
- `/notifications`, `/notifications/{id}/read`
- `/admin/products`, `/admin/inventory`, `/admin/orders`, `/admin/service-requests`, `/admin/technicians`, `/admin/dashboard`
- `/technician/jobs`, `/technician/jobs/{id}/status`, `/technician/jobs/{id}/notes`
- `/webhooks/stripe`, `/health/live`, `/health/ready`

## 14. Customer frontend structure

### 14.1 Technology and behavior

The customer app uses Expo with React Native and TypeScript. Expo is the default managed workflow; native projects may be generated later if a verified native requirement demands it. Server state uses a query/cache library, form state uses schema-backed validation, and authentication tokens are held in Expo SecureStore.

The application treats the server as authoritative for cart expiry, inventory, prices, orders, payments, machines, service states, and notifications. Optimistic UI is allowed for reversible cart interactions, but any server rejection immediately reconciles the displayed cart and explains the result in Hebrew.

### 14.2 Navigation

The unauthenticated stack contains Splash, Welcome, Phone, and OTP. The authenticated shell contains five RTL bottom tabs, each with its own navigation stack:

1. `בית` — home and activity summaries.
2. `חנות` — categories, product list, product detail, cart, checkout, and confirmation.
3. `שירות` — machines, registration, machine detail, service intake, payment, and status.
4. `הזמנות` — order list and order detail.
5. `פרופיל` — account, addresses, notifications entry points, and logout.

Notifications are also reachable from the global header and display an unread badge.

### 14.3 Design source of truth

Frontend implementation must closely follow `design/design_handoff_coffeeshop_mobile/`:

- Recreate the handoff in React Native; do not copy its prototype HTML as production code.
- Use Hebrew RTL layout and the provided Hebrew copy.
- Preserve the five-tab navigation model.
- Use the Warm & Artisanal palette, typography, spacing, radii, elevation, icon weight, interaction behavior, and screen hierarchy from the handoff.
- Use the handoff's default Editorial home and default service stepper variants unless an implementation constraint is documented and approved.
- Treat the handoff as the visual source of truth for layout, spacing, typography, colors, and copy; this specification remains authoritative for business rules and backend-controlled states.
- Validate representative screens on both iOS and Android and at common text-scaling settings.

## 15. Admin and technician dashboard

The web dashboard uses React and TypeScript with protected, role-aware routes. It is optimized for desktop admin use while technician job screens remain practical on a phone.

Admin navigation groups work by operational queue rather than raw database tables:

- Overview: revenue/order counts, open services, awaiting-payment items, low tracked stock, failed jobs, and today's appointments.
- Catalog: categories, products, SKUs, media, prices, activation, and stock.
- Orders: filterable queue, detail, status actions, shipment data, cancellation, and refund.
- Service: payment/status queues, request detail, media, quote, scheduling, assignment, and history.
- Configuration: machine models, model/service mappings, service types, diagnostic fees, shop/pickup settings.
- People: customer lookup, technicians, active/inactive state, and controlled role management.
- Operations: notification failures and audit logs.

Destructive or monetary actions require an explicit confirmation showing the affected record and amount. The dashboard hides unauthorized navigation and the API independently enforces every permission.

## 16. Integrations

### 16.1 Stripe

- Stripe PaymentIntents handle product, diagnostic, and additional service payments as separate payment records.
- Stripe's React Native SDK handles mobile payment confirmation.
- Webhooks are authoritative for final payment/refund outcomes.
- Metadata contains opaque internal references, not sensitive customer details.
- The application never stores raw card data.
- Local development uses a deterministic fake provider by default and can opt into Stripe test mode.

Assumption: the business will supply a Stripe account capable of accepting the required ILS transactions before cloud launch. The payments module isolates Stripe-specific code so another supported provider can replace it if commercial availability or account approval blocks launch.

### 16.2 Twilio Verify

- Twilio Verify sends and validates production OTP challenges.
- The local fake accepts configured development codes and never sends SMS.
- Rate limits, resend cooldowns, and generic responses reduce enumeration and SMS abuse.

Assumption: the business will supply an approved Twilio account and sender configuration for Israeli numbers before production launch.

### 16.3 Media storage

- Local development stores media under a configured non-source-controlled directory.
- Cloud environments use private S3 buckets with encryption, lifecycle rules, and blocked public access.
- Clients use short-lived presigned upload/download URLs in cloud environments.
- The API validates declared type, observed type, size, count, ownership, and completion.

MVP media limits are assumed to be five issue attachments per service request, 10 MB per image, and 100 MB per video. Supported launch formats are JPEG, PNG, HEIC where the client can normalize it, and MP4. Limits remain configuration values.

### 16.4 Firebase Cloud Messaging

- FCM delivers push notifications to registered iOS and Android devices.
- In-app notification records are created before delivery attempts.
- Invalid device tokens are deactivated after definitive provider rejection.

### 16.5 Email

Email is not required for MVP completion. If enabled later, Resend uses the same notification-outbox flow for operational receipts or staff alerts. OTP remains SMS-only.

## 17. Local development architecture

Local-first development is mandatory. A developer can run the complete core platform without AWS credentials or paid provider calls.

Local runtime:

- Mobile app through Expo development tooling.
- Admin dashboard through its local development server.
- FastAPI API with reload support.
- Background worker as a separate local process.
- PostgreSQL and Redis in containers.
- Local filesystem media adapter.
- Fake Stripe, Twilio, FCM, and optional email adapters.
- Seed command that creates the initial admin, technician, customer, catalog, machine models, service types, demo machines, and representative workflow records.

Provider mode is selected explicitly by configuration. Development never silently calls a real provider. Local test clocks or injectable clocks make cart expiry, payment deadlines, warranties, and appointments deterministic.

Required local health checks:

- Liveness confirms the API process and event loop can respond.
- Readiness confirms PostgreSQL access and successful migration compatibility; Redis/storage readiness is reported according to whether the dependent feature is enabled.
- Worker health reports heartbeat, queue/outbox lag, and last successful expiration pass.

## 18. Cloud and AWS architecture

Terraform manages the AWS infrastructure after local workflows are stable.

Planned AWS components:

- VPC spanning at least two Availability Zones.
- Public subnets for load balancers and controlled egress infrastructure.
- Private subnets for Kubernetes nodes, RDS, and Redis.
- EC2 instances for the self-managed Kubernetes control plane and workers.
- RDS for PostgreSQL with encryption, automated backups, restricted security groups, and production deletion protection.
- ElastiCache for Redis with encryption and environment-specific credentials.
- Private S3 buckets for media and infrastructure state, with versioning and lifecycle rules where appropriate.
- ECR repositories for immutable API, worker, and admin images.
- Route 53 and ACM for DNS and TLS.
- IAM roles following least privilege, including GitHub Actions access through OIDC rather than stored AWS keys.
- CloudWatch as an infrastructure-level safety net while application observability is collected by the Kubernetes stack.

Production data backups must have a documented restore test. Terraform state uses a remote encrypted backend with locking and tightly restricted access. Application secrets do not appear in Terraform outputs, Git, images, or frontend bundles.

## 19. Kubernetes architecture

The application runs on self-managed Kubernetes installed on EC2, not EKS. Terraform provisions the underlying network, instances, security groups, load balancers, IAM, databases, and storage. A versioned bootstrap process installs and upgrades Kubernetes and required cluster add-ons.

### 19.1 Cluster topology

The MVP uses one cluster with two isolated namespaces:

- `coffeeshop-dev`
- `coffeeshop-prod`

Each namespace has separate Deployments, Services, Ingress rules, service accounts, ConfigMaps, Secrets, database credentials/databases, Redis credentials/key prefixes, storage prefixes, quotas, and network policies. Production uses stricter resource guarantees, autoscaling thresholds, disruption budgets, and deployment approvals.

This shared-cluster decision reduces early cost and administration but does not provide a hard failure boundary. Separate AWS accounts and separate clusters are the recommended future production-isolation upgrade.

### 19.2 Workloads and platform services

- API Deployment with multiple production replicas, readiness/liveness/startup probes, rolling updates, and a disruption budget.
- Worker Deployment with queue/outbox health and controlled shutdown.
- Admin static application served through a small web container or approved static hosting path.
- Ingress controller behind an AWS load balancer with TLS.
- Metrics collector, Prometheus, Grafana, Alertmanager, and centralized log collection.
- Migration Job executed once per release before application rollout.
- Scheduled safety jobs for reservation/payment expiration and operational checks; application logic remains idempotent if jobs overlap.

Managed RDS, Redis, and S3 stay outside the cluster. Stateful application data is not placed on Kubernetes node disks.

### 19.3 Cluster security

- Namespaced RBAC with dedicated service accounts per workload.
- Default-deny ingress and egress NetworkPolicies, followed by narrow allow rules.
- Pod Security Admission using the restricted profile where workloads permit.
- Non-root containers, read-only root filesystems, dropped Linux capabilities, seccomp, resource requests/limits, and pinned image digests in production.
- Kubernetes API and node management access limited to an approved administrative path.
- Regular Kubernetes, node image, and add-on upgrade procedure with development validation first.

## 20. Configuration and secrets

Configuration is validated at process startup. Non-secret values use environment variables or mounted configuration. Secrets come from local ignored files in development and an AWS-backed secret-management path in cloud environments.

Configuration groups include:

- Runtime: environment name, API/public URLs, build version, log level, timezone display setting.
- Database: PostgreSQL DSN, pool sizes, statement/connection timeouts.
- Redis/worker: Redis URL, queue names, worker concurrency, lock and retry settings.
- Auth: access/refresh TTLs, token signing keys, OTP cooldown and rate limits.
- Providers: mode (`fake` or real), Stripe keys/webhook secret, Twilio credentials/service SID, FCM credentials, optional Resend key.
- Media: adapter, local path, S3 bucket/region/prefix, presigned URL TTL, file limits.
- Commerce: cart inactivity TTL of 60 minutes, pending-payment TTL of 30 minutes, shipping fee configuration.
- Service: shop address, appointment timezone, upload limits.
- Observability: service name, metric/export endpoints, trace sampling, alert destinations.

Assumption: product orders use delivery only in the MVP and have one admin-configured flat shipping fee, which may be zero. Store pickup for product orders is future scope. Service bring-in remains supported and is unrelated to product shipping.

## 21. CI/CD strategy

GitHub Actions is the assumed CI/CD platform.

### 21.1 Pull-request validation

- Dependency installation from locked versions.
- Formatting and linting for Python and TypeScript.
- Static typing for backend and both frontends.
- Backend unit and integration tests against real PostgreSQL and Redis service containers.
- Mobile component tests, including representative RTL assertions.
- Admin component and browser tests.
- OpenAPI generation and generated-client drift check.
- Database migration upgrade check from a clean database and from the current release baseline.
- Terraform formatting, validation, linting, security scanning, and tests.
- Kubernetes/Helm rendering, schema validation, policy checks, and container scanning.
- Secret scanning and dependency vulnerability checks.

### 21.2 Build and deployment

1. A successful main-branch build creates immutable images tagged with the Git commit SHA and records provenance.
2. Images are scanned and pushed to ECR.
3. Development deployment runs migrations as a one-off Job, rolls out workloads, and runs smoke tests.
4. Production promotion uses the same image digests, requires explicit approval, runs a database backup/preflight, executes backward-compatible migrations, and rolls out with health gates.
5. Failed health gates stop promotion and roll back application workloads when database compatibility permits.

Mobile release automation builds signed Expo application artifacts for internal testing and store submission. Store publication remains an explicit human-approved step.

Migrations follow expand-and-contract compatibility so the previous and next application versions can operate safely during rolling deployments. Destructive schema cleanup is separated from the release that stops using the old schema.

## 22. Observability strategy

Application code emits structured JSON logs and OpenTelemetry-compatible metrics/traces with correlation IDs. The Kubernetes observability stack uses Prometheus, Grafana, Alertmanager, and centralized logs such as Loki. Trace storage may use Grafana Tempo when enabled; metrics and logs are required for MVP operations.

### 22.1 Logs

- Request ID, correlation ID, service, environment, route template, status, duration, actor ID when safe, and domain event reference.
- Structured worker job start/result/retry/dead-letter information.
- Audit logs for role changes, stock corrections, pricing, order transitions, refunds, quotes, scheduling, and assignments.
- No OTP values, auth tokens, raw provider secrets, card data, or unrestricted media URLs.

### 22.2 Metrics

- API request rate, latency, error rate, saturation, and active requests.
- PostgreSQL pool use, query latency, transaction failures, and migration version.
- Redis connectivity and worker/outbox queue depth, age, attempts, and failures.
- Cart reservations created/released/expired, reservation-release lag, and stock conflicts.
- Orders and service requests by state and state age.
- Payment attempts, confirmations, declines, webhook lag, duplicate events, and reconciliation mismatches.
- Notification delivery success/failure and invalid-token count.
- Kubernetes replica health, restarts, CPU, memory, node capacity, and certificate expiry.

### 22.3 Dashboards and alerts

Dashboards cover platform overview, commerce funnel, service funnel, payments, background work, database/Redis, and Kubernetes capacity. Initial alert thresholds are treated as versioned operating assumptions and tuned from production data.

High-priority alerts include:

- API unavailability or readiness failure.
- Sustained 5xx rate above 5% for five minutes.
- Sustained p95 API latency above two seconds for ten minutes.
- Failed or delayed payment webhooks.
- Reservation/payment expiration lag above five minutes.
- Repeated background-job failure or growing outbox age.
- RDS storage/connection pressure, Redis failure, pod crash loops, unavailable replicas, node pressure, and certificate expiry.
- Production deployment health-check failure.

Every actionable alert names an owner, severity, runbook link, and customer impact. Alerts must avoid using business notifications as the only signal of system health.

## 23. Security and permissions

### 23.1 Application security

- Enforce authorization at the service/query boundary and object ownership in every customer request.
- Use short-lived signed access tokens and rotating, revocable refresh tokens stored hashed server-side.
- Store mobile credentials only in secure device storage; do not store auth tokens in ordinary async storage.
- Protect web sessions against token theft and cross-site attacks using an architecture-appropriate secure storage strategy and strict origin policy.
- Rate-limit OTP, authentication, media, checkout, and sensitive admin endpoints.
- Validate all input with strict schemas, length limits, allowlists, and normalized identifiers.
- Use parameterized database access and safe output encoding.
- Verify webhook signatures against the raw request body and reject stale/replayed events.
- Require idempotency keys for payment/refund commands.
- Keep private media private; authorize every download or issue short-lived signed URLs.
- Validate file type and size. Malware scanning is recommended before public launch if customer videos are accepted and becomes required when risk assessment or provider policy demands it.
- Record admin and technician actions in immutable audit history.

### 23.2 Permission summary

| Capability | Customer | Technician | Admin |
|---|---:|---:|---:|
| View catalog | Yes, authenticated | No operational need | Yes |
| Manage cart/pay order | Own only | No | No customer checkout |
| View/update orders | View own | No | All; permitted state actions |
| Cancel/refund product order | No | No | Yes, full-refund rule |
| Manage machines | Own registration/view | Assigned-job context only | All operational records |
| Create/pay/cancel service | Own; cancel only before diagnostic payment | No | Operational actions only; cannot refund service payment |
| View service request | Own | Assigned only | All |
| Add technician notes/media | No | Assigned only | Yes |
| Set fees, quote, schedule, assign | No | No | Yes |
| Manage roles/catalog/config | No | No | Yes |

### 23.3 Infrastructure security

- TLS in transit and AWS-managed encryption at rest.
- Least-privilege IAM roles and short-lived CI credentials through GitHub OIDC.
- Private data services with no public database or Redis endpoints.
- Restricted security groups, Kubernetes RBAC, default-deny network policy, and hardened containers.
- Separate development and production credentials and data.
- Regular dependency, image, node, Kubernetes, and Terraform scanning/upgrades.
- Backup retention, restore drills, audit retention, and incident-response ownership are established before production use.

## 24. Error handling and resilience

- API errors use stable codes, HTTP status, a safe Hebrew-capable message, correlation ID, and field-level details when relevant.
- Domain conflicts such as insufficient stock, expired cart, invalid transition, duplicate machine serial, or payment already processed return specific `409` error codes.
- Validation problems return `422`; authentication failures return `401`; denied role/ownership checks return `403`; absent or hidden resources return `404` as appropriate.
- Clients map codes to reviewed Hebrew messages and never display raw provider or stack errors.
- External-provider timeouts return retry-safe results. Unknown payment outcomes remain pending until webhook or reconciliation confirms them.
- Provider calls use bounded timeouts, limited exponential retries with jitter, and circuit-breaking/back-pressure where repeated failures could exhaust workers.
- Outbox delivery is at-least-once; consumers and provider commands are idempotent.
- Dead-lettered jobs remain inspectable and retryable by an administrator or operator.
- Database transactions are short and wrap each state change plus its history/outbox records.
- Startup validates required configuration and migration compatibility and fails loudly when unsafe.
- Graceful shutdown stops accepting traffic, drains in-flight requests/jobs within a limit, and leaves work retryable.
- A reconciliation job compares pending payments/refunds with provider state and flags mismatches without inventing a successful payment.

## 25. Testing strategy

Testing is part of every implementation phase, not a final hardening activity.

### 25.1 Backend

- Unit tests for money calculation, phone normalization, role rules, status transitions, warranty calculation, quote decisions, and notification-event construction.
- Property/concurrency tests for inventory invariants: reservations never exceed tracked stock, releases are idempotent, and unlimited stock behaves independently.
- Integration tests against PostgreSQL and Redis for transactions, migrations, expiration, outbox delivery, and repository queries.
- API tests for authentication, ownership, role boundaries, validation, pagination, and stable error codes.
- Provider contract tests using recorded/synthetic Stripe and Twilio webhook fixtures without real production calls.
- Migration tests from an empty database and supported previous schema baseline.

### 25.2 Mobile

- Unit tests for formatting, RTL-safe helpers, API error mapping, and state selectors.
- React Native Testing Library tests for authentication, product, cart, payment-gate, machine, service, notification, and accessibility states.
- Visual checks against the handoff for representative iOS and Android screen sizes.
- Maestro or equivalent end-to-end flows for OTP login with the fake provider, purchase, manual machine registration, service intake, diagnostic payment, additional-cost accept/decline, and tracking.

### 25.3 Admin and technician web

- Component tests for permissions, forms, tables, states, confirmations, and error handling.
- Playwright end-to-end tests for catalog/stock, order processing/refund, service review/quote/scheduling/assignment, and technician job updates.
- Negative tests prove technicians cannot access admin capabilities or unassigned jobs.

### 25.4 Infrastructure and operations

- Terraform format, validation, lint, security checks, and native Terraform tests with mocked providers where practical.
- Kubernetes manifest rendering, schema validation, security-policy checks, and namespace-isolation tests.
- Deployment smoke tests for migrations, health endpoints, API availability, and core read-only journeys.
- Backup-restore rehearsal in a non-production environment.
- Failure drills for duplicate webhooks, worker restart, Redis outage, provider timeout, and expired reservations.

Critical tests use deterministic clocks, IDs, provider fakes, and seeded data. Tests never depend on shared production accounts.

## 26. MVP versus future work

| Area | MVP | Future |
|---|---|---|
| Commerce | Authenticated catalog, cart reservations, payment, single shipment, manual tracking, full admin refund | Guest browsing, pickup, shipping APIs, partial refunds, returns, promotions, subscriptions |
| Service | Registration, bring-in/pickup, preferred window, manual scheduling, two-phase payment, technician workflow | On-site visits, capacity enforcement, automated dispatch, chat, multiple quotes/repair options |
| Warranty | App-purchase eligibility with snapshotted configurable duration | Claims adjudication, extended plans, manufacturer integrations |
| Mobile | Hebrew RTL Expo app for iOS/Android | Additional locales, web storefront, offline support |
| Notifications | In-app and mandatory push | Preferences, opt-out, richer email/SMS notification channels |
| Architecture | Modular monolith plus worker | Extract a service only when load/team boundaries justify it |
| AWS isolation | One cluster, dev/prod namespaces, separate credentials/data | Separate AWS accounts and Kubernetes clusters |
| Observability | Logs, metrics, dashboards, alerts; optional trace storage | Full distributed tracing, SLO automation, advanced business analytics |

## 27. Assumptions

The following fill gaps in the product brief and must be validated before production launch:

- Expo managed workflow is suitable for the first mobile release.
- The technician experience is a responsive restricted area of the React dashboard, not a second native app.
- Product orders use delivery only and one configurable flat shipping fee; product pickup is excluded.
- The pending product-payment reservation window is 30 minutes.
- App-purchased machines receive a model-configured warranty whose initial default is 12 months.
- A purchased machine may be auto-registered with a pending serial number that the customer/admin completes later.
- Service pickup has no separate fee in the MVP; any approved repair charge uses the additional-cost phase.
- A preferred service window is non-binding; admin confirmation after diagnostic payment creates the appointment.
- One active additional service quote is sufficient for the MVP.
- One shipment record per product order is sufficient.
- Stripe and Twilio accounts capable of the required Israeli flows will be available before production; provider adapters reduce replacement cost if not.
- The business supplies final legal text, privacy policy, refund/service terms, shop address, support contacts, shipping price, tax/accounting requirements, and production Hebrew copy approval.
- Prices presented by the business are treated as customer-payable totals; final Israeli tax-invoice/accounting integration is outside the MVP unless legally required for launch.
- One Kubernetes cluster with development and production namespaces is acceptable for the initial release despite its weaker failure isolation.

## 28. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Stripe or Twilio account/region approval is unavailable | Production payments or OTP cannot launch | Validate accounts early; keep provider interfaces; use fake/test modes locally; select an approved substitute before client integration is frozen. |
| Atomic cart reservations create contention or stale holds | Overselling or reduced availability | PostgreSQL row locks, short transactions, indexed reservations, synchronous expiry checks, periodic expiration, concurrency tests, and reservation-lag alerts. |
| Payment succeeds while local processing is delayed | Customer uncertainty or stock inconsistency | Webhook authority, pending states, provider-event idempotency, order-owned holds, reconciliation jobs, and staff-visible mismatch queue. |
| Two-phase service flow becomes operationally confusing | Repairs start without authorization or customers misunderstand charges | Explicit state machine, allowed-action responses, immutable fee snapshots, clear Hebrew copy, admin confirmations, and end-to-end tests. |
| Manual scheduling permits double-booking | Delays and poor service | Visible overlap warnings, daily schedule dashboard, admin ownership; capacity enforcement remains future scope. |
| Customer media is large, unsafe, or costly | Storage/security/latency problems | Private storage, configurable limits, type validation, direct uploads, lifecycle rules, and malware-scanning decision before launch. |
| Hebrew RTL differs between iOS and Android | Poor usability or design mismatch | Central design tokens, logical layout properties, real-device checks, text-scaling tests, and handoff-based visual review. |
| Self-managed Kubernetes adds substantial operational burden | Security, availability, and upgrade risk | Build locally first, keep managed data services, automate/bootstrap versioning, use hardened defaults, rehearse upgrades, document ownership; reassess EKS only if the business changes the constraint. |
| Shared dev/prod cluster increases blast radius | Development activity can affect production | Namespace isolation, quotas, priorities, network policy, separate credentials/data, production approvals; move to separate accounts/clusters when feasible. |
| Legal, tax, invoice, privacy, or non-refundable-service terms are incomplete | Launch/compliance risk | Obtain Israeli legal/accounting review before production acceptance; keep policy copy/config separate from domain implementation where possible. |
| Scope spans commerce, field service, mobile, web, payments, and infrastructure | Schedule and integration risk | Deliver vertical, testable phases; stabilize backend APIs before dashboard build; require local end-to-end acceptance before AWS work. |

## 29. Specification acceptance

This specification is ready for implementation planning when the product owner accepts:

- The modular-monolith architecture and local-first delivery order.
- Expo for the customer application and a responsive React dashboard for staff.
- The explicit order, stock-reservation, machine, warranty, service-payment, and scheduling rules.
- The marked MVP assumptions, especially product delivery, warranty duration, media limits, provider availability, and shared Kubernetes cluster.
- The strict separation between MVP and future capabilities.

