# Asechka 2.5.0 (22): where we are, and what we open together

Home places the location map directly under the shortcut choices and before the shared posts. Standard phone layouts keep the controls and map visible on first arrival. Large accessibility text and very small screens may need scrolling so text and touch targets remain usable.

## Live location

Sharing is off until each person chooses Share on their own phone. The phone apps keep sharing enabled until Stop is pressed; there is no one-hour cutoff. Only the newest position is stored. Positions expire from Redis after five minutes without another update, and stop being labeled Live after one minute. Consent and the per-device sharing capability persist so a phone can reconnect after an outage without turning sharing on again. A new sharing session on another device for the same profile revokes the previous device's capability.

Android uses an explicitly started location foreground service, with an ongoing notification and a Stop action. Allow location and notifications when asked. It accepts approximate location for the map; precise location is needed for the vault. Battery management, force-stop, reboot, or removal of permissions may interrupt updates. Open Asechka again to resume a previously enabled session. The service does not automatically restart from a boot receiver.

iPhone uses Core Location with background location capability, a visible system indicator, and an Always permission request. Allow Always in iPhone Settings for continued background delivery. Force-quitting Asechka can stop updates until it is reopened. Neither app can promise uninterrupted GPS or connectivity indefinitely.

The website shows both app locations. Its own Share button updates only while that page is visible. Leaving the browser page attempts to stop that browser's sharing session. A Stop request made offline immediately stops collection on that phone and persists a pending stop; reconnect to remove its server pin immediately. Without connectivity, that pin stops being Live after a minute and disappears after five minutes.

Coordinates and capability records are encrypted with AES-256-GCM in the existing TLS Redis database. There is no location history in Git. Map rendering uses Apple MapKit on iPhone and OpenStreetMap tiles on Android and the website, with attribution. Tile providers receive the map area needed for rendering. No reverse-geocoding or advertising service receives coordinates.

## Our time vault

1. Choose a title and a future local date/time, and optionally seal a first note. The server stores the exact UTC instant. The date cannot be brought forward or otherwise edited after saving.
2. Add more notes, pictures, or videos before that date. Each vault holds up to 100 notes and 10 media files. Each file can be up to 16 MB; supported formats are JPEG, PNG, WebP, HEIC/HEIF, MP4, MOV, and WebM. Device playback support varies, especially for HEIC and video codecs.
3. After the opening date, one phone chooses Open together. The other chooses its own profile and scans the fresh QR from inside Time vault.
4. Both phones provide fresh locations with accuracy within 50 metres, and must be within 100 metres. The QR lasts two minutes. Distinct profiles, device IDs, and authenticated sign-in sessions are required. A session is bound to both sign-in sessions and this one vault.
5. Both phones keep Time vault visible, online, and nearby. Each sends a fresh location heartbeat. If either leaves, stops responding, loses a fresh location, or moves away, the server refuses subsequent content reads and the screen relocks. Heartbeats are required within 45 seconds. Each new opening needs a new together check.

The vault's location permission is separate from ongoing map sharing: opening a vault does not silently enable permanent tracking. Creating and uploading are available through the authenticated shared vault screen inside both native apps and on the website.

Notes, vault metadata, and media chunks are encrypted before storage in the repository. There are no public photo/video URLs or decrypted offline vault snapshots. Small bounded uploads are staged encrypted in Redis for up to one hour, then committed atomically with the encrypted vault index. Uploads can be retried; an unfinished browser upload may need to be selected again. Sealed attachments and note contents are never included in the vault list response. The server checks the date and both phones' current session again for every media chunk.

The existing site uses a shared login and selectable Asnat/Youssef profiles, rather than independent identity-verified accounts. QR plus GPS is a practical together check, not tamper-proof physical ranging: spoofed GPS, deliberately shared QR images, compromised devices, or someone holding both authenticated devices can circumvent the intended real-world ceremony. Media already seen, recorded, or saved cannot be revoked by relocking the screen.

Keep the original `SESSION_SECRET` for recovery, or decrypt and migrate the camera, vault, and location data before rotating it. Store decryption fails closed after an unplanned secret change. The Redis database must remain connected for live location and together checks. Git metadata writes use non-force compare-and-retry commits, preserving concurrent shared memories.

## Verification

Shared tests cover sealed projections, encryption/tampering, immutable dates, bounded uploads, chunk authorization, stale/far GPS, QR expiry, device/profile/session separation, persistent consent, per-device revocation, live/paused labels, stopping, and real Redis Lua operations in CI. Native checks cover building both packages and iPhone Home visibility/explicit consent. Desktop and phone-sized browser previews use isolated synthetic locations and memories; production test requests do not turn on either person's tracking or create vaults. Actual background GPS delivery, camera QR scanning, and locked-phone behavior still need a two-phone hardware check.
