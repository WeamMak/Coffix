# Pull-request validation

Task 34 provides these required status names:

| Status | Checks |
| --- | --- |
| `backend` | Frozen uv/pnpm installs, changed-file formatting, Ruff, ty, all backend tests, clean/base migration upgrades, seed twice, OpenAPI/client drift |
| `mobile` | Frozen install, source whitespace, ESLint, TypeScript, emulator-independent component/RTL tests, shared client types |
| `admin` | Frozen install, source whitespace, ESLint, TypeScript, components, Chromium RTL/operations tests, production build |
| `local-e2e` | Python/TypeScript harness checks, load assertions, disposable PostgreSQL/Redis, real API/browser/load/resilience journeys with fake providers |
| `infra-validate` | Workflow/path contracts, actionlint/ShellCheck, secrets, dependency/static/container/config/license scans, discovered Terraform and Kubernetes checks |

Every PR and main push creates all five statuses. File selection happens inside
each job, so unrelated changes finish successfully instead of leaving a required
workflow pending. Shared client, lockfiles, root configuration, scripts, patches,
and CI changes select all checks. Application changes select their own gate and
E2E; the supply-chain gate always runs. Selection uses the complete Git diff,
including deleted paths, rather than a truncated changed-files API response.
See [GitHub's required-check guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks).

The workflows use read-only repository permissions, full-SHA action pins, no
persisted checkout credential, lockfile-keyed caches, timeouts, and cancellation
of superseded runs. They never use `pull_request_target`. Providers are fake and
there are no AWS or production application credentials. Signed mobile builds use
the release workflow described below; full device E2E remains a
separate release acceptance check.

## GitHub setup

Set repository Actions secrets `DHI_USERNAME` and `DHI_TOKEN` to a Docker account
and **read-only** token permitted to pull the free hardened PostgreSQL image.
Anonymous pulls return HTTP 401. The backend service uses service-container
credentials; E2E/security jobs use a job-local Docker configuration and log out
afterward.

In branch protection/rulesets, require exactly `backend`, `mobile`, `admin`,
`local-e2e`, and `infra-validate` after the first hosted run registers them.
These repository settings are not changed by this task. Fork PRs cannot receive
registry secrets and therefore cannot pass the database/container gates as-is;
review their changes on a same-repository branch before merging. Do not switch
to `pull_request_target` or provide production credentials to work around this.

## Dependency updates

Dependency updates are reviewed and applied manually. The repository has no
Dependabot version-update configuration, so scheduled update PRs stop once its
removal is merged into `main`. Existing dependency versions and CI checks are
unchanged.

Dependabot security updates are a separate GitHub repository setting. If enabled,
disable **Dependabot security updates** in the repository's security settings to
stop automatic security-update PRs too. Keep **Dependabot alerts** enabled for
vulnerability notifications; the CI dependency and container scans still run.
See [GitHub's security-update configuration guide](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates).

## Local checks and routing probes

Use the root README prerequisites and installed test services:

```bash
make check-migrations
make check-generated
make scan-secrets
uv run --frozen --project backend python -m unittest discover -s .github/tests -v
bash scripts/ci/workflow-lint.sh
bash scripts/ci/infra.sh
```

`check-migrations` creates and removes its own database, resolves the migration
head from `CI_BASE_SHA` (default `origin/main`), rejects changed/deleted historical
migrations, upgrades from that schema to the current head, and checks identity
preservation. It also runs the existing empty-database/downgrade/upgrade and
seed-idempotency tests in a fresh process. `check-generated` compares temporary
generated files without overwriting the committed client.

Python formatting uses Ruff on changed files. JavaScript/TypeScript formatting
checks LF, final newlines, and trailing whitespace alongside existing ESLint
rules. This does not introduce a new formatter or reformat legacy source.

The branch regression test commits deliberately failing files in temporary Git
repositories and verifies that each actual base-to-branch diff selects its gate.
For an end-to-end workflow-routing probe, use `workflow_dispatch` with
`probe_path` set to an owned file path. The selected job must fail at
**Deliberately failing path-filter probe**, exit 42. For example, with `act`:

```bash
act workflow_dispatch -j mobile --input probe_path=mobile/app/probe.tsx
act workflow_dispatch -j backend --input probe_path=backend/probe.py
act workflow_dispatch -j admin --input probe_path=admin/probe.tsx
act workflow_dispatch -j local-e2e --input probe_path=e2e/probe.ts
act workflow_dispatch -j infra-validate --input probe_path=infra/probe.tf
```

Omit `probe_path` to run the actual checks. The workflows are compatible with
`act -P ubuntu-24.04=-self-hosted`; this mode uses the existing local PostgreSQL
and Redis services for backend tests. Supply registry credentials in a private
ignored act secret file. Browser system libraries must already be installed for
act; hosted Ubuntu installs them in the workflow. The admin browser gate uses
port 5374, configurable locally via `COFFIX_ADMIN_TEST_PORT`.

## Infrastructure and supply-chain scope

`infra.sh` checks each directory containing Terraform files with format,
backend-disabled initialization, validation, native tests, and TFLint. Trivy
checks Terraform, Dockerfiles, Compose, and Kubernetes configuration. Helm charts
are linted and rendered with defaults and each environment values file, then
checked with strict kubeconform schemas and Trivy policies; plain manifests are
schema-checked too. Missing CRD schemas fail rather than being ignored.
Terraform/charts are absent at task 34, so their discovery reports that fact;
these checks activate when tasks 36–40 introduce them. Nothing is applied or
deployed, and no cloud credentials are used.

Dependency/container/configuration findings block at HIGH/CRITICAL. Secret
findings and scanner errors block. Secret scanning covers versionable working
source, including untracked changes, not Git history or ignored runtime files.
Reports stay under ignored `.local/` directories and are never uploaded, because
scanner reports may contain sensitive matches.

Licenses use [Trivy's classifications](https://trivy.dev/docs/latest/scanner/license/).
Python/source license files are scanned directly; pnpm's installed inventory is
converted to CycloneDX because the pinned scanner does not extract pnpm 10
license metadata. Both reports must be nonempty, and HIGH/CRITICAL license
findings block. Unclassified expressions are counted visibly and retained in
the report; a passing scan is not a license/legal approval. The current JavaScript
inventory has nine unclassified entries (`BlueOak-1.0.0` and `MIT AND OFL-1.1`).

## Task 34 verification (2026-09-16)

Local runner: checksum-verified act 0.2.89, host executor, real local PostgreSQL
17/Redis, Node 22.23.1, uv 0.11.27/Python 3.12, and matching Chromium libraries.
All five owned-path probes reached exit 42. The workflow list exposed exactly
the five required names. The full backend, mobile, admin, E2E and supply-chain
jobs were run locally; this is not evidence of GitHub-hosted secret/ruleset setup.

Passing application checks: 887 backend tests, two focused migration/seed tests,
266 mobile component tests, 90 admin component tests, 24 browser RTL/operations
tests, seven E2E harness checks, and 23 API/browser/load/resilience journeys.
All lint/types, admin build and OpenAPI drift checks passed. The local E2E load
profile returned p95 97.5 ms with 10 clients/500 requests; sixteen customers
reserved exactly five units. Workflow/ShellCheck, secret, dependency, static,
container, configuration and license scans passed at their stated thresholds.

Verification exposed and fixed two integration issues: standalone seeding now
registers the media foreign-key target without relying on API imports; admin
browser tests can use a dedicated port without stopping a development server.
No application dependency or lockfile change was needed.

## Immutable artifacts (task 35)

`build-images.yml` builds the backend and static dashboard twice on main. It uses
pinned base-image digests, frozen application dependency installs, non-root users,
and the same source timestamp/version for both passes. The resulting containers
must pass read-only smoke checks, migrations, health/version and worker checks,
dashboard deep links, absence of development tools, and graceful shutdown.
Trivy scans the exact saved images for HIGH/CRITICAL vulnerabilities and secrets;
scanner errors fail the job. Nonempty CycloneDX SBOMs accompany the archives.
Failed image scans print only vulnerability IDs, package names, installed/fixed
versions, severities and the number of secret findings. Matched secret values,
source snippets and raw reports stay out of public logs. Scanner failures still
block the release; the summary does not change the scan result.
Application bytes, permissions and symbolic links must match between builds;
archive timestamps and Python bytecode caches are outside this comparison.

Run the same checks locally (Docker and the existing DHI login are required):

```bash
bash scripts/build-images.sh "$(git rev-parse HEAD)"
```

Use a clean committed checkout for a release. Local verification of working-tree
changes uses the supplied base SHA as a test version and is not a release of that
commit. Results stay under ignored `.local/release-images/`; scan reports are
private and are not uploaded. The workflow attests the scanned image archives
using GitHub OIDC provenance, then uploads archives, SBOMs and content inventories.
The archive SHA256 in `build.json` is an archive checksum, not a deployment digest.
See [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
Private repositories need a GitHub plan that supports artifact attestations; an
attestation error is a release blocker and is never ignored.

The same backend image serves both processes:

- API: default image command, port 8000, `/health/live` includes the source SHA.
- Worker: `python -m coffix.worker.main`, with `COFFIX_PROCESS=worker` for its
  heartbeat health command. API `/health/worker` additionally checks outbox lag
  and the expiration pass. Give each environment its own Redis/database.
- Migrations: `alembic upgrade head`; shop bootstrap remains a separate deployment
  command, `coffix-shop-settings-init`.
- Dashboard: port 8080, `/health/live` and `/version.json`; static SPA fallback.
  Ingress must route `/api` to the API on the same origin. This allows identical
  dashboard bytes to be promoted between environments.

Run with `--read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL
--security-opt no-new-privileges`. Production media uses S3; local smoke media is
isolated in `/tmp`. Application credentials are supplied only at runtime.

### ECR setup when AWS infrastructure exists

The protected `artifact-publishing` GitHub environment needs an OIDC role scoped
to the two ECR repositories, without stored AWS keys. Require immutable image tags.
Set repository variables `ECR_BACKEND_REPOSITORY`, `ECR_ADMIN_REPOSITORY`
(full registry/repository names), `ARTIFACT_PUBLISH_ROLE_ARN`, `AWS_REGION`, and
`AWS_ACCOUNT_ID`. The workflow publishes the already-scanned archives, tagged by
full Git SHA, attests their resolved registry digests, and writes
`deployment-backend.env` / `deployment-admin.env`. API and worker share the exact
backend digest. Deployments must consume those `repository@sha256:...` references.

Until those later infrastructure resources exist, the build reports ECR setup as
pending and retains the scanned artifacts. Task 35 does not create AWS resources.
No registry publishing or hosted provenance has been verified merely by running
local Docker builds.

### Expo setup before signed mobile verification

EAS is Expo's hosted native build service. Create/link the Coffix project in the
intended Expo account; keep `com.coffix.mobile` unless the product owner approves a
change. Set repository variable `EAS_PROJECT_ID` to its UUID and `EXPO_OWNER` to the
account/organization. The mobile workflow reports a blocker until a project is
configured. Do not use placeholder project IDs or backend addresses for releases.

Create protected GitHub environments `mobile-preview` and `mobile-production`.
Store `EXPO_TOKEN` as an environment secret. Set environment variables
`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` to approved public
values. Production requires an approval reviewer. Configure the corresponding
EAS `development`, `preview` and `production` environments with the same public
values plus `EAS_PROJECT_ID` and `EXPO_OWNER`. These public values are embedded in
the app. EAS's `EAS_BUILD_GIT_COMMIT_HASH` supplies source identity on build workers;
GitHub supplies `COFFIX_BUILD_SHA` while evaluating config locally.

Store Android keystore and Apple signing/provisioning credentials in EAS's remote
credential store. Configure them interactively once before CI; CI uses
`--non-interactive --freeze-credentials`. iOS internal distribution requires an
Apple Developer account and registered devices. Firebase client config files
(`FIREBASE_ANDROID_CONFIG`, `FIREBASE_IOS_CONFIG`) use EAS file variables; Firebase
server credentials never enter mobile builds. Setup instructions:
[Expo profiles](https://docs.expo.dev/build/eas-json/) and
[EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

`mobile-build.yml` builds signed Android preview artifacts on main once configured.
Manual dispatch selects `android` (default), `ios`, or `all`, and can select
production behind its environment gate. iOS signing and verification are deferred
at the user's request; select iOS only after Apple account/device setup is complete.
It never submits to a store. Each platform builds twice with cache cleared and
unchanged version numbers. EAS source/version/platform metadata must agree, and
`scripts/mobile-content.py` compares JavaScript, bundled assets and package version
metadata in the signed archives. For the pinned Hermes HBC v98 compiler, the
comparison validates the full file checksum and hashes all executable bytecode,
constants, tables and source hash. It excludes debug data containing random
compiler temporary paths and the resulting file-length/footer fields. Unsupported
bytecode versions or malformed files fail. Native toolchain binaries, signatures
and archive timestamps are not asserted byte-identical. The first signed artifact and the
comparison inventory are retained for seven days. Increment `versionCode` and
`buildNumber` in a reviewed release change before a new store version; automatic
incrementing is disabled so the two verification builds have the same inputs.
Profiles enable `EXPO_USE_METRO_REQUIRE=1` for deterministic module IDs, following
[Expo's Metro runtime documentation](https://docs.expo.dev/versions/latest/config/metro/#metro-require-runtime).

Signed cloud builds, signing validity on devices, ECR publication and hosted OIDC
attestations require the configured external services. They cannot be established
by config tests, local Expo exports, or unsigned simulator builds.

Setup progress reported during Android onboarding: the Expo project was verified
with `eas project:info`; repository project/owner variables and the `mobile-preview`
environment token and `main` branch restriction were saved. EAS confirmed creation
of default Android credentials named `coffix-preview` for `com.coffix.mobile`.
Firebase Android client configuration was uploaded as the EAS file variable
`FIREBASE_ANDROID_CONFIG` for development/preview, and both environments have the
project/owner variables, as reported by the user. A disposable local E2E backend
was verified through the user's ngrok HTTPS endpoint: liveness, fake customer
login, profile/catalog access, and the photo-upload URL origin passed. The tunnel
blocks test-control and non-API routes. Set `EXPO_PUBLIC_API_URL` to that HTTPS
origin in EAS preview and GitHub `mobile-preview`; omit `/api/v1` because the
client supplies it. The backend and tunnel must stay running during device tests.
This temporary setup is not a deployed production backend. iOS remains
outstanding for task 35 rather than being marked complete.

Android native verification on 2026-09-27 found and fixed a missing splash
drawable that prevented release resource linking, then a denied notification
permission loop that made Android remove the app's task. The permission adapter
now checks the OS grant on foreground refresh and requests permission at most
once per app process. Its provider regression reproduced five requests before
the fix and one afterward; it also verifies later OS grant/revocation changes.
Sixteen notification/settings tests, TypeScript and focused ESLint passed.

The final signed preview pair used temporary verification snapshot
`294c116b75ce9024e4bbe4fe1c79f6315a748f55`:
[build A](https://expo.dev/accounts/weammakhouls-team/projects/coffix/builds/bd97aa1a-0259-4ea3-b120-e1b30ea8e1a9)
and [build B](https://expo.dev/accounts/weammakhouls-team/projects/coffix/builds/ee767898-8c01-48b9-940a-be4500dff577).
Both passed APK signature verification with the same signing certificate, source
SHA and version `0.1.0` / code `1`; all 1,373 selected application-content entries
matched. The full APK archive hashes differed, as expected for the comparison
scope above. Build A installed on the user's Pixel 8 Android 16 emulator and
passed saved-login restoration, authenticated home/catalog/product detail, and
cold-start plus background/foreground stability with notification permission
denied. Fake OTP login was also exercised on the preceding build. The final APK
and evidence are local ignored artifacts under `.local/task35/`.

The snapshot commits exist only in temporary verification repositories; they are
not commits on the task branch. EAS Doctor reported newer recommended Expo patch
versions (20/21 checks passed); the locked dependencies were kept unchanged.
These checks do not establish real push delivery, payment flows, every-screen
native accessibility acceptance, production settings, or iOS readiness.

### Task 35 local verification (2026-09-17)

Both final images were built twice without cache; application content matched.
Both passes completed disposable PostgreSQL migrations, API/worker readiness and
version checks, non-root/read-only smoke tests, dashboard routing and graceful
termination. Final hardened Alpine Python and static nginx images passed
HIGH/CRITICAL vulnerability and secret scanning. Their CycloneDX SBOMs contain
106 and 71 components respectively. Dockerfile configuration and source-secret
scans passed. No finding was suppressed to obtain these results.

All 270 mobile tests in 50 suites passed, along with TypeScript and ESLint
(two pre-existing React hook warnings). Ten workflow/artifact tests, actionlint,
scoped ShellCheck, Python lint/format and `git diff --check` passed. The pinned EAS
CLI accepted all three profiles. Two clean Android/iOS/web exports using explicit
test public values matched across 86 files after the documented Hermes debug-data
normalization. Native bytecode was also checked through the archive comparison CLI.
These exports use a test project UUID and an `.invalid` API URL and are not
installable signed release artifacts.
An extra Chromium check of the customer web export failed with
`__fbBatchedBridgeConfig is not set` under both the original numeric-ID runtime
and the deterministic runtime. No customer web runtime acceptance is claimed;
the product's native device checks remain required.

Android preview signed-build verification is recorded above. The remaining iOS,
production-environment and hosted provenance/publishing portions are outstanding.
Keep the corresponding plan steps open; this evidence does not satisfy the
entire task or Phase 11 acceptance gate.

### Container scan follow-up (2026-09-27)

The first hosted container release passed image builds and smoke checks, then
failed its backend vulnerability gate. Rescanning the original backend and admin
archives with the September 27 database reproduced HIGH `CVE-2026-93990` in
Expat `2.8.4-r0`. The September 17 scan used an earlier database and did not report
this finding.
[Expat 2.8.5](https://github.com/libexpat/libexpat/releases/tag/R_2_8_5) contains the
security fix. Updated digest-pinned hardened Python build/runtime images contain
the fixed package. The refreshed nginx runtime still includes the vulnerable
version, so its Dockerfile upgrades only `libexpat` to the exact `2.8.5-r0` package
and restores the non-root user. Remove this package override when a future pinned
upstream image includes the fix. The HIGH/CRITICAL gate and secret scan remain
enabled; no findings are suppressed.

Local verification of this fix rebuilt both images twice without cache and passed
both smoke runs, application-content comparisons, current vulnerability/secret
scans and Dockerfile configuration scans. The backend/admin SBOMs contain 106/71
components respectively and confirm Expat `2.8.5-r0`. Eleven workflow/artifact
tests, CI formatting, focused Ruff/ShellCheck and `git diff --check` passed. The
failure-summary path was also exercised against the vulnerable nginx image and
preserved the failing scan exit status. Hosted provenance still needs a successful
GitHub Actions run after this fix is merged.
