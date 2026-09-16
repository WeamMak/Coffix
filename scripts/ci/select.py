#!/usr/bin/env python3
"""Select checks from changed paths; workflows still publish every required status."""

import json
import os
import subprocess
import sys

CHECKS = {"backend", "mobile", "admin", "local-e2e", "infra-validate"}


def select(paths):
    checks = {"infra-validate"}
    for path in paths:
        if (
            path.startswith((".github/", "scripts/", "packages/", "patches/"))
            or "/" not in path
            and path not in {"README.md", "AGENTS.md"}
        ):
            return CHECKS
        if path.startswith("backend/"):
            checks.update(("backend", "local-e2e"))
        for app in ("mobile", "admin"):
            if path.startswith(app + "/"):
                checks.update((app, "local-e2e"))
        if path.startswith("e2e/"):
            checks.add("local-e2e")
    return checks


def changed_paths():
    base = os.environ.get("CI_BASE_SHA", "")
    if not base or set(base) == {"0"}:
        return None
    # No shell interpolation, newline splitting, rename limit, or API pagination.
    result = subprocess.check_output(
        ["git", "diff", "--name-only", "--no-renames", "-z", base, "HEAD"]
    )
    return result.decode().strip("\0").split("\0")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(json.dumps(sorted(select(sys.argv[1:]))))
    else:
        probe = os.environ.get("CI_PROBE_PATH")
        paths = [probe] if probe else changed_paths()
        checks = CHECKS if paths is None else select(paths)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"run={str(os.environ['CI_CHECK'] in checks).lower()}\n")
        print("Selected checks: " + ", ".join(sorted(checks)))
