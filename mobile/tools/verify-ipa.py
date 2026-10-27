"""Reject delivery artifacts that have lost the actual WidgetKit extension."""
import argparse
import plistlib
import struct
import zipfile

def entitlements(executable):
    """Read the XML entitlement slot from a prepared Mach-O code signature."""
    offset = 32
    for _ in range(struct.unpack_from("<I", executable, 16)[0]):
        command, size = struct.unpack_from("<II", executable, offset)
        if command == 0x1D:
            start, length = struct.unpack_from("<II", executable, offset + 8)
            signature = executable[start:start + length]
            magic, _, count = struct.unpack_from(">III", signature)
            assert magic == 0xFADE0CC0, "Invalid code signature"
            for i in range(count):
                slot, position = struct.unpack_from(">II", signature, 12 + i * 8)
                if slot == 5:
                    blob_magic, blob_length = struct.unpack_from(">II", signature, position)
                    assert blob_magic == 0xFADE7171
                    return plistlib.loads(signature[position + 8:position + blob_length])
        offset += size
    raise AssertionError("IPA lost its requested signing entitlements")

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
        assert "group.app.asechka.shared" in entitlements(executable).get("com.apple.security.application-groups", []), "Shared-data permission missing from app or extension"
    assert b"WidgetKit.framework" in archive.read(extension + widget["CFBundleExecutable"])
    print("Verified arm64 iPhone app and embedded WidgetKit extension, matching versions and bundle IDs.")
