# Games release verification · 2.3.0 (19)

The feature uses version **2.3.0**, build **19**, consistently in `mobile/ios/project.yml`, Android Gradle, and `mobile/android/build.ps1`. This advances beyond the published widget repair 2.2.9 (18). The iOS workflow retains that repair's renamed-widget-profile executable check. Both platforms retain the existing application/bundle IDs and widget extension packaging.

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

`Native Android and iPhone apps` remains manually dispatched. Select `android`, `iphone`, or `both`. Both build jobs depend on the shared-tests/source-verification job. `full_checks` adds the existing iPhone simulator suite/previews; shared tests and Games verification run regardless of that option. Android also runs its local Gradle unit-test task before building. Final archive checks and checksums always run. Successful artifacts, logs, and workflow URLs are the build evidence; do not claim a remote build succeeded until a successful run and actual outputs exist.

| Artifact | Signing / installation |
| --- | --- |
| `Asechka-Android-APK` | Release APK signed with the configured existing key; can update only apps with that same identity |
| `Asechka-Android-DEBUG-APK` | Explicit fallback when `ANDROID_SIGNING` is absent; installable debug identity, cannot update the release-signed app |
| `Asechka-iPhone-IPA` | arm64 IPA prepared with ad-hoc signatures for a sideload tool; requires Apple-ID signing/provisioning before device installation |
| Native iPhone previews / diagnostics | Simulator output and logs when available; do not establish physical-device performance |

### Android credentials

Preserve the existing encrypted GitHub `ANDROID_SIGNING` secret. It is JSON with `keystore` (base64-encoded original JKS) and `password`. The key alias remains `asechka`; keystore and key use the existing shared password. CI restores the key only in runner temporary storage, masks its password, and removes the file even after failure. It builds `assembleRelease` when configured. A malformed configured secret fails; it is not silently replaced with a new identity.

With no secret, CI explicitly builds `assembleDebug`, verifies its signature, names the download `Asechka-Android-debug.apk`, and includes debug installation guidance in the artifact and run summary. A hosted runner may generate a different debug key on each run, so even two fallback builds need not update one another. Do not remove an existing app without backing up needed local data. Restore the original release signing secret for compatible updates; never manufacture a replacement release key for an existing installation.

The Windows portable builder retains its existing protected local signing workflow and now uses 2.3.0 (19). It is separate from the CI missing-secret fallback. With the configured SDK/JDK, use `mobile/android/build.ps1`; verify its resulting APK and version before sharing it. No new signing material belongs in source control.

### iPhone credentials and sideloading

The workflow retains the current generic iOS device build, app/WidgetKit extension, preparation signatures with shared-data entitlements, existing IPA verifier, and additional Games archive verification. **An ad-hoc signature is not Apple provisioning. This IPA is not directly device-installable.** Sign/provision it through your sideloading tool and Apple ID, preserving the app and extension, bundle identity, and compatible App Group. In Sideloadly leave **Remove App Extensions (Plug-ins)** unchecked. Keep the same identity when updating to preserve local data.

This workflow does not upload to TestFlight. A future App Store/TestFlight path needs an Apple Developer account/team, matching app and extension identifiers/capabilities, distribution certificate/private key and password, provisioning profiles, signed archive/export configuration, and App Store Connect authorization. Keep these in protected secret storage. Their absence does not prevent the existing sideload-preparation IPA build, but prevents claiming Apple-signed device installation or TestFlight delivery.

## Device and deployment acceptance

After a successful build, exercise all six games on an iPhone and Android together: valid/invalid input, outcomes, draws, rematches/series, real invitations and presence, service restart, background/foreground, temporary loss/reconnect, stale and duplicate moves, hidden fleet/word privacy, sound toggles, reduced motion, accessible controls, and varying display sizes. Check existing home/content/widgets after the update. Confirm the public API/WS configuration and persistent volume independently of package build success.

Measure acknowledgment percentiles in the deployed region, native input-to-display latency, and actual frame pacing on named devices. The targets (under 16 ms local feedback, 60 FPS/optional high refresh, sub-150 ms same-region p95 acknowledgment) are targets, not claims made by packaging or a loopback benchmark. Physical haptics, thermal behavior, and unsigned IPA installability cannot be established by source checks.

## Recorded verification · October 31, 2026

- The shared workflow passed all **237 tests** with Redis 8, including all six rules, two-client networking, conflicts, reconnects, privacy, and Photography collection behavior.
- GitHub Actions produced and signature-verified release Android APKs using the existing signing identity. Android emulator verification passed **33 Games/Photography assertions**, including real JPEG upload/sync, legacy photo behavior, native navigation, pool pull-back input, ship dragging/validation, and checkers replay reconstruction.
- The Android native socket connected to the production Vercel endpoint with normal TLS/hostname validation and correctly rejected an unauthenticated client. This credential-free test is `adb shell am instrument -w -e gamesTlsOnly true app.asechka.android.tests/app.asechka.android.NativeTests`.
- The production two-client WSS check passed all six games, reconnect, deduplication, stale rejection, rematch, private word/fleet visibility, and identical pool results. Its 28 measured moves had **33.87 ms median / 62.05 ms p95** acknowledgment from this Windows host. The disposable rooms and their receipts were removed afterward.
- iPhone compilation and unit tests passed after simplifying pool-frame decoding. The full UI suite and final IPA packaging must be confirmed from the final linked Actions run before marking that archive delivered.

Physical iPhone/Android play together, 60/120 Hz frame pacing, thermal behavior, and haptics still require physical devices. Invitations currently arrive in the live room list and can be opened by room code or native share link. Background push invitation delivery needs APNs/FCM registration, server delivery credentials, and correctly provisioned Apple capabilities; it is not implemented by the WebSocket service. Optional AI/practice modes are not included. These are limitations, not claims of tested behavior.
