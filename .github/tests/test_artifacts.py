"""Artifact comparison contracts through their command-line interfaces."""

import hashlib
import io
import json
import struct
import subprocess
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


class ArtifactTests(unittest.TestCase):
    def test_scan_summary_reports_remediation_without_secret_values(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "scan.json"
            report.write_text(
                json.dumps(
                    {
                        "Results": [
                            {
                                "Target": "private-file-name",
                                "Vulnerabilities": [
                                    {
                                        "VulnerabilityID": "CVE-2026-93990",
                                        "PkgName": "libexpat",
                                        "InstalledVersion": "2.8.4-r0",
                                        "FixedVersion": "2.8.5-r0",
                                        "Severity": "HIGH",
                                        "Description": "private-description",
                                    }
                                ],
                                "Secrets": [
                                    {"Match": "private-secret-value", "Code": "private-source"}
                                ],
                            }
                        ]
                    }
                )
            )
            result = subprocess.run(
                ["python3", "scripts/report-image-scan.py", str(report)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["secret_findings"], 1)
            self.assertEqual(
                summary["vulnerabilities"][0],
                {
                    "VulnerabilityID": "CVE-2026-93990",
                    "PkgName": "libexpat",
                    "InstalledVersion": "2.8.4-r0",
                    "FixedVersion": "2.8.5-r0",
                    "Severity": "HIGH",
                },
            )
            self.assertNotIn("private-", result.stdout + result.stderr)

    def test_image_identity_ignores_timestamps_but_detects_changed_bytes(self):
        def inventory(data, timestamp):
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode="w") as output:
                info = tarfile.TarInfo("app.py")
                info.size = len(data)
                info.mtime = timestamp
                output.addfile(info, io.BytesIO(data))
            return subprocess.check_output(
                ["python3", "scripts/image-content.py"],
                input=archive.getvalue(),
                cwd=ROOT,
            )

        self.assertEqual(inventory(b"original", 1), inventory(b"original", 2))
        self.assertNotEqual(inventory(b"original", 1), inventory(b"changed", 1))

    def test_mobile_identity_ignores_signatures_but_rejects_bundle_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            first, second = (Path(directory) / name for name in ("first.apk", "second.apk"))

            def write(path, content, signature):
                with zipfile.ZipFile(path, "w") as archive:
                    archive.writestr("assets/index.android.bundle", content)
                    archive.writestr("AndroidManifest.xml", b"version:1")
                    archive.writestr("META-INF/CERT.RSA", signature)

            def compare():
                return subprocess.run(
                    ["python3", "scripts/mobile-content.py", str(first), str(second)],
                    cwd=ROOT,
                    capture_output=True,
                    check=False,
                )

            write(first, b"application", b"signature 1")
            write(second, b"application", b"signature 2")
            result = compare()
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("assets/index.android.bundle", json.loads(result.stdout))
            write(second, b"different application", b"signature 2")
            self.assertNotEqual(compare().returncode, 0)
            with zipfile.ZipFile(second, "w") as archive:
                archive.writestr("AndroidManifest.xml", b"version:1")
            self.assertNotEqual(compare().returncode, 0)

    def test_release_actions_are_pinned_and_never_receive_pull_request_code(self):
        for name in ("build-images", "mobile-build"):
            workflow = yaml.load(
                (ROOT / f".github/workflows/{name}.yml").read_text(),
                Loader=yaml.BaseLoader,
            )
            self.assertNotIn("pull_request_target", workflow["on"])
            self.assertNotIn("pull_request", workflow["on"])
            self.assertEqual(workflow["on"]["push"]["branches"], ["main"])
            for job in workflow["jobs"].values():
                self.assertIn("timeout-minutes", job)
                for step in job["steps"]:
                    if "uses" in step:
                        self.assertRegex(step["uses"], r"^[\w-]+/[\w-]+@[0-9a-f]{40}$")
                    self.assertNotIn("continue-on-error", step)

    def test_hermes_comparison_keeps_executable_bytes_and_validates_format(self):
        # HBC v98 fixture: 128-byte header, executable body, debug data, SHA1 footer.
        def bytecode(code, debug, version=98):
            header = bytearray(128)
            header[:8] = bytes.fromhex("c61fbc03c103191f")
            struct.pack_into("<I", header, 8, version)
            struct.pack_into("<I", header, 32, 128 + len(code) + len(debug) + 20)
            struct.pack_into("<I", header, 108, 128 + len(code))
            payload = header + code + debug
            return payload + hashlib.sha1(payload).digest()

        with tempfile.TemporaryDirectory() as directory:
            first, second = (Path(directory) / name for name in ("one.apk", "two.apk"))

            def write(path, payload):
                with zipfile.ZipFile(path, "w") as archive:
                    archive.writestr("assets/index.android.bundle", payload)

            def compare():
                return subprocess.run(
                    ["python3", "scripts/mobile-content.py", str(first), str(second)],
                    cwd=ROOT,
                    capture_output=True,
                    check=False,
                ).returncode

            write(first, bytecode(b"executable", b"/random/compiler/path"))
            write(second, bytecode(b"executable", b"/other/path"))
            self.assertEqual(compare(), 0)
            write(second, bytecode(b"DIFFERENT!", b"/other/path"))
            self.assertNotEqual(compare(), 0)
            write(second, bytecode(b"executable", b"/other/path", version=99))
            self.assertNotEqual(compare(), 0)
            write(second, bytecode(b"executable", b"/other/path")[:-1])
            self.assertNotEqual(compare(), 0)


if __name__ == "__main__":
    unittest.main()
