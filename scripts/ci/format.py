"""Check changed source against .editorconfig; use Ruff for changed Python files."""

import os
import subprocess
import sys
from pathlib import Path

base = os.environ.get("CI_BASE_SHA") or "origin/main"
if set(base) == {"0"}:
    base = "HEAD"
names = (
    subprocess.check_output(["git", "diff", "--name-only", "--diff-filter=ACMR", "-z", base])
    .decode()
    .split("\0")
)
names += (
    subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "-z"])
    .decode()
    .split("\0")
)
paths = [
    Path(name)
    for name in set(names)
    if name
    and Path(name).is_file()
    and any(name.startswith(prefix + "/") for prefix in sys.argv[1:])
]
python = []
for path in paths:
    if path.suffix not in {
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".mjs",
        ".json",
        ".yaml",
        ".yml",
        ".sh",
        ".css",
    }:
        continue
    content = path.read_bytes()
    assert b"\r" not in content, f"{path}: use LF line endings"
    assert not content or content.endswith(b"\n"), f"{path}: missing final newline"
    assert all(line.rstrip(b" \t") == line for line in content.splitlines()), (
        f"{path}: trailing whitespace"
    )
    if path.suffix == ".py":
        python.append(str(path))
if python:
    subprocess.run(
        [
            "uv",
            "run",
            "--frozen",
            "--project",
            "backend",
            "ruff",
            "format",
            "--config",
            "backend/pyproject.toml",
            "--check",
            *python,
        ],
        check=True,
    )
subprocess.run(["git", "diff", "--check", base], check=True)
