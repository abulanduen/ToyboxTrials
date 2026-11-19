# Online Hub

Friends (or anyone) can enter the Playroom hub together, see one another, walk around and use four
emotes. Trials (minigames) stay local and single-player: entering a gate or the Pavilion starts the
usual practice game, and the other players see a "playing <game>" tag above you until you're back.

- **Server:** a small always-on Node server using plain WebSockets (`ws`), hosted on **Railway**.
- **Client:** the same static Vite build as before (Vercel). It connects to `VITE_SERVER_URL`.
  A production build without that variable shows "Online play isn't switched on yet" in the online
  menus. That is what the live Vercel site shows until the steps at the end are done.
- **Login:** none. Players pick a nickname and join.

## Architecture

```
 browser (static Vite build on Vercel)                 Railway
 ┌───────────────────────────────────┐          ┌─────────────────────────────────────┐
 │ UI: Play online sheet, HUD chip,  │          │ server/index.ts  (http + ws)        │
 │     Emote menu, name tags         │   wss    │   origin check, 2 KB limit,         │
 │ net/client.ts: join, resume,      ├──────────┤   rate limit, ping/pong, GET /health│
 │     15 Hz intent, snapshots       │          │ server/hubDirectory.ts (pure)       │
 │ net/transport.ts (WebSocket)      │          │   public instances, private codes   │
 └───────────────────────────────────┘          │ server/hubRoom.ts (pure, per room)  │
                                                │   joins, movement, emotes, snapshots│
                                                └─────────────────────────────────────┘
```

| File | Role |
| --- | --- |
| `src/net/protocol.ts` | The wire protocol, shared by client and server: message types, version, limits, room codes, validation. Pure TypeScript (no DOM, no Node). |
| `server/hubRoom.ts` | **Pure room logic**, one per room: joining, caps, hosts, validated movement, emotes, snapshots, disconnect/resume, closing an empty private room. Deterministic: time and randomness are passed in. |
| `server/hubDirectory.ts` | **Pure directory**: public instance overflow, private room creation with unique codes, joining by code, resume routing, server capacity. |
| `server/sanitize.ts`, `server/limits.ts` | Nickname and cosmetics cleaning; rate limiter and origin allow-list. |
| `server/index.ts` | The socket layer only: HTTP `/health`, WebSocket upgrade on `/`, limits, heartbeats, the 15 Hz timer, logging. |
| `server/build.mjs` | Bundles the server with esbuild into one file, `server-dist/index.cjs` (ws included). |
| `src/net/client.ts`, `store.ts`, `remotes.ts`, `interp.ts`, `config.ts`, `transport.ts` | Client: connection manager, zustand store (status, room, roster), remote-player objects read by the frame loop, snapshot interpolation, server address, WebSocket transport. |
| `src/character/RemotePlayers.tsx` | Remote toys: `WindupBot` with each player's paint/hat/key, DOM name tags. |
| `src/ui/OnlineUI.tsx` | Play online sheet, HUD chip, touch Emote menu. |

### Rooms

- **Public Hub:** instances of 24 players. A public join goes to the lowest-numbered instance
  with space; when all are full, a new instance opens (up to 40). Empty instances are dropped.
- **Private room:** created by **Host private room** under a random 5-character code (alphabet
  without 0/O/1/I/L, never one already in use), 16 players. Friends join with **Join with code**
  or the share link `https://…/#room=CODE`. The creator is the host; if they leave for good, the
  longest-standing player takes over. A private room closes after 60 s with nobody connected.

### Movement, snapshots, emotes

- Clients send movement **intent** about every 66 ms: position, facing, grounded flag and speed.
  The server clamps positions to the hub play bounds (`PLAY_BOUNDS`) and height, rejects
  non-finite numbers, and limits travel with a distance budget. The budget refills at the fastest
  legitimate speed (running with the wind-up boost, 20.3 cm/s) plus 25 %, and banks at most 1 s.
  A move that is too long is clamped along its direction, so speed hacks and teleports only crawl.
  The jump back to the spawn point after an elimination is always allowed. Everything else a
  client sends is validated too: emote ids, activity ids, cosmetic ids and the nickname. The
  server does not run hub physics, so it doesn't check walls or props.
- The server sends every room a snapshot 15 times a second: each player's position, facing,
  speed, grounded flag, emote, activity and connection state. Clients draw remote toys about
  100 ms behind the newest snapshot, blending between the two around that moment. The walk/idle
  animation follows the interpolated speed.
- Emotes: `wave`, `cheer`, `spin`, `bow`, on keys 1–4 or the touch Emote button. The server
  accepts at most one per player per 1.5 s, sends it to the others at once, and shows it in
  snapshots for about 2 s. Each emote has a small synthesised sound.

### Reconnects and limits

- The welcome message carries a secret resume token. If a connection drops, the player's slot is
  held for 30 s, and others see "reconnecting…". The client retries with backoff and gets the
  same room, slot and player id back. The client also treats 6 s without any message as a drop.
- Messages over 2 KB close the socket. Each connection may send 30 messages a second, in bursts of
  40; persistent flooding closes it. The server pings every 10 s and drops sockets that don't
  answer. A socket that hasn't joined a room within 10 s is closed. The server turns players away
  above 1000 connected (`server_full`).
- Only origins in `ALLOWED_ORIGINS` may connect. Logs contain counts only, never nicknames or IP
  addresses.

## Protocol (version 1)

JSON objects with a `t` field. Bump `PROTOCOL_VERSION` when a shape changes. The server turns away
other versions with "This copy of the game is out of date. Refresh the page to play online."

Client → server:

| `t` | Fields | Notes |
| --- | --- | --- |
| `hello` | `v`, `name`, `look {paint, hat, keySkin}`, `join {kind: public \| host \| code, code?}`, `resume?` | First message. The name is sanitised (2–16 printable characters, otherwise "Toy 123"); unknown cosmetics become the defaults. |
| `move` | `x, y, z, yaw, grounded, speed` | About every 66 ms while moving, every 1 s otherwise. |
| `emote` | `id` | `wave`, `cheer`, `spin` or `bow`. |
| `activity` | `a` | A minigame id, `workshop`, or null. |
| `look` | `look` | Cosmetics changed (at most twice a second). |
| `leave` | | Leaving on purpose (frees the slot at once). |

Server → client: `welcome` (your id, resume token, room, roster, spawn point, server time),
`joined`, `left`, `room` (host changed), `snap` (`now`, players: `id x y z r s g e es a off`),
`emote`, `look`, and `error` (`code`, `message`, `fatal`). The error codes are
`version_mismatch`, `room_full`, `no_such_room`, `bad_request`, `not_joined`, `replaced`,
`server_full` and `shutting_down`.

## Run it locally

```bash
npm install
npm run server:dev        # server on ws://localhost:2567, rebuilt and restarted on change
npm run dev               # the game; development builds connect to port 2567 on the same host
```

Open the game in two browser windows. In one, choose **Play online** → **Host private room**.
Join from the other with the code, or open the `#room=CODE` link. To test with a phone on the
same network, open `http://<your-computer's-IP>:5173`. The client then looks for the server on
that IP, so allow that origin:
`ALLOWED_ORIGINS=http://<IP>:5173 npm run server:dev`.

Server environment:
- `PORT`: defaults to 2567; Railway sets it.
- `ALLOWED_ORIGINS`: comma-separated origins. A `*` matches one host label or a port. The default
  is localhost, 127.0.0.1 and `https://toybox-trials.vercel.app`; setting the variable replaces
  the default.

`GET /health` returns `{ ok, protocol, rooms, players, connected }`.

Checks:

```bash
npm test                                   # includes online-hub and online-protocol
VITE_SERVER_URL=ws://localhost:2567 npx vite build --outDir /tmp/online-dist
npx vite preview --outDir /tmp/online-dist --port 4190 --strictPort &
npm run server:build
BASE_URL=http://localhost:4190/ node tests/e2e/online.cjs   # starts the server itself on 2567
```

## Deploy on Railway (owner steps)

`railway.json` in the repository already sets these, but they're listed so you can check them in
the dashboard:
- build command: `npm run server:build`
- start command: `node --enable-source-maps server-dist/index.cjs`
- health check path: `/health`

1. **Create the project.** On [railway.com](https://railway.com): **New Project** → **Deploy
   from GitHub repo** → pick `abulanduen/ToyboxTrials`. Allow Railway access to the repository
   if it asks. Railway creates one service from the repository.
2. **Check the build and start commands.** Open the service → **Settings**.
   - **Build Command:** `npm run server:build`. This typechecks the server and bundles it with
     esbuild.
   - **Start Command:** `node --enable-source-maps server-dist/index.cjs`.
   - **Healthcheck Path:** `/health`.
   - Leave the root directory as the repository root. Don't set `NODE_ENV=production` as a build
     variable: the build needs the dev dependencies (TypeScript and esbuild).
   - The server targets Node 18 or newer, so Railway's default Node is fine.
3. **Set the allowed origins.** In the service → **Variables**, add:
   ```
   ALLOWED_ORIGINS=https://toybox-trials.vercel.app
   ```
   Separate several origins with commas. For example, to also allow Vercel preview deployments:
   `https://toybox-trials.vercel.app,https://toybox-trials-*.vercel.app`. Don't set `PORT`;
   Railway provides it.
4. **Get the public domain.** Go to the service → **Settings** → **Networking** → **Generate
   Domain**. This gives you something like `toybox-hub-production.up.railway.app`. Check it in a
   browser: `https://<domain>/health` should show `{"ok":true,…}`.
5. **Point the game at it.** In the Vercel project → **Settings** → **Environment Variables**,
   add the following for Production (and Preview if you want):
   ```
   VITE_SERVER_URL=wss://<domain>
   ```
   Use `wss://`, not `https://`, and no trailing slash. Then **Redeploy** the latest deployment so
   the build picks the variable up. Vite bakes it in at build time.
6. **Try it.** Open the Vercel site in two browsers (or one normal window and one private
   window). Choose **Play online** → **Host private room** in one, then join with the code in the
   other.

Railway pushes a new server on every commit to the branch it watches. The client and server share
`PROTOCOL_VERSION`; after a protocol change, deploy both, or players on the old page see the
"refresh" message. Railway's always-on service has a monthly cost.

## Not done yet, and not verified

- **Not deployed.** Everything was tested in this container: unit tests, plus the browser test
  against the built server on localhost. The Railway steps above have not been tried here.
- No latency, capacity or real-device measurements. Phones were tested in emulation only, on
  software rendering.
- Minigames are local only. There are no online matches, parties or matchmaking (M8/M9).
- No interest management: everyone in a room receives everyone, and rooms are capped at 24.
- Remote toys are always full `WindupBot`s. The planned fallback to `MiniContender` for distant
  players in a crowded room is not built.
- Remote toys don't collide with the local toy.
- One server process holds all rooms in memory, so a restart or redeploy empties every room.
  Clients then reconnect into a fresh room; private room codes are lost.
- No chat, moderation, reporting or blocking. Nickname filtering is a short word list.
- Unlock state is client-side, so a modified client could wear a cosmetic it hasn't unlocked.
  Only catalogue ids are accepted.
