# Task 20 Cart and Checkout Flow Corrections

## Scope

Correct the Task 20 mobile cart and checkout behavior reported during emulator review. The work stays on `feature/task20` and does not implement the Task 21 order-list feature.

## Navigation and fixed chrome

- Home, Store, and the current Orders tab surface use a shared fixed top header.
- The cart control sits on the physical left side of that header.
- Its badge displays the cart's server-provided `total_quantity`, meaning the total number of units across all cart lines.
- The badge is not rendered when `total_quantity` is zero.
- The header and existing bottom tab bar remain fixed while only the middle content scrolls.
- The bottom tab bar is hidden on Cart, Address Checkout, Payment, and Confirmation routes.
- Cart and checkout back controls use a circular 44-by-44 treatment.

## Add-to-cart behavior

- Adding a product updates the server cart and React Query cache through the existing cart mutation.
- A successful add keeps the customer on the product detail page and shows the existing inline success feedback.
- The shared cart badge reflects the updated total without requiring navigation to the cart.

## Checkout routes

Checkout is split into three route-backed steps:

1. Address (`checkout.tsx`)
2. Payment (`payment.tsx`)
3. Confirmation (`confirmation.tsx`)

Address and Payment render a fixed checkout header and progress indicator outside their scrollable content. Confirmation activates the third step while retaining the success-focused handoff presentation. All three routes omit the bottom tabs.

## Address step

- Saved addresses render as handoff-style radio cards.
- Every saved address includes a Remove action backed by the existing authenticated delete-address endpoint.
- Removing the selected address selects the default remaining address, otherwise the first remaining address.
- "Add new address" opens an inline address form.
- While the form is open, the sticky bottom action changes from Continue to Save Address.
- Save Address is disabled until every required field is valid; optional apartment and postal-code fields do not block saving.
- Continue is unavailable while the form is open, preventing an unfinished address from being bypassed.
- After a successful save, the new address is selected, the form closes, and Continue returns.
- The section below addresses is the single supported delivery option, "Standard delivery," with a truck icon. No credit-card option appears on this step.

## Payment preparation and authoritative totals

- Continuing from Address navigates to Payment with the selected address ID and a generated idempotency key.
- Payment creates or retrieves checkout exactly once for that key. Reusing the key protects against duplicate order/payment creation.
- The resulting server order is the source of truth for line items, subtotal, delivery fee, and final total.
- The delivery fee and final total are displayed on the Payment page before the customer presses Pay; the client does not invent or calculate the configured shipping fee.
- Payment confirmation starts only when the Pay button is pressed.
- Declined and unknown outcomes remain on Payment with retry feedback.
- Submitted payment polls the order endpoint. Only a server-verified paid state triggers replacement navigation to Confirmation.
- After verified payment, cart queries are invalidated so normal pages refetch an empty cart and render no badge.

## Components and state boundaries

- Extend the screen scaffold with fixed header/footer slots so screens do not reproduce scroll containment logic.
- Add shared cart-header and checkout-step components using existing theme tokens and Feather icons.
- Keep server state in React Query. Keep only transient form and payment interaction state locally.
- Extend `addressesApi` with deletion; do not change the backend contract.
- Refactor payment preparation and confirmation into separate hooks or operations so entering Payment does not automatically invoke the payment SDK.

## Failure behavior

- Header cart-loading failures do not block the rest of a normal screen; the icon remains usable and the badge is omitted.
- Address create/delete errors remain on the Address page with Hebrew feedback.
- Checkout-creation errors remain on Payment with retry.
- A pending payment never renders successful confirmation until the order API reports a verified state.

## Test seams

Tests exercise public behavior at these agreed boundaries:

- React Native Testing Library for fixed-header rendering, badge visibility/count, navigation, address form gating, removal, step state, and bottom-tab visibility.
- Mocked HTTP at `addressesApi`, `cartApi.checkout`, and order polling boundaries.
- Injected `PaymentConfirmer` for fake/Stripe confirmation outcomes without invoking native UI in unit tests.
- Expo Router calls and route parameters for Address to Payment to Confirmation navigation.

The focused Task 20 test suites run first, followed by mobile TypeScript, lint, the full mobile test suite where practical, and `git diff --check`.
