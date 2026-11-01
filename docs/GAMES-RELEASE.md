# Games release verification · 2.3.1 (20)

The current visual refresh uses version **2.3.1**, build **20**, consistently in `mobile/ios/project.yml`, Android Gradle, and `mobile/android/build.ps1`. Games now shares the app's light lavender palette, explicit readable sheet text, and consistent 960 × 640 cover artwork. The iOS workflow retains the widget repair's renamed-widget-profile executable check. Both platforms retain the existing application/bundle IDs and widget extension packaging.

## Required checks

```sh
npm test
node mobile/tools/verify-games.mjs
npm run games:benchmark
```

Shared tests exercise the rules, ticket access, and two-client networking in addition to the existing application services. CI also starts Redis 8 and sets `GAMES_TEST_REDIS_URL`, enabling the Redis persistence/CAS/pub-sub tests. Read test output and record failures or skipped Redis tests; bundling art does not establish working multiplayer. The full source checker verifies all six registered rules with their create/apply/view interface, native catalogs and original card-art integration, exact asset copies, complete resource folder configuration, and matching versions. Asset-only verification is `node mobile/tools/verify-games.mjs --assets-only`.

`mobile/tools/verify-games.py` checks a **built archive**, not a source directory:

```sh
python3 mobile/tools/verify-games.py --apk /path/to/app.apk
python3 mobile/tools/verify-games.py --ipa /path/to/app.ipa
```

For Android, optionally pass `--badging /path/to/aapt-output.txt` generated with `aapt dump badging` to compare the packaged version and build with Gradle. The workflow always supplies it. For iOS, the checker reads packaged Info.plist directly. Both archive checks require all six SVG/PNG covers, ten WAV cues, and an exact manifest; every file's size/hash must match source, without stale extras or duplicate ZIP entries. Source checks establish module registration/integration; archive checks establish the asset payload reached the package. Compilation and device testing remain separate evidence.

## GitHub Actions

`Native Android and iPhone apps` remains manually dispatched. Select `android`, `iphone`, or `both`. Both build jobs depend on the shared-tests/source-verification job. `full_checks` enables simulator checks/previews; `ios_test_scope=all` retains the full suite including system widget registration, while `games` runs all unit tests and the Games/Photography UI journeys, including all six match sheets and preferences. Shared tests and Games verification run regardless of those options. Android also runs its local Gradle unit-test task before building. Final archive checks and checksums always run. Successful artifacts, logs, and workflow URLs are the build evidence; do not claim a remote build succeeded until a successful run and actual outputs exist.

| Artifact | Signing / installation |
| --- | --- |
| `Asechka-Android-APK` | Release APK signed with the configured existing key; can update only apps with that same identity |
| `Asechka-Android-DEBUG-APK` | Explicit fallback when `ANDROID_SIGNING` is absent; installable debug identity, cannot update the release-signed app |
| `Asechka-iPhone-IPA` | arm64 IPA prepared with ad-hoc signatures for a sideload tool; requires Apple-ID signing/provisioning before device installation |
| Native iPhone previews / diagnostics | Simulator output and logs when available; do not establish physical-device performance |

### Android credentials

Preserve the existing encrypted GitHub `ANDROID_SIGNING` secret. It is JSON with `keystore` (base64-encoded original JKS) and `password`. The key alias remains `asechka`; keystore and key use the existing shared password. CI restores the key only in runner temporary storage, masks its password, and removes the file even after failure. It builds `assembleRelease` when configured. A malformed configured secret fails; it is not silently replaced with a new identity.

With no secret, CI explicitly builds `assembleDebug`, verifies its signature, names the download `Asechka-Android-debug.apk`, and includes debug installation guidance in the artifact and run summary. A hosted runner may generate a different debug key on each run, so even two fallback builds need not update one another. Do not remove an existing app without backing up needed local data. Restore the original release signing secret for compatible updates; never manufacture a replacement release key for an existing installation.

The Windows portable builder retains its existing protected local signing workflow and now uses 2.3.1 (20). It is separate from the CI missing-secret fallback. With the configured SDK/JDK, use `mobile/android/build.ps1`; verify its resulting APK and version before sharing it. No new signing material belongs in source control.

### iPhone credentials and sideloading

The workflow retains the current generic iOS device build, app/WidgetKit extension, preparation signatures with shared-data entitlements, existing IPA verifier, and additional Games archive verification. **An ad-hoc signature is not Apple provisioning. This IPA is not directly device-installable.** Sign/provision it through your sideloading tool and Apple ID, preserving the app and extension, bundle identity, and compatible App Group. In Sideloadly leave **Remove App Extensions (Plug-ins)** unchecked. Keep the same identity when updating to preserve local data.

This workflow does not upload to TestFlight. A future App Store/TestFlight path needs an Apple Developer account/team, matching app and extension identifiers/capabilities, distribution certificate/private key and password, provisioning profiles, signed archive/export configuration, and App Store Connect authorization. Keep these in protected secret storage. Their absence does not prevent the existing sideload-preparation IPA build, but prevents claiming Apple-signed device installation or TestFlight delivery.

## Device and deployment acceptance

After a successful build, exercise all six games on an iPhone and Android together: valid/invalid input, outcomes, draws, rematches/series, real invitations and presence, service restart, background/foreground, temporary loss/reconnect, stale and duplicate moves, hidden fleet/word privacy, sound toggles, reduced motion, accessible controls, and varying display sizes. Check existing home/content/widgets after the update. Confirm the public API/WS configuration and persistent volume independently of package build success.

Measure acknowledgment percentiles in the deployed region, native input-to-display latency, and actual frame pacing on named devices. The targets (under 16 ms local feedback, 60 FPS/optional high refresh, sub-150 ms same-region p95 acknowledgment) are targets, not claims made by packaging or a loopback benchmark. Physical haptics, thermal behavior, and unsigned IPA installability cannot be established by source checks.

## Previous release verification · 2.3.0 (19), October 31, 2026

- The shared workflow passed all **237 tests** with Redis 8, including all six rules, two-client networking, conflicts, reconnects, privacy, and Photography collection behavior.
- [Release build 41257260648](https://github.com/YoussefElb-Dev/asechka-website/actions/runs/41257260648) passed the shared checks, Android release build, and iPhone packaging jobs on `main` (`fd3615fc416a9a9f9c83dc9da91b04546c322954`). Both downloaded archives passed their exact Games asset/hash checks; the APK passed signature verification and the IPA passed its arm64 app/embedded WidgetKit extension checks. Downloaded archive SHA-256 values matched the workflow files.
- Android emulator verification passed **120 existing application assertions**, including login, native navigation, shared CRUD, stale conflicts after asynchronous outbox processing, JPEG upload, music, hearts, translation, copy, zoom, and logout. The separate Games/Photography suite passed **45 assertions**, including real JPEG upload/sync, legacy photo behavior, native navigation, pool pull-back input, ship dragging/validation, checkers replay reconstruction, and all six native board layouts. Board screenshots use recorded public rule states without a network connection; they establish rendering/layout, separately from the production two-client networking check.
- The Android native socket connected to the production Vercel endpoint with normal TLS/hostname validation and correctly rejected an unauthenticated client. This credential-free test is `adb shell am instrument -w -e gamesTlsOnly true app.asechka.android.tests/app.asechka.android.NativeTests`.
- The production two-client WSS check passed all six games, reconnect, deduplication, stale rejection, rematch, private word/fleet visibility, and identical pool results. Its 28 measured moves had **33.87 ms median / 62.05 ms p95** acknowledgment from this Windows host. The disposable rooms and their receipts were removed afterward.
- [Full iPhone test run 41256555802](https://github.com/YoussefElb-Dev/asechka-website/actions/runs/41256555802) passed all **29 unit tests**, both Games/Photography UI tests, and all six existing application UI journeys. Its remaining system widget-gallery test failed because XCTest could not read the remote gallery accessibility hierarchy (`kAXErrorServerNotFound`). The saved failure screenshot visibly contains the Asechka search result; this is evidence of gallery registration, but adding and opening the real widget was not verified by that run. The assertion remains enabled. This full-suite run predates only the final game animation/art polish; the final production commit compiled and packaged successfully in the release run above.

Physical iPhone/Android play together, 60/120 Hz frame pacing, thermal behavior, and haptics still require physical devices. Invitations currently arrive in the live room list and can be opened by room code or native share link. Background push invitation delivery needs APNs/FCM registration, server delivery credentials, and correctly provisioned Apple capabilities; it is not implemented by the WebSocket service. Optional AI/practice modes are not included. These are limitations, not claims of tested behavior.
