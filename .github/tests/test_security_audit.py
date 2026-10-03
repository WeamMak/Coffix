"""Exercise the report gate through its CLI with real installed patch checks."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def pnpm_report():
    return {
        "metadata": {"vulnerabilities": {"high": 1, "critical": 0, "moderate": 2}},
        "advisories": {
            "1": {
                "module_name": "braces",
                "github_advisory_id": "GHSA-vfj7-8cjw-p6xm",
                "cves": ["CVE-2026-93687"],
                "severity": "high",
                "findings": [{"version": "3.0.3"}],
            }
        },
    }


def trivy_report():
    return {
        "SchemaVersion": 2,
        "Results": [
            {
                "Target": "pnpm-lock.yaml",
                "Class": "lang-pkgs",
                "Type": "pnpm",
                "Vulnerabilities": [
                    {
                        "PkgName": "node-forge",
                        "InstalledVersion": "1.4.0",
                        "VulnerabilityID": "CVE-2026-85393",
                        "Severity": "HIGH",
                    }
                ],
            }
        ],
    }


class SecurityAuditTests(unittest.TestCase):
    def run_gate(self, scanner, report, status=1, source_root=ROOT):
        with tempfile.TemporaryDirectory() as directory:
            report_file = Path(directory) / "report.json"
            report_file.write_text(json.dumps(report))
            return subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts/security-audit.py"),
                    scanner,
                    str(report_file),
                    str(status),
                    "--source-root",
                    str(source_root),
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

    def test_exact_reviewed_fixes_pass_both_scanners(self):
        for scanner, report in [("pnpm", pnpm_report()), ("trivy", trivy_report())]:
            with self.subTest(scanner=scanner):
                result = self.run_gate(scanner, report)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("verified local fix", result.stdout)

    def test_other_findings_and_package_versions_still_fail(self):
        for field, value in [
            ("module_name", "another-package"),
            ("github_advisory_id", "GHSA-another-advisory"),
            ("cves", ["CVE-2026-OTHER"]),
            ("findings", [{"version": "3.0.3"}, {"version": "3.0.2"}]),
        ]:
            with self.subTest(field=field):
                report = pnpm_report()
                report["advisories"]["1"][field] = value
                result = self.run_gate("pnpm", report)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("unresolved", result.stderr)

    def test_trivy_fix_is_scoped_to_the_pnpm_lockfile(self):
        for field, value in [
            ("Type", "npm"),
            ("Class", "os-pkgs"),
            ("Target", "other/pnpm-lock.yaml"),
        ]:
            with self.subTest(field=field):
                report = trivy_report()
                report["Results"][0][field] = value
                result = self.run_gate("trivy", report)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("unresolved", result.stderr)

    def test_scanner_errors_and_inconsistent_reports_fail(self):
        inconsistent = pnpm_report()
        inconsistent["metadata"]["vulnerabilities"]["high"] = 0
        for scanner, report, status in [
            ("pnpm", pnpm_report(), 2),
            ("trivy", trivy_report(), 2),
            ("pnpm", {"error": "registry unavailable"}, 1),
            ("pnpm", inconsistent, 1),
            ("trivy", {}, 0),
            ("trivy", {"SchemaVersion": 2, "Results": []}, 1),
            ("pnpm", pnpm_report(), 0),
            ("trivy", trivy_report(), 0),
        ]:
            with self.subTest(scanner=scanner, report=report, status=status):
                self.assertNotEqual(self.run_gate(scanner, report, status).returncode, 0)

    def test_patch_expiry_and_integrity_fail_closed(self):
        for change in ["expired", "patch-bytes", "installed-code-hash"]:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                source = Path(directory)
                shutil.copytree(ROOT / "patches", source / "patches")
                shutil.copytree(ROOT / "scripts/tests", source / "scripts/tests")
                manifest_path = source / "patches/security-fixes.json"
                manifest = json.loads(manifest_path.read_text())
                fix = manifest["fixes"][0]
                if change == "expired":
                    fix["expiresOn"] = "2000-01-01"
                elif change == "patch-bytes":
                    with (source / fix["patch"]).open("a") as patch:
                        patch.write("\nchanged\n")
                else:
                    fix["files"]["lib/parse.js"] = "0" * 64
                manifest_path.write_text(json.dumps(manifest))
                result = self.run_gate("pnpm", pnpm_report(), source_root=source)
                self.assertNotEqual(result.returncode, 0)
                expected = "expired" if change == "expired" else "verification failed"
                self.assertIn(expected, result.stderr)


if __name__ == "__main__":
    unittest.main()
