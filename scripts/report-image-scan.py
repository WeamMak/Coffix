"""Print remediation fields only; raw scan reports may contain matched secrets."""

import json
import sys
from pathlib import Path

try:
    report = json.loads(Path(sys.argv[1]).read_text())
except (OSError, ValueError):
    raise SystemExit("Image scan report unavailable or invalid; inspect scanner errors above.")

fields = ("VulnerabilityID", "PkgName", "InstalledVersion", "FixedVersion", "Severity")
vulnerabilities = []
secret_findings = 0
for result in report.get("Results", []):
    vulnerabilities.extend(
        {field: finding.get(field, "") for field in fields}
        for finding in result.get("Vulnerabilities", [])
    )
    secret_findings += len(result.get("Secrets", []))
print(
    json.dumps({"vulnerabilities": vulnerabilities, "secret_findings": secret_findings}, indent=2)
)
