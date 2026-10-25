# Asechka native apps — 2.2.4

The streak is now shared by Android, iPhone, and the website. It starts at the website's 13-day age on October 25, 2026, using its first source record of October 12. This seed is saved once in `dist/together.json` and never advances on later releases. Either person's heart keeps a day. Daily heart totals retain only real sends.

One life is available initially; each monthly anniversary, the 12th, grants another. Unused lives stack without a cap. A completed day with no hearts consumes one life and preserves the day in the streak. Without a life, the streak resets; the next heart restarts at one. Once inactive, idle days do not consume newly earned lives. Lives continue accruing every month. Daily settlement uses Eastern midnight, including daylight saving time. The hidden heart history lists protected days and the next allowance.

The server persists the shared policy and computes status from its saved heart dates. All three clients use the same calendar rules and twelve common regression fixtures. Offline heart sends keep their original day; syncing a late heart repairs that day and restores any life it no longer needs. Retries cannot spend a life twice. Older responses cannot replace a newer ledger. Hearts refresh every 15 seconds while the apps are open, independently of image downloads. Offline views use the last saved ledger and pending hearts; devices converge after connecting.

The Home heart sender uses a compact white capsule, a rose heart icon, and dark, readable text on both Android and iPhone. The 48-point touch target, soft press feedback, floating hearts, and offline queue remain available.

Two native applications share the existing private website services: Android Views (Android 6+) and SwiftUI (iOS 16+, iPhone/iPad). Neither app contains a WebView. Home is a scrolling social feed; Photos and Quotes have their own feeds. Music, Our days, Words, the letter, personal corner, birthdays, and profile choices remain available.

## Adaptive heart motion in 2.2.3

Android uses a Choreographer-driven application window; iPhone uses a CADisplayLink-driven, non-key UIWindow above sheets. Both request the supported display refresh rate, including 90/120 Hz where available, reuse cached heart artwork, bound active particles, and leave underlying controls interactive. Particle positions follow display timestamps for steadier pacing. Android selects a faster mode only at the current display resolution; iPhone opts into ProMotion. Hearts travel beyond cards and headers to the top of the screen. Reduced motion and the existing pause option remain supported. Actual frame rates depend on the device and system load. The website follows browser animation frames and compacts active particles in place to avoid a fresh array each frame.

Android saves taps on an ordered worker; iPhone serializes encrypted heart writes on its vault queue. Visual feedback happens immediately and writes finish before synchronization. Home's Create / Our corner / Saved actions share the full available width. The website uses a requestAnimationFrame canvas in the browser top layer and durable retry batches, with a full-width mobile navigation row.

## Home and little hearts

Version 2.2 puts Send a heart directly on Home, alongside a live time-together counter and shortcuts to Secret vocab, Open when letters, Tiny victories, Recipes for two, Little things, and Our beginning. Android settings, creation choices, and post actions use rounded, animated native sheets.

Tap the heart as often as you like. Every tap saves on the phone before syncing; rapid taps share a batch, while an attempted batch keeps its original identity so retries cannot add the same hearts twice. Floating hearts rise while tapping, with bounded animation work and support for reduced motion. Offline hearts keep the day they were sent and sync after reconnecting.

Long-press the streak on Home to open the small heart-history page. It shows both people's totals for each day and a together streak for days when both sent at least one heart. The Home streak follows the selected profile. Days follow Eastern time; yesterday's streak stays active until today's opportunity ends. Counting begins with this update because earlier versions did not record daily totals. This feature uses the existing private backend and needs no new service account.

## Get the builds

Open [Native Android and iPhone apps](https://github.com/YoussefElb-Dev/asechka-website/actions/workflows/mobile-builds.yml) while signed into the private repository. Open a successful run and download its artifacts:

- **Asechka-Android-APK**: extract `Asechka-Android.apk`. This universal APK is signed with the original release key, so it updates the previous Android app while retaining its local data. Transfer the complete file and open it from Downloads or Files; an Instagram browser may not hand APK files to Android's installer correctly.
- **Asechka-iPhone-IPA**: extract `Asechka-iPhone.ipa`, then sign and install it using your sideloading tool and Apple ID. This is an unsigned device build for sideloading, not a directly installable App Store or enterprise package. Signing and periodic renewal are handled by your sideloading tool. Keep a consistent bundle identifier and signing identity when updating to retain local data.
- **Native-iPhone-previews**: actual simulator screenshots of the native interface and its tested screens.

Pushes changing mobile sources, shared server code, tests, or the workflow build both platforms. **Run workflow** also starts a build manually. Artifacts are private and retained for 30 days; keep downloaded copies. Android signing material lives in the encrypted `ANDROID_SIGNING` repository secret, never in source or the app. The iPhone build requires no Apple developer signing credentials in GitHub.

## Shared content and offline use

Both profiles can create photos and quotes, like posts, comment, edit posts, and save personal bookmarks. Native composers preview the post and preserve drafts. Original photos, artwork, fonts, and licenses are bundled. Online refresh saves the shared collections and referenced images; new pictures work offline after downloading. Own changes are saved locally before sending and remain queued across restarts. Reconnect retries ordered edits; conflicts stay available for review. Encrypted device storage protects saved content and the session.

Hearts and the shared streak refresh every 15 seconds while open. Other content refreshes every 60 seconds, on return, on reconnect, and after saves. Other-person changes appear within the corresponding foreground interval. Android also requests background sync, subject to Android's scheduling and battery rules. iOS does not promise one-minute refresh while closed. The existing backend has no push event service.

Website content changes appear through the shared APIs without reinstalling. Changes to native screens or new application features need a new APK/IPA. New translations, new music searches, and external playback need internet; saved results remain available offline. Music recordings are not bundled.

Asnat's birthday is August 5; Youssef's is January 25. Profiles set translation grammar and heart identity automatically. Haptics, button motion, animated transitions, quote autoplay, and gentle photo motion respect accessibility settings and the app's motion preference.

## Build and verification

Android: JDK 21, Android SDK 36, `mobile/android/gradlew assembleRelease` with the signing environment configured. The Windows portable builder and isolated instrumentation fixture are included under `android/`.

iPhone: macOS with Xcode and XcodeGen. Run `xcodegen generate` in `ios/`; the workflow runs native model/storage tests and a simulator UI walkthrough before building the unsigned arm64 Release application and packaging `Payload/Asechka.app` as an IPA. Debug preview fixtures use isolated encrypted storage and never connect to production.

Shared backend tests run before deployment. Successful app writes, retry behavior, conflict handling, photo preparation, and social interactions are tested against isolated fixtures. Production validation uses reads and preserves personal content. Simulator checks cannot verify physical haptic hardware or every phone manufacturer's installer.

## Our little book and Since us

Version 2.1 adds native Tiny victories, Recipes for two (ingredients, steps, photos, and separate ratings), and a searchable inside-joke dictionary. Since us includes the September 27 first conversation, the original couple beginning, monthly and yearly anniversaries, all Open when letters with a heart celebration, and a collection of little things with one revealed at a time. Open these from Our days or Our corner. Every collection supports adding, editing, and confirmed removal using the same shared website APIs. Drafts, pending changes, and downloaded recipe photos use the existing encrypted offline storage.

The private build workflow also keeps the latest APK, IPA, checksums, build status, and previews on the codex/mobile-delivery branch so an existing SSH checkout can retrieve them without a browser sign-in. It uses a repository-scoped, short-lived GitHub Actions token; signing keys remain in their existing encrypted secret.

## Photo launcher icon

Version 2.1.1 uses our original shadow photo on both platforms. The source and square preview are in `artwork/`. To reproduce every native icon size, install Pillow and run `python mobile/tools/launcher-icons.py` from the repository root. The Android adaptive crop includes the outer area reserved for launcher masking; iPhone and iPad icons are opaque RGB PNGs.
