"""Hash application bytes/modes/links, ignoring archive timestamps and Python caches."""

import hashlib
import json
import sys
import tarfile

files = {}
with tarfile.open(fileobj=sys.stdin.buffer, mode="r|*") as archive:
    for member in archive:
        name = member.name
        if "__pycache__" in name.split("/") or name.endswith(".pyc"):
            continue
        if member.isfile():
            stream = archive.extractfile(member)
            assert stream is not None
            files[name] = [
                member.mode,
                hashlib.file_digest(stream, "sha256").hexdigest(),
            ]
        elif member.issym() or member.islnk():
            files[name] = [member.mode, member.linkname]
assert files, "Application content inventory is empty"
json.dump(files, sys.stdout, sort_keys=True, indent=2)
print()
