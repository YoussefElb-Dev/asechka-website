"""Reject delivery artifacts that have lost the actual WidgetKit extension."""
import argparse
import plistlib
import struct
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("ipa")
args = parser.parse_args()
with zipfile.ZipFile(args.ipa) as archive:
    assert archive.testzip() is None, "Damaged IPA archive"
    app = "Payload/Asechka.app/"
    extension = app + "PlugIns/AsechkaWidgets.appex/"
    parent = plistlib.loads(archive.read(app + "Info.plist"))
    widget = plistlib.loads(archive.read(extension + "Info.plist"))
    assert widget["NSExtension"]["NSExtensionPointIdentifier"] == "com.apple.widgetkit-extension"
    assert widget["CFBundleIdentifier"].startswith(parent["CFBundleIdentifier"] + ".")
    assert widget["CFBundlePackageType"] == "XPC!"
    for key in ("CFBundleVersion", "CFBundleShortVersionString"):
        assert widget[key] == parent[key], "App/extension versions must match"
    for folder, info in ((app, parent), (extension, widget)):
        assert info.get("CFBundleName") and info.get("CFBundleExecutable")
        executable = archive.read(folder + info["CFBundleExecutable"])
        magic, cpu, _, kind = struct.unpack_from("<4I", executable)
        assert magic == 0xFEEDFACF and cpu == 0x100000C and kind == 2, "Expected a real arm64 device executable"
        assert len(executable) > 16384, "Empty extension executable"
    assert b"WidgetKit.framework" in archive.read(extension + widget["CFBundleExecutable"])
    print("Verified arm64 iPhone app and embedded WidgetKit extension, matching versions and bundle IDs.")
