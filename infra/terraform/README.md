# Terraform foundations

This directory defines the one-time state/IAM bootstrap and independent `shared`,
`dev`, and `prod` roots. Task 37 adds networking, private media/backup storage
and credential references for Kubernetes data services. Shared/development
foundations were applied and verified on 2026-10-04; production remains plan-only.
New resources target `us-east-1`; the existing state backend remains in
`il-central-1`. Nothing runs
an AWS apply automatically. The approved bootstrap was applied on
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
and runs native mocked/offline-provider tests plus Python configuration policy tests.
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

Task 37 data tests use offline plans with the real provider schema, synthetic
credentials and credential/metadata/account discovery disabled. Terraform 1.15
cannot load ephemeral resource schemas through a mocked provider. The small
`modules/secrets/credential` boundary is overridden in environment tests; all
other data-resource configuration is planned normally. The tests never call
Secrets Manager or other AWS APIs. Child modules are validated/linted through
their callers; the credential module has no outputs. Source policies also guard
write-only credentials, retained storage and backup-chain lifecycle rules.

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

## Task 37 topology and ownership

The shared root owns `10.42.0.0/16`, public subnets across two Availability Zones,
an internet gateway, public routes, an S3 gateway endpoint and restricted security
groups. Subnets do not assign public IPs automatically; Task 38 explicitly enables
public addresses on node launch templates. There are no NAT resources, private
application/data subnet tiers, EC2 instances or load balancers in Task 37.
CloudWatch flow logs capture accepted/rejected traffic, use AWS-managed encryption,
ten-minute aggregation and 14-day retention. The default VPC security group is
closed. An S3 gateway endpoint has no hourly endpoint charge.

Shared security groups separate the control plane, development workers, production
workers and the future ALB. Internet ingress is allowed only to ALB ports 80/443.
Only the ALB group can reach worker HTTPS NodePort `32080`. Private cluster traffic
permits the Kubernetes API, kubelet and Cilium VXLAN/health ports between the
required node groups. There are no SSH, public API, PostgreSQL or Redis ingress
rules. Node HTTPS egress supports AWS/provider endpoints; DNS egress targets the
VPC resolver. Kubernetes NetworkPolicies in Task 40 enforce pod/environment
isolation inside the permitted cluster overlay.

The `network` output provides `vpc_id` and `public_subnet_ids` keyed by AZ.
`cluster_security` provides `control_plane_security_group_id`,
`worker_security_group_ids` keyed by environment and `alb_security_group_id`.
Pass these non-secret references to later tasks without granting environment
roles access to another root's complete state.

Each environment independently owns two private, versioned buckets:
`coffix-media-{environment}-{account}` and
`coffix-backups-{environment}-{account}`. ACLs are disabled, all public-access
blocks are enabled and bucket policies require TLS. AWS-managed SSE-S3 avoids
additional key charges. Media uploads support the adapter's `AES256` header;
uploads without an explicit header use default encryption. Media CORS is disabled until exact
HTTPS staff origins are supplied. Current media objects are not expired.

The backup prefix is `{environment}/postgresql/`. Task 37 publishes logical
PostgreSQL retention of seven days in development and 30 days in production;
Task 40's CloudNativePG Barman Cloud plugin owns backup scheduling, WAL continuity
and recovery-chain deletion. S3 lifecycle only aborts incomplete uploads and
expires noncurrent versions. It must not expire current base backups or WAL
independently. A bucket and retention number alone do not establish a working
backup. Restore verification is required in Tasks 40 and 45.

Task 40 stores Redis snapshots in the same environment bucket under
`{environment}/redis/`. Its scoped backup job owns one-day dev/seven-day prod
logical retention and cannot delete PostgreSQL backup objects; Task 38 grants
that sibling prefix only to the Redis backup role.

Each environment has three Secrets Manager secrets encrypted with the AWS-managed
`alias/aws/secretsmanager` key:

| Path | Initial value / consumer |
| --- | --- |
| `/coffix/{environment}/postgresql` | JSON `database`, `username`, generated `password` for the restricted runtime role |
| `/coffix/{environment}/redis` | JSON `username`, generated `password` |
| `/coffix/{environment}/application` | Metadata only; Task 40 supplies JWT/provider configuration before deployment |

PostgreSQL runtime names are `coffix_dev` or `coffix_prod`. The database does not
yet exist. CloudNativePG manages a separate owner/migration credential inside
Kubernetes in Task 40; API/worker pods never receive that privileged credential.
Terraform generates passwords ephemerally and writes JSON with `secret_string_wo`.
It never reads the stored values back, exports them or records them in state.
Increase the relevant password-version input only during a coordinated credential
rotation that also updates the consuming database/workloads. Changing a stored
secret by itself does not rotate a running database password.

Buckets and secret metadata have `prevent_destroy`; buckets also reject forced
emptying. Secret recovery windows are seven days for dev and 30 days for prod.
These guards do not prevent a privileged direct AWS deletion or deletion after
removing a resource block. Outputs contain only `data_foundations.secret_arns`,
media/backup bucket names and prefixes, and `retention_days`.

No RDS, ElastiCache, AWS Backup vault or Terraform-managed application EBS volume
is created. Task 38 creates compute and delivery services. Tasks 39–40 create
Kubernetes and data workloads; EBS CSI owns retained gp3 data volumes. Task 40
keeps each data Helm release separate from application releases. Development
shutdown retains data and scales only its worker group to zero.

## Cost assumptions

The full planned deployment uses one `t4g.medium` control plane, one always-on
`t4g.large` production worker, an on-demand `t4g.medium` dev worker and one shared
ALB. Terraform owns that ALB and its HTTPS `32080` targets; Traefik supplies ingress
without a Kubernetes-created AWS load balancer. One control plane and one
production worker allow downtime during failure or maintenance. Retained volumes
and tested S3 recovery are required; they do not provide high availability.

Planning prices were checked against AWS prices on 2026-10-03, in USD before tax
or discounts, using 730 hours/month in `us-east-1`:

| Full deployment baseline | Monthly estimate |
| --- | ---: |
| Control plane `t4g.medium` at $0.0336/hour | $24.53 |
| Production worker `t4g.large` at $0.0672/hour | $49.06 |
| ALB fixed hourly charge at $0.0225/hour | $16.43 |
| Four always-on public IPv4 addresses at $0.005/hour | $14.60 |
| 120 GiB gp3 at $0.08/GiB-month | $9.60 |
| Six Secrets Manager secrets at $0.40/month | $2.40 |
| Existing state KMS key and one hosted zone | $1.50 |
| One dev hour including temporary root disk and IPv4 | $0.04 |
| **Total, summed before rounding** | **$118.15** |

The 120 GiB includes 50 GiB always-on node roots, 25 GiB each for prod/dev data,
and 20 GiB for shared Prometheus. Dev data remains billable while its worker is
off. Extra startup/cleanup time is additional compute time. Allow approximately
$135–150/month for modest usage, then revise using measured usage: S3 backups/media,
ALB capacity units, transfer, CloudWatch logs, API requests, image storage,
burst CPU credits and disk growth are not fixed in this table. Domain registration,
external providers and tax are additional. The existing state key is in Israel;
its location does not change with the workload provider region.

**Task 37 alone does not incur the full deployment baseline.** Shared networking
has no fixed NAT/compute/ALB cost. Applying development creates three secret
containers (budget $1.20/month) and two buckets, plus usage charges for storage,
requests, flow logs and the existing bootstrap resources. Production remains
plan-only. No task-37 approval authorizes later compute or production deployment.

Pricing references: [EC2 On-Demand](https://aws.amazon.com/ec2/pricing/on-demand/),
[EBS](https://aws.amazon.com/ebs/pricing/),
[ALB](https://aws.amazon.com/elasticloadbalancing/pricing/),
[public IPv4](https://aws.amazon.com/vpc/pricing/),
[Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/).

## Task 37 plan/apply order and verification

Use the named `coffix` profile in account `270242382915`. Workload inputs select
`us-east-1`; all roots continue to use the existing approved backend file pointing
to `il-central-1`. The bootstrap and six CI roles remain unchanged. Those roles
still have state-only access; operator planning does not expand their permissions.

1. Run local tests/scans, then confirm the named AWS session's account.
2. Prepare ignored per-root `approved.tfvars` with account, region, owner and
   cost center. Shared accepts two reviewed regional AZs; dev/prod accept their
   media origins and explicit credential version inputs as needed. Remove old
   NAT, subnet and managed-database inputs. Never reuse an older saved plan.
3. Initialize the roots with their existing encrypted backend. Save fresh plans
   for shared, dev and prod independently; the data foundations have no dependency
   on live network IDs. Review additions, costs, deletion/replacement actions,
   encryption, environment boundaries and reference-only outputs.
4. Obtain approval of the concrete shared/dev plans before applying them. Apply
   those exact saved plans only. Production stays plan-only.
5. Verify VPC routes, no NAT, restrictive security-group rules, S3 endpoint,
   flow-log destination/retention, private encrypted/versioned buckets, secret
   metadata and sanitized outputs through read-only AWS APIs. Do not retrieve
   secret values. No temporary EC2 verifier is needed because databases are not
   running yet; database/TLS/backup-job checks occur in Task 40.
6. Replan shared/dev and require no changes. Confirm production was not applied
   and no temporary verification access remains. Record evidence, mark only
   verified task checkboxes and commit the completed task.

```bash
export AWS_PROFILE=coffix
terraform -chdir=infra/terraform/environments/shared init -lockfile=readonly -backend-config=../../approved.tfbackend
terraform -chdir=infra/terraform/environments/shared plan -var-file=approved.tfvars -out=task37-foundations.tfplan
# After approval of this exact saved plan:
terraform -chdir=infra/terraform/environments/shared apply task37-foundations.tfplan
# Repeat plan/review for dev; apply only its approved saved plan.
# Plan prod for review only; do not apply prod.
```

Source policies guard retained resources, unchanged encrypted/locked backend
contracts and ephemeral write-only credential storage. Scanner exceptions are
resource-local and documented: AWS-managed encryption and narrowly allowed
HTTPS egress do not disable the HIGH/CRITICAL gate globally. Passing these tests
does not establish live routing or database recovery. Saved plans, inputs,
reports and runtime state remain ignored and must never be committed.

## Approved Task 37 apply and live verification (2026-10-04)

The revised foundations pass formatting, locked backend-disabled initialization
and validation in all five roots, 26 native Terraform tests, seven configuration
policies, TFLint including local modules, and Trivy HIGH/CRITICAL configuration
scanning both with source defaults and explicit synthetic AWS inputs. Versionable
source-secret scanning, 16 CI contract tests, Ruff, ShellCheck for the changed CI
script and `git diff --check` also pass. Mock tests use no AWS credentials.
The network review added regular-AZ discovery and rejection of Local Zones or
zones outside the selected region. Generated passwords use write-only fields;
the saved plan values contain no passwords.

The reviewed plans targeted account `270242382915` and workload region
`us-east-1`. The owner approved the exact shared/development plans after review:

| Root | Add | Change | Destroy | Apply scope |
| --- | ---: | ---: | ---: | --- |
| shared | 93 | 0 | 0 | Applied; no-change replan passed |
| dev | 19 | 0 | 0 | Applied; no-change replan passed |
| prod | 19 | 0 | 0 | Review only |

The shared count includes four security groups and 75 individually managed
security-group rules, plus VPC/routing/log-delivery resources. Each data root's
19 resources represent two buckets with policies/settings, three secret
containers and two write-only secret versions. No compute, ALB, NAT, managed
database/cache, data disk or additional customer-managed key is planned.
All three initialized backend configurations still reference their existing
separate state keys in the encrypted, locked Israel bucket. Bootstrap source,
state-bucket configuration and provider versions have not changed.

The reviewed artifacts are ignored `task37-foundations.tfplan` files under each
root; their SHA-256 values are:

- shared: `052f260b0a411a9849ab3ad92f467771671ba0b89b9c900f59f7daa319184ff8`
- dev: `9e34c9584e00bed37cb86a55deb98a8040ca4dbb59c69b2646a5c001e1abfdb7`
- prod (review only): `4b0f0d2229c421263eaff9afae3f311a5303d331380815bea5a248d4de7c23fc`

Applied the matching shared plan first, followed by development, using the named
`coffix` profile. Both applies succeeded with the counts above and no changes or
deletions. Read-only AWS verification passed all 11 grouped metadata checks:

- The VPC, two regular-AZ subnets, Internet Gateway routes and S3 gateway endpoint
  match the reviewed topology. There are no NAT gateways or EC2 instances.
- All 75 security-group rules match the permitted public, ALB and cluster ports.
  The default security group denies ingress and egress.
- The VPC flow log is active, with 14-day log retention, AWS-managed encryption
  and the scoped log-delivery role. This verifies configuration, not application
  traffic or end-to-end connectivity.
- Both development buckets are in `us-east-1`, private, versioned, SSE-S3
  encrypted and TLS-only, with ACLs disabled and all public-access blocks set.
  Lifecycle rules retain current objects and clean incomplete uploads/old versions.
- All three development secrets use the AWS-managed key. PostgreSQL and Redis
  each have an initialized current version; the application secret has metadata
  only. Verification never retrieved secret values.
- Outputs contain references only. The applied Terraform state contains no
  generated passwords: write-only values are absent and legacy secret fields
  are empty placeholders.
- No temporary verification host, role or access grant was created.

Shared and development replans both returned exit code zero with no changes.
A fresh production review still proposes 19 additions, with no existing managed
resources; production was not applied. The existing encrypted, locked state
backend remains in Israel. Detailed apply, metadata and replan evidence stays
under ignored `.local/task37/`.

Task 37's apply and verification gates are complete. Running databases, backup
jobs, restore tests and workload connectivity remain in their later numbered
tasks; this foundation apply does not establish those behaviors.
