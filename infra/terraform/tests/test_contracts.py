"""Check backend/lifecycle policy, which Terraform test cannot directly assert."""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ConfigurationPolicyTests(unittest.TestCase):
    def test_data_resources_cannot_be_destroyed_by_terraform(self):
        resources = (
            ("media", "aws_s3_bucket", "media"),
            ("backup_storage", "aws_s3_bucket", "main"),
            ("secrets", "aws_secretsmanager_secret", "main"),
        )
        for module, resource_type, name in resources:
            with self.subTest(module=module):
                text = (ROOT / "modules" / module / "main.tf").read_text()
                block = re.search(
                    rf'^resource "{resource_type}" "{name}" {{(.*?)^}}',
                    text,
                    re.MULTILINE | re.DOTALL,
                ).group(1)
                self.assertRegex(
                    block, r"lifecycle\s*\{\s*prevent_destroy\s*=\s*true\s*\}"
                )

    def test_generated_passwords_never_use_persisted_attributes(self):
        credential = (ROOT / "modules/secrets/credential/main.tf").read_text()
        # These write-only/ephemeral declarations cannot be asserted from plan
        # values: Terraform intentionally omits their values from plan/state.
        self.assertNotRegex(
            credential, r'(?m)^(data|resource) "aws_secretsmanager_random_password"'
        )
        self.assertNotRegex(credential, r"(?m)^\s*secret_string\s*=")
        self.assertNotRegex(
            credential, r'(?m)^data "aws_secretsmanager_secret_version"'
        )
        self.assertRegex(
            credential,
            r"secret_string_wo\s*=\s*jsonencode\(merge\(var.metadata,",
        )
        self.assertRegex(
            credential,
            r"password\s*=\s*ephemeral\.aws_secretsmanager_random_password\.main\.random_password",
        )
        self.assertRegex(
            credential, r"secret_string_wo_version\s*=\s*var.password_version"
        )
        for path in (ROOT / "modules/secrets/credential").glob("*.tf"):
            self.assertNotRegex(path.read_text(), r'(?m)^output "')
        for environment in ("dev", "prod"):
            outputs = (ROOT / "environments" / environment / "outputs.tf").read_text()
            self.assertNotIn("module.redis_credential", outputs)
            self.assertNotIn("module.postgresql_credential", outputs)

    def test_foundations_do_not_create_compute_or_managed_databases(self):
        # These resources incur the fixed costs removed by this architecture;
        # compute/ALB and CSI-managed data volumes belong to later tasks.
        forbidden = (
            "aws_db_instance",
            "aws_elasticache_replication_group",
            "aws_nat_gateway",
            "aws_eip",
            "aws_instance",
            "aws_lb",
            "aws_ebs_volume",
            "aws_backup_vault",
            "aws_kms_key",
        )
        for module in ("vpc", "security", "media", "backup_storage", "secrets"):
            for path in (ROOT / "modules" / module).rglob("*.tf"):
                with self.subTest(path=path):
                    for resource_type in forbidden:
                        self.assertNotRegex(
                            path.read_text(), rf'resource "{resource_type}"'
                        )

    def test_backup_lifecycle_does_not_expire_live_recovery_chains(self):
        text = (ROOT / "modules/backup_storage/main.tf").read_text()
        self.assertNotRegex(text, r"(?m)^\s*expiration\s*\{")

    def test_separate_encrypted_locked_backends(self):
        for environment in ("shared", "dev", "prod"):
            with self.subTest(environment=environment):
                text = (ROOT / "environments" / environment / "backend.tf").read_text()
                self.assertRegex(text, r'backend\s+"s3"\s*\{')
                self.assertRegex(
                    text, rf'key\s*=\s*"coffix/{environment}/terraform.tfstate"'
                )
                self.assertRegex(text, r"encrypt\s*=\s*true\b")
                self.assertRegex(text, r"use_lockfile\s*=\s*true\b")

    def test_state_and_key_cannot_be_destroyed_by_terraform(self):
        text = (ROOT / "bootstrap/main.tf").read_text()
        for resource_type in ("aws_s3_bucket", "aws_kms_key"):
            with self.subTest(resource=resource_type):
                block = re.search(
                    rf'^resource "{resource_type}" "state" {{(.*?)^}}',
                    text,
                    re.MULTILINE | re.DOTALL,
                ).group(1)
                self.assertRegex(
                    block, r"lifecycle\s*\{\s*prevent_destroy\s*=\s*true\s*\}"
                )

    def test_provider_uses_tags_and_account_guard_in_every_root(self):
        for directory in (
            "bootstrap",
            "environments/shared",
            "environments/dev",
            "environments/prod",
        ):
            with self.subTest(directory=directory):
                text = (ROOT / directory / "main.tf").read_text()
                self.assertRegex(
                    text, r"allowed_account_ids\s*=\s*\[var.aws_account_id\]"
                )
                self.assertRegex(
                    text, r"default_tags\s*\{\s*tags\s*=\s*local.default_tags\s*\}"
                )


if __name__ == "__main__":
    unittest.main()
