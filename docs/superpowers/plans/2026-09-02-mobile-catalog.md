# Mobile Catalog Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the customer activity and catalog API gaps, then deliver Task 19's authenticated Hebrew RTL home, product search, category, product-list, and product-detail experience matching the approved simulator references.

**Architecture:** FastAPI adds one customer-scoped read model, ordered product-media projections, persisted category icon metadata, computed category counts, and literal paginated product search without changing order, service, inventory, or cart rules. Expo routes consume narrowly typed API methods through TanStack Query keys scoped by authenticated session and resource, while reusable presentation components own catalog state, search, navigation, and accessibility behavior.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLAlchemy async, Alembic, PostgreSQL, OpenAPI, TypeScript 6, Expo SDK 57, React Native 0.86, Expo Router, TanStack Query 5, Jest, React Native Testing Library.

## Global Constraints

- Follow `docs/spec.md`; the server remains authoritative for activation, stock, and price.
- Customer-facing copy is Hebrew and rendered RTL with logical start/end spacing.
- Recreate the default Editorial handoff using the existing Warm & Artisanal tokens; do not import prototype HTML or remote implementation code.
- The catalog remains authenticated. A failed refresh clears credentials and all private query data without another retry loop.
- Product detail sends only `sku_id` and desired `quantity` to the cart mutation.
- Quantity is limited to `1..99`, further capped by tracked stock; unlimited stock is represented by `stock_quantity = null`.
- Product-media object keys remain private server data; mobile receives only expiring URLs and Hebrew alternative text.
- Do not implement promotions, ratings, reviews, favorites, cart screens, checkout, or media administration.
- Use one final Task 19 implementation commit, including `docs/plan.md`, with message `feat: build mobile catalog experience`.

---

### Task 1: Persist and expose the customer catalog read contract

**Files:**
- Create: `backend/migrations/versions/0012_product_media.py`
- Modify: `backend/src/coffix/catalog/models.py`
- Modify: `backend/src/coffix/catalog/schemas.py`
- Modify: `backend/src/coffix/catalog/repository.py`
- Modify: `backend/src/coffix/catalog/router.py`
- Test: `backend/tests/integration/catalog/test_catalog_repository.py`
- Test: `backend/tests/api/test_catalog.py`
- Test: `backend/tests/integration/test_migrations.py`

**Interfaces:**
- Produces: `ProductMedia(product_id, sku_id, object_key, media_type, sort_order, alt_text_he)`.
- Adds persisted `Category.icon_key` and produces dedicated customer category fields `image_url`, `icon_key`, and computed `product_count` while preserving existing admin read models.
- Produces `CatalogProductRead.media: list[CatalogProductMediaRead]` and `CatalogProductListRead`; the collection accepts optional literal `q` search over Hebrew name and description.
- `CatalogProductMediaRead` exposes `id`, `sku_id`, `media_type`, `sort_order`, `alt_text_he`, and `url`; it never exposes `object_key`.

- [ ] **Step 1: Write a failing repository test for media ordering**

Create two media rows in reverse sort order, fetch the customer product, and assert stable ordering:

```python
assert [(item.sort_order, item.alt_text_he) for item in product.media] == [
    (1, "פולי קפה בשקית על שולחן עץ"),
    (2, "תקריב של פולי הקפה"),
]
```

- [ ] **Step 2: Run the repository test and confirm red**

Run:

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/integration/catalog/test_catalog_repository.py -q
```

Expected: failure because `ProductMedia` and `Product.media` do not exist.

- [ ] **Step 3: Add the migration and model**

Create revision `0012_product_media` after `0011_notifications_outbox_audit`. Add nullable `categories.icon_key varchar(50)`. The media table must use UUID primary key, product and nullable SKU ownership, `object_key varchar(512)`, `media_type varchar(40)`, `sort_order integer`, `alt_text_he varchar(300)`, timestamps, `sort_order >= 0`, and indexes on `(product_id, sort_order, id)` and `sku_id`. Add a unique constraint on `product_skus(id, product_id)` and a composite foreign key from `product_media(sku_id, product_id)` so media cannot name a SKU owned by a different product.

Add these relationships:

```python
class ProductMedia(Base):
    __tablename__ = "product_media"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    sku_id: Mapped[UUID | None] = mapped_column(index=True)
    object_key: Mapped[str] = mapped_column(String(512))
    media_type: Mapped[str] = mapped_column(String(40))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    alt_text_he: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped["Product"] = relationship(
        back_populates="media", foreign_keys=[product_id]
    )

class Product(Base):
    media: Mapped[list["ProductMedia"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        foreign_keys=lambda: ProductMedia.product_id,
        order_by=lambda: (ProductMedia.sort_order, ProductMedia.id),
        lazy="selectin",
    )
```

Load `Product.media` in both customer list and detail repository queries.

- [ ] **Step 4: Run the repository test and confirm green**

Run the focused repository test from Step 2. Expected: pass.

- [ ] **Step 5: Write failing HTTP tests for resolved URLs and private keys**

Extend `test_catalog.py` with media and category keys, then assert:

```python
category_body = categories.json()[0]
product_body = detail.json()
assert category_body["image_url"].startswith("http")
assert product_body["media"][0]["alt_text_he"] == "פולי קפה ארבל"
assert product_body["media"][0]["url"].startswith("http")
assert "object_key" not in product_body["media"][0]
```

- [ ] **Step 6: Run the HTTP test and confirm red**

Run:

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_catalog.py -q
```

Expected: response validation or missing-field failure for `image_url` and `media`.

- [ ] **Step 7: Resolve media URLs in the catalog route**

Define response models:

```python
class CatalogCategoryRead(CatalogSchema):
    id: UUID
    name_he: str
    slug: str
    sort_order: int
    is_active: bool
    image_url: str | None = None
    icon_key: str | None = None
    product_count: int

class CatalogProductMediaRead(CatalogSchema):
    id: UUID
    sku_id: UUID | None
    media_type: str
    sort_order: int
    alt_text_he: str
    url: str

class CatalogProductRead(CatalogSchema):
    id: UUID
    category_id: UUID
    name_he: str
    description_he: str
    product_type: str
    is_featured: bool
    is_active: bool
    skus: list[SkuRead]
    media: list[CatalogProductMediaRead]
    created_at: datetime
    updated_at: datetime

class CatalogProductListRead(CatalogSchema):
    items: list[CatalogProductRead]
    page: int
    limit: int
    total: int
```

Make category/list/detail handlers accept `Request`, call `request.app.state.media_store.create_download_url(object_key)`, and construct response models explicitly. Preserve inactive-product and inactive-SKU filtering.

Add one aggregate repository query for active product counts per active category. Add optional `q` to the collection query; trim it, escape SQL wildcard characters, and match `Product.name_he` or `Product.description_he` case-insensitively while preserving all category/featured/pagination filters.

- [ ] **Step 8: Run catalog and migration tests**

Run:

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_catalog.py backend/tests/integration/catalog/test_catalog_repository.py backend/tests/integration/test_migrations.py -q
```

Expected: pass.

---

### Task 2: Add the authenticated customer activity summary

**Files:**
- Create: `backend/src/coffix/activity/__init__.py`
- Create: `backend/src/coffix/activity/schemas.py`
- Create: `backend/src/coffix/activity/repository.py`
- Create: `backend/src/coffix/activity/router.py`
- Modify: `backend/src/coffix/api/app.py`
- Test: `backend/tests/api/test_activity_summary.py`

**Interfaces:**
- Produces: authenticated `GET /api/v1/users/me/activity-summary`.
- Produces: `ActivitySummaryRead(customer_id, display_name, active_order, active_service_request)`.
- Active order summary has `id`, `order_number`, and `state`; service summary has `id`, `reference`, and `state`.

- [ ] **Step 1: Write the failing authentication and ownership test**

Seed two customers with active and terminal records. Override `get_current_actor` first as unauthenticated, then customer A. Assert `401` without authentication and that customer A never receives customer B's identifiers.

```python
assert response.json() == {
    "customer_id": str(customer_a.id),
    "display_name": "מאיה",
    "active_order": {
        "id": str(newest_active_order.id),
        "order_number": newest_active_order.order_number,
        "state": newest_active_order.state,
    },
    "active_service_request": {
        "id": str(newest_active_request.id),
        "reference": newest_active_request.reference,
        "state": newest_active_request.state,
    },
}
```

- [ ] **Step 2: Run the activity test and confirm red**

Run:

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_activity_summary.py -q
```

Expected: `404` because the endpoint is absent.

- [ ] **Step 3: Implement the read model**

Use direct read-only SQLAlchemy queries scoped by `customer_id`. Exclude these terminal states:

```python
TERMINAL_ORDER_STATES = {
    OrderState.PAYMENT_EXPIRED,
    OrderState.CANCELLED,
    OrderState.DELIVERED,
    OrderState.REFUNDED,
}
TERMINAL_SERVICE_STATES = {
    ServiceRequestState.COMPLETED,
    ServiceRequestState.CANCELLED,
}
```

Order by `created_at DESC, id DESC` and limit each activity query to one row. Fetch the current `User` for `display_name`. Mount the router in `create_app`; the route accepts `CustomerActorDep` and passes only `actor.user_id` to the repository.

- [ ] **Step 4: Add and run empty/terminal-state cases**

Assert customers with no non-terminal records receive both summary fields as `null`. Run the focused activity test. Expected: pass.

---

### Task 3: Regenerate and wrap the repaired API contract

**Files:**
- Modify: `packages/api-client/openapi.json`
- Modify: `packages/api-client/src/generated.ts`
- Create: `mobile/src/features/catalog/types.ts`
- Create: `mobile/src/features/catalog/api.ts`
- Create: `mobile/src/features/catalog/queries.ts`
- Modify: `mobile/src/features/auth/useSession.tsx`
- Test: `mobile/tests/catalog/api.test.ts`
- Test: `mobile/tests/auth/session.test.tsx`

**Interfaces:**
- Produces: `catalogApi.getActivitySummary()`, `getCategories()`, `getProducts(params)`, `getProduct(productId)`, and `addToCart(skuId, quantity)`.
- Produces: `catalogKeys` whose keys begin with `['private', sessionScope, 'catalog']` or `['private', sessionScope, 'activity']`.
- Produces: `useSession().sessionScope`, derived from the non-secret UUID prefix of the rotated refresh token.

- [ ] **Step 1: Regenerate the frozen artifacts**

Run:

```bash
bash scripts/generate-api-client.sh
```

Verify generated types contain `ActivitySummaryRead`, `CatalogProductMediaRead`, customer category `image_url`, customer product `media`, and the activity-summary operation.

- [ ] **Step 2: Write failing transport tests at the fetch boundary**

Test exact paths/query encoding and the cart authority boundary:

```typescript
await catalogApi.addToCart('sku-1', 3);
expect(globalThis.fetch).toHaveBeenCalledWith(
  expect.stringMatching(/\/api\/v1\/cart\/items$/),
  expect.objectContaining({
    body: JSON.stringify({ sku_id: 'sku-1', quantity: 3 }),
    method: 'POST',
  }),
);
```

Also assert product-list parameters include `q`, `category_id`, `featured`, `page`, and `limit` only when supplied.

- [ ] **Step 3: Run the transport tests and confirm red**

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/api.test.ts
```

Expected: module-not-found failure for the catalog API.

- [ ] **Step 4: Implement typed API methods and presentation selectors**

Derive types from `components['schemas']`. Implement specific calls through `apiClient.request<T>()`. Add selectors with literal outcomes:

```typescript
export function firstSellableSku(product: Product): Sku | null;
export function maximumQuantity(sku: Sku): number;
export function productImage(product: Product, category?: Category): CatalogImage | null;
export function formatIls(agorot: number): string;
```

`firstSellableSku` ignores inactive and zero-stock SKUs. `maximumQuantity` returns `99` for unlimited stock and `Math.min(99, stock_quantity)` otherwise. `formatIls(7250)` returns `₪72.50` using deterministic Hebrew-safe output.

- [ ] **Step 5: Add stable session scope to the session provider**

Parse only the refresh token prefix before the first `.` and expose it while authenticated. Use `null` while loading or unauthenticated. Update auth fixtures to use UUID-prefixed refresh tokens and assert the scope survives token rotation within the same session.

- [ ] **Step 6: Implement query keys and query options**

Use primitive key members:

```typescript
catalogKeys.categories(scope)
// ['private', scope, 'catalog', 'categories']
catalogKeys.products(scope, { query, categoryId, featured, limit })
catalogKeys.product(scope, productId)
catalogKeys.activity(scope)
```

Use `useInfiniteQuery` for product lists and `useQuery` for summary/categories/detail. Do not add query-level retries; the transport alone handles a single refresh. Keep existing `queryClient.clear()` behavior on credential clearing.

- [ ] **Step 7: Run API, session, TypeScript, and OpenAPI drift tests**

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/api.test.ts tests/auth/session.test.tsx
corepack pnpm --dir mobile typecheck
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_openapi.py -q
```

Expected: pass.

---

### Task 4: Build reusable catalog state and quantity components

**Files:**
- Create: `mobile/src/components/EmptyState.tsx`
- Create: `mobile/src/components/ErrorState.tsx`
- Create: `mobile/src/components/QuantityStepper.tsx`
- Test: `mobile/tests/catalog/productDetail.test.tsx`

**Interfaces:**
- `EmptyState` accepts `title`, optional `description`, and optional action label/callback.
- `ErrorState` accepts Hebrew `message` and `onRetry`.
- `QuantityStepper` accepts `value`, `minimum`, `maximum`, `onChange`, and optional `disabled`.

- [ ] **Step 1: Write the failing accessible-state tests**

Assert retry and empty actions use button roles and Hebrew accessible names. Assert the stepper exposes buttons named `הפחתת כמות` and `הגדלת כמות`, reports the current value, and disables each boundary action.

```typescript
await fireEvent.press(screen.getByRole('button', { name: 'הגדלת כמות' }));
expect(onChange).toHaveBeenLastCalledWith(2);
```

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/productDetail.test.tsx
```

Expected: module-not-found failures for the new components.

- [ ] **Step 3: Implement the minimal components**

Use `Pressable`, existing `Text`/`Button`/`Card`, 44-point minimum targets, `accessibilityRole="adjustable"` and `accessibilityValue={{ min, max, now: value }}` on the quantity group, logical margins, and existing tokens. Clamp inside event handlers even when a caller passes an out-of-range boundary.

- [ ] **Step 4: Run the focused test and confirm green**

Run the command from Step 2. Expected: pass.

---

### Task 5: Build accessible product cards and grids

**Files:**
- Create: `mobile/src/components/ProductCard.tsx`
- Create: `mobile/src/components/ProductGrid.tsx`
- Test: `mobile/tests/catalog/productList.test.tsx`

**Interfaces:**
- `ProductCard` accepts a normalized product, optional category, and `onPress(productId)`.
- `ProductGrid` accepts products, categories, `onProductPress`, and an optional list-footer element.

- [ ] **Step 1: Write the failing card behavior test**

Render available, zero-stock, and inactive fixtures. Assert meaningful image labels, formatted server prices, `אזל מהמלאי`/`לא זמין` presentation, disabled interaction for inactive data, and exactly two logical columns.

- [ ] **Step 2: Run the product-list test and confirm red**

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/productList.test.tsx
```

Expected: missing `ProductCard` and `ProductGrid` modules.

- [ ] **Step 3: Implement cards and grid**

Use React Native `Image` only when `productImage()` returns a safe `https://` or configured local `http://` URL. Set the image's `accessibilityLabel` from `alt_text_he`; render a coffee icon fallback otherwise. The card press target includes product name, price, and availability in its accessible label. Use stable IDs as keys and no components declared inside render functions.

- [ ] **Step 4: Run the product-list test and confirm green**

Run the command from Step 2. Expected: pass.

---

### Task 6: Implement product search, categories, and paginated product lists

**Files:**
- Modify: `mobile/app/(tabs)/(shop)/_layout.tsx`
- Modify: `mobile/app/(tabs)/(shop)/index.tsx`
- Create: `mobile/app/(tabs)/(shop)/categories.tsx`
- Create: `mobile/app/(tabs)/(shop)/products/[categoryId].tsx`
- Create: `mobile/src/features/catalog/useDebouncedSearch.ts`
- Test: `mobile/tests/catalog/categories.test.tsx`
- Test: `mobile/tests/catalog/productSearch.test.tsx`
- Test: `mobile/tests/catalog/productList.test.tsx`

**Interfaces:**
- Shop index renders the category experience without a redirect flash.
- Shop search queries products by debounced text and restores categories when cleared.
- Category presses push `/(tabs)/(shop)/products/[categoryId]` with the selected opaque ID.
- Product presses include only the opaque product ID plus a controlled `source` value and optional opaque category ID for explicit back navigation.

- [ ] **Step 1: Write a failing categories route test**

At the fetch boundary return loading, rejected, empty, and populated responses. Assert `טוענים קטגוריות`, generic Hebrew error plus `ניסיון נוסף`, `אין קטגוריות להצגה`, two-column image cards, product counts, and exact router parameters after a category press.

- [ ] **Step 2: Run the categories test and confirm red**

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/categories.test.tsx
```

Expected: current shop placeholder does not meet the assertions.

- [ ] **Step 3: Implement category routes and stack registration**

Render the handoff's `חנות` header, product-search field, and `לעיין לפי קטגוריה` hierarchy. Omit promotional controls. Reuse one category content component from `categories.tsx` in `index.tsx`, and register `categories`, `products/[categoryId]`, and `product/[productId]` with Hebrew titles hidden behind custom headers.

- [ ] **Step 4: Run categories tests and confirm green**

Run the command from Step 2. Expected: pass.

- [ ] **Step 4a: Implement product search red-green slice**

At the rendered Shop route and external fetch boundary, assert typing Hebrew text sends trimmed `q` after the debounce, displays matching product cards instead of categories, paginates without dropping earlier results, shows a localized no-results state, and restores categories when cleared. Implement the smallest search field, debounce hook, and query integration that passes.

- [ ] **Step 5: Write the failing list pagination/navigation test**

Return page one with `total > items.length`, press `טעינת מוצרים נוספים`, return page two, and assert both pages remain rendered exactly once. Assert category ID is encoded in the request, product navigation carries `source=category`, and the circular right-side back action replaces the route with the Shop category index.

- [ ] **Step 6: Run the list test and confirm red**

Run the product-list test. Expected: missing route or pagination behavior.

- [ ] **Step 7: Implement the product-list route**

Read `categoryId` with `useLocalSearchParams`, select the matching cached/fetched category label, flatten infinite-query pages once, and show loading/error/empty/footer states. Disable the next-page button while fetching and omit it when accumulated item count reaches `total`.

- [ ] **Step 8: Run category and product-list tests**

Run both focused route tests. Expected: pass.

---

### Task 7: Implement the Editorial authenticated home

**Files:**
- Modify: `mobile/app/(tabs)/(home)/_layout.tsx`
- Modify: `mobile/app/(tabs)/(home)/index.tsx`
- Test: `mobile/tests/catalog/home.test.tsx`
- Modify: `mobile/tests/auth/landing.test.tsx`

**Interfaces:**
- Home consumes activity, categories, and featured products independently.
- Activity cards navigate by opaque order/service IDs; catalog cards navigate by opaque category/product IDs.

- [ ] **Step 1: Replace the old landing assertion with a failing Editorial-home test**

Return a customer named `מאיה`, one active order, one active service request, categories, and featured products. Assert `שלום, מאיה`, `הזמנה פעילה`, `שירות`, featured content, `קטגוריות`, `מוצרים מובילים`, and `בקשת שירות` are visible.

- [ ] **Step 2: Add independent failure/empty tests and confirm red**

Reject only the activity request and keep catalog requests successful. Assert catalog content still renders and only the activity section offers retry. Return no activity and assert cards collapse rather than displaying an error.

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/home.test.tsx tests/auth/landing.test.tsx
```

Expected: old success placeholder fails the new home contract.

- [ ] **Step 3: Implement the Editorial hierarchy**

Use one vertical `Screen` scroll container, a compact horizontal category row with API icon/count data, compact two-across featured cards, handoff typography, and tokenized cards. Match the approved dark service call-to-action. When no featured product exists, show the shared product empty state. Do not render fabricated ETA, promotion, cart badge, rating, or review values.

- [ ] **Step 4: Implement navigation and retry behavior**

Route order/service cards toward their existing/future stack paths using IDs, category/product cards to shop stack paths, and service CTA to the service tab. Each retry calls only its query's `refetch`.

- [ ] **Step 5: Run home and landing tests and confirm green**

Run the command from Step 2. Expected: pass.

---

### Task 8: Implement product detail and authoritative cart submission

**Files:**
- Create: `mobile/app/(tabs)/(shop)/product/[productId].tsx`
- Modify: `mobile/tests/catalog/productDetail.test.tsx`

**Interfaces:**
- Detail fetches by opaque product ID and accepts only controlled `source=home|category` navigation context plus an optional opaque category ID.
- Add-to-cart submits only selected SKU ID and desired quantity.
- Authentication expiry delegates to the existing transport and route guard.

- [ ] **Step 1: Write the failing detail states and navigation test**

Assert loading, generic error/retry, missing/empty product, product image label, Hebrew description, table-form SKU attributes, formatted price, low/zero/unlimited stock labels, fixed bottom action layout, circular right-side back behavior for both sources, and absence of working favorites/ratings/reviews controls.

- [ ] **Step 2: Write the failing quantity and payload test**

For stock `3`, increment to `3`, assert increment disables at the boundary, press `הוספה לסל`, and assert the exact body:

```typescript
expect(JSON.parse(requestInit.body as string)).toEqual({
  sku_id: 'sku-available',
  quantity: 3,
});
```

Assert inactive, missing, and zero-stock SKUs disable the add button.

- [ ] **Step 3: Run product-detail tests and confirm red**

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/productDetail.test.tsx
```

Expected: route-not-found failure.

- [ ] **Step 4: Implement detail rendering and mutation**

Read `productId` and validated source context, fetch detail, derive the sellable SKU during render, and keep only desired quantity in local state. Reset quantity to one when product ID or selected SKU changes. Render an image-led header and rounded scrolling detail sheet while keeping the quantity/cart bar fixed. The action uses current server price for display only and calls `addToCart(sku.id, quantity)`.

- [ ] **Step 5: Add the authentication-expiry case**

Return `401` for catalog, fail refresh with `refresh_token_expired`, and assert credentials clear, catalog query data clears, and no third catalog request occurs. Reuse the existing provider/route-guard behavior instead of adding catalog-specific redirects.

- [ ] **Step 6: Run product-detail and session tests**

Run:

```bash
corepack pnpm --dir mobile test -- --runTestsByPath tests/catalog/productDetail.test.tsx tests/auth/session.test.tsx
```

Expected: pass.

---

### Task 9: Verify Task 19 and create the task commit

**Files:**
- Modify: `docs/plan.md`

**Interfaces:**
- Produces a verified Task 19 branch ready for the user to push and merge.

- [ ] **Step 1: Run all focused backend checks**

```bash
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend pytest backend/tests/api/test_activity_summary.py backend/tests/api/test_catalog.py backend/tests/api/test_openapi.py backend/tests/integration/catalog/test_catalog_repository.py backend/tests/integration/test_migrations.py -q
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend ruff check backend
UV_CACHE_DIR=/tmp/coffix-uv-cache uv run --project backend ty check backend/src backend/tests backend/migrations
```

Expected: all pass.

- [ ] **Step 2: Run all mobile checks**

```bash
corepack pnpm --dir mobile test
corepack pnpm --dir mobile typecheck
corepack pnpm --dir mobile lint
corepack pnpm --dir mobile config-check
```

Expected: all pass.

- [ ] **Step 3: Run local authenticated smoke navigation**

Start PostgreSQL/Redis and the API, seed twice, authenticate with the fake OTP, then navigate Home → category → product list → product detail and add one available SKU. Confirm activity/catalog responses are authenticated and the cart response uses server totals.

- [ ] **Step 4: Perform the required visual review**

Compare Home, Categories, Product List, and Product Detail at one representative iOS size and one representative Android size. Check RTL direction, safe areas, two-column wrapping, text scaling, image crop/fallback, sticky detail action, and tab visibility. Record pass/fail and any environment blocker in the final handoff/PR text, not another document.

- [ ] **Step 5: Mark Task 19 complete only after required checks pass**

Update all Task 19 checkboxes in `docs/plan.md` from `[ ]` to `[x]`. Leave Task 20 unchanged.

- [ ] **Step 6: Run final repository checks**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm only Task 19 files and the approved design/plan documents are included.

- [ ] **Step 7: Create the required implementation commit**

Stage only Task 19 files and commit:

```bash
git commit -m "feat: build mobile catalog experience"
```

Report the branch, commit SHA, implemented behavior, checks, visual-review status, and any blocker. Do not push, merge, rebase, amend, tag, or begin Task 20.
