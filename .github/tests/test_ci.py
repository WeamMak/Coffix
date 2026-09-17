"""Public path-selection and workflow safety contracts for the five required checks."""

import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


class PathSelectionTests(unittest.TestCase):
    def select(self, *paths):
        result = subprocess.run(
            ["python3", "scripts/ci/select.py", *paths],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
        return set(json.loads(result.stdout))

    def test_owned_paths_schedule_the_required_checks(self):
        cases = {
            "backend/src/coffix/catalog/service.py": {"backend", "local-e2e", "infra-validate"},
            "mobile/app/index.tsx": {"mobile", "local-e2e", "infra-validate"},
            "admin/src/app/App.tsx": {"admin", "local-e2e", "infra-validate"},
            "e2e/specs/auth.spec.ts": {"local-e2e", "infra-validate"},
            "infra/terraform/main.tf": {"infra-validate"},
            "infra/kubernetes/charts/coffix/Chart.yaml": {"infra-validate"},
        }
        for path, expected in cases.items():
            with self.subTest(path=path):
                self.assertEqual(self.select(path), expected)

    def test_shared_contracts_lockfiles_and_ci_select_all_consumers(self):
        all_checks = {"backend", "mobile", "admin", "local-e2e", "infra-validate"}
        for path in (
            "pnpm-lock.yaml",
            "packages/api-client/src/generated.ts",
            "scripts/ci/select.py",
            ".github/workflows/backend-ci.yml",
            "Makefile",
            "patches/example.patch",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.select(path), all_checks)

    def test_multiple_changes_include_deletions_and_never_execute_filenames(self):
        self.assertEqual(
            self.select("mobile/deleted.ts", "admin/$(exit 99).tsx"),
            {"mobile", "admin", "local-e2e", "infra-validate"},
        )

    def test_documentation_still_gets_the_security_gate(self):
        self.assertEqual(self.select("README.md"), {"infra-validate"})

    def test_deliberately_failing_branch_files_reach_every_owned_check(self):
        for check, path in {
            "backend": "backend/probe.py",
            "mobile": "mobile/probe.py",
            "admin": "admin/probe.py",
            "local-e2e": "e2e/probe.py",
            "infra-validate": "infra/probe.py",
        }.items():
            with self.subTest(check=check), tempfile.TemporaryDirectory() as directory:

                def git(*args):
                    return subprocess.check_output(
                        ["git", "-c", "user.name=CI", "-c", "user.email=ci@example.invalid", *args],
                        cwd=directory,
                        stderr=subprocess.DEVNULL,
                        text=True,
                    ).strip()

                git("init", "--initial-branch=main")
                git("commit", "--allow-empty", "-m", "base")
                base = git("rev-parse", "HEAD")
                git("switch", "-c", "deliberate-failure")
                probe = Path(directory) / path
                probe.parent.mkdir()
                probe.write_text("raise AssertionError('intentional branch probe')\n")
                git("add", path)
                git("commit", "-m", "failing owned-path test")
                output = Path(directory) / "output"
                subprocess.run(
                    ["python3", str(ROOT / "scripts/ci/select.py")],
                    cwd=directory,
                    env={
                        **os.environ,
                        "CI_BASE_SHA": base,
                        "CI_CHECK": check,
                        "GITHUB_OUTPUT": str(output),
                        "CI_PROBE_PATH": "",
                    },
                    check=True,
                    capture_output=True,
                )
                self.assertEqual(output.read_text(), "run=true\n")
                failure = subprocess.run(["python3", str(probe)], capture_output=True)
                self.assertNotEqual(failure.returncode, 0)
                self.assertIn(b"intentional branch probe", failure.stderr)


class WorkflowSafetyTests(unittest.TestCase):
    def test_every_required_status_is_published_and_actions_are_pinned(self):
        names = []
        for path in (ROOT / ".github/workflows").glob("*-ci.yml"):
            workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
            with self.subTest(workflow=path.name):
                self.assertIn("pull_request", workflow["on"])
                self.assertNotIn("pull_request_target", workflow["on"])
                self.assertFalse(workflow["on"]["pull_request"])
                self.assertEqual(workflow["permissions"], {"contents": "read"})
                self.assertEqual(workflow["concurrency"]["cancel-in-progress"], "true")
                for job in workflow["jobs"].values():
                    names.append(job["name"])
                    self.assertNotIn("if", job)  # publish even for unrelated paths
                    self.assertIn("timeout-minutes", job)
                    checkout = job["steps"][0]
                    self.assertEqual(checkout["with"]["persist-credentials"], "false")
                    self.assertEqual(checkout["with"]["fetch-depth"], "0")
                    for step in job["steps"]:
                        if "uses" in step:
                            self.assertRegex(
                                step["uses"], re.compile(r"^[\w-]+/[\w-]+@[0-9a-f]{40}$")
                            )
                        self.assertNotIn("continue-on-error", step)
        self.assertCountEqual(names, ["backend", "mobile", "admin", "local-e2e", "infra-validate"])


if __name__ == "__main__":
    unittest.main()
