# Verification — October 17, 2026

Release **1.3.1**, version code **5**, package `app.asechka.android`. Minimum Android 6.0 (API 23); target Android 16 (API 36). Built with JDK 21 and official Android SDK 36 tools.

## Verified outcomes

**121 native instrumentation assertions passed on the final application source**, using an Android 15 Pixel 6 emulator. Android animation scales were enabled for motion checks. The unchanged production backend previously passed **50 tests**; the final memory/shared-feature subset passed all 12 tests after that integration. No backend code or personal production content was changed for 1.3.1.

- Android 6.0 (API 23): installed successfully, passed **25 compatibility assertions**, including validated production HTTPS (expected unauthenticated 401), all six native screens, bundled static fonts, date/birthday calculations, photo EXIF rotation, JPEG preparation, supported password verification, encrypted storage, offline queue persistence and reconnect. Home screenshot visually inspected. A further **31 motion/publishing assertions passed** on Android 6, including real press/release animation, quote autoplay/pause, reduced motion, photo/quote form publishing and offline retry. The old x86_64 runtime initially crashed inside the QA APK’s compiled test method; reinstalling only the test harness with its interpreter compilation mode allowed this focused suite to complete. The application code was unchanged, and its normal compiled build was used throughout those checks. With normal compilation restored, the signed release also installed and cold-launched successfully on Android 6 in 843 ms.
- Android 8.0 (API 26): installed successfully and passed the same **25 compatibility assertions**. The signed release then installed over the development build and cold-launched in 1,282 ms.
- Android 15 (API 35): full **121 assertions passed**. Separately installed the original signed **1.3.0** APK, seeded its encrypted draft, untagged password verifier and pending quote, then installed the **1.3.1 release over it**. **Five upgrade assertions passed**; saved state remained readable and the queued quote appeared in the original collection cache. Release cold launch succeeded in 1,503 ms.
- Legacy Java/Android API calls have fallbacks. Photo decoding keeps ImageDecoder isolated on Android 9+ and uses sampled BitmapFactory plus EXIF on Android 6–8. Pre-Android-8 password verifiers record the platform-supported PBKDF2 algorithm at the same 120,000-iteration/256-bit settings; older SHA-256 verifiers remain readable. Calendar-day arithmetic avoids daylight-saving offsets. Eight static font variants ship alongside the original variable fonts and licenses.

- Native profile selection, remembered Asnat/Youssef identity, automatic translation grammar and heart identity, separate word drafts, recurring August 5 / January 25 birthdays, and year rollover.
- Six native tabs: Home, Photos, Quotes, Music, Our days, Words. Tested the default layout, 320 dp width, 140% text size, and landscape, including header/navigation bounds and gesture insets.
- Actual bitmap rendering of bundled artwork and protected gallery images. The signed APK contains all 13 current gallery JPEGs, original artwork/default images, fonts, and licenses. Asset ZIP paths were verified, and every bundled gallery file matches its source byte for byte.
- Native touch presses visibly scale down and return smoothly. Quote autoplay advances after eight seconds, Pause stops it, and reduced motion removes transitions. Visible photos pan gently; quote cards float, and images crossfade. Navigation, cards, dialogs, expandable details, refresh, and love interactions use the shared motion implementation. Haptics use Android's system-respecting View API; the emulator cannot verify a physical vibration motor.
- The native quote form publishes text and notes to the shared API. The native photo picker prepares a bounded JPEG, shows a preview, and publishes the photo and caption. Both appear through the shared collection route.
- Quote and photo additions save offline, persist across API-client recreation, synchronize after reconnect, and remain unique after repeated requests. Existing wish/music edits, chained revisions, completion photos, hearts, and conflict review continue to work.
- Cached content survives a cold native activity with emulator Wi-Fi and mobile data disabled. A fixture website addition appeared through the real one-minute foreground refresh without tapping refresh. Persistent background sync remains scheduled at Android's 15-minute minimum.
- Native login, invalid-code handling, encrypted sessions, explicit locking, music CRUD/search, stale-write protection, five-language translation contracts, saved history, clipboard, image zoom, failure recovery, and sign-out. A late background GET can no longer undo an explicit offline lock.

## Production connection

The shared memory API was deployed in GitHub commit `ec972f2`; gallery session handling was completed in `883b91f`. Existing content was preserved. Authenticated production reads returned all **16 quotes and 13 photos**, with shared saving enabled. All 13 protected photo responses matched the bundled originals by SHA-256. The website now reads the same live API and uses protected photo URLs, so it does not have to wait for a static deployment to display phone additions.

Verified unauthenticated collection requests return 401, and an authenticated invalid save returns 400 without creating test content. Production personal data was not changed for testing. Successful writes, concurrency, retry idempotency, rejected uploads, and access checks were verified against isolated fixtures using the production server modules. Real Gemini translations and licensed music playback were not exercised; these retain the existing provider connections and availability requirements.

## Release package

- Release APK signatures verified using schemes **v1, v2 and v3**. Verification restricted to API 23 succeeds using v1; API 24–27 succeeds using v2; the full supported range succeeds. Certificate SHA-256: `f94c188b9b9b0a23cee08e4e5a38359f5c13ebe11e5f22dbc4ddca866be6aba0`, matching previous versions for an in-place update.
- ZIP integrity, unique entries, forward-slash asset paths and four-byte alignment verified. DEX is version 035, compatible with the minimum OS. No `lib/` CPU-specific binaries or ABI restriction is packaged. Legacy launcher icon is included for Android 6–7. Cold-start measurements above are smoke checks, not device performance guarantees.
- Non-debuggable; cleartext traffic and Android backup disabled. Permissions remain Internet, network state, and boot completion. No WebView, HTML/JavaScript shell, account secrets, or signing material is packaged.
- APK SHA-256: `aa5a4231ea282c33527ee5deaaab9fb91f8daae96aaf58ce1c00194d3899bd9e`. Size: 6,532,650 bytes.
- The source archive includes the self-contained QA server modules in `tools/backend`, plus the deployed website/server patch. Runtime build files, screenshots, credentials, signing keys, and local environment files are excluded.

## Practical limits

No physical Samsung device was available. Supported minimum is Android 6.0; Android 5 and earlier are unsupported. Phone-specific installer behavior and corrupted transfers cannot be ruled out without the exact model/OS and received file.

Other-person changes are checked every minute while the app is open, on return, and on reconnect. Own saves update immediately. Background updates follow Android scheduling and battery restrictions; the server does not supply push events. New images are retained offline once downloaded, and pending uploads remain encrypted on the phone until synchronized. New translations/catalog searches and external music playback need internet. Native UI changes require an updated APK. Animation speed and frame delivery depend on the device; continuous image/quote motion stops when not visible or when motion is disabled.
