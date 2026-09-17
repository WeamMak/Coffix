"""Copy versionable working source only, excluding credentials and runtime data."""

import shutil
import subprocess
import sys
from pathlib import Path

target = Path(sys.argv[1])
paths = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"]
)
for raw in set(paths.split(b"\0")) - {b""}:
    path = Path(raw.decode())
    if path.is_file() and not path.is_symlink():
        output = target / path
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, output)
