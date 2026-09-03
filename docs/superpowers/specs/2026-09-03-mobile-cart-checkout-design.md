# Mobile Reserved Cart and Checkout Design

## Scope

Task 20 adds the authenticated Hebrew RTL cart, checkout, payment, and order-confirmation experience. It consumes the existing cart, address, checkout, payment-intent, and order endpoints without changing their authority: inventory, prices, totals, reservation expiry, and payment completion remain server-owned.

The implementation follows the existing Expo Router, TanStack Query, generated OpenAPI types, shared design primitives, and Warm & Artisanal handoff. It does not add promotions, alternative delivery methods, saved payment instruments, or order tracking implementation from Task 21.

## Architecture

The feature is split into focused modules:

- `cart/api.ts` owns cart and checkout HTTP calls, including `Idempotency-Key`.
- `cart/queries.ts` owns customer-scoped cart and order query keys and server refresh behavior.
- `cart/mutations.ts` owns optimistic cache updates and one serialized mutation queue per SKU.
- `cart/expiry.ts` derives display-only remaining time and requests authoritative reconciliation when the displayed deadline passes.
- `addresses/api.ts` owns saved-address reads and creation.
- `addresses/form.ts` owns typed Israeli address state, normalization, and Hebrew validation messages.
- `payments/fake.ts` and `payments/stripe.ts` implement the same client-confirmation interface.
- `payments/usePayment.ts` coordinates checkout, client confirmation, and order polling without treating an SDK result as final payment success.

The screens stay presentation-focused and compose these modules. No mobile-local cart model becomes authoritative.

## Cart Data Flow

Opening the cart fetches `GET /api/v1/cart`. The UI renders item prices, quantities, `subtotal_agorot`, `total_quantity`, currency, and `expires_at` exactly from that response.

Quantity changes optimistically update the cached quantity and derived display total. Mutations for the same SKU run sequentially, while different SKUs may update independently. A successful response replaces the entire cached cart so server prices, totals, versions, and expiry win. On `INSUFFICIENT_STOCK`, the UI restores the last confirmed cart, refetches, and explains in Hebrew that the requested quantity is unavailable. Other failures also restore and refetch before showing the mapped error. Removal uses the same serialization and reconciliation rules.

The reservation countdown is informational. A successful cart mutation refreshes it from the returned `expires_at`. When it reaches zero, the app invalidates and refetches the cart. `CART_EXPIRED` clears the stale presentation and shows an explanation with a route back to shopping.

If a mutation or checkout response changes a unit price or total, the response replaces the displayed values and a short Hebrew notice explains that the price was updated by the server.

## Cart Screen

`cart.tsx` recreates the handoff's top bar, item cards, quantity steppers, remove actions, totals card, and sticky checkout action using existing design tokens and primitives. The unsupported promotion-code row is omitted. A visible reservation panel takes its place, explaining that items are reserved temporarily and showing the remaining time.

The empty, loading, error, expired, and active-cart states remain accessible under common text scaling. Item images are decorative when the adjacent product is the accessible product. Controls have Hebrew labels that include the product name and resulting quantity or removal action.

## Address and Checkout Flow

`checkout.tsx` displays the handoff's three-step heading, saved-address cards, standard delivery card, server-owned order summary, and sticky secure-payment action.

Saved addresses come from `GET /api/v1/users/me/addresses`; the default address is initially selected. “הוספת כתובת חדשה” expands an inline form for recipient name, Israeli phone number, street, building, optional apartment, city, and optional postal code. Country is always `IL`. Required strings are trimmed, the phone is normalized to `+972`, and field-specific Hebrew errors are shown before submission. A valid new address is saved through the existing address endpoint and selected for checkout.

Checkout sends exactly one of `address_id` or an inline address and always sends a generated `Idempotency-Key`. The key is created once for a checkout attempt and reused after uncertain transport failures. While the request is active, the payment action is disabled to prevent duplicate submission. The returned `CheckoutRead.order` replaces the checkout summary so shipping and totals are authoritative.

## Payment Confirmation

Payment behavior is selected by `EXPO_PUBLIC_PAYMENT_PROVIDER`, defaulting to `fake`. The Stripe React Native SDK and provider configuration are initialized only for `stripe` mode. The fake adapter deterministically reports that client confirmation was submitted; backend fake-provider events remain responsible for changing the order state during local and automated end-to-end runs.

Both adapters return a normalized client outcome:

- `submitted`: confirmation was accepted client-side; begin authoritative order polling.
- `declined`: show the Hebrew decline message and allow a deliberate retry.
- `unknown`: explain that the outcome is uncertain and continue checking the order before allowing a safe retry with the same idempotency key.

A Stripe SDK success means only that client confirmation was submitted. `usePayment` polls `GET /api/v1/orders/{order_id}` until it observes `paid` or another terminal state. Only `paid` navigates to confirmation. `pending_payment` remains a processing state, `payment_expired` prompts the customer to rebuild checkout, and `cancelled` or payment failure displays a non-success result.

## Confirmation and Deep Links

`confirmation.tsx` accepts an `orderId` route parameter and fetches that order. It renders success only for the server-verified `paid`, `processing`, `shipped`, or `delivered` states, uses the real order number and total, links to the Task 21 order-detail route, and offers a return-home action. Direct links and reloads therefore reconstruct confirmation from backend state instead of navigation memory.

If the order is still pending, the screen displays processing and continues bounded polling. An inaccessible, failed, expired, or cancelled order never renders the success treatment.

## Testing and Verification

React Native Testing Library tests cover:

- optimistic quantity changes, per-SKU serialization, removal, and authoritative response replacement;
- rollback and Hebrew feedback for `INSUFFICIENT_STOCK`;
- countdown display, expiry reconciliation, and reload;
- server price-change replacement and notice;
- saved-address selection, Israeli address normalization, and field validation;
- one idempotency key per attempt, retry-key reuse, and duplicate-tap prevention;
- pending, declined, unknown, and successful client payment outcomes;
- the rule that confirmation requires a server-verified paid order;
- confirmation deep links, RTL semantics, accessible labels, and text scaling.

The local end-to-end purchase uses the fake payment provider, submits one confirmed fake event twice with the same event ID, verifies idempotent order finalization, and confirms the app reaches the real order confirmation. Final checks are the focused component tests, complete mobile test suite, lint, TypeScript, accessibility assertions, and `git diff --check`.
