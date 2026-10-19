# Asechka 2.0.0 verification

The native social redesign uses the existing private website backend. Personal production data is preserved; successful writes are checked using isolated fixtures.

- Shared backend: 62 tests pass, including profile likes, comments, ownership checks, idempotency, concurrent commits, content revisions, and existing connected features.
- Android 15 (API 35): 120 feature assertions pass for login, all six screens, wishes/music/hearts, translation contracts, JPEG upload, conflicts, offline restart, automatic one-minute content refresh, profiles, birthdays, layouts, motion, and post publishing. A separate social suite covers ordered offline likes/unlikes, comments, per-profile bookmarks, native composers, photos, encrypted restart, and reconnect without duplicates.
- Android 6 (API 23): 25 compatibility assertions pass, including valid production HTTPS, native screens, dates, EXIF orientation, bounded JPEGs, secure login, offline verification, and queued synchronization. Additional social checks exercise encrypted photo disk reads, new posts, likes, comments, image rendering, and reconnect.
- The old Android 6 Keystore provider truncated large one-shot cipher output. The current storage code collects bounded streaming output and verifies encrypted lengths, preserving AES-GCM authentication and existing valid cache files. Damaged cached remote images can download again when connected. A 200 KB encrypted disk round-trip is checked without the metadata memory cache.
- iPhone: GitHub macOS builds the native SwiftUI application for arm64 iOS 16+. Five model/storage/resource tests and a native UI journey pass, including every original photo decoding offline, encrypted storage tamper detection, both profile reactions, quote creation, likes, and comments. UI fixtures are isolated and never contact production.
- Both apps bundle all 13 original gallery JPEGs, original artwork, fonts, licenses, and native icons. The IPA archive, arm64 device executable, iOS minimum, absence of a device signature, original photo bytes, and fonts are verified after download. It must be signed by a sideloading tool before installation.
- Android release uses the original certificate and v1/v2/v3 signatures, minimum API 23, target API 36, version 2.0.0 / code 6, with no CPU split packages. Certificate SHA-256: f94c188b9b9b0a23cee08e4e5a38359f5c13ebe11e5f22dbc4ddca866be6aba0.

Physical Samsung/iPhone hardware and vibration motors are not available. Provider-backed real Gemini output and licensed music playback are not exercised; those retain the existing service connections. New translations/searches/playback need internet. Other-device changes refresh within one minute while open; operating systems control background activity. Native feature changes require installing a new app build.

The previous release verification remains in VERIFICATION-1.3.1.md. Exact current file hashes are delivered beside the app files.
