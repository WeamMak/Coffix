# Silent Services and Orders Tab Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Services and Orders whenever their tabs regain focus without showing the native pull-to-refresh indicator, while retaining that indicator for manual pull gestures.

**Architecture:** Keep the existing TanStack Query focus-refetch hooks. In each list screen, introduce local state that tracks only user-initiated refreshes and bind the `FlatList.refreshing` prop to that state.

**Tech Stack:** React Native 0.86, Expo Router 57, TanStack Query 5, Jest, React Native Testing Library, TypeScript 6.

## Global Constraints

- Keep the existing full-page loading state for the first request without cached data.
- Keep cached list content visible during focus refreshes.
- Preserve pull-to-refresh and its native progress indicator.
- Add no dependencies and make no unrelated refactors.

---

### Task 1: Distinguish focus refresh from manual pull-to-refresh

**Files:**
- Modify: `mobile/app/(tabs)/(service)/index.tsx`
- Modify: `mobile/app/(tabs)/(orders)/index.tsx`
- Test: `mobile/tests/machines/list.test.tsx`
- Test: `mobile/tests/orders/list.test.tsx`

**Interfaces:**
- Consumes: the existing `useRefetchOnFocus(refetch: () => unknown): void` hooks and each TanStack Query result's `refetch()` method.
- Produces: an async local `refreshManually(): Promise<void>` handler in each list screen and a boolean `isManualRefresh` bound to `FlatList.refreshing`.

- [x] **Step 1: Write failing tests for silent focus refresh and visible manual refresh**

Capture the callback passed to the mocked `useFocusEffect`. Start a controlled refetch, invoke that callback, and assert that the list remains rendered with `refreshing={false}` while the request is pending. Update the existing pull-to-refresh test to start a controlled refetch and assert `refreshing={true}` until it settles. Apply the same checks to both list screens.

```tsx
const focusCallback = jest.mocked(useFocusEffect).mock.calls.at(-1)?.[0];
await act(async () => {
  focusCallback?.();
});
expect(screen.getByTestId('orders-list')).toHaveProp('refreshing', false);

fireEvent(screen.getByTestId('orders-list'), 'refresh');
expect(screen.getByTestId('orders-list')).toHaveProp('refreshing', true);
resolveRefetch(jsonResponse(orders));
await waitFor(() => {
  expect(screen.getByTestId('orders-list')).toHaveProp('refreshing', false);
});
```

- [x] **Step 2: Run the focused tests and verify the focus-refresh assertions fail**

Run:

```bash
corepack pnpm --filter @coffix/mobile exec jest tests/machines/list.test.tsx tests/orders/list.test.tsx --runInBand
```

Expected: both focus-refresh tests fail because `refreshing` currently follows `query.isRefetching`.

- [x] **Step 3: Add manual-refresh state to both screens**

Import `useCallback` and `useState`, then add the same focused handler in each screen using its query result:

```tsx
const [isManualRefresh, setIsManualRefresh] = useState(false);
const refreshManually = useCallback(async () => {
  setIsManualRefresh(true);
  try {
    await query.refetch();
  } finally {
    setIsManualRefresh(false);
  }
}, [query.refetch]);
```

Bind only the manual handler and state to the list:

```tsx
onRefresh={() => void refreshManually()}
refreshing={isManualRefresh}
```

Use the local query variable names `machines` and `orders` in the respective screens. Leave `useRefetchOnFocus(query.refetch)` unchanged.

- [x] **Step 4: Run focused and project checks**

Run:

```bash
corepack pnpm --filter @coffix/mobile exec jest tests/machines/list.test.tsx tests/orders/list.test.tsx --runInBand
corepack pnpm --filter @coffix/mobile test
corepack pnpm --filter @coffix/mobile lint
corepack pnpm --filter @coffix/mobile typecheck
git diff --check
```

Expected: tests and type checking pass; lint has no new warnings; `git diff --check` reports no errors.

- [x] **Step 5: Commit the implementation**

```bash
git add mobile/app/'(tabs)'/'(service)'/index.tsx mobile/app/'(tabs)'/'(orders)'/index.tsx mobile/tests/machines/list.test.tsx mobile/tests/orders/list.test.tsx docs/superpowers/plans/2026-09-15-silent-tab-refresh.md
git commit -m "fix: refresh service and orders tabs silently"
```
