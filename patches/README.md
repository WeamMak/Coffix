# Dependency patches

pnpm applies the patches in `pnpm-workspace.yaml` during installation. Commit the
patch file and lockfile together; do not edit installed `node_modules` directly.

## Temporary security backports — reviewed 2026-10-03

These patches backport reviewed runtime changes from open upstream pull requests;
the package versions still appear vulnerable in version-based scanner reports.
They are not published upstream releases.

| Package | Fix and pinned upstream source |
| --- | --- |
| `braces@3.0.3` | [CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): cap parser and AST traversal nesting at 100; [PR 72](https://github.com/micromatch/braces/pull/72), revision `d0d575e55e74a4e0218e5248fafb79efc3e54ebb`. |
| `node-forge@1.4.0` | [CVE-2026-85393](https://github.com/advisories/GHSA-86w9-cpqp-85rv): reject unconsumed nested DigestAlgorithm elements during RSA signature verification; [PR 1152](https://github.com/digitalbazaar/forge/pull/1152), revision `ceba34402e329f0365134f23fe19898756527d65`. |

`security-fixes.json` records the owner (Weam Mak), exact package/advisory/version,
patch SHA-256, installed runtime-file SHA-256 values, and review expiration.
Recognition expires at **2026-11-02 00:00 UTC**. Before then, review upstream
releases and replace the backports with published fixes when available. Any
extension requires a new source review, regression checks, and manifest update.

`scripts/security-audit.py` retains raw Trivy/pnpm reports and recognizes only
these exact findings after the regression tests and hashes pass against the
installed dependencies used by Metro and Expo. Trivy recognition applies only
to `pnpm-lock.yaml` language-package findings. Other high/critical findings,
scanner errors, expired reviews, missing patches, or changed installed code fail
the gate. Container, secret, and static-analysis scans have no such exceptions.

Both exploit regression tests failed before patching and pass afterward. Checks
also cover ordinary brace expansion, the nesting boundary, direct AST input,
valid RSA signatures, and altered messages. The RSA fixture contains only a
public key and malformed signature from the pinned upstream test. Compatibility
tests generate temporary private keys in memory.

Verify using Node 22.23.1:

```sh
corepack pnpm install --frozen-lockfile
node scripts/tests/security-patches.test.cjs
python3 -m unittest discover -s .github/tests -p test_security_audit.py -v
bash scripts/security-local.sh
```

To remove a backport, upgrade the consuming dependency to a verified fixed
release, remove its `patchedDependencies` entry and patch, and regenerate the
lockfile. Update the manifest and regression tests together. When both upstream
fixes are installed, remove the temporary patch-recognition path and its policy
tests while retaining the security regression tests and scanner error handling.

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
