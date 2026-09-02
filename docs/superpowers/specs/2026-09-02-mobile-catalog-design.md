# Mobile Catalog Experience Design

## Goal

Build Task 19's authenticated Hebrew RTL home and shopping experience, including product search, while repairing the backend response gaps that currently prevent the approved Editorial home, category counts, and accessible catalog imagery from being implemented against real API data.

## Scope

The work includes:

- An authenticated customer activity-summary endpoint for the home screen.
- Product-media persistence and read models for customer catalog responses.
- API-driven category icons, images, and active-product counts, including six representative demo categories that remain ordinary admin-managed records.
- Authenticated product-name and description search through the existing paginated product collection.
- Safe, short-lived catalog image URLs and Hebrew alternative text.
- Regenerated OpenAPI and TypeScript client types.
- Editorial home, categories, product list, and product-detail routes.
- Reusable loading, error, empty, product-grid, product-card, and quantity-stepper components.
- The existing cart-item command used from product detail with only `sku_id` and `quantity` supplied by the client.

The work does not include cart screens, checkout, catalog-media administration, favorites, ratings, reviews, or promotions. Those controls from the visual prototype must not be presented as working features.

## Backend Contract Repair

### Customer activity summary

Add `GET /api/v1/users/me/activity-summary`, protected by the customer role. Its response contains:

- The current customer's ID and optional display name.
- The newest non-terminal product order, or `null`.
- The newest non-terminal service request, or `null`.

Each summary contains only the identifiers and status fields needed by the home cards. Orders in `payment_expired`, `cancelled`, `delivered`, or `refunded` are terminal. Service requests in `completed` or `cancelled` are terminal. Selection is scoped to the authenticated customer and ordered deterministically by newest creation timestamp and ID.

This read model belongs under the user-facing activity boundary and does not duplicate order or service transition logic.

### Catalog media

Add the specification's missing `product_media` persistence with:

- Product ownership and an optional SKU association.
- Storage object key and image media type.
- Non-negative sort order.
- Required Hebrew alternative text.
- Stable ID and timestamps.

Dedicated customer category responses gain an optional resolved `image_url` derived from the existing category `image_key`. Dedicated customer product responses gain an ordered `media` collection containing media ID, optional SKU ID, media type, sort order, alternative text, and a resolved URL. Existing admin read models continue exposing the configuration fields administrators need. Storage object keys remain server-side and are never returned to mobile clients.

Customer category responses also expose a presentation-safe `icon_key` and a computed `product_count`. The count includes active products in that category and is calculated by the server rather than inferred from a paginated mobile response. Category identity, ordering, activation, icon, and image data remain persisted catalog data so later admin CRUD can add or remove categories without a mobile release. The deterministic demo seed contains six category records matching the approved design; they are not hard-coded into screen components.

The server resolves URLs through the configured media-store adapter at response time. Missing media is valid: the mobile app renders a branded, accessible fallback instead of a broken image. Unknown icon keys use one neutral fallback icon. Creating and editing product or category media remains outside Task 19 and will be handled with the later admin catalog work.

### Product search

`GET /api/v1/catalog/products` accepts an optional trimmed `q` parameter alongside category, featured, page, and limit filters. Search is case-insensitive and matches the Hebrew product name or description. It remains authenticated, returns active products and active SKUs only, and uses the existing deterministic pagination and ordering. An empty or whitespace-only query behaves as no search filter. The server escapes wildcard characters so user input is treated as text.

## Mobile Architecture

`mobile/src/features/catalog/types.ts` derives catalog and activity types from the generated client and contains small presentation selectors such as sellable-SKU selection, availability, price formatting inputs, and image selection.

`mobile/src/features/catalog/api.ts` is the network boundary. It exposes specific methods for activity summary, categories, paginated/searchable products, product detail, and adding a desired SKU quantity to the existing server-owned cart. The cart request body contains exactly `sku_id` and `quantity`; displayed price and stock are never sent as authority.

`mobile/src/features/catalog/queries.ts` owns TanStack Query options and keys. Every private key starts with a stable authenticated-session scope and then the resource name and parameters. Credential clearing and logout continue to clear the entire private query cache.

Routes compose these APIs and reusable components:

- Home loads activity, categories, and featured products independently so one failed section does not hide successful sections.
- Shop index and `categories` show a product-search field above the category grid. A non-empty debounced query replaces the category grid with paginated product results; clearing it restores categories.
- Product lists use backend pagination and category filtering. A visible action loads the next page without discarding earlier results.
- Product detail chooses the first active SKU by stable SKU order, shows its server price and availability, clamps desired quantity to `1..min(99, stock_quantity)` for tracked stock or `1..99` for unlimited stock, and disables cart submission when no sellable SKU exists.

Inactive products and inactive SKUs are not treated as purchasable even if a malformed or stale response includes them. Zero-stock SKUs are shown as unavailable. The UI never invents server stock or pricing.

## Screen Behavior

All customer copy is Hebrew and all layout uses logical RTL spacing. Screens reuse the existing Warm & Artisanal colors, typography, spacing, radii, elevation, button behavior, and independent tab stacks.

The home screen follows the handoff's default Editorial hierarchy: brand/header, greeting, optional active-activity cards, a compact horizontal category row, compact featured-product cards, and the dark service call-to-action. Sections with no data collapse cleanly. Failures provide a localized retry action.

Home categories use their API-provided icon and live count. Shop categories use a two-column photo-forward grid with API-provided images rather than icon-only cards. Product lists use the approved editorial two-column cards. Product detail uses an image-led header, rounded scrolling information sheet, product/category identity, price, description, a SKU-attribute table, availability, quantity stepper, and fixed bottom add-to-cart action. Image elements always have meaningful Hebrew accessibility labels; decorative fallbacks are hidden from accessibility when adjacent text already names the resource.

Back navigation is explicit. Home-featured product detail returns to Home, Shop-search product detail returns to Shop, and product detail opened from a category returns to that category's product list. The category product-list back button is circular, appears on the right in RTL, and returns to the Shop category index instead of whichever route happens to be in history.

## Error and Authentication Behavior

Loading, empty, and error states are explicit and reusable. Error copy remains generic Hebrew and never displays server internals. Retry actions refetch only the failed resource.

The existing authenticated transport performs at most one token refresh after a `401`. If refresh fails or the session is revoked, credentials and query data are cleared; the existing route guard returns the customer to authentication. Catalog code does not add another retry loop.

## Test Seams

Tests observe only these public seams:

1. Backend HTTP endpoints: customer authorization, cross-customer isolation, deterministic active-summary selection, hidden inactive catalog data, category counts, literal product search, ordered media, safe image URLs, and OpenAPI drift.
2. Mobile route components: loading/error/empty content, activity and catalog rendering, product search, explicit source-aware navigation, pagination, unavailable presentation, authentication expiry, and the exact cart payload.
3. Reusable component props and accessibility output: image labels, product activation, grid output, and quantity boundaries.

Network calls are mocked only at the external `fetch` boundary. Tests do not mock internal catalog selectors, query hooks, or components. Implementation proceeds in vertical red-green slices: one observable behavior, its minimal implementation, then the next behavior.

## Verification

Run focused backend API, catalog, migration, OpenAPI-drift, and mobile catalog tests throughout implementation. Before completion, run all mobile tests, TypeScript, Expo lint, Expo configuration validation, relevant backend tests and type/lint checks, `git diff --check`, and local authenticated API navigation.

Representative iOS and Android screen sizes are compared with the handoff. Review results belong in the task handoff or pull request, not in another planning document.
