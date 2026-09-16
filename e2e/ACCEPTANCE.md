# Task 33 local acceptance

Task 33 extends the approved task 32 isolated Compose harness. Tests use public
HTTP outcomes and separate worker processes; only fault injection uses internal
worker claims or connection-pool controls. Fake providers and the existing secret
and run-ownership restrictions remain required. No cloud/provider work is included.

## Execution plan and agreed boundaries

1. Add failing checks for the load acceptance calculation; implement the two
   JavaScript load drivers and run against the API. The user approved 10 concurrent
   clients, 500 authenticated reads, no errors and p95 below 2,000ms. Twenty warmup
   reads precede measurement; elapsed time includes response-body consumption.
   Inventory contention uses 16 distinct customers competing for five units and
   verifies the final inventory through the admin API.
2. Exercise duplicate/reordered signed payment events, kill a worker after its
   outbox claims commit and restart after lease expiry, pause/restore run-owned
   Redis, exhaust the API PostgreSQL pool, drain multiple expired-cart batches,
   and reject malformed/oversized media. Fix observed failures with regressions.
3. Add smoke and security commands with failing exit status for missing tools,
   scan failures and findings. Record dependency, secret, static and exact local
   container scan outcomes, including launch-blocking exceptions.
4. Run backend (including migrations/seed), mobile, admin, E2E, lint/types and
   generated-client drift checks from a clean source snapshot. Record exact
   commands/results and preserve generated reports outside tracked source.
5. Prepare the 21-screen mobile and staff operations review against the approved
   handoffs. Record actual owner/staff approval only after review; previous staff
   design approval does not establish this task's operations acceptance.
6. Update only verified task 33 checkboxes and commit with the required message
   once the required gates pass. Do not proceed to task 34 with an open gate.

## Results

Technical verification and owner/staff acceptance completed on 2026-09-16. The
task branch is `feature/task33`, based on main `4383f8c` (task 32 merge). The owner
approved all 21 mobile screens and admin/technician operations as recorded below.
The PostgreSQL image exception was closed after the approved replacement passed
the unchanged security checks; see the remediation evidence below.

Verified fixes:

- Exhausting the 15-connection API pool previously waited 30 seconds and returned
  500. Pool acquisition now times out after two seconds with a safe, correlated
  `503 DEPENDENCY_UNAVAILABLE` and `Retry-After: 2`; recovery is verified.
- A paused Redis previously left OTP waiting beyond five seconds. Connection and
  socket waits now have two-second limits, with no automatic retry of uncertain
  rate-limit increments. OTP fails closed with 503; readiness fails, liveness and
  independent order reads remain available, and unpausing restores service.
- Profile updates previously sent success before committing. A deterministic test
  reads the profile as the response body is sent and observed `profile_complete`
  still false. Profile PATCH now uses the existing command transaction finalizer.
- The clean-checkout backend suite exposed an implicit import-path assumption in
  cross-file test fixtures. Pytest now explicitly includes the backend root.
- The staff browser fixture still expected metadata edits to clear the legacy
  `image_key` field. Its exact request assertion now matches the current separate
  image-management contract; stale drafts and layout assertions remain intact.
- `js-yaml` 4.3.1 was affected by
  [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
  A narrowly scoped workspace override and lock update use 4.3.2, including
  Redocly's exact transitive pin; existing 3.15.2 remains unchanged.

Load/resilience: all eight new scenarios passed together. API p95 was **77.29ms**
for 500 requests/10 clients, with no errors. Sixteen buyers reserved exactly five
units; eleven received the expected stock conflict. Duplicate/reordered webhooks,
worker SIGKILL after two committed claims, lease recovery with two distinct
notifications and no duplicates, PostgreSQL pool exhaustion, Redis unavailability,
12 expired carts drained in 5/5/2 batches and media rejection all passed.

## Clean-checkout verification

Candidate source was copied into a separate temporary Git repository at
`/tmp/coffix-task33-verify-46a6lp2g`, installed with frozen Python and pnpm locks,
and checked with `bash scripts/verify-local.sh`. This is a local candidate snapshot,
not a task-branch commit. No task branch was pushed or merged. Reports are under
that checkout's `.local/verification/`.

The runner used Node 22.23.1, Python 3.12.13 and the installed Chromium revision 1234
executable. Chromium's existing shared libraries required `LD_LIBRARY_PATH` to
point to `.local/browser-libs/root/usr/lib/x86_64-linux-gnu` in the main workspace.
The standard `playwright install --with-deps chromium` attempt required an
interactive sudo password; reusing the existing local libraries resolved it.

| Command / boundary | Result |
| --- | --- |
| `make test`: backend, including migrations and seed | 887 passed |
| `make test`: mobile | 266 passed / 49 suites |
| `make test`: admin | 90 passed / 12 files |
| `make lint`: backend and workspace lint/types | Passed |
| E2E Python Ruff and ty checks | Passed |
| `bash scripts/smoke-local.sh` | Two load-policy checks, seven harness checks and four HTTP/browser scenarios passed |
| `bash scripts/e2e-local.sh` | Seven harness checks and 23 scenarios passed, no retries |
| Staff design/operations browser suite | 24 passed, including desktop and phone; admin lint/types also passed |
| Admin build | Passed |
| Expo export, all platforms | Passed; does not prove native visual acceptance |
| Generated OpenAPI and TypeScript client comparisons | Both byte-for-byte comparisons passed |
| `git diff --check` | Passed |

The first full pass exposed the implicit backend import path and missing Chromium
libraries. After those were corrected, all boundaries passed except the stale
category browser expectation. That test-only correction is checked by rerunning
the complete affected staff suite plus admin lint/types from the updated clean
snapshot. The unchanged backend/mobile/E2E suites are not rerun solely for that
fixture adjustment. Original failed logs are retained alongside final results.

## Security delivery tracker

Command: `bash scripts/security-local.sh`. Last completed report:
`.local/security-0PPjKkca/` (2026-09-16). Trivy 0.68.2 is pinned by image digest;
Bandit is pinned to 1.8.6. Advisory databases were freshly downloaded. Trivy found
both lockfiles (Python uv and pnpm), including development dependencies. Findings
remain in private local JSON reports. The replaced image findings are retained
below as history; the latest complete security command exited successfully.

| Check | Result |
| --- | --- |
| Locked Python/JS dependencies, high/critical | Pass after js-yaml fix |
| Versionable-source secrets | Pass; does not cover Git history or ignored local files |
| Python static security, high severity | Pass |
| pnpm audit, high/critical | Pass; two moderate advisories retained below |
| Installed Redis image | Pass, no high/critical findings |
| Configured, installed PostgreSQL image | Pass, no high/critical findings |
| Application container images | Not yet available; builds are task 35 |

`SEC-33-01` — **Closed on 2026-09-16 by image replacement.** Both Compose files
now pin Docker Hardened PostgreSQL 17 Alpine 3.24:

```text
dhi.io/postgres:17-alpine3.24@sha256:de165bfe11cdc8fd5cda469b02c1aacb94e7c6cd017841470347c81ce8ea2343
```

The full local security command passed with zero HIGH or CRITICAL PostgreSQL
findings. No exclusions, VEX filtering, threshold changes or risk waivers were
applied. The scanner resolves images from `compose.yaml` and scans their installed
archives; service names keep report paths independent of registry names/digests.
The tested platform is Linux amd64, running PostgreSQL 17.11 as UID/GID 70. Other
architectures were not tested. The Phase 10 security blocker is resolved for the
configured local images; application images still need scanning in task 35.

The previous `postgres:17-alpine` digest
`sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`
failed with 30 HIGH and one CRITICAL package findings. Its original report remains
at `.local/security-d5N4nqPe/`. The replacement contains OpenSSL libraries 3.5.8-r1
and libuuid 2.42.3-r1; the old image had 3.5.7-r0 and 2.42.1-r0. The replacement scan
detected 48 Alpine packages and no Go binary targets. Trivy's Alpine 3.24 EOL-table
warning did not prevent package scanning. Package findings in the replaced image
are not claims of exploitability.

Comparison scans rejected official `postgres:17-bookworm` (101 HIGH, 16 CRITICAL)
and hardened `dhi.io/postgres:17-debian13` (18 HIGH, one CRITICAL) under the same
scanner policy. Exact comparison digests, commands and raw reports are retained
under `.local/task33-image-research/`.

[Docker's PostgreSQL guide](https://hub.docker.com/hardened-images/catalog/dhi/postgres/guides)
documents the image's data path and initialization variables.
[Registry access](https://docs.docker.com/dhi/how-to/use/) requires Docker account
login for the free Community image. Authentication succeeded here without changes
to local credentials. [Docker's scan guide](https://docs.docker.com/dhi/how-to/scan/)
describes optional VEX handling, which this passing scan did not require.

Redis scanned digest:
`sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf`.

Moderate dependency observations (outside the high/critical task threshold):
`uuid` 7.0.3 through Expo's xcode tooling
([advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)), and
`decode-uri-component` 0.2.2 through expo-router/query-string
([advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)). No speculative
major-version transitive override was added.

Historical PostgreSQL findings from the replaced image:

| Package / installed version | Severity | Advisory |
| --- | --- | --- |
| libcrypto3 3.5.7-r0 | HIGH | CVE-2026-14456 |
| libssl3 3.5.7-r0 | HIGH | CVE-2026-14456 |
| libuuid 2.42.1-r0 | HIGH | CVE-2026-53612 |
| libuuid 2.42.1-r0 | HIGH | CVE-2026-53613 |
| libuuid 2.42.1-r0 | HIGH | CVE-2026-53614 |
| libuuid 2.42.1-r0 | HIGH | CVE-2026-76642 |
| libuuid 2.42.1-r0 | HIGH | CVE-2026-78408 |
| libuuid 2.42.1-r0 | HIGH | CVE-2026-78409 |
| libuuid 2.42.1-r0 | HIGH | CVE-2026-78410 |
| stdlib v1.24.6 | CRITICAL | CVE-2025-68121 |
| stdlib v1.24.6 | HIGH | CVE-2025-61726 |
| stdlib v1.24.6 | HIGH | CVE-2025-61729 |
| stdlib v1.24.6 | HIGH | CVE-2026-25679 |
| stdlib v1.24.6 | HIGH | CVE-2026-27145 |
| stdlib v1.24.6 | HIGH | CVE-2026-32280 |
| stdlib v1.24.6 | HIGH | CVE-2026-32281 |
| stdlib v1.24.6 | HIGH | CVE-2026-32283 |
| stdlib v1.24.6 | HIGH | CVE-2026-33811 |
| stdlib v1.24.6 | HIGH | CVE-2026-33814 |
| stdlib v1.24.6 | HIGH | CVE-2026-33818 |
| stdlib v1.24.6 | HIGH | CVE-2026-39820 |
| stdlib v1.24.6 | HIGH | CVE-2026-39821 |
| stdlib v1.24.6 | HIGH | CVE-2026-39822 |
| stdlib v1.24.6 | HIGH | CVE-2026-39836 |
| stdlib v1.24.6 | HIGH | CVE-2026-42499 |
| stdlib v1.24.6 | HIGH | CVE-2026-42504 |
| stdlib v1.24.6 | HIGH | CVE-2026-56853 |
| stdlib v1.24.6 | HIGH | CVE-2026-56858 |
| stdlib v1.24.6 | HIGH | CVE-2026-56859 |
| stdlib v1.24.6 | HIGH | CVE-2026-56860 |
| stdlib v1.24.6 | HIGH | CVE-2026-56862 |

## Review artifacts

Current staff gallery: `.local/task33-review/index.html` (107 captures).
Representative desktop overview, phone technician jobs and phone People review
captures were inspected; no visual correction was identified in those samples.
The gallery includes normal, empty, loading, failed/stale, confirmation, payment
wait, permissions and operations states at desktop and phone widths. Its images
come from the 24 passing fixture-backed browser tests. The 23 separate E2E
scenarios exercise real API transactions and browser commands.

Copies of verification logs: `.local/task33-review/verification/`. Native device
review could not be performed here: no Android device bridge or iOS runtime is
available. Owner review remains explicit below.

## Owner and staff review gate

`DESIGN-33-01` — **Closed, approved on 2026-09-16.** The user/product owner
responded “Reviewed and approved” to the review request covering all 21 mobile
screens and staff admin/technician operations, with this checklist and the staff
gallery linked. No corrections were requested. Device/OS and text-scale details
were not provided; this records owner acceptance, not native execution by the
agent. The 2026-09-14 task 28 staff visual approval remains the baseline.

Run `bash scripts/e2e-local.sh serve` for an isolated seeded endpoint; use the
mobile and Android connection instructions in `e2e/README.md`. Compare the current
app against `design/design_handoff_coffeeshop_mobile/`, including normal and
large text on representative iOS/Android devices. Browser exports/component trees
cannot substitute for native review. Use the existing route/test map in
`mobile/README.md` and the staff baseline in `design/admin/README.md`.

| Mobile screen | Owner review |
| --- | --- |
| Splash | Approved |
| Welcome | Approved |
| Phone | Approved |
| OTP | Approved |
| Editorial home | Approved |
| Categories | Approved |
| Product list/search | Approved |
| Product detail | Approved |
| Cart | Approved |
| Checkout | Approved |
| Order confirmation | Approved |
| Machines | Approved |
| Machine detail | Approved |
| Register machine | Approved |
| Service intake, all steps | Approved |
| Service detail/payment/quote | Approved |
| Service confirmation | Approved |
| Orders | Approved |
| Order detail | Approved |
| Notifications | Approved |
| Profile and account/contact/settings | Approved |

Staff operations review: authenticate/restore/logout; create and edit catalog and
images; review inventory; process/ship/refund orders; review diagnostic intake,
payment gates and quotes; schedule with overlap warning and assign a technician;
complete assigned jobs and add notes/photos; edit shop settings; confirm People
access changes; inspect notification failures/retries and audit before/after
values. Check desktop and phone layouts, Hebrew/RTL, keyboard/focus, readable
mixed-direction values and permission denials. Staff confirmation: **approved by the user on 2026-09-16**.


## PostgreSQL image remediation plan (2026-09-16)

The user approved adopting the locally verified Docker Hardened PostgreSQL 17
Alpine image. Keep the existing named volume and mount its root directly at DHI's
`/var/lib/postgresql/17/data`, where both existing and freshly initialized database
files are expected. Both images run PostgreSQL as UID/GID 70. This avoids moving
or deleting data and preserves the PostgreSQL major version. Pin the tested digest
in both Compose files. Derive security scan references from development Compose
and name report files by service, so registry prefixes and digests are supported.

- [x] Pin both Compose images and update only their PostgreSQL volume targets.
- [x] Update the scanner to resolve the configured images and fail on resolution errors.
- [x] Verify old-image to new-image volume reuse with a persistent sentinel, then
      run the full E2E suite against the final Compose configuration.
- [x] Run all local security checks with the unchanged thresholds; record results
      and close SEC-33-01 only after they pass.
- [x] Document registry access and volume compatibility, run whitespace checks,
      and commit the verified task 33 follow-up without pushing.


Remediation verification: the unchanged local security command exited 0 with all
six checks passing (`.local/security-0PPjKkca/`). The final Compose configuration
passed seven harness checks, all 17 migrations and all 23 E2E scenarios in 46.1s.
The agreed API load had zero errors and p95 101.66ms. A disposable database created
by the old official image retained a sentinel table/row after replacement and a
second restart. Both verification stacks removed all run-owned resources.

The development PostgreSQL service was backed up privately, recreated with the
pinned image and confirmed healthy on PostgreSQL 17.11. Redis was not recreated.
Verification logs and the private before/after backups are ignored local artifacts
under `.local/task33-image-research/`; no database contents or credentials are
included in this commit.

The complete backend suite passed against the updated development service:
`uv run --project backend pytest backend/tests -q` — **887 passed in 166.55s**,
including migration and seed checks. The before/after `pg_dumpall` output matched
byte-for-byte after removing only randomly generated psql `\restrict` and
`\unrestrict` keys; existing development data was preserved. Both Compose image
references match the image metadata in the passing security report. Shell syntax,
Compose validation and `git diff --check` passed. Frontend code and contracts did
not change, so their already-passing suites/builds were not repeated.
