# Mobile Reserved Cart and Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Task 20's authenticated Hebrew RTL reserved cart, Israeli address checkout, fake/Stripe payment confirmation, and server-verified order confirmation.

**Architecture:** Expo screens remain thin over customer-scoped TanStack Query data. Cart mutations optimistically overlay server data while a per-SKU coordinator serializes requests, checkout retains one idempotency key through uncertain retries, and normalized fake/Stripe adapters only initiate client payment confirmation; order polling is the sole success gate.

**Tech Stack:** TypeScript 6, Expo SDK 57, React Native 0.86, Expo Router, TanStack Query 5, Stripe React Native SDK installed with Expo, Jest, React Native Testing Library, FastAPI fake-provider endpoints for local verification.

## Global Constraints

- Follow `docs/spec.md`; the server remains authoritative for inventory, prices, totals, cart expiry, orders, and payment completion.
- Customer-facing copy is Hebrew and rendered RTL with logical start/end spacing.
- Match the Warm & Artisanal cart, checkout, and confirmation handoff using existing tokens and primitives; do not copy prototype HTML.
- Send only SKU identity and desired quantity for cart changes, and exactly one of `address_id` or `address` for checkout.
- Use `Idempotency-Key` for checkout and retain the same key after uncertain transport outcomes.
- A client SDK result never marks the order paid; only `GET /api/v1/orders/{order_id}` may unlock confirmation.
- Default local payment mode is `fake`; initialize Stripe only when `EXPO_PUBLIC_PAYMENT_PROVIDER=stripe`.
- Do not add promotions, alternative delivery methods, saved payment methods, order-list/detail UI, or backend business-rule changes.
- Use one final Task 20 implementation commit, including `docs/plan.md`, with message `feat: add mobile cart and checkout`.

---

### Task 1: Install and isolate the payment runtime

**Files:**
- Modify: `mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `mobile/app.json`
- Modify: `mobile/.env.example`
- Modify: `mobile/app/_layout.tsx`
- Create: `mobile/src/features/payments/fake.ts`
- Create: `mobile/src/features/payments/stripe.ts`
- Create: `mobile/src/features/payments/usePayment.ts`
- Test: `mobile/tests/checkout/payment.test.tsx`

**Interfaces:**
- Produces `PaymentMode = 'fake' | 'stripe'` and `paymentMode(): PaymentMode`.
- Produces `PaymentClientResult = { status: 'submitted' } | { status: 'declined'; message: string } | { status: 'unknown'; message: string }`.
- Produces `PaymentConfirmer.confirm(clientSecret: string): Promise<PaymentClientResult>`.
- Produces `PaymentRuntimeProvider` and `usePaymentConfirmer()`; fake mode does not invoke Stripe initialization.

- [ ] **Step 1: Write failing adapter/runtime tests**

Mock `@stripe/stripe-react-native` and assert fake mode returns `submitted` without calling `initPaymentSheet` or `presentPaymentSheet`. Assert Stripe maps a successful sheet presentation to `submitted`, `Failed` to `declined`, and thrown/unclassified errors to `unknown`:

```tsx
expect(await fakePaymentConfirmer.confirm('fake_secret')).toEqual({ status: 'submitted' });
expect(initPaymentSheet).not.toHaveBeenCalled();

expect(await confirmer.confirm('pi_secret')).toEqual({ status: 'submitted' });
expect(initPaymentSheet).toHaveBeenCalledWith(expect.objectContaining({
  merchantDisplayName: 'Coffix',
  paymentIntentClientSecret: 'pi_secret',
  returnURL: 'coffix://stripe-redirect',
}));
```

- [ ] **Step 2: Run the payment test and confirm red**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/checkout/payment.test.tsx
```

Expected: failure because the payment modules and Stripe dependency do not exist.

- [ ] **Step 3: Install the Expo-compatible Stripe SDK**

Run from `mobile/`:

```bash
pnpm expo install @stripe/stripe-react-native
```

Use Expo's selected compatible version; do not hand-pick a version. Add the Stripe config plugin with `enableGooglePay: false` and no Apple merchant identifier because wallet payments are outside MVP.

Add safe configuration:

```dotenv
EXPO_PUBLIC_PAYMENT_PROVIDER=fake
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_replace_me
```

- [ ] **Step 4: Implement normalized fake and Stripe confirmers**

Keep SDK-specific errors in `stripe.ts` and expose only the normalized interface:

```ts
export type PaymentClientResult =
  | { status: 'submitted' }
  | { status: 'declined'; message: string }
  | { status: 'unknown'; message: string };

export type PaymentConfirmer = {
  confirm(clientSecret: string): Promise<PaymentClientResult>;
};
```

The Stripe implementation must call `initPaymentSheet` with the existing backend PaymentIntent client secret, then `presentPaymentSheet`. Treat customer cancellation as declined/cancelled without creating success UI. Wrap `StripeProvider` only in `stripe` mode and reject stripe mode at startup when the publishable key is missing or still `pk_test_replace_me`.

- [ ] **Step 5: Run the focused test and configuration check**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/checkout/payment.test.tsx
pnpm --filter @coffix/mobile config-check
```

Expected: pass, and public Expo config includes the Stripe plugin without secrets.

---

### Task 2: Build typed cart transport, expiry helpers, and serialized optimistic mutations

**Files:**
- Create: `mobile/src/features/cart/api.ts`
- Create: `mobile/src/features/cart/queries.ts`
- Create: `mobile/src/features/cart/mutations.ts`
- Create: `mobile/src/features/cart/expiry.ts`
- Modify: `mobile/src/features/catalog/api.ts`
- Modify: `mobile/src/features/catalog/queries.ts`
- Modify: `mobile/src/api/errors.ts`
- Test: `mobile/tests/cart/expiration.test.tsx`
- Test: `mobile/tests/cart/conflict.test.tsx`

**Interfaces:**
- Aliases generated `CartRead`, `CartItemRead`, `CheckoutRequest`, `CheckoutRead`, and `OrderRead` types.
- Produces `cartApi.get()`, `setItem(skuId, quantity)`, `removeItem(skuId)`, `checkout(input, idempotencyKey)`, and `getOrder(orderId)`.
- Produces `cartKeys.cart(scope)` and `cartKeys.order(scope, orderId)` plus `useCart` and `useOrder`.
- Produces `remainingSeconds(expiresAt, now)`, `formatRemaining(seconds)`, and `useCartExpiry(expiresAt, onExpired)`.
- Produces `useCartMutations(scope)` with `setQuantity`, `remove`, `isPending(skuId)`, and a Hebrew error/notice state.

- [ ] **Step 1: Write failing transport and expiry tests**

Assert exact methods, encoded SKU paths, and bodies. Use fake timers for the informational countdown and assert one reconciliation callback at zero:

```ts
expect(fetch).toHaveBeenCalledWith(
  expect.stringMatching(/\/api\/v1\/cart\/items\/sku-1$/),
  expect.objectContaining({ method: 'PUT', body: JSON.stringify({ quantity: 2 }) }),
);
expect(formatRemaining(125)).toBe('02:05');
```

- [ ] **Step 2: Run cart expiry tests and confirm red**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/cart/expiration.test.tsx
```

Expected: missing cart modules.

- [ ] **Step 3: Implement transport, keys, queries, and expiry**

Move cart ownership out of the catalog feature. `catalogApi.addToCart` may delegate to `cartApi.addItem`; `useAddToCart` must write `cartKeys.cart(scope)` so product detail and cart share one cache entry.

`useCart` must refetch on screen focus/mount and treat a `CART_EXPIRED` `ApiClientError` as an expired empty presentation rather than retaining stale items. `useOrder` accepts a polling interval only while state is `pending_payment`.

- [ ] **Step 4: Write failing optimistic conflict and serialization tests**

Render a hook/harness with cart quantity 1. Press increase twice before resolving either request. Assert the UI shows 3 immediately, only the first request starts, and the second desired quantity starts after the first settles. Reject with an `ApiClientError` whose code is `INSUFFICIENT_STOCK`; assert rollback/refetch and Hebrew feedback:

```ts
expect(screen.getByText('3')).toBeOnTheScreen();
expect(setItem).toHaveBeenCalledTimes(1);
first.resolve(serverCartWithQuantity(2));
await waitFor(() => expect(setItem).toHaveBeenLastCalledWith('sku-1', 3));

expect(await screen.findByText('אין מספיק מלאי לכמות שבחרתם. הסל עודכן.')).toBeOnTheScreen();
```

- [ ] **Step 5: Implement the per-SKU mutation coordinator**

Use a map keyed by SKU. Each entry stores the active request and latest desired action. Apply every user action immediately to cached quantity and locally derived subtotal/total quantity. Never send two requests for one SKU concurrently; coalesce queued quantity changes to the latest desired quantity.

When a server response arrives, replace the cart with it, then reapply a still-queued optimistic quantity for that SKU so the display does not jump backward. On any failure, clear that SKU's queue, restore the last confirmed cart, invalidate `cartKeys.cart(scope)`, and map `INSUFFICIENT_STOCK`, `CART_EXPIRED`, and fallback errors to reviewed Hebrew copy. Detect changed unit price/subtotal between the confirmed snapshot and response and expose `המחיר עודכן לפי הסכום הנוכחי בחנות.`.

- [ ] **Step 6: Run focused cart logic tests**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/cart/expiration.test.tsx tests/cart/conflict.test.tsx
```

Expected: pass with no act warnings or unresolved mutation promises.

---

### Task 3: Implement the handoff cart screen and shop entry points

**Files:**
- Create: `mobile/app/(tabs)/(shop)/cart.tsx`
- Modify: `mobile/app/(tabs)/(shop)/_layout.tsx`
- Modify: `mobile/app/(tabs)/(shop)/categories.tsx`
- Modify: `mobile/app/(tabs)/(shop)/product/[productId].tsx`
- Test: `mobile/tests/cart/cart.test.tsx`

**Interfaces:**
- Produces `CartContent({ sessionScope, now? })` for isolated component tests.
- Adds the `/\(tabs\)/\(shop\)/cart` stack route.
- Product add success and the shop cart button navigate to the server-backed cart.

- [ ] **Step 1: Write failing cart presentation tests**

Cover loading, error/retry, empty, active, removal, price notice, and expiry. Assert server values and accessible controls rather than local fixture arithmetic:

```tsx
expect(await screen.findByText('הסל שלי')).toBeOnTheScreen();
expect(screen.getByText('₪72.50')).toBeOnTheScreen();
expect(screen.getByText(/הפריטים שמורים עבורכם/)).toBeOnTheScreen();
expect(screen.getByRole('button', { name: 'הסרת תערובת הבית מהסל' })).toBeOnTheScreen();
```

Assert the checkout button is absent for an empty/expired cart and has at least a 44-point target when active.

- [ ] **Step 2: Run the cart screen test and confirm red**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/cart/cart.test.tsx
```

Expected: route/component not found.

- [ ] **Step 3: Implement the cart screen**

Recreate the handoff top bar, count, bordered item cards, steppers, line totals, subtotal, shipping, total, and sticky `המשך לתשלום` action. The current backend cart exposes only subtotal, while authoritative shipping/total is created at checkout; label the cart amount `סכום מוצרים` and avoid inventing a final shipping charge before checkout.

Replace the unsupported promotion row with the reservation explanation/countdown. Use a product-image fallback because the cart contract has no media URL. Keep list content scrollable above the sticky action, use logical RTL layout, live regions for updates, and product-specific accessibility labels.

- [ ] **Step 4: Wire shop navigation**

Register `cart`, `checkout`, and `confirmation` in the shop stack. Add an accessible cart icon to the shop heading, and navigate product detail to cart after a successful add while preserving the shared cached response.

- [ ] **Step 5: Run cart and existing catalog tests**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/cart/cart.test.tsx tests/cart/expiration.test.tsx tests/cart/conflict.test.tsx tests/catalog/productDetail.test.tsx tests/catalog/categories.test.tsx
```

Expected: pass; catalog navigation and quantity limits remain intact.

---

### Task 4: Implement Israeli saved-address and form behavior

**Files:**
- Create: `mobile/src/features/addresses/api.ts`
- Create: `mobile/src/features/addresses/form.ts`
- Test: `mobile/tests/checkout/address.test.tsx`

**Interfaces:**
- Aliases generated `AddressRead`, `AddressCreate`, and `CheckoutAddress` types.
- Produces `addressesApi.list()` and `addressesApi.create(input)`.
- Produces `emptyAddressForm`, `validateAddressForm(values)`, and `toAddressCreate(values)`.
- Phone normalization accepts `05XXXXXXXX`, `5XXXXXXXX`, or `+9725XXXXXXXX` and returns `+9725XXXXXXXX`; country is always `IL`.

- [ ] **Step 1: Write failing pure form and API tests**

Cover empty required fields, trimming, invalid Israeli mobile numbers, optional apartment/postal code, and exact API payload:

```ts
expect(toAddressCreate({ ...valid, phone: '050-123-4567' })).toEqual(expect.objectContaining({
  phone: '+972501234567',
  country: 'IL',
}));
expect(validateAddressForm({ ...valid, city: '' }).city).toBe('יש להזין עיר.');
```

- [ ] **Step 2: Run the address test and confirm red**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/checkout/address.test.tsx
```

Expected: missing address modules.

- [ ] **Step 3: Implement address transport and validation**

Keep validation pure and schema-shaped without adding a form dependency. Trim all string fields, strip phone separators, normalize the Israeli prefix, preserve omitted optional values as `null`, and return field-keyed Hebrew errors. Do not accept or expose a country selector.

Create customer-scoped address query/mutation hooks alongside the API or in `checkout.tsx` using TanStack Query; a successful create updates the address list, selects the returned address ID, and does not send the same form again during checkout.

- [ ] **Step 4: Run the focused address tests**

Run the command from Step 2. Expected: pass.

---

### Task 5: Coordinate idempotent checkout and authoritative payment polling

**Files:**
- Modify: `mobile/src/features/payments/usePayment.ts`
- Modify: `mobile/src/features/cart/api.ts`
- Modify: `mobile/src/features/cart/queries.ts`
- Test: `mobile/tests/checkout/payment.test.tsx`

**Interfaces:**
- Produces `usePayment({ sessionScope, confirmer, createIdempotencyKey? })`.
- `start(input)` returns immediately only on validation/decline and otherwise tracks `checkout`, `clientStatus`, `order`, `isSubmitting`, and Hebrew `message`.
- `retry()` reuses the retained checkout idempotency key after `unknown`; a deliberate restart after a known decline creates a new attempt only if no pending order exists.
- Produces `isVerifiedOrder(order)` for `paid`, `processing`, `shipped`, or `delivered`.

- [ ] **Step 1: Extend failing payment tests for checkout orchestration**

Use deferred promises and injected deterministic IDs. Assert two rapid `start` calls create one request with one header, unknown retry reuses the same key, and SDK submission remains processing until the order response changes:

```ts
expect(checkoutCalls).toHaveLength(1);
expect(checkoutCalls[0]?.headers).toMatchObject({ 'Idempotency-Key': 'checkout-fixed' });
expect(result.current.status).toBe('processing');
orderResponse.resolve({ ...pendingOrder, state: 'paid' });
await waitFor(() => expect(result.current.status).toBe('verified'));
```

Add declined and terminal `payment_expired` cases. Assert `router` is not called by the hook; navigation belongs to the screen.

- [ ] **Step 2: Run the focused payment test and confirm red**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/checkout/payment.test.tsx
```

Expected: adapter tests pass but orchestration assertions fail.

- [ ] **Step 3: Implement guarded checkout and polling**

Guard `start` synchronously with a ref before awaiting. Generate and retain the key before the network call. Save the returned order/payment in customer-scoped query cache, invoke the selected confirmer once, and poll the order at two-second intervals while it is `pending_payment`. Stop polling on verified, `payment_expired`, `cancelled`, component unmount, or explicit reset.

Do not convert a confirmed PaymentIntent or successful PaymentSheet result into order success. Preserve the pending order and key after unknown network/client outcomes so retry cannot create another order. Invalidate the cart after checkout creates the pending order because reservations have transferred and the original cart is closed.

- [ ] **Step 4: Run payment tests**

Run the command from Step 2. Expected: all pending, declined, unknown, duplicate-submit, expiry, and verified cases pass.

---

### Task 6: Implement checkout and server-backed confirmation screens

**Files:**
- Create: `mobile/app/(tabs)/(shop)/checkout.tsx`
- Create: `mobile/app/(tabs)/(shop)/confirmation.tsx`
- Modify: `mobile/app/(tabs)/(shop)/_layout.tsx`
- Test: `mobile/tests/checkout/address.test.tsx`
- Test: `mobile/tests/checkout/confirmation.test.tsx`

**Interfaces:**
- Produces `CheckoutContent({ sessionScope, confirmer? })` for component tests.
- Produces `ConfirmationContent({ sessionScope, orderId })` for route/deep-link tests.
- Confirmation deep links use `coffix://confirmation?orderId=00000000-0000-4000-8000-000000000020`; the in-app route uses the same `orderId` query parameter with the real order UUID.

- [ ] **Step 1: Write failing checkout UI tests**

Assert default saved-address selection, accessible radio state, inline new-address form, field errors, one save, server summary replacement, disabled duplicate submit, and the four payment presentations. The pre-checkout summary may show cart subtotal only; after checkout it must show the returned order subtotal, shipping, and total.

- [ ] **Step 2: Write failing confirmation/deep-link tests**

Mock `useLocalSearchParams` and order reads. Assert pending never renders the checkmark/title, paid renders the actual order number, and tracking uses the future Task 21 path without implementing that screen:

```tsx
expect(screen.queryByText('ההזמנה התקבלה.')).not.toBeOnTheScreen();
expect(await screen.findByText('LN-10483')).toBeOnTheScreen();
fireEvent.press(screen.getByRole('button', { name: 'מעקב אחרי ההזמנה' }));
expect(router.push).toHaveBeenCalledWith('/(tabs)/(orders)/order-1');
```

- [ ] **Step 3: Run checkout UI tests and confirm red**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/checkout/address.test.tsx tests/checkout/payment.test.tsx tests/checkout/confirmation.test.tsx
```

Expected: screen exports/routes do not exist.

- [ ] **Step 4: Implement checkout**

Recreate the handoff top bar, three-step indicator, selectable saved-address cards, inline address form, standard-delivery card, item summary, and sticky payment action. Default to `is_default`, then the first address. Disable payment until an address is selected or a valid newly saved address exists.

Render processing with `accessibilityLiveRegion="polite"`; render decline and unknown messages with an explicit retry action. Navigate with `router.replace({ pathname: '/(tabs)/(shop)/confirmation', params: { orderId } })` only after `usePayment` reports verified.

- [ ] **Step 5: Implement confirmation**

Read `orderId`, fetch the owned order, and render loading/error/pending/verified/terminal states. For verified states recreate the handoff success mark, thank-you title, order card, order number, total, tracking button, and home action. Never trust route parameters for order number, total, or payment state.

- [ ] **Step 6: Run all Task 20 component tests**

Run:

```bash
pnpm --filter @coffix/mobile test -- --runTestsByPath tests/cart/cart.test.tsx tests/cart/expiration.test.tsx tests/cart/conflict.test.tsx tests/checkout/address.test.tsx tests/checkout/payment.test.tsx tests/checkout/confirmation.test.tsx
```

Expected: pass with accessible roles/labels and no React act warnings.

---

### Task 7: Verify fake-provider idempotency, complete checks, and commit

**Files:**
- Modify: `docs/plan.md`
- Verify only: mobile and backend runtime files from prior tasks

**Interfaces:**
- Confirms the existing fake webhook endpoint finalizes one order exactly once for duplicate event ID.
- Marks every Task 20 checkbox complete only after its required check succeeds.

- [ ] **Step 1: Run one local fake-provider purchase**

Start PostgreSQL/Redis and the API with `APP_ENV=test PAYMENT_PROVIDER=fake`, sign in with the configured fake OTP on the Android emulator, add an in-stock SKU, change quantity, select/create an Israeli address, and submit checkout. Then construct the webhook body directly from the newest order payment and send it:

```bash
docker compose exec -T postgres psql -U coffix -d coffix -Atc \
  "SELECT json_build_object('event_id','task20-success-1','event_type','payment.succeeded','provider_object_id',provider_payment_id,'state','confirmed')::text FROM payments WHERE phase = 'order' ORDER BY created_at DESC LIMIT 1" \
  | curl -sS -X POST http://127.0.0.1:8000/api/v1/test/payments/webhooks \
      -H 'Content-Type: application/json' --data-binary @-
```

Repeat the identical request. Expected: the first response applies the event, the duplicate reports the idempotent duplicate result, stock is consumed once, and mobile polling reaches the real confirmation/order number.

- [ ] **Step 2: Run focused backend idempotency checks**

Run:

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_payment_webhooks.py backend/tests/integration/orders/test_checkout_transaction.py -q
```

Expected: pass.

- [ ] **Step 3: Run full mobile quality checks**

Run:

```bash
pnpm --filter @coffix/mobile test
pnpm --filter @coffix/mobile lint
pnpm --filter @coffix/mobile typecheck
pnpm --filter @coffix/mobile config-check
git diff --check
```

Expected: all pass. The component assertions cover the Task 20 accessibility requirement.

- [ ] **Step 4: Review scope and secrets**

Run:

```bash
git status --short
git diff --stat main...HEAD
git diff -- mobile/.env.example mobile/app.json mobile/package.json docs/plan.md
```

Confirm there are no local `.env` files, real Stripe keys, caches, generated Expo runtime files, unrelated refactors, or Task 21 implementation.

- [ ] **Step 5: Mark Task 20 complete and commit**

After every required check succeeds, mark all seven Task 20 checkboxes in `docs/plan.md`, stage only Task 20 files, and commit:

```bash
git add mobile/app mobile/src mobile/tests mobile/.env.example mobile/app.json mobile/package.json pnpm-lock.yaml docs/plan.md docs/superpowers/plans/2026-09-03-mobile-cart-checkout.md
git commit -m "feat: add mobile cart and checkout"
```

Do not push. Report the branch, commit SHA, implemented behavior, passed/failed checks, and any environmental blocker; then wait for the user to push and merge Task 20.
