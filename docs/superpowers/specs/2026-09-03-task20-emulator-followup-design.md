# Task 20 Emulator Follow-up Design

**Date:** 2026-09-03
**Status:** Approved for planning

## Goal

Correct four issues found in the final Task 20 emulator review:

1. Empty Cart's “חזרה לחנות” transition moves in the wrong direction.
2. The seeded product has no uploaded media, so Cart shows an icon instead of the photo shown in the catalog.
3. Returning Home after confirmation leaves Confirmation at the top of the nested Store stack.
4. Category-page headings appear on the physical left instead of beside the right-side Back button.

## Design

### Empty-cart Back action

The empty-state “חזרה לחנות” action will use the existing history-aware `goBack` helper. When stack history exists it performs a native pop, producing the approved right-to-left Back reveal. A direct-linked empty Cart still falls back safely to the Store root.

### Cart images

`CartItemRead` will include `product_type`. Cart image selection will follow the same hierarchy as catalog cards:

1. Use the server-provided uploaded product/SKU image when present.
2. Otherwise use the shared product-type fallback photo already displayed by catalog cards.
3. Use the coffee icon only when neither source exists or when image loading fails.

The shared fallback selection will live in the catalog image helper rather than being duplicated in Cart. Cart photos will increase from 82 by 82 points to 112 by 112 points and use `resizeMode="cover"`.

### Leaving Confirmation

The successful Confirmation “חזרה לבית” action will first dismiss the nested Shop stack back to its root and then navigate to Home. Reopening Store therefore displays the Store root instead of the completed Confirmation screen. Order tracking navigation remains unchanged.

### Category heading alignment

The category header retains its physical layout: cart on the left and circular Back button on the right. The middle heading area stretches across the remaining width, while both Hebrew heading lines explicitly use right text alignment and RTL writing direction. This prevents global RTL edge swapping from placing the heading beside the cart.

## Error Handling

- Broken uploaded or fallback image URLs show the coffee icon.
- Deep-linked Cart navigation without history uses the Store root fallback.
- Store-stack dismissal is performed only from the successful Confirmation Home action.
- Payment state, cart reset rules, and order tracking are unchanged.

## Verification

Focused regression tests will assert:

- empty-cart “חזרה לחנות” calls native Back when history exists;
- a cart item without uploaded media uses the same fallback URL as its catalog product type;
- the enlarged cart photo is 112 by 112 and cover-cropped;
- Confirmation dismisses the Shop stack before navigating Home;
- the category heading occupies the middle region and explicitly aligns text to the physical right.

The existing Task 20 mobile suite, affected backend API/OpenAPI tests, TypeScript, lint, and `git diff --check` will be rerun. Final animation and physical alignment remain emulator verification items.
