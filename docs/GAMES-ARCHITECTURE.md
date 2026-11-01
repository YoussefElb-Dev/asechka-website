# Games architecture and protocol

The Games tab extends the existing Android Views/Canvas and iOS SwiftUI/Canvas applications. It uses the existing API request/cookie helpers and encrypted native storage rather than embedding a browser or replacing the existing app. `GAMES-CONTRACT.md` is the common client/server contract.

| Layer | Location | Responsibility |
| --- | --- | --- |
| Native rendering and sessions | Android `Games*.java`; iOS `Games*.swift` | Catalog, lobby, boards, input, reconnect, local preferences |
| Ticket endpoint | `api/games-session.js`, `server/games-session-api.js` | Authorize existing site access, validate selected profile, issue short ticket |
| WebSocket transport | `server/games/server.mjs` | `/games`, authentication, frame limits, connection heartbeat |
| Match service | `server/games/service.mjs` | Rooms, readiness, serialized commands, receipts, persistence, per-player views |
| Existing-project socket route | `api/games-socket.js` | Exported HTTP server for Vercel WebSocket upgrades; Redis-backed service |
| Redis service adapter | `server/games/redis-service.mjs` (`RedisGamesService`) | Durable compare-and-set match updates and cross-instance pub/sub |
| Rules dispatcher | `server/games/engine.mjs` | Register six games; create/apply/view API |
| Rules | `server/games/rules/<id>.mjs` | Legal moves, wins/draws, pool physics, hidden-state projection |
| Original assets | `mobile/games-assets/`, `mobile/tools/games-assets.mjs` | Scalable originals, small native covers, synthesized cues |

Each rule module exports `create(settings={})`, `apply(state,player,action,settings={})`, and `view(state,player)`. States are plain JSON; invalid actions throw. The dispatcher exposes `createGame`, `applyAction`, `publicState`, and `games`. A seventh game requires a rule module, dispatcher/catalog entry, native board renderer, artwork, tests, and an intentional verifier/catalog update; the room protocol remains shared.

## Access boundary

The ticket endpoint requires the app's existing website authorization cookie. Native requests send `Origin` matching the API origin, `Content-Type: application/json`, and `X-Asechka-Games: 1`. POST body is `{"actor":"asnat"}` or `{"actor":"youssef"}`. A configured service responds with `{ticket,url,expiresIn:900}`; missing configuration returns 503 with setup guidance. The API signs a short-lived HMAC ticket containing actor, expiry, audience, and a unique ticket ID. The shared secret stays on servers; the native app receives the public WSS address and ticket.

The existing website uses shared-code access and a selectable profile. It does not authenticate Asnat and Youssef independently. A person with shared access may select either identity; room membership and hidden-state filtering enforce the chosen actor, not proof of an individual's identity. Room codes invite another authorized profile and do not replace authentication. Public multi-user deployment requires a separate identity model and room authorization design.

## WebSocket messages

Connect to the URL returned by the API: preferred `wss://EXISTING_SITE/api/games-socket`, or `wss://SELF_HOSTED_HOST/games`. Send `{"type":"auth","ticket":"…"}` first. Tickets last 15 minutes; obtain a fresh ticket on reconnect. Every later command includes a unique stable `id`; native clients use UUIDs. Vercel may also close a socket at its function-duration limit, independently of ticket expiry.

| Command | Fields after `type,id` | Effect |
| --- | --- | --- |
| `list` | — | Discover available lobbies and participant history; current presence |
| `create` | `game, settings` | Create private two-player lobby |
| `join` | `code` | Join a lobby by its code |
| `ready` | `room, ready` (boolean) | Change ready status |
| `start` | `room` | Creator starts when both players are ready |
| `move` | `room, seq, action` | Validate and apply one game action |
| `sync` | `room` | Fetch an authorized current room view |
| `rematch` | `room` | Consent to next round; both players must agree |
| `react` | `room, emoji` | Rate-limited reaction |
| `ping` | — | Application-level round trip |

Server messages are `welcome {actor,rooms,presence}`, `rooms {rooms,presence}`, `room {room}`, `reaction {actor,emoji,room}`, `pong {id}`, `ack {id,seq}`, or `error {id,error,code}`. Creation acknowledgments also contain the new room ID; duplicate receipts may include `duplicate:true`. Do not assume a fixed order between the room event and its acknowledgment.

```json
{"type":"move","id":"a7363a54-2a1f-440e-9704-62dca5c6c680","room":"ROOM_ID","seq":7,"action":{"type":"place","cell":4}}
```

A room has `id`, invitation `code`, `game`, `settings`, `players:[{actor,ready,online}]`, `status` (`lobby|playing|finished`), monotonic `seq`, player-projected `state`, `scores:[0,0]`, `result`, and `updatedAt`. Series metadata includes `round`, `seriesWinner`, and `rematchReady`. Game states include `turn:0|1` and `winner:null|0|1|"draw"`. Check `winner !== null` explicitly: numeric zero is a winning player. Invitations use `asechka://games?code=CODE`.

## Ordering and recovery

The portable service serializes mutations through one queue; the Vercel adapter adds Redis compare-and-set coordination for multiple instances and pub/sub for remote updates. Accepted state must be durably committed before acknowledgment. Move requests carry the last known room sequence; stale moves receive `STALE_STATE` and must synchronize. The service retains a bounded receipt window (4096 commands), keyed by actor and stable command ID plus payload hash. An identical retry returns its earlier acknowledgment; reusing an ID for changed input fails. This is bounded deduplication, not an unlimited historical guarantee.

Save an unacknowledged move with its ID, sequence, and action in native encrypted storage. Following connection loss, fetch a new ticket, reconnect, then list/sync before retrying that same move ID. Never silently create a new move identity for an ambiguous previous send. Authoritative room events reconcile the client display. Connection loss changes online status and does not declare a winner. Inactive rooms expire after 30 days; participation refreshes expiry.

Pool runs deterministic fixed-step simulation on the server and sends sampled shot frames with timestamps in seconds. Native clients interpolate the sampled playback and reconcile to final ball positions; they do not stream rendered frames. Battleship and Hangman responses must pass through `publicState` for the selected player, including history/resume/list events. Unsunk opposing fleets and the guesser's secret word stay out of their views.

## Operational limits

The preferred existing-project deployment uses Vercel's exported HTTP-server WebSocket support and external Redis. Vercel connections are tied to a function instance until they close; reconnects may land on another instance, so durable rooms, presence, and inter-instance events cannot rely on function memory. This hosting behavior and the external-store requirement are described in [Vercel's WebSocket documentation](https://vercel.com/docs/functions/websockets). Use a secure Redis connection with the provider's persistent storage and backup policy; an HTTP-only cache endpoint is not the `REDIS_URL` expected by the Node Redis client.

The JSON fallback is one process with an atomic file store and cannot be horizontally replicated. Use a persistent local volume for `GAMES_DATA_DIR`; two processes must never write the same store. Atomic rename protects file replacement, but is not a transactional database, backup system, or guaranteed power-loss durability mechanism. Both stores contain private full match state, including hidden words and fleets; restrict permissions and backups accordingly.

The transport has bounded messages, an authentication deadline, rate limiting, heartbeat, and slow-consumer handling. Those controls support this two-profile application; internet-facing abuse resistance, load capacity, regional latency, native FPS, and battery use require separate measurements. `games:benchmark` records local WebSocket acknowledgment latency with persistence, not device input-to-photon performance.
