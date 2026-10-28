# Asechka native apps — 2.2.8

Six matching, horizontal Home Screen widgets show quotes, your hearts, both people's totals and last-sent times, today's hearts, together time, and streak/lives. See [widget setup and validation](WIDGETS.md), including the Sideloadly extension settings and the current iPhone test status.

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

Open [Native Android and iPhone apps](https://github.com/YoussefElb-Dev/asechka-website/actions/workflows/mobile-builds.yml) while signed into GitHub. Open a successful run and download its artifacts:

- **Asechka-Android-APK**: extract `Asechka-Android.apk`. This universal APK is signed with the original release key, so it updates the previous Android app while retaining its local data. Transfer the complete file and open it from Downloads or Files; an Instagram browser may not hand APK files to Android's installer correctly.
- **Asechka-iPhone-IPA**: extract `Asechka-iPhone.ipa`, then sign and install it using your sideloading tool and Apple ID. This device build has preparation signatures and still needs Apple-ID signing before installation. Signing and periodic renewal are handled by your sideloading tool. Keep a consistent bundle identifier and signing identity when updating to retain local data. In Sideloadly retain **AsechkaWidgets** and leave **Remove App Extensions (Plug-ins)** unchecked.
- **Native-iPhone-previews**: actual simulator screenshots, included when the optional full checks run.

Builds are **manual only**. Choose the platform that needs rebuilding; iPhone is the default. Source pushes do not launch a runner. Optional `full_checks` runs backend tests and the iPhone simulator suite when that platform is selected. Package compilation and verification always run. Each native job is limited to 15 minutes. Packages are retained for 30 days and optional test screenshots/logs for three days; keep downloaded copies. Visibility of logs and artifacts follows GitHub's repository access rules. Android signing material lives in the encrypted `ANDROID_SIGNING` repository secret, never in source or the app. The iPhone build requires no Apple developer signing credentials in GitHub.

## Shared content and offline use

Both profiles can create photos and quotes, like posts, comment, edit posts, and save personal bookmarks. Native composers preview the post and preserve drafts. Original photos, artwork, fonts, and licenses are bundled. Online refresh saves the shared collections and referenced images; new pictures work offline after downloading. Own changes are saved locally before sending and remain queued across restarts. Reconnect retries ordered edits; conflicts stay available for review. Encrypted device storage protects saved content and the session.

Hearts and the shared streak refresh every 15 seconds while open. Other content refreshes every 60 seconds, on return, on reconnect, and after saves. Other-person changes appear within the corresponding foreground interval. Android also requests background sync, subject to Android's scheduling and battery rules. iOS does not promise one-minute refresh while closed. The existing backend has no push event service.

Website content changes appear through the shared APIs without reinstalling. Changes to native screens or new application features need a new APK/IPA. New translations, new music searches, and external playback need internet; saved results remain available offline. Music recordings are not bundled.

Asnat's birthday is August 5; Youssef's is January 25. Profiles set translation grammar and heart identity automatically. Haptics, button motion, animated transitions, quote autoplay, and gentle photo motion respect accessibility settings and the app's motion preference.

## Build and verification

Android: JDK 21, Android SDK 36, `mobile/android/gradlew assembleRelease` with the signing environment configured. The Windows portable builder and isolated instrumentation fixture are included under `android/`.

iPhone: macOS with Xcode and XcodeGen. See [Mac build instructions](ios/BUILDING.md). The workflow builds the arm64 Release app, embeds the WidgetKit extension, and validates both before packaging `Payload/Asechka.app` as an IPA. Full simulator checks are an explicit option. Debug preview fixtures use isolated encrypted storage and never connect to production.

Shared backend tests run before deployment. Successful app writes, retry behavior, conflict handling, photo preparation, and social interactions are tested against isolated fixtures. Production validation uses reads and preserves personal content. Simulator checks cannot verify physical haptic hardware or every phone manufacturer's installer.

## Our little book and Since us

Version 2.1 adds native Tiny victories, Recipes for two (ingredients, steps, photos, and separate ratings), and a searchable inside-joke dictionary. Since us includes the September 27 first conversation, the original couple beginning, monthly and yearly anniversaries, all Open when letters with a heart celebration, and a collection of little things with one revealed at a time. Open these from Our days or Our corner. Every collection supports adding, editing, and confirmed removal using the same shared website APIs. Drafts, pending changes, and downloaded recipe photos use the existing encrypted offline storage.

Build packages and checksums are downloaded directly from the successful run's **Artifacts** section. The former `codex/mobile-delivery` mirror is historical and must not be used as live build status.

## Photo launcher icon

Version 2.1.1 uses our original shadow photo on both platforms. The source and square preview are in `artwork/`. To reproduce every native icon size, install Pillow and run `python mobile/tools/launcher-icons.py` from the repository root. The Android adaptive crop includes the outer area reserved for launcher masking; iPhone and iPad icons are opaque RGB PNGs.

## Connection controls and optional biometrics (2.2.5)

Normal launches and return visits open directly using the saved connection. There is no custom number pad or recurring app-password screen. The existing shared website code is only needed for the first connection or an explicit reconnection. Private editors retain their unsaved drafts on return.

Optional biometric locking is off by default. Enable it in Profile / Our little settings. Android uses the native OS BiometricPrompt (with fingerprint support on Android 6–8); iOS uses native Face ID or Touch ID. Your phone's system screen-lock credentials are the fallback. The app keeps no fingerprint/face data or copy of the phone passcode. When enabled, a separate privacy window covers existing native sheets while authentication runs. Turning off this option restores direct entry. Hardware biometrics need a compatible enrolled device.

The top refresh button and connection status open Refresh now and Reconnect & retry. Rapid hearts coalesce encrypted writes, retain immutable operation IDs once attempted, and avoid rebuilding Android's photo feed for counter-only changes. Temporary repository contention returns a retryable response. An exact, authenticated heart receipt repairs old batches that were changed after partial delivery, resending only the unsaved remainder. A genuinely stale post edit still needs review and no longer prevents independent hearts from syncing.

Shortcut rows include space above their outlines; selected navigation tabs use a larger solid purple icon pill and a lavender background.
