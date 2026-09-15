# Silent Services and Orders Tab Refresh

## Problem

The Services and Orders list screens refetch whenever they regain focus. Their
`FlatList` components bind `refreshing` directly to the query's
`isRefetching` state, so a programmatic focus refresh displays the native
pull-to-refresh indicator at the top of the screen. Entering either tab should
refresh current server data without showing that indicator.

## Considered approaches

1. Track manual pull-to-refresh separately from query refetch state. This keeps
   focus refresh silent while preserving native feedback for a pull gesture.
   This is the selected approach because it distinguishes the two user
   experiences without changing query behavior.
2. Remove the `refreshing` binding. This hides the indicator for every refresh,
   including a manual pull, and gives poor feedback when the user explicitly
   requests a refresh.
3. Remove focus refetching and depend on pull-to-refresh or query invalidation.
   This can leave server-managed order and service data stale when the user
   returns to a tab.

## Design

Each list screen owns a boolean that represents only a user-initiated pull
refresh. Its refresh handler sets the boolean, awaits the existing query
`refetch`, and clears the boolean in `finally`. The `FlatList.refreshing` prop
uses this boolean rather than `query.isRefetching`.

The existing `useRefetchOnFocus` hooks remain unchanged and continue to update
the cache whenever the screen gains focus. Because those calls do not set the
manual boolean, they keep the rendered list visible and do not activate the
native top indicator. The initial request continues to use the existing
full-page loading state when there is no cached data.

Both screens keep their current error behavior. A failed silent refresh leaves
cached content visible according to TanStack Query's refetch semantics. A
manual refresh always clears its indicator through `finally`, whether the
request succeeds or fails.

## Verification

Focused tests will exercise the registered focus callback and verify that it
requests fresh data without setting the list's `refreshing` prop. Existing
pull-to-refresh tests will verify that manual refresh still requests data and
shows user-controlled refresh state. Mobile tests, lint, type checking, and
`git diff --check` will run before the implementation commit.
