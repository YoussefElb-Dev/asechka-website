# Games setup, credentials, and deployment

The preferred deployment keeps Games inside the existing Vercel project. `api/games-socket.js` exports an HTTP server with WebSocket upgrade handling; Redis holds durable state and coordinates instances. Vercel announced general availability of native WebSockets on October 20, 2026, and documents the exported-server pattern. Function lifetime limits still require reconnect support. [Vercel announcement](https://vercel.com/changelog/websocket-support-is-now-generally-available), [WebSocket setup and persistence](https://vercel.com/docs/functions/websockets).

The portable Node/JSON server and Docker image remain local/self-hosted fallbacks. Their single-writer volume restrictions apply to that fallback, not to the Redis-backed Vercel service.

## Preferred: existing Vercel project

1. Connect a durable Redis provider reachable from the Vercel function region. Use its secure `rediss://` connection URL, including credentials, as the encrypted `REDIS_URL` environment variable. This implementation uses the Node Redis client (pinned 6.3.1) with Redis protocol and pub/sub; a provider's HTTP REST URL/token alone is not equivalent.
2. Add `REDIS_URL` to the existing project's encrypted environment settings. In this same-project deployment, tickets derive a separate signing key from the existing `SESSION_SECRET` and `SITE_PASSWORD`, and the API selects its own secure `/api/games-socket` URL. Optional overrides are `GAMES_TOKEN_SECRET` (at least 32 random characters) and `GAMES_WS_URL`. Set `GAMES_ALLOWED_ORIGINS` to exact browser site origins if needed; native clients omit Origin. Scope configuration to the deployment environments you intend to enable and redeploy after changes.
3. Use Fluid Compute and the socket route's configured 300-second duration. Allow `/api/games-socket` through the site's upgrade path, middleware, and deployment protection policy while preserving the first-message ticket requirement. Never put a Redis credential or the signing secret in the returned URL or native bundle.
4. Deploy the source containing both Games API routes, rules, Redis service, pinned dependencies/lockfile, and existing application. No separate always-running process or file volume is needed for this Vercel mode. Do not start the portable JSON server as a Vercel build command.
5. Complete the two-client live verification below against the actual production WSS URL. Reconnects caused by function duration or new deployments must reauthenticate, reload shared rooms, and preserve pending action identities. Confirm cross-instance updates and persistence; a successful website deployment alone does not establish these.

Redis compare-and-set writes prevent independent instances from committing conflicting versions, and pub/sub delivers remote changes. Configure provider durability and backups, keep storage near the function region, and isolate preview/test data from production. A missing `REDIS_URL` is a configuration blocker for this route; never replace durable shared state with per-instance memory or ephemeral local JSON. The existing app uses shared-code profile access, so Redis does not add individual account authentication.

## Redis verification in CI

The backend workflow starts `redis:8-alpine`, publishes port 6379, waits for `redis-cli ping` health, and sets `GAMES_TEST_REDIS_URL=redis://127.0.0.1:6379`. The normal `tests/*.test.mjs` command includes `tests/games-redis.test.mjs`, so the Redis adapter runs against a real isolated Redis service in CI. Local Redis testing uses the same variable pointed at an isolated test instance; never point integration tests at production storage. A local run without Redis must distinguish skipped Redis tests from a successful Redis integration pass.

## Configuration

| Variable | Configure on | Meaning |
| --- | --- | --- |
| `GAMES_TOKEN_SECRET` | API **and** Games service | Optional same-project override; required matching secret for a separate host; at least 32 random characters |
| `GAMES_WS_URL` | API host | Optional same-project override; with Redis, defaults to this origin's secure `/api/games-socket`; required for a separate host |
| `REDIS_URL` | Vercel Games route | Secret secure Redis-protocol connection for persistent state and pub/sub |
| `GAMES_REDIS_PREFIX` | Redis Games route | Optional key/channel override; production defaults to `asechka:games:v1`, Vercel previews use a separate branch namespace; use separate test storage |
| `GAMES_TEST_REDIS_URL` | Integration tests / CI | Isolated test Redis instance; plain loopback allowed for CI service |
| `GAMES_DATA_DIR` | Portable JSON fallback only | Persistent writable directory containing `matches.json`; default `.games-data` relative to the server working directory |
| `GAMES_HOST` | Games service | Listen address; default `127.0.0.1`; use `0.0.0.0` inside a container |
| `GAMES_PORT` | Games service | Listen port; default `8787` |
| `GAMES_ALLOWED_ORIGINS` | Games service | Comma-separated exact browser origins; default `https://asechka-website.vercel.app`; native clients may omit Origin |
| `NODE_ENV` | API/service | Set `production` in deployment; production ticket URLs require WSS |

The existing website access credentials/cookie remain necessary. The preferred route uses the current Vercel account/project plus a configured Redis service. The portable process can use your own host. Provider credentials, API environment access, and Android/Apple distribution credentials remain operator configuration. Never place the token secret, Redis credentials, keystores, private keys, or full tickets in mobile resources, committed examples, screenshots, or logs.

Generate a secret locally and place its exact value into both hosts' secret stores:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Portable fallback: local setup

From the repository root, install Node 22 or newer and run `npm install --ignore-scripts --no-audit --no-fund`. The service uses pinned `ws` 8.22.0. If using the repository's pnpm environment instead, run its install command against the root manifest/lockfile.

Create a local `.env` with the variables below; `.env` is ignored by Git. Replace the secret marker with the generated secret. The entry point reads `.env` when launched from the repository root.

```dotenv
GAMES_TOKEN_SECRET=REPLACE_WITH_THE_GENERATED_SECRET
GAMES_HOST=127.0.0.1
GAMES_PORT=8787
GAMES_DATA_DIR=.games-data
GAMES_ALLOWED_ORIGINS=http://localhost:4173
```

```sh
npm run games:server
```

The HTTP health endpoint is `http://127.0.0.1:8787/health`; WebSocket traffic is at `/games`. Configure the API host's matching secret and its `GAMES_WS_URL` separately. A local API in development permits `ws:` only for the supported loopback/emulator host names; production native clients should use a TLS endpoint reachable from both devices. `127.0.0.1` on a phone means that phone, not the development computer. The normal site development server is not the Games service.

Run checks from another terminal:

```sh
npm run games:test
npm run games:benchmark
node mobile/tools/verify-games.mjs
```

The benchmark launches its own isolated loopback service and two clients with temporary storage. Its report is written to `benchmark-results/games.json`. Treat it as a local measurement; rerun on the deployment host and physical clients to establish any regional or device targets.

## Portable fallback: production process

Deploy one Node 22+ process under your host's service supervisor, from the repository root, using `npm run games:server` or `node server/games/server.mjs`. Set `NODE_ENV=production`, mount `GAMES_DATA_DIR` on a persistent writable volume, and configure your HTTPS reverse proxy to forward `/games` upgrades to the internal port. Preserve WebSocket `Upgrade` and `Connection` headers, use HTTP/1.1 upstream, and choose an idle timeout longer than the server's 25-second heartbeat (for example 75 seconds). Restrict the internal port from direct public access. Route `/health` to the same process for basic health checks.

The supplied `server/games/Dockerfile` can be built from the **repository root**, so its COPY paths resolve correctly:

```sh
docker build -f server/games/Dockerfile -t asechka-games .
docker volume create asechka-games-data
docker run -d --name asechka-games --restart unless-stopped \
  --env-file /secure/path/games.env \
  -p 127.0.0.1:8787:8787 \
  -v asechka-games-data:/data asechka-games
```

The container defaults to `GAMES_HOST=0.0.0.0` and `GAMES_DATA_DIR=/data`; keep those values if supplying overrides. The env file lives outside the repository and contains `NODE_ENV=production`, the matching token secret, and the site's exact allowed origin(s). The API deployment needs `GAMES_WS_URL=wss://your-games-host.example/games` and the same secret; the container does not need the public URL to listen.

After the proxy and service are healthy, configure/redeploy the existing API. For either hosting mode, open Games on two devices/profiles, verify real presence, create/join a room, ready/start, exchange legal moves, disconnect/reconnect one client, and restart/redeploy the service to confirm match restoration. Test the deep link or shared room code with both native platforms. Do not treat HTTP health alone as evidence that authentication, TLS upgrade, cross-platform play, or persistence works.

## Portable fallback: persistence and maintenance

Use **one process and one replica**. Commands are serialized in memory and saved by atomic replacement of `GAMES_DATA_DIR/matches.json`. Sharing the volume between writers or scaling horizontally can lose updates; there is no distributed lock or external pub/sub. The file contains secret words and fleets as well as public state. Limit filesystem/backup access. Stop the service for a consistent backup, preserve the complete directory, and verify restoration into an isolated service before relying on a backup. Never commit match data.

Use a graceful stop and the supervisor's restart policy. Native sockets reconnect, obtain a fresh 15-minute ticket, and list/sync rooms. Rotation of `GAMES_TOKEN_SECRET` requires updating both API and service; it invalidates outstanding tickets and clients reconnect. Room expiry is 30 days of inactivity, not an immediate disconnect forfeit. The bounded command receipt window is not unlimited deduplication history.

This service follows the app's shared-code profile model, not independently verified accounts. See [architecture](GAMES-ARCHITECTURE.md) before exposing it to any larger audience.
