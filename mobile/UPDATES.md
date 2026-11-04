# Asechka 2.6.4 (29)

Android: Settings → App updates checks the protected website for a release. Install this APK manually once over the existing app; later releases download inside Asechka and open Android's installation confirmation. On Android 8+, allow installation from Asechka when asked. Reconnect with the existing website code if the session has expired. Updates retain the package, original release certificate, encrypted offline content, drafts, and outbox.

The updater accepts HTTPS only on the existing website, never follows redirects, and sends the session cookie only to that origin. It checks bounded metadata and file size, SHA-256, APK package/version, and the installed signing certificate before granting temporary read access to the Android installer. Downloads support cancel/retry. Interrupted downloads never replace the installed application. APKs and metadata stay behind the website's existing sign-in.

Both apps: the six chance dots scale within the book's right page. Word tiles wrap into additional rows for long words and phrases, with no horizontal scrolling. Writing fields use the system keyboard's spelling suggestions and correction controls. Language dictionaries and suggestions depend on the phone's keyboard settings. Password and room-code fields retain their exclusions.

When choosing a custom word, Personal reference turns off AI and descriptive clues for that round. The guesser sees only the free revealed letter, and no word is sent to Google. New rounds and server-selected words return to normal hint behavior.

Hints use the existing server-side GEMINI_API_KEY. Only an authorized, valid, unused hint action can call Google. A bounded structured clue is cached, screened for answer disclosure, and combined with the existing free letter reveal. Provider errors or unavailable models keep the existing built-in clue; no chance is deducted. Timer expiry and duplicate action receipts remain authoritative.

## Publishing the next Android release

1. Increase Android versionCode and versionName in app/build.gradle and build.ps1.
2. Build with the original release key and run the checks.
3. Run `node mobile/tools/publish-android-update.mjs path/to/signed.apk` with JAVA_HOME and ANDROID_HOME configured. The script verifies the original certificate, reads the actual APK version, and writes dist/updates atomically.
4. Deploy the APK and android.json together. The manual main-branch Android workflow performs steps 2–4 for release-signed builds. Debug builds never publish to the update feed. GitHub needs permission for its workflow token to push the release commit.

The iPhone IPA requires signing/provisioning with the same Apple ID and bundle identifiers as the existing installation. Keep its widget extension when signing. Android's APK updater does not change the iPhone signing process.
