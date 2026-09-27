"""Compare bundled application bytes/version across signed EAS builds.

Native toolchain output and signing envelopes are deliberately not byte-compared.
EAS metadata must independently confirm the source SHA, version and platform.
"""

import hashlib
import json
import plistlib
import struct
import sys
import zipfile
from pathlib import Path


def application_hash(data: bytes) -> str:
    # Hermes HBC v98: bytecode, constants and tables precede debugInfoOffset.
    # Expo's random temporary compiler path lives in debug information. Keep
    # every executable byte and source hash, excluding only debug data/footer
    # and its resulting fileLength field. Reject new layouts until reviewed.
    # https://github.com/facebook/hermes/blob/static_h/include/hermes/BCGen/HBC/BytecodeFileFormat.h
    if data[:8] == bytes.fromhex("c61fbc03c103191f"):
        if len(data) < 148 or struct.unpack_from("<I", data, 8)[0] != 98:
            raise ValueError("Unsupported Hermes bytecode version")
        length = struct.unpack_from("<I", data, 32)[0]
        debug_offset = struct.unpack_from("<I", data, 108)[0]
        if length != len(data) or not 128 <= debug_offset <= len(data) - 20:
            raise ValueError("Invalid Hermes bytecode boundaries")
        if hashlib.sha1(data[:-20]).digest() != data[-20:]:
            raise ValueError("Invalid Hermes bytecode checksum")
        executable = bytearray(data[:debug_offset])
        executable[32:36] = bytes(4)
        data = executable
    return hashlib.sha256(data).hexdigest()


def content(path: Path) -> dict:
    result = {}
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if name.endswith("/"):
                continue
            if name.startswith("Payload/"):
                name_in_app = name.split(".app/", 1)[-1]
                if name_in_app == "Info.plist":
                    info = plistlib.loads(archive.read(name))
                    result["version"] = {
                        key: info[key]
                        for key in (
                            "CFBundleIdentifier",
                            "CFBundleShortVersionString",
                            "CFBundleVersion",
                        )
                    }
                selected = (
                    name_in_app == "main.jsbundle"
                    or name_in_app.startswith("assets/")
                    or (
                        "/" not in name_in_app
                        and name_in_app.endswith(
                            (".ttf", ".otf", ".png", ".jpg", ".car")
                        )
                    )
                )
            else:
                name_in_app = name.removeprefix("base/")
                selected = name_in_app.startswith(
                    ("assets/", "res/")
                ) or name_in_app in (
                    "AndroidManifest.xml",
                    "manifest/AndroidManifest.xml",
                    "resources.arsc",
                    "resources.pb",
                )
            if selected:
                data = archive.read(name)
                result[name_in_app] = (
                    application_hash(data)
                    if name_in_app.endswith((".bundle", ".jsbundle"))
                    else hashlib.sha256(data).hexdigest()
                )
    if not any(name.endswith((".bundle", ".jsbundle")) for name in result):
        raise ValueError(
            "Missing bundled JavaScript; development clients are not release artifacts"
        )
    return result


if __name__ == "__main__":
    first, second = (content(Path(value)) for value in sys.argv[1:3])
    if first != second:
        raise SystemExit("Signed builds contain different application content/version")
    print(json.dumps(first, sort_keys=True, indent=2))
