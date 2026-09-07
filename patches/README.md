# Dependency patches

pnpm applies the patches in `pnpm-workspace.yaml` during installation. Commit the
patch file and lockfile together; do not edit installed `node_modules` directly.

## Expo Router 57.0.17 — deprecated interaction handles

`expo-router@57.0.17.patch` removes the interaction handle ref, start/end helpers,
and their calls from the bundled JS stack's `Card.js`. In the pinned React Native
0.86.3, `createInteractionHandle()` returns a constant and `clearInteractionHandle()`
only validates it; these calls no longer schedule work. Accessing the deprecated
API produces the development warning during screen transitions.

Animation drivers, timings, gesture callbacks, completion callbacks, and timer
cleanup remain intact. There is no warning suppression or replacement scheduler.
The application retains the simultaneous right-to-left Back slide.

Expo Router 57.0.19 was inspected on 2026-09-07 and still contains the calls. Keep
this patch scoped to 57.0.17. When upgrading Expo Router, inspect the bundled stack
and remove this patch/configuration if upstream has removed the deprecated usage;
otherwise review and regenerate the patch for the new version.

Verify with:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --dir mobile test --runTestsByPath tests/navigation/service.test.tsx
```

The regression test spies on access to the real React Native API while opening
and popping real Expo Router pages, so it catches a missing patch even if the
one-time console warning was already emitted by an earlier test.

After changing this patch, restart Metro with a cleared cache:

```sh
corepack pnpm --dir mobile start --clear
```
