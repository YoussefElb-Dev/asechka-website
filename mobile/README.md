# Asechka native apps — 2.0.0

Two native applications share the existing private website services: Android Views (Android 6+) and SwiftUI (iOS 16+, iPhone/iPad). Neither app contains a WebView. Home is a scrolling social feed; Photos and Quotes have their own feeds. Music, Our days, Words, the letter, personal corner, birthdays, and profile choices remain available.

## Get the builds

Open [Native Android and iPhone apps](https://github.com/YoussefElb-Dev/asechka-website/actions/workflows/mobile-builds.yml) while signed into the private repository. Open a successful run and download its artifacts:

- **Asechka-Android-APK**: extract `Asechka-Android.apk`. This universal APK is signed with the original release key, so it updates the previous Android app while retaining its local data. Transfer the complete file and open it from Downloads or Files; an Instagram browser may not hand APK files to Android's installer correctly.
- **Asechka-iPhone-IPA**: extract `Asechka-iPhone.ipa`, then sign and install it using your sideloading tool and Apple ID. This is an unsigned device build for sideloading, not a directly installable App Store or enterprise package. Signing and periodic renewal are handled by your sideloading tool. Keep a consistent bundle identifier and signing identity when updating to retain local data.
- **Native-iPhone-previews**: actual simulator screenshots of the native interface and its tested screens.

Pushes changing mobile sources, shared server code, tests, or the workflow build both platforms. **Run workflow** also starts a build manually. Artifacts are private and retained for 30 days; keep downloaded copies. Android signing material lives in the encrypted `ANDROID_SIGNING` repository secret, never in source or the app. The iPhone build requires no Apple developer signing credentials in GitHub.

## Shared content and offline use

Both profiles can create photos and quotes, like posts, comment, edit posts, and save personal bookmarks. Native composers preview the post and preserve drafts. Original photos, artwork, fonts, and licenses are bundled. Online refresh saves the shared collections and referenced images; new pictures work offline after downloading. Own changes are saved locally before sending and remain queued across restarts. Reconnect retries ordered edits; conflicts stay available for review. Encrypted device storage protects saved content and the session.

Apps refresh every 60 seconds while open, on return, on reconnect, and after saves. Other-person changes appear within that foreground refresh interval. Android also requests background sync, subject to Android's scheduling and battery rules. iOS does not promise one-minute refresh while closed. The existing backend has no push event service.

Website content changes appear through the shared APIs without reinstalling. Changes to native screens or new application features need a new APK/IPA. New translations, new music searches, and external playback need internet; saved results remain available offline. Music recordings are not bundled.

Asnat's birthday is August 5; Youssef's is January 25. Profiles set translation grammar and heart identity automatically. Haptics, button motion, animated transitions, quote autoplay, and gentle photo motion respect accessibility settings and the app's motion preference.

## Build and verification

Android: JDK 21, Android SDK 36, `mobile/android/gradlew assembleRelease` with the signing environment configured. The Windows portable builder and isolated instrumentation fixture are included under `android/`.

iPhone: macOS with Xcode and XcodeGen. Run `xcodegen generate` in `ios/`; the workflow runs native model/storage tests and a simulator UI walkthrough before building the unsigned arm64 Release application and packaging `Payload/Asechka.app` as an IPA. Debug preview fixtures use isolated encrypted storage and never connect to production.

Shared backend tests run before deployment. Successful app writes, retry behavior, conflict handling, photo preparation, and social interactions are tested against isolated fixtures. Production validation uses reads and preserves personal content. Simulator checks cannot verify physical haptic hardware or every phone manufacturer's installer.
