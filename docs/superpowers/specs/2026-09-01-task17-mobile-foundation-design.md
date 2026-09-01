# Task 17 Mobile Foundation Design

## Objective

Establish the Expo React Native foundation for Coffix as a Hebrew RTL application and encode the approved Warm & Artisanal handoff as typed, reusable design primitives. This task provides navigation and presentation infrastructure only; authentication and product screens remain in later plan tasks.

## Sources of Truth

Requirements follow `docs/spec.md` and Task 17 in `docs/plan.md`. Visual decisions follow `design/design_handoff_coffeeshop_mobile/`, but its browser prototype is reference material rather than production code. Where the prototype conflicts with the product documents, the product documents win; specifically, the fourth bottom tab is `הזמנות`, not the prototype's `עדכונים`.

## Architecture

The mobile workspace will use Expo Router, React Native, and TypeScript. The root layout owns startup concerns: loading bundled fonts, keeping the native splash visible until initialization completes, enabling RTL before routed UI renders, and registering the authentication, tab, and development-gallery routes.

The authentication layout is an RTL native stack. The tab layout declares five stable route groups—home, shop, service, orders, and profile—with instant tab changes. Each group is treated as an independent stack boundary so later tasks can add screens without changing the tab contract. Stack pushes use the RTL leading edge; tab switches do not animate.

A development-only gallery renders the Task 17 primitives for manual comparison. It is reachable for local review but is not linked from production navigation. Task 17 does not implement placeholder business screens or copy prototype HTML into the application.

## Design System

Theme modules expose readonly tokens for the approved Warm & Artisanal palette, the documented type scale, spacing values, radii, and native shadow/elevation values. Components consume theme tokens rather than restating raw design values.

Assistant is the UI and body typeface. Noto Serif Hebrew renders Hebrew display and heading text because Fraunces has no Hebrew glyph coverage. Fraunces remains available for Latin branding. Fonts are bundled through Expo-compatible packages so the application does not depend on Google Fonts network requests at runtime.

Logical RTL layout is expressed through start/end-oriented helpers and React Native direction-aware properties. Numeric and phone values may opt into LTR presentation without changing the surrounding Hebrew flow.

## Reusable Components

- `Screen` owns safe-area presentation, background, scrolling, and logical content padding.
- `Text` maps semantic variants to approved font family, size, weight, line height, color, and scaling behavior.
- `Button` provides ink and accent variants, accessible button semantics, disabled state, minimum touch size, and the handoff's press feedback.
- `Input` provides an accessible label, native text-input semantics, logical adornment placement, validation messaging, and optional LTR value entry.
- `Card` provides tokenized surface, border, radius, padding, and elevation.
- `Pill` provides compact tokenized status and category treatments.
- `IconButton` provides a minimum accessible touch target and requires an accessibility label.
- `BottomTabs` exposes the approved five-item contract, Hebrew labels, deterministic RTL visual order, active state, and an activation callback.

Components remain controlled through narrow public props and do not own server or navigation state.

## Startup and Failure Behavior

RTL initialization is idempotent. When the native direction already matches the desired state, startup continues without requesting a reload. Font loading keeps the splash visible and reports initialization failure rather than rendering a partially styled application. No remote services are required for Task 17.

The development gallery exercises default, alternate, disabled, pressed, and text-scaling-relevant component states. It uses local primitives only and introduces no mock business behavior.

## Public Test Seams

Tests observe only these public boundaries:

1. Exported theme tokens, checked against literal approved values from the handoff.
2. Exported logical spacing and RTL initialization helpers, checked through their returned styles and the public React Native RTL manager boundary.
3. Rendered component roles, labels, disabled state, and text-scaling properties through React Native Testing Library.
4. The `BottomTabs` public item contract and rendered behavior: Hebrew labels, `בית · חנות · שירות · הזמנות · פרופיל` order, active state, and activation callback.
5. Expo configuration through Expo's public configuration command.

Tests do not assert private component structure, internal hooks, or implementation-only style-array positions.

## Verification

Implementation proceeds in vertical red-green slices. Required verification is:

- Focused mobile theme and RTL component tests.
- Full mobile test command.
- Mobile lint and TypeScript checks.
- Expo configuration validation.
- `git diff --check`.
- Manual gallery comparison on representative iOS and Android presentations, including common text-scaling settings; any unavailable simulator or device is reported as an environmental blocker rather than silently skipped.

## Scope Boundaries

Task 17 does not implement authentication behavior, API access, persistent session state, product screens, service screens, orders, notifications, or profile functionality. It does not import the prototype HTML or its browser components. Alternative handoff themes and non-default screen variants remain out of scope.
