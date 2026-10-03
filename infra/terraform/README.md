# Terraform foundations (Task 36)

This directory defines the one-time state/IAM bootstrap and independent `shared`,
`dev`, and `prod` roots. It does not provision the application infrastructure or
run an AWS apply automatically. The approved bootstrap was applied on
2026-10-03 using the named `coffix` profile. Its state is now stored in the
private encrypted S3 backend. See the live verification record below before
performing another bootstrap operation; do not repeat the initial local setup.

## Design and scope

- One private S3 state bucket, versioning, enforced TLS and KMS encryption with
  one rotating key. Writes must specify the exact KMS key ARN, including locks.
- Bucket and key have `prevent_destroy`; the bucket also has `force_destroy=false`.
  This protects all environments, including production. State versions are not
  expired automatically. These guards do not protect against manual AWS deletion
  or removing the resource blocks; operational access still needs review.
- Native S3 lock files; no DynamoDB locking table. State keys are
  `coffix/{shared,dev,prod}/terraform.tfstate`. Only the default workspace is used.
- Provider defaults: `project`, `environment`, `owner`, `managed-by`, `cost-center`.
  Every deployable root requires an explicit region and restricts the provider
  to the approved 12-digit AWS account ID. No account or region is selected by default.
- Six short-lived GitHub OIDC roles: `coffix-{shared,dev,prod}-{plan,deploy}`.
  Each role can read only its environment's state; deploy roles can also write it.
  Both can manage only that state's lock file. KMS access is restricted to S3
  and the matching state/lock encryption contexts. No state deletion, IAM mutation,
  role chaining, bootstrap-state access, or application infrastructure permissions
  are granted. Later tasks add resource-specific permissions as resources appear.
- Plan trust requires the exact repository and `refs/heads/main`. Untrusted PRs
  use the credential-free tests; they cannot request cloud state. Deploy trust
  requires the exact `terraform-{shared,dev,prod}-deploy` GitHub environment.
  Both require audience `sts.amazonaws.com` and only `AssumeRoleWithWebIdentity`.

Terraform `~> 1.15.8` matches the existing CI runtime. AWS provider `~> 6.61.0`
was selected from the current major and locked to 6.61.0, with signed registry
checksums in every root (including the test harness). Provider upgrades are
reviewed changes; routine initialization uses `-lockfile=readonly`.

## Local verification

Run from the repository root in a clean checkout with Terraform 1.15.8:

```bash
make -C infra/terraform check
make -C infra/terraform lint      # TFLint 0.61.0 on PATH
make -C infra/terraform security  # Trivy 0.68.2 on PATH
```

`check` formats, initializes without backends, validates all five configurations,
and runs native mocked-provider tests plus Python configuration policy tests.
The top-level `versions.tf` is a test harness, not a deployable root.
Tests exercise the plan-defined seams: encryption/public access/versioning,
OIDC trust and action permissions, environment tags, backend isolation/locking,
and deletion safeguards. Python checks cover backend and lifecycle declarations,
which native test assertions cannot reference directly. Expected warnings say
that environment backend blocks are ignored when tested as child modules.

In a clean checkout, no credentials are required and tests never create AWS
resources. Provider installation requires registry access. After a checkout has
been initialized against a live backend, cached backend metadata can cause
initialization to validate AWS credentials even with `-backend=false`. Run local
mock checks from a separate clean checkout or a copy of tracked files, as CI does;
keep the initialized operator checkout and its state configuration intact.
CI's existing Terraform discovery runs these tests, TFLint and Trivy, and now
also runs the backend/lifecycle policies.
Passing mocks/scans establish configuration behavior, not live IAM, locking or
recovery behavior; those need an approved AWS bootstrap and integration checks.

## Before the first apply

The Task 36 plan requires approval of the AWS account, region, naming,
billing-alert owner, and break-glass access. Record those decisions before
planning/applying against AWS. Use a named CLI profile or AWS IAM Identity Center
session; never place access keys in this directory, Terraform inputs, or chat.
Verify `aws sts get-caller-identity --profile <approved-profile>` matches the
approved account. No AWS operations should use an old/default profile implicitly.

Prepare an ignored `bootstrap/approved.tfvars` with the six required values:
`aws_account_id`, `aws_region`, `state_bucket_name`, `owner`, `cost_center`, and
`github_repository`. The repository OIDC identity is normally `WeamMak/Coffix`;
verify its actual subject format. GitHub repositories using immutable subjects
need `owner@OWNER_ID/repo@REPO_ID` instead. Wildcards and suffixes are rejected.
Check whether the account already has the GitHub OIDC provider: import the
existing provider into `aws_iam_openid_connect_provider.github` instead of
attempting to create a duplicate. Review any client IDs before changing it.

Create three protected GitHub environments named `terraform-shared-deploy`,
`terraform-dev-deploy`, and `terraform-prod-deploy`. Restrict deployments to
`main` (no tags), require reviewers for production/shared, and disable bypass as
appropriate. Environment OIDC subjects replace branch subjects, so the branch
restriction must be enforced by GitHub's environment rules. The owner created
these settings, and their branch and reviewer protections were verified before
the bootstrap apply. Grant `id-token: write` only
to future jobs that need the relevant role; no stored AWS access keys are needed.

After those approvals, use the explicitly selected profile to initialize and
produce a saved plan for review (commands below are manual, not Make targets):

```bash
export AWS_PROFILE=<approved-profile>
terraform -chdir=infra/terraform/bootstrap init -lockfile=readonly
terraform -chdir=infra/terraform/bootstrap plan -var-file=approved.tfvars -out=bootstrap.tfplan
terraform -chdir=infra/terraform/bootstrap show bootstrap.tfplan
# Only after approval of that concrete plan:
terraform -chdir=infra/terraform/bootstrap apply bootstrap.tfplan
```

The first bootstrap uses local state because its bucket does not exist yet.
Immediately migrate that state to the new encrypted backend before collaboration.
Keep local state and saved plans private. Do not apply this root independently
from another machine or lose the initial state.

1. Read `terraform -chdir=infra/terraform/bootstrap output -json backend_config`.
   Put its non-secret `bucket`, `region`, `kms_key_id`, and `allowed_account_ids`
   into an ignored `infra/terraform/approved.tfbackend` file as HCL assignments.
2. Create ignored `bootstrap/backend_override.tf` with the following block:

   ```hcl
   terraform {
     backend "s3" {
       key          = "coffix/bootstrap/terraform.tfstate"
       encrypt      = true
       use_lockfile = true
     }
   }
   ```

3. Run `terraform -chdir=infra/terraform/bootstrap init -migrate-state
   -backend-config=../approved.tfbackend` and confirm the migration. Verify a
   subsequent plan with the same variables has no changes and verify the remote
   state object's KMS encryption/version history. Retain a protected recovery copy
   until verification completes. New operator checkouts must recreate the ignored
   backend override and initialize against this remote state before planning.
4. Initialize each environment with the same backend file, for example
   `terraform -chdir=infra/terraform/environments/dev init
   -backend-config=../../approved.tfbackend`. Each root fixes its own state key,
   encryption, and locking. Supply its approved account/region/owner/cost-center
   inputs separately. Do not use workspaces to select an environment.
5. Verify OIDC from permitted main/environment jobs and reject wrong repositories,
   branches, and environments. Exercise concurrent lock acquisition and confirm
   plan-role state writes and cross-environment state reads are denied. Verify a
   versioned-state recovery with the approved break-glass operator before use.

Bootstrap remains operator-managed. Its state and administrative permissions are
not available to CI roles. If another account will host an environment, design
and approve that cross-account relationship before applying; this task describes
one approved account with separate state and roles.

References: [S3 backend locking and permissions](https://developer.hashicorp.com/terraform/language/backend/s3),
[GitHub OIDC trust](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws),
[Terraform provider mocks](https://developer.hashicorp.com/terraform/language/tests/mocking).

## Verification recorded on 2026-09-28

`make check` passed: formatting, locked backend-disabled initialization and
validation in all five configurations, 10 native mocked tests and 3 configuration
policy tests. TFLint 0.61.0, Trivy 0.68.2 HIGH/CRITICAL configuration scanning
(with explicit synthetic inputs), source-secret scanning, Ruff, ShellCheck,
11 existing CI contract tests, and `git diff --check` passed. Tests were observed
failing before storage, OIDC, environment and encryption-policy implementation.
At that checkpoint, the AWS bootstrap apply and live verification were still
pending. The subsequent approved apply is recorded below.

## Approved bootstrap and live verification (2026-10-03)

The user approved the saved full plan after supplying the billing-alert owner
and confirming root-account recovery with MFA. Applied using profile `coffix`
in account `270242382915`, region `il-central-1`, cost center `coffix`:
**21 resources added, zero changed or destroyed**. This includes the state
bucket `coffix-terraform-state-270242382915`, its safeguards, rotating KMS key
and alias, GitHub OIDC provider, and six environment/action roles with their
inline state-access policies. No application infrastructure was deployed.

The repository's immutable OIDC identity was configured as
`WeamMak@155534656/Coffix@1349423515`. Before applying, all three deployment
environments were verified to allow only the `main` branch, with no tag rules.
Shared and production require reviewer `WeamMak`, allow self-review for this
single-owner setup, and disallow administrator bypass. Development has no
required reviewer and retains its default administrator-bypass setting.

Bootstrap state was migrated to
`s3://coffix-terraform-state-270242382915/coffix/bootstrap/terraform.tfstate`.
A protected local pre-migration recovery copy remains in ignored `.local/task36/`.
The ignored backend configuration and bootstrap override are required in this
checkout. Shared, dev and prod roots were initialized against their separate
state keys with KMS encryption, account restriction and native S3 locking.
No environment application resources were applied.

Verification passed:

- Full bootstrap plans after migration and after the lock test returned exit
  code zero and reported no changes.
- AWS confirmed bucket versioning, all four public-access blocks, non-public
  bucket policy, the configured KMS encryption key, and enabled key rotation.
  The remote state object has KMS encryption and a version ID.
- A version-specific state download matched all 21 resource records and outputs
  in the pre-migration recovery copy. This verifies retrieval and content, not
  a destructive rollback of the live state or an independent operator recovery.
- Terraform refused a competing encrypted lock with the expected lock ID.
  Only the temporary verification lock version was removed; a subsequent normal
  plan acquired/released its lock successfully without changing infrastructure.
- All six deployed roles have the expected tags, exact OIDC principal/audience/
  subject, and state permissions. AWS IAM simulation passed 72 action/resource
  cases: plan state writes, state deletion, cross-environment access and bootstrap
  state access were denied; permitted state reads/writes and lock operations
  matched each role's purpose. Simulation does not test an actual role session.
- `make check` in an isolated copy of tracked files, with AWS credential files
  disabled, passed formatting, initialization, validation, 10 mocked Terraform
  tests and 3 configuration-policy tests. An initial attempt in the initialized
  operator checkout hit cached backend configuration and failed AWS validation
  using the obsolete default profile; no cloud changes resulted. The isolated
  run avoids that backend dependency. `git diff --check` passed. No infrastructure
  source code or provider versions changed in this apply.

A GitHub-hosted OIDC token exchange and its negative admission cases still need
verification when a workflow consumes these roles. No existing workflow uses
these Terraform deployment environments yet. This bootstrap did not create a
billing alarm; the supplied billing contact is the accountable owner tag.
Inputs, state, saved plans and recovery copies remain ignored and are not committed.
