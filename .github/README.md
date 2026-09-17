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
there are no AWS or production application credentials. Mobile device E2E and
signed builds remain release-workflow work in task 35.

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
