# Task 20 Cart and Payment Follow-up Design

**Date:** 2026-09-03
**Status:** Approved for planning

## Goal

Correct the remaining Task 20 shopping and checkout behavior while keeping the server authoritative for prices, cart expiration, orders, and payment state.

This follow-up covers:

- the cart button on category product lists;
- cart preservation while moving between Cart and Payment;
- immediate navigation from Pay to a waiting Confirmation screen;
- automatic confirmation updates and reset timing;
- equal right-to-left checkout progress lines;
- real product photos in Cart;
- consistent right-to-left Back transitions;
- the requested circular shopping-cart icon and total-unit badge.

## Cart Lifecycle

The existing server cart remains the source of truth and keeps its one-hour inactivity timeout.

1. Adding a product updates the active server cart and stays on the current product page.
2. The cart badge shows the sum of item quantities, not the number of distinct rows.
3. A zero quantity displays no badge.
4. Opening Cart or Payment does not clear or check out the cart.
5. Returning from Payment before pressing Pay shows the same items and badge.
6. Pressing Pay creates the checkout/order once using the existing idempotency key. This is the first point at which the server transfers the active cart into a pending order.
7. The mobile cart snapshot is not invalidated merely because an order is pending or a confirmation attempt fails. It is invalidated and reset only after the server reports a verified payment.
8. Before Pay, the existing server-side one-hour cart expiration remains authoritative. The client refetches after expiration and then hides the badge.

The pending order is the source of truth after Pay. Confirmation owns payment retry and polling, so the user is not sent back into a newly empty editable cart while the order is unresolved.

## Server Cart Read Model

The cart response will include the information needed to render Cart and Payment without creating an order:

- `image_url` and `image_alt_he` on each cart item;
- authoritative `shipping_agorot`;
- authoritative `total_agorot` including shipping.

The selected image follows the catalog rule: prefer media assigned to the exact SKU, then fall back to general product media. The media store creates the download URL. If no media exists or the image fails to load, the current coffee icon remains as a fallback.

Shipping and final total are displayed on Payment before Pay, but checkout remains the final authority and may reject stale inventory or changed prices.

## Mobile Screens and Header

### Cart button

Home, Store, Orders, and each category product list display the same reusable cart button in the fixed header. The button uses:

- a pale beige circular background;
- the Feather `shopping-cart` outline;
- a small rust/orange badge at the upper-left;
- the total number of units in the badge;
- no badge when the quantity is zero.

### Cart product image

Each Cart row renders the real product photo in the existing rounded square. The image uses a cover crop so it fills the square instead of appearing as a small centered icon. The generic coffee icon is used only as a fallback.

### Checkout progress

The three steps are ordered visually from right to left:

1. כתובת
2. אמצעי תשלום
3. אישור

The circles and labels are independent of the connector layout. Two equal-width connector lines sit between the three circles, preventing the unequal lines shown in the current screen.

## Payment and Confirmation Flow

### Entering Payment

Payment reads the active cart and selected address. It shows the item subtotal, shipping, and final total from the cart response. It does not call checkout and does not reset the cart.

If the address or cart is unavailable, Payment shows an actionable error and lets the user go Back rather than creating a partial order.

### Pressing Pay

The Pay action is guarded against double taps and uses one stable checkout idempotency key.

1. Create or retrieve the checkout/order.
2. Navigate immediately to Confirmation with the order identifier and the information needed to resume the idempotent flow.
3. Confirmation renders the waiting state before it begins provider confirmation.
4. Confirmation invokes the payment provider once and polls the order endpoint.
5. When the server reports `paid`/verified, the same screen automatically renders the success UI and then invalidates the cart cache.
6. When the provider reports a failure or the order remains pending, Confirmation keeps the cart snapshot, shows the unresolved state, and offers retry. It does not display success and does not reset the cart.

The local fake provider sends a fake success webhook through the existing hidden development/test endpoint so the emulator can exercise the complete waiting-to-confirmed flow. That endpoint remains unavailable in production.

A direct link to an existing Confirmation order continues to poll the order without attempting provider confirmation when no payment credentials are present.

## Back Navigation and RTL Animation

Custom Back buttons use real stack history:

- call `router.back()` when a previous route exists;
- use a screen-specific safe parent route only when the screen was opened as a deep link and has no history.

Shop and authentication stacks use the same RTL stack direction. With RTL forward screens entering from the left, the native Back pop reveals the previous screen from right to left. This replaces the current `router.replace(...)` Back behavior that creates a new forward transition in the wrong direction.

Fallback navigation is treated as a pop rather than a new forward page where Expo Router supports it.

## Error Handling

- Checkout creation failure stays on Payment with a retryable error.
- Provider confirmation failure stays on Confirmation and preserves the pending order/cart snapshot.
- Polling failures keep the waiting UI and expose retry rather than guessing success.
- Missing or expired product images fall back to the coffee icon.
- An expired active cart refetches as empty and removes the badge.
- Duplicate Pay or retry actions reuse the same checkout and payment identifiers.

## Verification

Automated coverage will verify:

- backend cart serialization includes the selected real image and authoritative shipping/final total;
- Payment entry performs no checkout mutation;
- Back from Payment preserves cart items and unit count;
- Pay creates checkout once and navigates to Confirmation;
- Confirmation starts waiting, confirms/polls, then changes to success automatically;
- failed or pending confirmation does not invalidate the cart;
- verified confirmation invalidates the cart;
- the category product list renders the shared cart button;
- the badge is hidden at zero and counts total units;
- the Cart image fills its square with fallback behavior;
- the checkout steps and connector ordering are RTL and equal;
- custom Back buttons pop existing history and use safe fallbacks only for deep links.

Required repository checks remain the focused backend/mobile tests, TypeScript, lint, and `git diff --check`. The emulator flow will also be checked manually because animation direction and provider overlays are visual/native behaviors.
