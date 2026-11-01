# Games · 2.3.1 (20)

The Games feature uses Android Views/Canvas and SwiftUI/Canvas, the existing website connection, and an authoritative Node WebSocket service. The preferred deployment uses the existing Vercel project with Redis for shared durable state; a portable Node/JSON server remains available for local development and self-hosting. Native code draws the boards; the server validates moves and owns match results. Both platforms use the same six game IDs: `pool`, `tictactoe`, `hangman`, `connect4`, `checkers`, `battleship`.

Read the [architecture and protocol](../docs/GAMES-ARCHITECTURE.md), [exact rules](../docs/GAMES-RULES.md), [server setup and deployment](../docs/GAMES-DEPLOYMENT.md), [original asset pipeline](../docs/GAMES-ASSETS.md), and [release verification](../docs/GAMES-RELEASE.md).

## Connect the service

For the preferred existing-project deployment, configure `GAMES_TOKEN_SECRET` (at least 32 random characters), a secure persistent `REDIS_URL`, and `GAMES_WS_URL=wss://YOUR_EXISTING_SITE/api/games-socket` in Vercel, then redeploy. The same project hosts `api/games-session.js` and the exported HTTP/WebSocket server `api/games-socket.js`. Redis coordinates state and events across function instances; local files are not persistent storage for this route. Native clients continue to use the ticket endpoint's unchanged `{ticket,url}` response.

For the portable fallback, install Node 22 or newer and project dependencies, share `GAMES_TOKEN_SECRET` between API and service, and set the API's `GAMES_WS_URL=wss://your-games-host.example/games`. Start `npm run games:server` (`server/games/server.mjs`). Put `GAMES_DATA_DIR` on a persistent volume and run one process behind a TLS reverse proxy. Defaults are `127.0.0.1:8787`, `/games`, and `.games-data/matches.json`. Details for both routes are in the deployment guide.

The native connection exchanges the existing website cookie at `POST /api/games-session` for a 15-minute ticket, then authenticates the socket. A missing service configuration returns an explicit 503; it does not create a simulated opponent. Reconnect obtains a new ticket and restores rooms. Both profiles need an internet connection for multiplayer.

This is the existing shared-code/private-couple access model. Choosing Asnat or Youssef selects a profile; it is **not independent identity authentication**. Anyone with the shared website access can select either profile. See the security boundary in the architecture guide before making the service public to unrelated users.

## Native asset paths

The canonical source bundle is `mobile/games-assets/`. The generator copies identical runtime payloads to:

- iOS: `mobile/ios/Resources/default/games/` (bundled as `default/games/`).
- Android: `mobile/android/app/src/main/assets/default/games/` (AssetManager `default/games/`).

Use `covers/<game-id>.png` for native cards and match sheets. PNGs and SVG masters are 960 × 640; raster export uses 2× sampling for smooth edges. The light lavender/blue artwork matches the existing app and is shared by iPhone and Android. Audio is PCM WAV at `audio/<cue>.wav`: `tap`, `invite`, `collision`, `pocket`, `drop`, `move`, `splash`, `hit`, `win`, `lose`. Play cues only when sound is enabled; motion and haptics remain native settings. No media downloads are needed for the bundled covers or sounds.

## Local verification

```sh
node mobile/tools/games-assets.mjs
node mobile/tools/verify-games.mjs --assets-only
node mobile/tools/verify-games.mjs
npm run games:test
npm run games:benchmark
```

The full check requires the six server rule modules and complete native catalogs. The asset-only check can run independently. The benchmark measures two WebSocket clients on local loopback; its output does not establish device rendering speed or internet latency.

The manual mobile workflow gates both builds on shared tests and Games source checks. It verifies all Games assets inside the actual APK/IPA after packaging. A missing Android release secret produces a separately labeled, installable debug APK. The iPhone artifact retains its existing sideload packaging and must be signed and provisioned before device installation. See the release guide for credentials, update compatibility, and remaining device checks.
