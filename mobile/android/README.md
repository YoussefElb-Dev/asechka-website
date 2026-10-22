# Asechka for Android — 2.1.0

A native Android app for [our live website](https://asechka-website.vercel.app). All screens use Android views, text inputs, dialogs, image rendering, navigation, and the system photo picker. The application contains no WebView, bundled website, browser shell, JavaScript bridge, or website credentials.

## Install

Transfer **Asechka.apk** to an Android phone running **Android 6.0 or later**, open the file, and allow that browser or file manager to install apps if Android asks. Open **Asechka**, then enter the same code used on the website. Connect once to sign in and download shared content; saved content and bundled artwork then work offline. Updates can be installed over this version when signed with the same key.

## Phone compatibility

This is one universal APK: Android 6.0 (API 23) and newer, with no ARM/x86 split packages, CPU-specific native libraries, or Google Play services requirement. The target SDK stays at Android 16. Android 5 and earlier are outside the supported range; an APK cannot support every Android release or guarantee every manufacturer's installer.

Earlier compatibility work added explicit v1, v2, and v3 signatures using the original release certificate, plus Android 6–8 fallbacks for photo decoding and EXIF orientation, static bundled fonts, animation settings, navigation labels, network callbacks, background scheduling, dates, and password verification. Existing encrypted storage and pending changes remain compatible with previous versions. Newer Android retains its modern image decoder and variable fonts.

Download or transfer **Asechka-v2.1.0.apk** as a complete file, retaining the `.apk` extension. Send it as a document or download from a browser into Downloads, then open it in Files. Compare its SHA-256 with the supplied file if a transfer is suspect. Install over the existing app to retain app-private saved data. A parsing error can also mean an incomplete/corrupted transfer or an unsupported OS; Samsung Galaxy alone does not identify the Android version.

## Connected features

| Native section | Features and live data |
| --- | --- |
| Home | Recycled social feed combining photos and quotes; likes, comments, bookmarks, sharing, double-tap hearts, and native creation/editing. Our corner keeps the original letter, countdown, feelings, daily memory, birthdays, and artwork. |
| Photos | Shared gallery, add a photo with caption/date, encrypted offline uploads, gently moving images, and a full-screen viewer with previous/next and pinch zoom |
| Quotes | Shared quotes, add a quote with note/date, swipeable automatic slideshow, pause/resume, gentle quote movement, and the dated collection |
| Music | Existing catalog search; ten shared slots; add, replace, edit notes, remove with confirmation; artwork, album, duration, Apple Music and Spotify links |
| Our days | Shared wishes; add, edit, filter, complete, reopen, delete with confirmation; optional completion photos; automatic profile sender, shared hearts and timestamps |
| Words | The existing Gemini-backed translator; all five target languages; source detection, tone, automatic profile grammar; pronunciation, back translation, notes, native clipboard, and RTL text |

The same Vercel routes and server-side GitHub/Gemini connections are used. The shared `/api/memories` backend is deployed on the existing website. It uses the existing server-side repository connection, with no secrets in the APK. Phone additions, the website, and Asechka Studio use the same collection. Studio still supports desktop batch publishing.

The app refreshes shared data every 60 seconds while visible, after a save, on return, and when internet reconnects. A manual refresh button is also available. A persistent Android JobScheduler job checks in the background with a 15-minute minimum interval; Android controls when it runs, including battery and network restrictions. Open editors and photo viewers stay steady during refresh. Native layouts use the website’s exact ink, paper, blue, lavender, and button colors, with bundled DM Sans, Manrope, and Caveat fonts. Buttons have consistent spacing; action groups stack on narrow screens or with large text. Bottom navigation draws through the gesture area and hides while the keyboard is open. Shared saves appear immediately in the app, and the website reads them through the live collection API before static deployment finishes. Website content and API data update without reinstalling the app. Changes to native screen design or new website features require a new APK.

The countdown retains the website's exact October 16, 2026, 3 PM Eastern target. It now shows the original completed state. The letter and personal static copy are retained in native code.

## Motion and touch

Buttons, navigation, clickable cards, checkboxes, and selectors have native press/release motion and system-respecting haptics. Tab changes slide and fade, visible cards enter in a short stagger, photos reveal smoothly and pan gently within their frames, and quotes float slightly and slide between entries every eight seconds while visible. Quotes support horizontal swipes, previous/next, and pause/resume. Dialogs enter smoothly; feelings and translation details expand with animated layout changes. Refresh rotates and little-love interactions emit a short heart burst. Offscreen images and quotes do not run their continuous draw loops. The in-app menu can pause motion or disable haptics, and Android’s disabled animation/haptic settings are respected.

Repeated metadata reads reuse a bounded memory cache; image requests are coalesced, decoding occurs on worker threads, and the album loads in small batches. Full-screen zoom uses a separate higher-resolution bitmap cache key.

## Profiles and birthdays

On first launch, choose **Asnat** or **Youssef**. The choice is remembered and can be changed in the app menu. Hearts use the correct sender automatically. Translations automatically use a female speaker and male recipient for Asnat, and a male speaker and female recipient for Youssef. Drafts and the last translation are kept per profile; shared website content stays shared.

**Asnat: August 5. Youssef: January 25.** Both recurring birthdays appear in Our corner and Our days, including days remaining and a birthday-day message. They work offline and roll forward each year. No birth years or ages are assumed.

## Offline behavior

The original cat artwork, default photos, all 13 current gallery photos, icons, and licensed fonts ship inside the APK. Shared images show an explicit loading/retry state; the gallery and viewer use the protected shared photo endpoint. Online sync saves the current quotes, gallery, shared wishes, song metadata, artwork, daily memory, and referenced photos. The status line reports unfinished photo downloads. Open the app online until those finish before relying on new pictures offline.

New posts, post edits, likes, comments, gallery photos, music/wish edits, completion photos, deletions, and hearts are saved durably before sending. Offline changes remain in an ordered outbox across app restarts and are retried on reconnect. Repeated requests use the existing backend’s revision checks and idempotency rules. A conflict stays saved for review in **Saved changes**; the user can keep the website version or explicitly apply their change. The app does not silently overwrite a newer edit.

New catalog searches, new translations, and external music playback need internet. Previously searched catalog results and saved translations work offline. The APK does not include licensed music recordings. Changes made by the other person are checked within the foreground one-minute refresh cycle; the existing server does not provide push events.

## Privacy and access

- The shared password is sent over HTTPS to the existing `/api/session` route and is never saved.
- The seven-day session cookie is encrypted with an Android Keystore AES-GCM key in private app storage. Android backup is disabled. Locking the door clears the session and private in-memory data, while keeping encrypted saved content and pending edits. After one successful online sign-in, the last code can unlock saved content offline using a salted PBKDF2 verifier; the password itself is never saved.
- Shared content, photos, artwork, translation history, drafts, and pending edits are saved in encrypted, atomic app-private files using an Android Keystore AES-GCM key. All referenced photos are prefetched, including screens not yet opened. There is no automatic cache eviction. Cookies go only to the website, never to external artwork or listening services.
- Photo selection uses Android's file picker without broad storage permissions. The app honors image orientation, flattens to JPEG without source metadata, limits the longest side to 1,600 pixels, and compresses below the server's 320 KB limit.
- Native writes send the existing Origin and protected request headers. Existing revision checks and idempotent operations prevent silent overwrites and duplicate wishes after retries.
- The release manifest permits HTTPS only. The debug build enables HTTP solely for emulator testing; distribute the release APK.
- Translation text goes through the site's existing Gemini service, with the same disclosure shown on the website. Translations and drafts are saved privately on the phone for offline use. A previously translated request can be repeated offline; generating a new translation needs the online service.

## Source and builds

Open this directory in Android Studio, or use the included Gradle wrapper with JDK 21 and Android SDK 36. The checked-in Gradle build uses AGP 8.13.2 and Gradle 8.13. `gradlew.bat assembleDebug` creates a development build. Standard Gradle release builds need your signing configuration.

The dependency-free Windows release builder uses official Android SDK tools directly:

```powershell
.\build.ps1
```

It finds the portable tools installed at `%LOCALAPPDATA%\AsechkaAndroid\toolchain`, or accepts `-SdkRoot` and `-JavaHome`. Required SDK packages: `platforms;android-36`, `build-tools;36.0.0`, and `platform-tools`. Output: `build\Asechka.apk` and its SHA-256 file.

The persistent release key is stored outside the repository at `%LOCALAPPDATA%\AsechkaAndroid\signing\asechka-release.jks`. Its random password is protected with Windows DPAPI in `password.dpapi`. Keep the key and protected password available on this Windows account for future updates. Neither belongs in a source archive or Git. The builder never displays either secret.

## Verification

`tools/test-server.mjs` runs an isolated, in-memory fixture against the website's real auth, music, photo, revision, and shared-memory validation code copied into `tools/backend` for a self-contained source package. It does not contact production or change personal data.

```powershell
node tools/test-server.mjs
.\build.ps1 -Debug
.\tools\build-tests.ps1
# With an emulator running and adb available:
adb reverse tcp:4777 tcp:4777
adb install -r build\Asechka-debug.apk
adb install -r build\tests\native-tests.apk
adb shell am instrument -w app.asechka.android.tests/app.asechka.android.NativeTests
```

The compatibility mode (`-e compatOnly true`) checks real production HTTPS without changing personal data, dates, native screens, EXIF rotation, bounded uploads, secure login, offline password verification, encrypted cache recreation, and queued writes. Separate upgrade checks seed encrypted state under the original 1.3.0 APK and verify it after installing the current release.

The instrumentation checks image bitmap rendering, six navigation destinations, quote autoplay/pause, reduced motion, native quote/photo form publishing, offline addition persistence and retry idempotency, first-launch profiles, automatic roles, birthday rollover, small/large-text/landscape layouts, real disconnected-radio access, cold activity restoration, one-minute automatic content updates, ordered offline writes, and native controls and navigation, invalid and valid login, encrypted session persistence, live reads and writes against the isolated server, stale-write rejection, JPEG resizing and photo upload, music search, shared hearts, translation, clipboard, photo zoom, failure recovery, and sign-out. QA screenshots use fictional fixture content. Release signature and manifest checks are recorded with the delivered APK.


The production collection backend was deployed in repository commit `ec972f2`, with gallery session handling completed in `883b91f`. The exact server/website changes are included in `tools/connected-backend.patch`; `tools/backend` contains the server modules used by the isolated QA fixture. These files contain no production credentials. The existing 16 quotes and 13 photos were retained when deploying the connection.

## Android and iPhone automation

The private repository includes both native applications under mobile/ and a GitHub Actions workflow that generates the signed Android APK and an unsigned iPhone IPA for signing with a sideloading tool. See mobile/README.md in the repository for build downloads and iOS installation details.

## Our little book and Since us

Version 2.1 adds native Tiny victories, Recipes for two (ingredients, steps, photos, and separate ratings), and a searchable inside-joke dictionary. Since us includes the September 27 first conversation, the original couple beginning, monthly and yearly anniversaries, all Open when letters with a heart celebration, and a collection of little things with one revealed at a time. Open these from Our days or Our corner. Every collection supports adding, editing, and confirmed removal using the same shared website APIs. Drafts, pending changes, and downloaded recipe photos use the existing encrypted offline storage.

The private build workflow also keeps the latest APK, IPA, checksums, build status, and previews on the codex/mobile-delivery branch so an existing SSH checkout can retrieve them without a browser sign-in. It uses a repository-scoped, short-lived GitHub Actions token; signing keys remain in their existing encrypted secret.
