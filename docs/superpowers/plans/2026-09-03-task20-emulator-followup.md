# Task 20 Emulator Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four final emulator defects in Cart imagery/navigation, checkout completion navigation, and category-header alignment.

**Architecture:** Add `product_type` to the existing cart read contract so Cart can reuse the catalog's public fallback-image selector without extra requests. Keep navigation fixes at the public route/button seams: history-aware Back for empty Cart, nested Shop-stack dismissal on successful completion, and explicit physical-right text alignment in category headers.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, OpenAPI TypeScript generation, Expo Router, React Native, TypeScript, Jest, React Native Testing Library, pytest.

## Global Constraints

- Stay on `feature/task20`; never push, merge, rebase, or amend.
- Uploaded product media has priority over fallback photos.
- Fallback Cart photos must match the photo chosen for the same product type in catalog cards.
- Cart photos are exactly 112 by 112 points and use `resizeMode="cover"`.
- Only successful Confirmation-to-Home navigation resets the nested Shop stack.
- Add no dependencies or database migrations.
- Use Node 22 for every JavaScript command.

---

### Task 1: Expose cart product type

**Files:**
- Modify: `backend/src/coffix/carts/schemas.py`
- Modify: `backend/src/coffix/carts/service.py`
- Modify: `backend/src/coffix/carts/router.py`
- Modify: `backend/tests/api/test_cart.py`
- Modify generated: `packages/api-client/openapi.json`
- Modify generated: `packages/api-client/src/generated.ts`

**Interfaces:**
- Produces: required `CartItemRead.product_type: str` / generated TypeScript `product_type: string`.
- Consumes: `Product.product_type` already loaded through `CartItem.sku.product`.

- [x] **Step 1: Add a failing API assertion**

At the authenticated cart API seam, assert the seeded item includes:

```py
assert first_reserved.json()["items"][0]["product_type"] == "beans"
```

- [x] **Step 2: Run the focused test and verify red**

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_cart.py -q
```

Expected: `KeyError: 'product_type'`.

- [x] **Step 3: Carry product type through the cart view and response**

Add `product_type` to `CartItemView`, populate it from `item.sku.product.product_type`, add it to `CartItemRead`, and pass it through `cart_response`.

- [x] **Step 4: Regenerate and verify the API client**

```bash
PATH=/home/weam/.nvm/versions/node/v22.23.1/bin:/home/weam/.local/bin:/usr/local/bin:/usr/bin:/bin bash scripts/generate-api-client.sh
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_cart.py backend/tests/api/test_openapi.py -q
```

Expected: four tests pass and generated `CartItemRead` requires `product_type`.

- [x] **Step 5: Commit**

```bash
git add backend/src/coffix/carts/schemas.py backend/src/coffix/carts/service.py backend/src/coffix/carts/router.py backend/tests/api/test_cart.py packages/api-client/openapi.json packages/api-client/src/generated.ts
git commit -m "fix: expose cart product image type"
```

---

### Task 2: Match and enlarge catalog photos in Cart

**Files:**
- Modify: `mobile/src/features/catalog/types.ts`
- Modify: `mobile/app/(tabs)/(shop)/cart.tsx`
- Modify: `mobile/tests/cart/cart.test.tsx`
- Modify cart fixtures under: `mobile/tests/cart/`, `mobile/tests/checkout/`

**Interfaces:**
- Produces: `productTypeImage(productType: string, alt: string): CatalogImage | null`.
- Consumes: `CartItem.image_url`, `CartItem.image_alt_he`, and `CartItem.product_type`.

- [x] **Step 1: Add a failing fallback-photo UI test**

Render a Cart item with `image_url: null`, `image_alt_he: null`, and `product_type: 'beans'`. Assert the image uses the known catalog beans fallback and enlarged cover styling:

```ts
expect(screen.getByLabelText('תערובת הבית')).toHaveProp('source', {
  uri: 'https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=800&q=80',
});
expect(screen.getByLabelText('תערובת הבית')).toHaveStyle({ height: 112, width: 112 });
expect(screen.getByLabelText('תערובת הבית')).toHaveProp('resizeMode', 'cover');
```

- [x] **Step 2: Run the Cart test and verify red**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test -- tests/cart/cart.test.tsx
```

Expected: Cart renders the icon because `image_url` is null.

- [x] **Step 3: Export and reuse the catalog fallback selector**

Extract the current product-type lookup behind:

```ts
export function productTypeImage(productType: string, alt: string): CatalogImage | null
```

Use it inside `productImage` and in Cart after checking the uploaded `image_url`. Keep per-row `onError` fallback to the coffee icon. Change the shared photo style to `height: 112` and `width: 112`.

- [x] **Step 4: Update typed fixtures and verify green**

Add literal `product_type` to Cart fixtures, run the focused Cart test, then run mobile typecheck. Expected: both pass.

- [x] **Step 5: Commit**

```bash
git add mobile/src/features/catalog/types.ts mobile/app/'(tabs)'/'(shop)'/cart.tsx mobile/tests/cart mobile/tests/checkout
git commit -m "fix: show larger catalog photos in cart"
```

---

### Task 3: Correct completion and empty-cart navigation

**Files:**
- Modify: `mobile/app/(tabs)/(shop)/cart.tsx`
- Modify: `mobile/app/(tabs)/(shop)/confirmation.tsx`
- Modify: `mobile/tests/cart/cart.test.tsx`
- Modify: `mobile/tests/checkout/confirmation.test.tsx`

**Interfaces:**
- Empty Cart consumes `goBack('/(tabs)/(shop)')`.
- Successful Confirmation uses `router.dismissAll()` before `router.replace('/(tabs)/(home)')`.

- [x] **Step 1: Add the failing empty-Cart Back assertion**

Render the empty cart with `router.canGoBack()` true, press the empty-state `חזרה לחנות`, and assert:

```ts
expect(router.back).toHaveBeenCalledTimes(1);
expect(router.replace).not.toHaveBeenCalledWith('/(tabs)/(shop)');
```

- [x] **Step 2: Run the Cart test and verify red**

Run the focused Cart command from Task 2. Expected: the empty-state action still calls `replace`.

- [x] **Step 3: Route empty Cart through the shared Back helper**

Replace only the empty-state action with `goBack('/(tabs)/(shop)' as Href)`. Keep the deep-link fallback inside `goBack`.

- [x] **Step 4: Add the failing completed-checkout stack assertion**

Render a paid Confirmation, press `חזרה לבית`, and assert calls occur in this order:

```ts
expect(router.dismissAll).toHaveBeenCalledTimes(1);
expect(router.replace).toHaveBeenCalledWith('/(tabs)/(home)');
expect(router.dismissAll.mock.invocationCallOrder[0])
  .toBeLessThan(router.replace.mock.invocationCallOrder[0]);
```

- [x] **Step 5: Run Confirmation test and verify red**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test -- tests/checkout/confirmation.test.tsx
```

Expected: `dismissAll` is not called.

- [x] **Step 6: Reset Shop before navigating Home**

Create a local `returnHome` handler that calls `router.dismissAll()` followed by `router.replace('/(tabs)/(home)' as Href)`, and connect the successful Home button to it.

- [x] **Step 7: Run both navigation suites and verify green**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test -- tests/cart/cart.test.tsx tests/checkout/confirmation.test.tsx tests/navigation/goBack.test.ts
```

Expected: all selected tests pass.

- [x] **Step 8: Commit**

```bash
git add mobile/app/'(tabs)'/'(shop)'/cart.tsx mobile/app/'(tabs)'/'(shop)'/confirmation.tsx mobile/tests/cart/cart.test.tsx mobile/tests/checkout/confirmation.test.tsx
git commit -m "fix: reset completed shop navigation"
```

---

### Task 4: Physically right-align category headings

**Files:**
- Modify: `mobile/app/(tabs)/(shop)/products/[categoryId].tsx`
- Modify: `mobile/tests/catalog/productList.test.tsx`

**Interfaces:**
- Category title and eyebrow use `align="end"` plus a full-width RTL text style.
- Header outer order remains cart, flexible heading, Back under its existing LTR container.

- [x] **Step 1: Add a failing physical-alignment assertion**

Ensure the route fixture category ID matches the requested category, then assert both heading lines expose:

```ts
expect(screen.getByTestId('category-title')).toHaveStyle({
  alignSelf: 'stretch',
  textAlign: 'right',
  writingDirection: 'rtl',
});
```

- [x] **Step 2: Run the product-list test and verify red**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test -- tests/catalog/productList.test.tsx
```

Expected: the test ID/style is absent and the old header defaults left.

- [x] **Step 3: Apply explicit RTL text alignment**

Add `align="end"`, `testID="category-title"`, and `styles.headerText` to the display title; apply the same alignment/style to the eyebrow. Define:

```ts
headerText: {
  alignSelf: 'stretch',
  writingDirection: 'rtl',
}
```

- [x] **Step 4: Run the focused test and verify green**

Run the same product-list test. Expected: it passes.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/'(tabs)'/'(shop)'/products/'[categoryId]'.tsx mobile/tests/catalog/productList.test.tsx
git commit -m "fix: align category headings right"
```

---

### Task 5: Regression and emulator verification

**Files:**
- Modify only if a check exposes a defect inside this approved correction scope.

- [ ] **Step 1: Run directly affected backend tests**

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_cart.py backend/tests/api/test_openapi.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run complete mobile checks**

```bash
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile test
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile lint
/home/weam/.nvm/versions/node/v22.23.1/bin/node /home/weam/.nvm/versions/node/v22.23.1/lib/node_modules/corepack/dist/corepack.js pnpm --filter @coffix/mobile typecheck
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Manual emulator loop**

Reload Expo and verify all four original symptoms no longer reproduce: empty-Cart Back moves right-to-left, Cart shows a larger matching photo, returning Home prevents Confirmation reopening from Store, and category titles sit on the physical right.
