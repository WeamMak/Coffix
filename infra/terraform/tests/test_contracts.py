"""Check backend/lifecycle policy, which Terraform test cannot directly assert."""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ConfigurationPolicyTests(unittest.TestCase):
    def test_separate_encrypted_locked_backends(self):
        for environment in ("shared", "dev", "prod"):
            with self.subTest(environment=environment):
                text = (ROOT / "environments" / environment / "backend.tf").read_text()
                self.assertRegex(text, r'backend\s+"s3"\s*\{')
                self.assertRegex(text, rf'key\s*=\s*"coffix/{environment}/terraform.tfstate"')
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
                self.assertRegex(block, r"lifecycle\s*\{\s*prevent_destroy\s*=\s*true\s*\}")

    def test_provider_uses_tags_and_account_guard_in_every_root(self):
        for directory in (
            "bootstrap",
            "environments/shared",
            "environments/dev",
            "environments/prod",
        ):
            with self.subTest(directory=directory):
                text = (ROOT / directory / "main.tf").read_text()
                self.assertRegex(text, r"allowed_account_ids\s*=\s*\[var.aws_account_id\]")
                self.assertRegex(text, r"default_tags\s*\{\s*tags\s*=\s*local.default_tags\s*\}")


if __name__ == "__main__":
    unittest.main()
