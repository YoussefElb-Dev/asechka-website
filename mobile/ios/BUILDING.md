# Build the iPhone IPA on a Mac

This uses your Mac instead of GitHub Actions minutes. Xcode and XcodeGen must already be installed. No Apple credentials are needed for packaging; Sideloadly signs the finished IPA for installation.

From `mobile/ios`, run:

```sh
xcodegen generate
xcodebuild -project Asechka.xcodeproj -scheme Asechka \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
mkdir -p package/Payload
cp -R build/Build/Products/Release-iphoneos/Asechka.app package/Payload/
codesign --force --sign - --entitlements Widgets/Widgets.entitlements \
  package/Payload/Asechka.app/PlugIns/AsechkaWidgets.appex
codesign --force --sign - --entitlements Asechka.entitlements \
  package/Payload/Asechka.app
codesign --verify --deep --strict package/Payload/Asechka.app
cd package
zip -qry Asechka-iPhone.ipa Payload
python3 ../../tools/verify-ipa.py Asechka-iPhone.ipa
shasum -a 256 Asechka-iPhone.ipa > Asechka-iPhone.ipa.sha256
```

Use a clean `package` folder for a new build so old archive entries cannot remain. The resulting `package/Asechka-iPhone.ipa` still needs Apple-ID signing before installation. In Sideloadly leave **Remove App Extensions (Plug-ins)** unchecked, retain **AsechkaWidgets**, and sign both targets with the same provisioned App Group. Open the installed app once, then **Messages → Our home-screen widgets → Refresh widgets**. Search **Asechka** in the Home Screen widget picker.

The optional simulator suite can be run in Xcode with **Product → Test**. The newest Home Screen registration wait change still needs a Mac test run; the Android checks and earlier iPhone unit/screen checks are documented in `../WIDGETS.md`.
