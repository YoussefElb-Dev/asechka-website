"""Verify Games payloads in real APK/IPA archives. Python standard library only.

The Node source check proves six rules/native catalogs exist; this check proves
their complete asset payload actually reached the distribution archive.
"""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import zipfile

ROOT = Path(__file__).resolve().parents[2]
GAMES = {"pool", "tictactoe", "hangman", "connect4", "checkers", "battleship"}


def verify(path, kind, badging=None):
    source = ROOT / "mobile/games-assets"
    expected_manifest = (source / "manifest.json").read_bytes()
    manifest = json.loads(expected_manifest)
    assert set(manifest["games"]) == GAMES, "Incomplete game catalog"
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, "Corrupt archive"
        names = archive.namelist()
        assert len(set(names)) == len(names), "Duplicate archive entries"
        if kind == "apk":
            prefix = "assets/default/games/"
            dex = [n for n in names if re.fullmatch(r"classes\d*\.dex", n)]
            assert dex and sum(archive.getinfo(n).file_size for n in dex) > 16384, "Missing Android executable"
            if badging:
                metadata = badging.read_text(encoding="utf-8")
                gradle = (ROOT / "mobile/android/app/build.gradle").read_text(encoding="utf-8")
                version = re.search(r"versionName\s+'([^']+)'", gradle)[1]
                build = re.search(r"versionCode\s+(\d+)", gradle)[1]
                assert f"versionCode='{build}'" in metadata, "Stale APK build"
                assert f"versionName='{version}'" in metadata, "Stale APK version"
        else:
            apps = [n for n in names if re.fullmatch(r"Payload/[^/]+\.app/Info.plist", n)]
            assert len(apps) == 1, "Expected one real iOS application"
            app = apps[0].rsplit("/", 1)[0] + "/"
            prefix = app + "default/games/"
            info = plistlib.loads(archive.read(app + "Info.plist"))
            project = (ROOT / "mobile/ios/project.yml").read_text(encoding="utf-8")
            version = re.search(r"MARKETING_VERSION:\s*'([^']+)'", project)[1]
            build = re.search(r"CURRENT_PROJECT_VERSION:\s*'([^']+)'", project)[1]
            assert info["CFBundleShortVersionString"] == version, "Stale IPA version"
            assert info["CFBundleVersion"] == build, "Stale IPA build"
            assert archive.getinfo(app + info["CFBundleExecutable"]).file_size > 16384, "Missing iOS executable"
        assert archive.read(prefix + "manifest.json") == expected_manifest, "Packaged manifest differs from source"
        expected = {"manifest.json"}
        for item in manifest["assets"]:
            name = item["path"]
            assert not name.startswith("/") and ".." not in Path(name).parts
            expected.add(name)
            data = archive.read(prefix + name)
            assert len(data) == item["bytes"], f"Wrong size: {name}"
            assert hashlib.sha256(data).hexdigest() == item["sha256"], f"Wrong content: {name}"
            assert data == (source / name).read_bytes(), f"Stale source: {name}"
        actual = {n[len(prefix):] for n in names if n.startswith(prefix) and not n.endswith("/")}
        assert actual == expected, f"Incomplete or stale Games payload: {actual ^ expected}"
        for game in GAMES:
            assert {f"covers/{game}.svg", f"covers/{game}.png"} <= actual
    print(f"Verified {kind.upper()} Games payload: all six covers, ten sounds, exact manifest/content hashes: {path}")
    if kind == "ipa":
        print("Payload integrity only; this does not establish Apple provisioning or device installability.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apk", type=Path)
    group.add_argument("--ipa", type=Path)
    parser.add_argument("--badging", type=Path, help="Android aapt dump badging output; check packaged version")
    args = parser.parse_args()
    if args.badging and not args.apk:
        parser.error("--badging requires --apk")
    try:
        verify(args.apk or args.ipa, "apk" if args.apk else "ipa", args.badging)
    except (AssertionError, KeyError, OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Games package verification failed: {error}\n")
