# Task 20 Cart and Payment Follow-up Implementation Plan

> **For agentic workers:** Execute each task test-first and commit each completed vertical slice. This repository does not provide the plan skill's execution helper, so the approved workflow is inline execution.

**Goal:** Finish the Task 20 emulator corrections for the shared cart control, real cart photos, non-destructive Payment entry, waiting-to-confirmed payment flow, equal RTL checkout steps, and RTL Back transitions.

**Architecture:** Enrich the existing server cart read model with presentation-safe product media and authoritative delivery totals. Keep checkout creation behind the Pay action, pass the resulting checkout to Confirmation through React Query plus route identifiers, and let Confirmation own provider confirmation and order polling. Centralize history-aware Back behavior and reuse the shared cart button/header rather than creating route-specific copies.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, Expo Router, React Native, TypeScript, TanStack React Query, Jest, React Native Testing Library.

## Global Constraints

- Stay on `feature/task20`; never push, merge, rebase, or amend.
- Preserve the existing one-hour active-cart TTL and idempotent checkout contract.
- Prices, shipping, final total, order state, and cart expiration remain server authoritative.
- Do not introduce a new cart status or database migration.
- Do not invalidate the cart query until the order becomes verified or the active cart expires.
- Use the existing media store and fake payment webhook; add no dependencies.
- Use Node 22 for every JavaScript command.
- Do not interrupt the user's running backend or Expo terminals.

---

### Task 1: Enrich the authoritative cart response

**Files:**
- Modify: `backend/src/coffix/carts/schemas.py`
- Modify: `backend/src/coffix/carts/repository.py`
- Modify: `backend/src/coffix/carts/router.py`
- Modify: `backend/tests/api/test_cart.py`
- Modify generated: `packages/api-client/openapi.json`
- Modify generated: `packages/api-client/src/generated.ts`

**Interfaces:**
- `CartItemRead` adds nullable `image_url` and `image_alt_he`.
- `CartRead` adds `shipping_agorot` and `total_agorot`.
- Cart responses prefer exact-SKU media, then product-level media, in catalog display order.

- [ ] **Step 1: Write the failing cart API contract test**

Extend `seed_cart_api` to create both general and SKU media using the existing catalog/media test helpers. Configure a known shipping fee and assert an item response contains the exact-SKU photo URL/alt text and totals:

```py
assert body["items"][0]["image_alt_he"] == "צילום פולי קפה"
assert body["items"][0]["image_url"].endswith("/sku-photo.jpg")
assert body["shipping_agorot"] == 3000
assert body["total_agorot"] == body["subtotal_agorot"] + 3000
```

Also assert an empty cart still reports shipping and total consistently, and add a fallback assertion for product-level media when no exact-SKU media exists.

- [ ] **Step 2: Run the focused backend test and verify red**

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_cart.py -q
```

Expected: failures because the new cart fields are absent.

- [ ] **Step 3: Implement the smallest server read-model change**

Load `Product.media` with the cart SKU/product query. Make `cart_response` asynchronous so it can create signed/download media URLs. Build `CartRead` explicitly from `CartAccess` and settings, selecting media with:

```py
selected = next((m for m in media if m.sku_id == item.sku_id), None)
selected = selected or next((m for m in media if m.sku_id is None), None)
```

Set:

```py
shipping = request.app.state.settings.shipping_fee_agorot
total = access.cart.subtotal_agorot + shipping
```

Keep expiration conflicts unchanged and await the response helper from all four cart endpoints.

- [ ] **Step 4: Run the cart API test and verify green**

Run the same focused pytest command. Expected: all cart API tests pass.

- [ ] **Step 5: Regenerate the API client and verify drift**

```bash
PATH=/home/weam/.nvm/versions/node/v22.23.1/bin:$PATH bash scripts/generate-api-client.sh
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_openapi.py -q
```

Expected: generated files include the four new fields and the OpenAPI drift test passes.

- [ ] **Step 6: Commit the vertical slice**

```bash
git add backend/src/coffix/carts/schemas.py backend/src/coffix/carts/repository.py backend/src/coffix/carts/router.py backend/tests/api/test_cart.py packages/api-client/openapi.json packages/api-client/src/generated.ts
git commit -m "feat: enrich cart checkout preview"
```

---

### Task 2: Correct the cart control, category header, photos, and RTL stepper

**Files:**
- Modify: `mobile/src/components/CartButton.tsx`
- Modify: `mobile/src/components/CheckoutHeader.tsx`
- Modify: `mobile/app/(tabs)/(shop)/products/[categoryId].tsx`
- Modify: `mobile/app/(tabs)/(shop)/cart.tsx`
- Modify: `mobile/tests/cart/header.test.tsx`
- Modify: `mobile/tests/cart/cart.test.tsx`
- Create: `mobile/tests/checkout/header.test.tsx`
- Modify or create focused catalog test for category route under `mobile/tests/catalog/`

**Interfaces:**
- `CartButton` continues consuming `CartRead.total_quantity`; icon changes to `shopping-cart`.
- Category product lists place a fixed header outside the scroll region and reuse `CartButton`.
- Cart rows render `CartItem.image_url` using `Image` with `resizeMode="cover"`.
- `CheckoutHeader` renders three step nodes separated by two equal flex lines in RTL order.

- [ ] **Step 1: Write failing UI tests**

Add assertions for:

```tsx
expect(screen.getByLabelText('תמונת תערובת הבית')).toHaveProp('resizeMode', 'cover');
expect(screen.getByRole('button', { name: /פתיחת הסל/ })).toBeOnTheScreen();
expect(screen.getByLabelText('מחבר שלבים 1-2')).toHaveStyle({ flex: 1 });
expect(screen.getByLabelText('מחבר שלבים 2-3')).toHaveStyle({ flex: 1 });
```

Keep the current badge tests proving total-unit count and no zero badge. Assert the Feather mock receives `shopping-cart`, and assert the category screen's cart button opens Cart.

- [ ] **Step 2: Run the focused mobile tests and verify red**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test -- tests/cart/header.test.tsx tests/cart/cart.test.tsx tests/checkout/header.test.tsx tests/catalog/categories.test.tsx
```

Expected: failures for the old bag icon, missing category cart control, missing real photo, and unequal step structure.

- [ ] **Step 3: Implement the visual corrections**

Change the shared icon to `shopping-cart` while retaining the beige circle and upper-left badge. Convert the category page to a fixed `Screen.header` containing its Back/title and `CartButton`, leaving only its results scrollable.

In Cart, render the real image as an 82-by-82 cover image and switch to the coffee fallback only when `image_url` is null or loading fails. Track image load failure per row so a broken signed URL also falls back.

Refactor `CheckoutHeader` to the explicit sequence:

```tsx
<Step step={1} />
<Connector />
<Step step={2} />
<Connector />
<Step step={3} />
```

Use one RTL row and identical `flex: 1` connector styles.

- [ ] **Step 4: Run focused tests and verify green**

Run the same Jest command. Expected: selected suites pass.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add mobile/src/components/CartButton.tsx mobile/src/components/CheckoutHeader.tsx mobile/app/'(tabs)'/'(shop)'/products/'[categoryId]'.tsx mobile/app/'(tabs)'/'(shop)'/cart.tsx mobile/tests/cart/header.test.tsx mobile/tests/cart/cart.test.tsx mobile/tests/checkout/header.test.tsx mobile/tests/catalog
git commit -m "fix: finish cart and checkout visuals"
```

---

### Task 3: Move checkout creation behind Pay and payment work into Confirmation

**Files:**
- Modify: `backend/src/coffix/payments/router.py`
- Modify: `backend/tests/api/test_payment_webhooks.py`
- Modify: `mobile/src/features/cart/api.ts`
- Modify: `mobile/src/features/cart/queries.ts`
- Modify: `mobile/src/features/payments/usePayment.ts`
- Modify: `mobile/src/features/payments/fake.ts`
- Modify: `mobile/src/features/payments/stripe.ts`
- Modify: `mobile/app/(tabs)/(shop)/payment.tsx`
- Modify: `mobile/app/(tabs)/(shop)/confirmation.tsx`
- Modify: `mobile/tests/checkout/payment.test.tsx`
- Modify: `mobile/tests/checkout/confirmation.test.tsx`

**Interfaces:**
- `PaymentConfirmer.confirm(payment)` receives the complete checkout payment object so fake mode can send the provider object ID and Stripe can use `client_secret`.
- Payment consumes `useCart`, shows the cart's authoritative totals, and calls checkout only from Pay.
- The prepared checkout is cached under a stable key before Confirmation navigation.
- Confirmation receives `orderId`, `addressId`, and `checkoutKey`; it reads the cached/idempotently recoverable checkout, invokes confirmation, polls order, and invalidates Cart only for a verified order.
- Fake confirmation POSTs the synthetic confirmed event to the hidden endpoint in local/test environments.

- [ ] **Step 1: Write failing backend environment tests**

Change the current test-only assertion so local + fake accepts the helper while dev/prod-like non-local configuration remains hidden. Preserve the existing test-environment success and non-fake-provider rejection coverage.

- [ ] **Step 2: Run the webhook tests and verify red**

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_payment_webhooks.py -q
```

Expected: local fake webhook currently returns 404.

- [ ] **Step 3: Allow the fake helper only in local and test**

Permit `{AppEnvironment.LOCAL, AppEnvironment.TEST}` and keep all other environments hidden. Do not expose it in OpenAPI and continue requiring `FakePaymentProvider`.

- [ ] **Step 4: Run webhook tests and verify green**

Run the same focused pytest command. Expected: all webhook tests pass.

- [ ] **Step 5: Rewrite mobile tests around the requested lifecycle and verify red**

Test these behaviors:

- rendering Payment performs `GET /cart` and no `POST /checkout`;
- Payment displays cart shipping and final total;
- Back before Pay does not invalidate Cart;
- pressing Pay once calls checkout once and immediately routes to Confirmation with identifiers;
- Confirmation initially renders `ממתינים לאישור התשלום`;
- Confirmation calls its injected confirmer once, polls, and automatically renders success when the order becomes paid;
- pending, declined, and unknown states do not invalidate `cartKeys.cart(sessionScope)`;
- paid state invalidates it once;
- direct-link Confirmation without cached payment credentials only polls;
- fake confirmer posts a stable synthetic success webhook.

Run:

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test -- tests/checkout/payment.test.tsx tests/checkout/confirmation.test.tsx
```

Expected: lifecycle tests fail because Payment currently checks out on mount and owns confirmation.

- [ ] **Step 6: Implement Payment as a read-only preview until Pay**

Remove `usePreparedCheckout` from route entry. Read the cart, render `items`, `subtotal_agorot`, `shipping_agorot`, and `total_agorot`, and execute the idempotent `cartApi.checkout` only inside the guarded Pay handler. Cache both checkout and its order, then navigate:

```ts
router.push({
  pathname: '/(tabs)/(shop)/confirmation',
  params: { orderId, addressId, checkoutKey },
});
```

Do not run the payment provider or invalidate the cart on Payment.

- [ ] **Step 7: Implement Confirmation-owned provider work and polling**

Refactor the payment hook so Confirmation starts in waiting state, confirms once when checkout credentials exist, and keeps polling `useOrder`. Update the fake adapter to post:

```ts
{
  event_id: `mobile-${providerPaymentId}-confirmed`,
  event_type: 'payment_intent.succeeded',
  provider_object_id: providerPaymentId,
  state: 'confirmed',
}
```

On verified order only, invalidate the cart query and render the existing success UI. On failure/unknown, retain the cached cart and show retry. A direct-linked order with no checkout cache must skip provider confirmation and only poll.

- [ ] **Step 8: Run payment and confirmation tests and verify green**

Run the same two Jest suites. Expected: both pass.

- [ ] **Step 9: Commit the vertical slice**

```bash
git add backend/src/coffix/payments/router.py backend/tests/api/test_payment_webhooks.py mobile/src/features/cart/api.ts mobile/src/features/cart/queries.ts mobile/src/features/payments/usePayment.ts mobile/src/features/payments/fake.ts mobile/src/features/payments/stripe.ts mobile/app/'(tabs)'/'(shop)'/payment.tsx mobile/app/'(tabs)'/'(shop)'/confirmation.tsx mobile/tests/checkout/payment.test.tsx mobile/tests/checkout/confirmation.test.tsx
git commit -m "fix: complete pending payment flow"
```

---

### Task 4: Make every custom Back action a real RTL pop

**Files:**
- Create: `mobile/src/navigation/goBack.ts`
- Modify: `mobile/app/(auth)/_layout.tsx`
- Modify: `mobile/app/(tabs)/(shop)/products/[categoryId].tsx`
- Modify: `mobile/app/(tabs)/(shop)/product/[productId].tsx`
- Modify: `mobile/app/(tabs)/(shop)/cart.tsx`
- Modify: `mobile/app/(tabs)/(shop)/checkout.tsx`
- Modify: `mobile/app/(tabs)/(shop)/payment.tsx`
- Modify applicable tests under: `mobile/tests/auth/`, `mobile/tests/catalog/`, `mobile/tests/cart/`, `mobile/tests/checkout/`
- Create: `mobile/tests/navigation/goBack.test.ts`

**Interfaces:**
- `goBack(fallback: Href)` calls `router.back()` when `router.canGoBack()` is true; otherwise it uses the explicit safe fallback.
- Auth and Shop stacks use `animation: 'slide_from_left'`, so a native Back pop reveals the previous screen from right to left.

- [ ] **Step 1: Write failing navigation tests**

Unit-test the helper for both history and deep-link cases:

```ts
goBack('/(tabs)/(shop)');
expect(router.back).toHaveBeenCalledTimes(1);
expect(router.replace).not.toHaveBeenCalled();
```

Then set `canGoBack` false and assert the fallback replace. Update each screen test so pressing its custom Back uses `router.back()` when history exists. Add a focused assertion that Auth's layout animation is `slide_from_left` if the existing test setup can render layout options; otherwise cover this static setting with TypeScript plus emulator verification.

- [ ] **Step 2: Run focused navigation tests and verify red**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test -- tests/navigation/goBack.test.ts tests/cart/cart.test.tsx tests/checkout/address.test.tsx tests/checkout/payment.test.tsx tests/catalog/productDetail.test.tsx
```

Expected: screens still use replacement navigation and the helper does not exist.

- [ ] **Step 3: Implement history-aware Back behavior**

Create the small helper and replace only actual custom Back actions. Keep deliberate completion redirects—successful authentication, Home after completion, and order tracking—unchanged. Product detail retains its source-aware fallback, but uses `router.back()` whenever history exists.

Change Auth's stack animation to `slide_from_left`; Shop already uses that RTL direction. The native pop then produces the requested right-to-left Back reveal.

- [ ] **Step 4: Run focused navigation tests and verify green**

Run the same Jest command. Expected: all selected suites pass.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add mobile/src/navigation/goBack.ts mobile/app/'(auth)'/_layout.tsx mobile/app/'(tabs)'/'(shop)' mobile/tests
git commit -m "fix: use rtl back navigation"
```

---

### Task 5: Full regression checks and emulator handoff

**Files:**
- Modify only if a check exposes a defect in the approved scope.

- [ ] **Step 1: Run focused backend coverage together**

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_cart.py backend/tests/api/test_payment_webhooks.py backend/tests/api/test_openapi.py backend/tests/integration/orders/test_checkout_transaction.py -q
```

Expected: all selected tests pass.

- [ ] **Step 2: Run the complete mobile suite**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test
```

Expected: all mobile suites pass.

- [ ] **Step 3: Run static checks**

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend ruff check backend
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend ty check backend/src backend/tests backend/migrations
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile lint
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile typecheck
git diff --check
```

Expected: every command exits successfully.

- [ ] **Step 4: Manual emulator verification with the user's existing terminals**

Ask the user to reload Expo, then verify:

1. Category list retains the circular cart button and total-unit badge.
2. The real product photo fills the Cart square.
3. Address → Payment → Back preserves the cart.
4. Pay opens waiting Confirmation immediately, then fake local confirmation changes to success automatically.
5. Only confirmed payment removes the badge/cart; a failed or pending attempt does not.
6. Checkout connector lines are equal and ordered RTL.
7. Every custom Back transition reveals the previous page from right to left.

- [ ] **Step 5: Mark the plan complete only after manual confirmation**

Do not add another `docs/plan.md` checkbox: Task 20 is already checked and committed. Report any visual/native discrepancy and correct it within this follow-up before final handoff.
