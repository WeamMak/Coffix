#!/usr/bin/env python3
"""Keep raw audit reports; recognize only verified, temporary local fixes."""

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import UTC, date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEVERITIES = {"info", "unknown", "low", "moderate", "medium", "high", "critical"}


def reviewed_fixes(source_root):
    fixes = json.loads((source_root / "patches/security-fixes.json").read_text())["fixes"]
    today = datetime.now(UTC).date()
    for fix in fixes:
        if today >= date.fromisoformat(fix["expiresOn"]):
            raise ValueError(f"Local fix review expired: {fix['package']}")
        if date.fromisoformat(fix["reviewedOn"]) > today or not fix["owner"]:
            raise ValueError("Invalid local fix review metadata")
    return fixes


def pnpm_findings(report, scanner_status, fixes):
    counts = report["metadata"]["vulnerabilities"]
    if any(type(count) is not int or count < 0 for count in counts.values()):
        raise ValueError("Invalid pnpm vulnerability counts")
    covered, unresolved, observed = [], [], Counter()
    for advisory in report["advisories"].values():
        severity = advisory["severity"]
        if severity not in SEVERITIES:
            raise ValueError("Unknown pnpm severity")
        observed[severity] += 1
        if severity not in ("high", "critical"):
            continue
        match = next(
            (
                fix
                for fix in fixes
                if (
                    advisory["module_name"] == fix["package"]
                    and advisory["github_advisory_id"] == fix["ghsa"]
                    and advisory["cves"] == [fix["cve"]]
                    and advisory["findings"]
                    and all(item["version"] == fix["version"] for item in advisory["findings"])
                )
            ),
            None,
        )
        if match:
            covered.append(match)
        else:
            unresolved.append(f"{advisory['module_name']}: {advisory['github_advisory_id']}")
    if any(counts[level] != observed[level] for level in ("high", "critical")):
        raise ValueError("Inconsistent pnpm vulnerability counts")
    if bool(sum(counts.values())) != bool(scanner_status):
        raise ValueError("pnpm exit status disagrees with its report")
    return covered, unresolved


def trivy_findings(report, scanner_status, fixes):
    if report["SchemaVersion"] != 2 or not isinstance(report["Results"], list):
        raise ValueError("Invalid Trivy report")
    covered, unresolved = [], []
    for result in report["Results"]:
        for finding in result.get("Vulnerabilities", []):
            severity = finding["Severity"].lower()
            if severity not in SEVERITIES:
                raise ValueError("Unknown Trivy severity")
            if severity not in ("high", "critical"):
                continue
            match = next(
                (
                    fix
                    for fix in fixes
                    if (
                        result["Target"] == "pnpm-lock.yaml"
                        and result["Class"] == "lang-pkgs"
                        and result["Type"] == "pnpm"
                        and finding["PkgName"] == fix["package"]
                        and finding["InstalledVersion"] == fix["version"]
                        and finding["VulnerabilityID"] == fix["cve"]
                    )
                ),
                None,
            )
            if match:
                covered.append(match)
            else:
                unresolved.append(f"{finding['PkgName']}: {finding['VulnerabilityID']}")
    if bool(covered or unresolved) != bool(scanner_status):
        raise ValueError("Trivy exit status disagrees with its report")
    return covered, unresolved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scanner", choices=("pnpm", "trivy"))
    parser.add_argument("report", type=Path)
    parser.add_argument("scanner_status", type=int)
    parser.add_argument("--source-root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        report = json.loads(args.report.read_text())
        if args.scanner_status not in (0, 1) or report.get("error"):
            raise ValueError("Dependency scanner failed to complete")
        fixes = reviewed_fixes(args.source_root)
        read_findings = pnpm_findings if args.scanner == "pnpm" else trivy_findings
        covered, unresolved = read_findings(report, args.scanner_status, fixes)
        if unresolved:
            raise ValueError("High/critical findings unresolved: " + "; ".join(unresolved))
        # Resolve dependencies from the real checkout while reading patch evidence
        # from the same versionable snapshot used by the scanner.
        subprocess.run(
            ["node", str(args.source_root.resolve() / "scripts/tests/security-patches.test.cjs")],
            cwd=ROOT,
            check=True,
            timeout=30,
        )
        for fix in covered:
            print(
                f"{fix['package']}@{fix['version']} {fix['cve']}: verified local fix "
                f"(review expires {fix['expiresOn']} UTC)"
            )
        print(
            f"{args.scanner}: {len(covered)} findings covered by verified local fixes; "
            "no unresolved high/critical findings. Raw report retained."
        )
        if args.scanner == "pnpm":
            moderate = report["metadata"]["vulnerabilities"]["moderate"]
            print(f"pnpm: {moderate} moderate findings remain")
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
        subprocess.SubprocessError,
    ) as error:
        print(f"Security audit verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
