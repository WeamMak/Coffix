# Task 20 Checkout Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the mobile cart badge, fixed navigation chrome, address workflow, and route-backed payment flow found during Task 20 emulator review.

**Architecture:** Extend the existing `Screen` scaffold with fixed header and footer slots, then compose focused commerce and checkout headers around React Query-backed cart data. Split checkout preparation from payment confirmation: the Address route selects and manages addresses, the Payment route creates an idempotent server checkout and displays authoritative totals, and Confirmation renders only after order polling observes verified payment.

**Tech Stack:** Expo Router, React Native 0.86, React 19, TypeScript 6, TanStack React Query 5, Stripe React Native, Jest, React Native Testing Library.

## Global Constraints

- Preserve Hebrew RTL copy, existing design tokens, the five-tab navigation model, and the handoff's Warm & Artisanal styling.
- Cart quantity, prices, shipping fee, final total, and payment success remain server authoritative.
- The badge value is `CartRead.total_quantity`; it is absent when the value is zero.
- Do not change backend APIs or add dependencies.
- Stay on `feature/task20`; never push or merge.
- Use Node 22 for every mobile package command.

---

### Task 1: Fixed commerce header and cart badge

**Files:**
- Create: `mobile/src/components/CartButton.tsx`
- Create: `mobile/src/components/CommerceHeader.tsx`
- Modify: `mobile/src/components/Screen.tsx`
- Modify: `mobile/app/(tabs)/(home)/index.tsx`
- Modify: `mobile/app/(tabs)/(shop)/categories.tsx`
- Test: `mobile/tests/cart/header.test.tsx`

**Interfaces:**
- Consumes: `useCart(sessionScope: string)` and `CartRead.total_quantity`.
- Produces: `CartButton({ sessionScope }: { sessionScope: string })` and `CommerceHeader({ children, sessionScope })`; `Screen` accepts optional `header` and `footer` nodes outside its scroll container.

- [ ] **Step 1: Write a failing cart-header test**

Render `CartButton` with an HTTP cart response whose `total_quantity` is `3`, assert that the button named `פתיחת הסל, 3 פריטים` and visible badge text `3` exist, then render with zero and assert that neither a badge nor a numeric label exists. Pressing the icon must call:

```ts
expect(router.push).toHaveBeenCalledWith('/(tabs)/(shop)/cart');
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/cart/header.test.tsx
```

Expected: failure because `CartButton` does not exist.

- [ ] **Step 3: Implement the fixed-shell primitives**

Add optional nodes to the screen interface:

```ts
type ScreenProps = {
  header?: ReactNode;
  footer?: ReactNode;
  // existing props remain unchanged
};
```

Render `header` before the `ScrollView`/content `View` and `footer` after it. Implement a physically left-aligned cart button whose badge is conditional:

```tsx
const quantity = cart.data?.total_quantity ?? 0;
{quantity > 0 ? <Text>{quantity}</Text> : null}
```

Move Home and Store headings into `CommerceHeader` passed through `Screen.header`, leaving their content in the scroll container. The current Orders route re-exports Home and therefore receives the same fixed cart control until Task 21 replaces its content.

- [ ] **Step 4: Run header and catalog tests and verify green**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/cart/header.test.tsx tests/catalog/home.test.tsx tests/catalog/categories.test.tsx
```

Expected: all selected suites pass.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add mobile/src/components/CartButton.tsx mobile/src/components/CommerceHeader.tsx mobile/src/components/Screen.tsx mobile/app/'(tabs)'/'(home)'/index.tsx mobile/app/'(tabs)'/'(shop)'/categories.tsx mobile/tests/cart/header.test.tsx mobile/tests/catalog/home.test.tsx mobile/tests/catalog/categories.test.tsx
git commit -m "fix: add persistent cart header"
```

### Task 2: Product and cart navigation behavior

**Files:**
- Modify: `mobile/app/(tabs)/(shop)/product/[productId].tsx`
- Modify: `mobile/app/(tabs)/(shop)/cart.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Test: `mobile/tests/catalog/productDetail.test.tsx`
- Test: `mobile/tests/cart/cart.test.tsx`

**Interfaces:**
- Consumes: existing cart mutation and `Screen.header`/`Screen.footer` slots.
- Produces: successful add-to-cart without navigation; fixed cart header/footer; hidden tabs for the commerce checkout route set.

- [ ] **Step 1: Change tests to describe the requested navigation**

After pressing `הוספה לסל`, wait for `נוסף לסל`, assert the cart update request occurred, and assert:

```ts
expect(router.push).not.toHaveBeenCalledWith('/(tabs)/(shop)/cart');
```

Update the cart screen test to require a circular back control and keep checkout navigation unchanged.

- [ ] **Step 2: Run product and cart tests and verify red**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/catalog/productDetail.test.tsx tests/cart/cart.test.tsx
```

Expected: the product test fails because success currently pushes Cart, and the circular-control assertion fails.

- [ ] **Step 3: Implement minimal navigation and fixed-cart changes**

Remove the product mutation's `onSuccess` router push. Move Cart's top bar and checkout action into the new fixed screen slots. Apply a 44-by-44 pill radius to the back control. In the tab layout, hide the bottom bar when any shop segment is one of:

```ts
const routesWithoutTabs = new Set(['product', 'cart', 'checkout', 'payment', 'confirmation']);
```

- [ ] **Step 4: Run product and cart tests and verify green**

Run the same two focused suites. Expected: both pass.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add mobile/app/'(tabs)'/'(shop)'/product/'[productId]'.tsx mobile/app/'(tabs)'/'(shop)'/cart.tsx mobile/app/'(tabs)'/_layout.tsx mobile/tests/catalog/productDetail.test.tsx mobile/tests/cart/cart.test.tsx
git commit -m "fix: keep shopping flow in place"
```

### Task 3: Address step and saved-address removal

**Files:**
- Create: `mobile/src/components/CheckoutHeader.tsx`
- Modify: `mobile/src/features/addresses/api.ts`
- Modify: `mobile/app/(tabs)/(shop)/checkout.tsx`
- Test: `mobile/tests/checkout/address.test.tsx`

**Interfaces:**
- Consumes: `addressesApi.list`, `addressesApi.create`, `validateAddressForm`, and the existing DELETE address endpoint.
- Produces: `addressesApi.remove(addressId: string): Promise<void>` and `CheckoutHeader({ activeStep, backLabel, onBack })`; Address Continue navigates with `addressId` and `checkoutKey` route parameters.

- [ ] **Step 1: Add the failing address workflow tests**

Cover these public behaviors in `address.test.tsx`:

```ts
expect(screen.getByRole('button', { name: 'שמירת כתובת' })).toBeDisabled();
expect(screen.queryByRole('button', { name: 'המשך לאמצעי תשלום' })).not.toBeOnTheScreen();
```

Fill all required fields and assert Save becomes enabled. Mock DELETE, press `הסרת הכתובת ...`, assert the owned address URL and `DELETE` method, and verify the removed card disappears. With a selected address and closed form, press Continue and require navigation to `/payment` with `addressId` and a stable generated `checkoutKey`.

- [ ] **Step 2: Run the address test and verify red**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/checkout/address.test.tsx
```

Expected: failures for missing Remove, Save gating, Continue routing, and fixed step header.

- [ ] **Step 3: Implement the Address route**

Add:

```ts
remove(addressId: string): Promise<void> {
  return apiClient.request(`/api/v1/users/me/addresses/${encodeURIComponent(addressId)}`, {
    method: 'DELETE',
  });
}
```

Refactor address cards so selection and removal are separate accessible buttons. Derive validity from `validateAddressForm(addressForm)`. Use a fixed footer that renders Save while the form is open and Continue otherwise. Continue generates one checkout key and navigates as follows:

```ts
router.push({
  pathname: '/(tabs)/(shop)/payment',
  params: { addressId: selectedAddressId, checkoutKey },
});
```

Replace the credit-card section with the single standard-delivery card and truck icon. Keep the cart item/subtotal summary on Address, but do not calculate a client shipping fee.

- [ ] **Step 4: Run address and cart tests and verify green**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/checkout/address.test.tsx tests/cart/cart.test.tsx
```

Expected: both suites pass.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add mobile/src/components/CheckoutHeader.tsx mobile/src/features/addresses/api.ts mobile/app/'(tabs)'/'(shop)'/checkout.tsx mobile/tests/checkout/address.test.tsx
git commit -m "fix: rebuild checkout address step"
```

### Task 4: Separate payment preparation and confirmation

**Files:**
- Create: `mobile/app/(tabs)/(shop)/payment.tsx`
- Modify: `mobile/app/(tabs)/(shop)/_layout.tsx`
- Modify: `mobile/src/features/payments/usePayment.ts`
- Test: `mobile/tests/checkout/payment.test.tsx`

**Interfaces:**
- Consumes: `cartApi.checkout({ address_id }, checkoutKey)`, `PaymentConfirmer.confirm(clientSecret)`, and `useOrder` polling.
- Produces: `usePreparedCheckout({ addressId, checkoutKey, sessionScope })` for idempotent server checkout; `usePayment({ checkout, confirmer, sessionScope })` confirms only an already-prepared checkout.

- [ ] **Step 1: Write a failing route-backed payment test**

Render Payment with known route params and assert checkout is prepared on entry while the injected confirmer has not run. Require the authoritative values from the checkout response before Pay:

```ts
expect(await screen.findByText('₪29')).toBeOnTheScreen();
expect(screen.getByText('₪101.50')).toBeOnTheScreen();
expect(confirmer.confirm).not.toHaveBeenCalled();
```

Press `תשלום מאובטח`, assert one confirmation call, keep duplicate presses at one call, resolve order polling to `paid`, and assert replacement navigation to Confirmation with the order ID.

- [ ] **Step 2: Run payment tests and verify red**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/checkout/payment.test.tsx
```

Expected: failure because the Payment route and split preparation interface do not exist.

- [ ] **Step 3: Implement checkout preparation**

Use a React Query key containing session scope and checkout key, with retries disabled and infinite stale time:

```ts
queryKey: ['private', sessionScope, 'checkout', checkoutKey],
queryFn: () => cartApi.checkout({ address_id: addressId }, checkoutKey),
retry: false,
staleTime: Infinity,
```

Cache the returned order under `cartKeys.order`. Do not invoke `PaymentConfirmer` during preparation.

- [ ] **Step 4: Implement Payment UI and confirmation polling**

Render the fixed step-2 header, secure-card explanation, order items, subtotal, delivery fee, and total from `checkout.order`. Put the Pay action in `Screen.footer`. Refactor `usePayment.start()` to call only:

```ts
await confirmer.confirm(checkout.payment.client_secret);
```

Then poll the prepared order. On a verified order, invalidate `cartKeys.cart(sessionScope)` and replace the route with Confirmation. Declined/unknown results display Hebrew retry feedback on the same page.

- [ ] **Step 5: Run payment and confirmation tests and verify green**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/checkout/payment.test.tsx tests/checkout/confirmation.test.tsx
```

Expected: both suites pass.

- [ ] **Step 6: Commit the vertical slice**

```bash
git add mobile/app/'(tabs)'/'(shop)'/payment.tsx mobile/app/'(tabs)'/'(shop)'/_layout.tsx mobile/src/features/payments/usePayment.ts mobile/tests/checkout/payment.test.tsx
git commit -m "fix: split payment into its own step"
```

### Task 5: Confirmation chrome and complete verification

**Files:**
- Modify: `mobile/app/(tabs)/(shop)/confirmation.tsx`
- Modify: `mobile/tests/checkout/confirmation.test.tsx`
- Modify: `docs/plan.md` only if the existing Task 20 checked state needs correction after verification.

**Interfaces:**
- Consumes: `CheckoutHeader` step 3 and the existing verified-order predicate.
- Produces: fixed confirmation progress chrome, no bottom navigation, and unchanged server-authoritative deep-link behavior.

- [ ] **Step 1: Write the failing confirmation chrome assertion**

For a paid order, require `שלבי התשלום` with step 3 selected and retain the existing order number, total, tracking, and Home controls. For a pending order, assert no success copy appears.

- [ ] **Step 2: Run the confirmation suite and verify red**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/checkout/confirmation.test.tsx
```

Expected: failure because Confirmation does not render the step-3 header.

- [ ] **Step 3: Add fixed confirmation chrome**

Pass `CheckoutHeader activeStep={3}` through `Screen.header` for pending, failure, and success states. Preserve the existing server-state gates and success actions.

- [ ] **Step 4: Run all focused Task 20 tests**

Run:

```bash
pnpm --filter @coffix/mobile test -- tests/cart tests/checkout tests/catalog/productDetail.test.tsx tests/catalog/home.test.tsx tests/catalog/categories.test.tsx
```

Expected: all selected suites pass.

- [ ] **Step 5: Run project-level mobile checks**

Run:

```bash
pnpm --filter @coffix/mobile typecheck
pnpm --filter @coffix/mobile lint
pnpm --filter @coffix/mobile test
git diff --check
```

Expected: TypeScript, lint, all mobile tests, and whitespace validation pass.

- [ ] **Step 6: Commit the completed correction**

```bash
git add mobile/app/'(tabs)'/'(shop)'/confirmation.tsx mobile/tests/checkout/confirmation.test.tsx docs/plan.md
git commit -m "fix: complete task 20 checkout flow"
```
