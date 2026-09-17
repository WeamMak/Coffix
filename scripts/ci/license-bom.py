"""Preserve pnpm's installed license inventory for Trivy's CycloneDX scanner."""

import json
import sys
from pathlib import Path
from urllib.parse import quote

inventory = json.loads(Path(sys.argv[1]).read_text())
assert inventory, "pnpm returned no installed license inventory"
components = []
for expression, packages in inventory.items():
    for package in packages:
        for version in package["versions"]:
            purl = f"pkg:npm/{quote(package['name'], safe='/')}@{quote(version, safe='')}"
            components.append(
                {
                    "type": "library",
                    "name": package["name"],
                    "version": version,
                    "purl": purl,
                    "bom-ref": purl,
                    "licenses": [{"expression": expression}],
                }
            )
assert components, "No installed JavaScript dependencies were inventoried"
Path(sys.argv[2]).write_text(
    json.dumps(
        {"bomFormat": "CycloneDX", "specVersion": "1.5", "version": 1, "components": components}
    )
    + "\n"
)
