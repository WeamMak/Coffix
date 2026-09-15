# Create Catalog Records With Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators select category, product, and machine-model images during creation and save each record through one visible action.

**Architecture:** Reuse the completed-media upload lifecycle and add an explicit ownership-transfer callback to uploaded drafts. Category and machine-model forms submit their single media ID in the existing create payload; product creation saves an ordered gallery after receiving the new product ID and retains retryable state if that second command fails.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, TypeScript 6, Vitest, Testing Library.

## Global Constraints

- Add no API, schema, database, or dependency changes.
- Accept the same JPEG and PNG files and use the existing upload/finalize lifecycle.
- Preserve edit-time image replacement, removal, ordering, SKU association, and concurrency behavior.
- Delete abandoned uploads on cancellation and never delete successfully attached media during navigation cleanup.
- Prevent duplicate product creation when gallery attachment is retried.

---

### Task 1: Make uploaded draft ownership transferable

**Files:**
- Modify: `admin/src/components/ImageUpload.tsx`
- Modify: `admin/src/features/catalog/CategoryImageEditor.tsx`
- Modify: `admin/src/features/catalog/ProductImagesEditor.tsx`
- Test: `admin/tests/images.test.tsx`

**Interfaces:**
- Produces: `UploadedImage.retain(): void`, which synchronously exempts its completed media ID from unmount cleanup after a successful record association.
- Consumes: existing `retainedIds`, which continue to protect media loaded from server state.

- [x] **Step 1: Extend cleanup tests with synchronous ownership transfer**

Add a focused harness that uploads an image, calls the returned `retain()`, unmounts, and asserts that no `DELETE /media/{id}` request occurs. Retain the existing cancellation test proving that an unclaimed upload is deleted.

- [x] **Step 2: Run the focused test and verify it fails**

```bash
corepack pnpm --filter @coffix/admin exec vitest run tests/images.test.tsx
```

Expected: the new test fails because `UploadedImage` does not expose `retain()`.

- [x] **Step 3: Add the ownership-transfer callback**

Include a callback in every successful upload result:

```tsx
onUploaded({
  media_id: media.id,
  url: download.url,
  retain: () => {
    if (!attached.current.includes(media.id)) {
      attached.current = [...attached.current, media.id];
    }
  },
});
```

Call the callback after successful single-image and product-gallery edit saves so existing flows are also safe during immediate navigation.

- [x] **Step 4: Run the focused image tests**

Run the Task 1 command again. Expected: all image tests pass.

---

### Task 2: Add images to category and machine-model creation

**Files:**
- Create: `admin/src/components/SingleImageDraftField.tsx`
- Modify: `admin/src/features/catalog/CategoryList.tsx`
- Modify: `admin/src/features/config/MachineModels.tsx`
- Test: `admin/tests/images.test.tsx`

**Interfaces:**
- Produces: `SingleImageDraftField` with `purpose`, `label`, `value`, `onChange`, `onBusyChange`, and `disabled` props.
- Consumes: `UploadedImage`, including its `media_id`, preview URL, and `retain()` callback.

- [x] **Step 1: Write failing create-with-image tests**

For both record types, select a valid PNG in the create editor, wait for the preview, submit the required metadata, and assert that the single POST body contains `image_media_id: "media-1"`. Close or navigate after success and assert that the attached media ID is not deleted.

- [x] **Step 2: Run the focused tests and verify they fail**

```bash
corepack pnpm --filter @coffix/admin exec vitest run tests/images.test.tsx tests/config.test.tsx
```

Expected: the create forms have no image picker.

- [x] **Step 3: Implement the controlled single-image draft field and create payloads**

Render the existing `ImageUpload`, preview the selected image, propagate busy state, and keep the same uploader mounted until submit or cancellation. Add the selected media ID only to POST bodies:

```tsx
const result = await client.api.request(path, {
  method,
  body: {
    ...metadata,
    ...(!existing && image ? { image_media_id: image.media_id } : {}),
  },
});
if (!existing) image?.retain();
return result;
```

Disable the form Save button while upload completion is pending.

- [x] **Step 4: Run the focused tests**

Run the Task 2 command again. Expected: both create-with-image tests and existing configuration/image tests pass.

---

### Task 3: Add an ordered image gallery to product creation

**Files:**
- Create: `admin/src/features/catalog/ProductCreateImages.tsx`
- Modify: `admin/src/features/catalog/ProductEditor.tsx`
- Test: `admin/tests/images.test.tsx`

**Interfaces:**
- Produces: `ProductCreateImages` with controlled ordered draft items, Hebrew alt-text editing, cover/reorder/removal controls, upload busy state, and no separate Save action.
- Consumes: the new product response's `id` and `version`, then sends `ProductGalleryUpdate` to `PUT /admin/products/{id}/media`.

- [x] **Step 1: Write a failing partial-success and retry test**

Create a product with two uploaded images, reorder them, and make the first gallery PUT fail. Assert that the dashboard reports the product was saved but the images were not, retains both previews, and sends only one product POST. Retry through the main Save button, allow the gallery PUT to succeed, and assert that upload initialization and product creation were not repeated and the ordered gallery uses the product name as empty alt-text fallback.

- [x] **Step 2: Run the product image test and verify it fails**

```bash
corepack pnpm --filter @coffix/admin exec vitest run tests/images.test.tsx
```

Expected: the new-product page has no image picker or creation gallery.

- [x] **Step 3: Implement product creation gallery orchestration**

Keep `savedProduct` after the POST. For a new route with drafts, PUT the gallery using the returned version. On success, call every draft's `retain()` before navigating to the edit route. On failure, leave the route, form values, drafts, and completed uploads intact; show a partial-success alert and let the next main Save update the same product before retrying the gallery.

Use explicit request items:

```tsx
items: images.map((image) => ({
  media_id: image.media_id,
  sku_id: null,
  alt_text_he: image.alt_text_he.trim() || productName,
}))
```

- [x] **Step 4: Run the focused catalog and image tests**

```bash
corepack pnpm --filter @coffix/admin exec vitest run tests/images.test.tsx tests/catalog.test.tsx
```

Expected: product create, retry, and all existing edit tests pass.

---

### Task 4: Verify and commit

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-create-with-images-design.md`
- Create: `docs/superpowers/plans/2026-09-15-create-with-images.md`

**Interfaces:**
- Consumes: the completed UI and tests from Tasks 1–3.
- Produces: a verified Task 29 follow-up commit.

- [x] **Step 1: Run all required checks**

```bash
corepack pnpm --filter @coffix/admin test
corepack pnpm --filter @coffix/admin lint
corepack pnpm --filter @coffix/admin typecheck
corepack pnpm --filter @coffix/admin build
git diff --check
```

Expected: all checks pass without new warnings.

- [x] **Step 2: Mark this plan complete and commit only the feature files**

```bash
git add -f docs/superpowers/specs/2026-09-15-create-with-images-design.md docs/superpowers/plans/2026-09-15-create-with-images.md
git add admin/src/components/ImageUpload.tsx admin/src/components/SingleImageDraftField.tsx admin/src/features/catalog/CategoryImageEditor.tsx admin/src/features/catalog/ProductImagesEditor.tsx admin/src/features/catalog/ProductCreateImages.tsx admin/src/features/catalog/CategoryList.tsx admin/src/features/catalog/ProductEditor.tsx admin/src/features/config/MachineModels.tsx admin/tests/images.test.tsx
git commit -m "feat: add images during catalog creation"
```
