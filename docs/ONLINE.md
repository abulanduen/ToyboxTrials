# Online Hub

Friends (or anyone) can enter the Playroom hub together, see one another (paint, hat, key and
accessories), walk around and use their four equipped gestures (emotes). Trials (minigames) stay
local and single-player: entering a gate or the Pavilion starts the usual practice game, and the
other players see a "playing <game>" tag above you until you're back ("in the Workshop" and "at the
Odds & Ends shop" work the same way).

- **Server:** a small always-on Node server using plain WebSockets (`ws`), hosted on **Railway**.
- **Client:** the same static Vite build as before (Vercel). It connects to `VITE_SERVER_URL`.
  A production build without that variable shows "Online play isn't switched on yet" in the online
  menus. That is what the live Vercel site shows until the steps at the end are done.
- **Login:** optional. Players pick a nickname and join; nobody needs an account to play online
  or offline. An optional account (username and password) saves the player's profile on the same
  server, in a Railway PostgreSQL database (see "Optional accounts" below).

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
| `server/index.ts` | The socket layer only: HTTP `/health`, the accounts API on `/api/*`, WebSocket upgrade on `/`, limits, heartbeats, the 15 Hz timer, logging. |
| `server/accounts/*.ts` | Optional accounts: `api.ts` (handlers), `http.ts` (CORS, body limit), `passwords.ts` (scrypt), `sessions.ts` (tokens), `rateLimit.ts`, `store.ts` (interface + in-memory store), `pgStore.ts` (PostgreSQL). |
| `src/net/accountProtocol.ts` | The accounts API contract shared by client and server: endpoints, request/response shapes, username and password rules, error texts. |
| `src/net/account.ts`, `src/ui/AccountUI.tsx` | Client: sign in, debounced saving, merging; the Account sheet and menu entries. |
| `server/build.mjs` | Bundles the server with esbuild into one file, `server-dist/index.cjs` (ws included). |
| `src/net/client.ts`, `store.ts`, `remotes.ts`, `interp.ts`, `config.ts`, `transport.ts` | Client: connection manager, zustand store (status, room, roster), remote-player objects read by the frame loop, snapshot interpolation, server address, WebSocket transport. |
| `src/character/RemotePlayers.tsx` | Remote toys: `WindupBot` with each player's paint, hat, key and accessories, DOM name tags. |
| `src/game/cosmetics.ts`, `src/game/emotes.ts` | The shared cosmetics catalogue and gesture list. The server validates looks and emotes against them (docs/ECONOMY.md). |
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
- Emotes (gestures): each player plays the four gestures equipped in their profile, on keys 1–4
  or the touch Emote button. The free ones are `wave`, `cheer`, `spin` and `bow`; the shop sells
  `dance`, `laugh`, `sit`, `salute`, `juggle` and `faint`. The server accepts any of these ten
  ids (the shared list in `src/game/emotes.ts`) and at most one per player per 1.5 s. It sends the
  emote to the others at once and shows it in snapshots for about 2 s. Each emote has a small
  synthesised sound.
- **Ownership is not checked by the server.** The Hub doesn't look at accounts (they're
  optional), so it can't know which gestures or cosmetics a player bought. It only accepts ids
  that exist in the shared catalogue (each accessory in its own slot) and replaces anything else
  with the default. A modified client could wear or play items it hasn't unlocked.

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

## Protocol (version 2)

Version 2 (the shop): looks gained the accessory slots `back`, `face` and `neck`; the emote list
grew from 4 to 10 ids; and `shop` became an activity. Clients still on version 1 get the
"refresh the page" message.


JSON objects with a `t` field. Bump `PROTOCOL_VERSION` when a shape changes. The server turns away
other versions with "This copy of the game is out of date. Refresh the page to play online."

Client → server:

| `t` | Fields | Notes |
| --- | --- | --- |
| `hello` | `v`, `name`, `look {paint, hat, keySkin, back, face, neck}`, `join {kind: public \| host \| code, code?}`, `resume?` | First message. The name is sanitised (2–16 printable characters, otherwise "Toy 123"); unknown cosmetics become the defaults. An accessory slot may be omitted (read as `none`). |
| `move` | `x, y, z, yaw, grounded, speed` | About every 66 ms while moving, every 1 s otherwise. |
| `emote` | `id` | One of the ten gesture ids in `src/game/emotes.ts`. |
| `activity` | `a` | A minigame id, `workshop`, `shop`, or null. |
| `look` | `look` | Cosmetics changed (at most twice a second). |
| `leave` | | Leaving on purpose (frees the slot at once). |

Server → client: `welcome` (your id, resume token, room, roster, spawn point, server time),
`joined`, `left`, `room` (host changed), `snap` (`now`, players: `id x y z r s g e es a off`),
`emote`, `look`, and `error` (`code`, `message`, `fatal`). The error codes are
`version_mismatch`, `room_full`, `no_such_room`, `bad_request`, `not_joined`, `replaced`,
`server_full` and `shutting_down`.

## Optional accounts

Owner decision (19 Nov 2026): an optional login with a username and password, so a player's
profile (cogs, owned items, loadout, achievements, paid secrets) follows them across devices and
browsers. **Playing never requires it.** The merge and sync rules are in `docs/ECONOMY.md`; what
is stored and how to delete it is in `docs/PRIVACY.md`.

The API is plain HTTP JSON on the same server and port as the Hub (no framework). The client calls
`VITE_SERVER_URL` with `wss://` swapped for `https://`.

| Method and path | Body | Answer |
| --- | --- | --- |
| `GET /api/status` | | `{ accounts: true \| false }`: the client hides the Account entries when false |
| `POST /api/register` | `{ username, password }` | 201 `{ token, username, rev: 0, profile: null }` |
| `POST /api/login` | `{ username, password }` | 200 `{ token, username, rev, profile }` |
| `POST /api/logout` | (Bearer) | 200 `{ ok: true }`; deletes that session |
| `GET /api/me` | (Bearer) | 200 `{ username, rev, profile, savedAt }` |
| `PUT /api/profile` | (Bearer) `{ rev, profile }` | 200 `{ rev, profile, adjusted }`, or 409 `{ error: 'conflict', rev, profile }` with the server's copy |
| `DELETE /api/account` | (Bearer) `{ password }` | 200 `{ ok: true }`; deletes the user, their sessions and their profile |

Errors are `{ error, message }` with a player-facing message (`src/net/accountProtocol.ts`). The
status is 400 (bad input), 401 (wrong password or not signed in), 409 (name taken, save
conflict), 413 (body too large), 429 (rate limited), 503 (accounts off, or busy) or 500.

**Rules.** Usernames are 3–20 letters, digits or underscore, unique regardless of letter case, and
pass the same word filter as online nicknames (`server/sanitize.ts`). Passwords are 8–128
characters. There is no email, so a forgotten password can't be reset (yet).

**Security choices.**
- **Passwords:** Node's built-in `crypto.scrypt` (no native dependencies), N = 2^15, r = 8, p = 1,
  a random 16-byte salt per user, a 32-byte key; the parameters are stored with each hash so they
  can be raised later. Verification uses `timingSafeEqual`. Text is NFC-normalised first. At most
  four hashes run at once (32 more may wait; beyond that the answer is 503 "busy"), because scrypt
  uses about 32 MB each. A login for a name that doesn't exist still checks a dummy hash, so both
  cases take as long, and both get the same "Wrong username or password."
- **Sessions:** a random 32-byte token, returned once and stored only as its SHA-256 hash. It
  expires 30 days after sign-in. The client sends it as `Authorization: Bearer …`: no cookies,
  because the game (Vercel) and the server (Railway) are different origins, and with no cookies
  there is nothing for cross-site request forgery to ride on. Logout deletes the session. Each user
  keeps at most 10 sessions (signing in again drops the oldest), and an hourly sweep deletes expired
  ones.
- **CORS:** `/api/*` answers browsers only from `ALLOWED_ORIGINS` (the same list as the WebSocket),
  with a preflight answer for `authorization` and `content-type`. Another origin gets 403. A
  request with no `Origin` header (curl, a health probe) is allowed, since only the bearer token
  authorises anything.
- **Limits:** request bodies up to 32 KB (413 beyond). Rate limits are token buckets kept in
  memory (`server/accounts/rateLimit.ts`): every `/api` request 120 per minute per IP; login 20 in a
  burst then 10 a minute per IP; **failed** logins (and failed delete-account passwords) 10 in a
  burst then 1 a minute per username, from any IP; account creation 20 an hour per IP (generous
  for a class on one school network); profile saves 30 a minute per account. Behind Railway's
  proxy the client address is the right-most `X-Forwarded-For` entry, the one the proxy added.
  The per-username limit means someone guessing at an account can also slow its owner's sign-in
  for a few minutes; that is the usual trade-off.
- **SQL:** parameterised queries only (`pg`). Tables are created on start by numbered migrations
  (`schema_migrations`), under an advisory lock.
- **Logs:** counts and events only ("account created", "a save was soft-capped"). Never usernames,
  passwords, tokens, IP addresses or database error details (only the error code).
- **Responses:** `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer`.
- **Profiles:** every save is cleaned by the client's own clean-up (`normalizeProfile`) and wallet
  increases are soft-capped. That stops absurd values, not cheating: see docs/ECONOMY.md.

**Storage.** `server/accounts/store.ts` defines a small interface with two implementations:
PostgreSQL (`pgStore.ts`, when `DATABASE_URL` is set) and in memory (tests, and local development
with `ACCOUNTS_STORE=memory`). Tables: `users` (id, username, lower-cased `username_key` unique,
`password_hash`, `created_at`), `sessions` (`token_hash`, user, created, expires), `profiles` (user,
`rev`, `data` JSONB, `updated_at`) and `schema_migrations`. Deleting a user cascades to their
sessions and profile. If the database can't be reached at start, the Hub still starts, `/health`
says `"accounts":"starting"`, the API answers 503 and the server retries every 5–60 s.

### Add the database on Railway (owner steps)

1. In the Railway project: **+ New** → **Database** → **PostgreSQL**. Railway creates a Postgres
   service with its own `DATABASE_URL`.
2. Open the game server service → **Variables** → **New Variable** → **Add Variable Reference**
   (or type the value `${{Postgres.DATABASE_URL}}`), and pick the Postgres service's
   `DATABASE_URL`. Use the service's real name if it isn't "Postgres". This private URL keeps the
   traffic inside Railway.
3. **Redeploy** the game server (Railway usually offers it after the variable change; otherwise
   **Deployments** → the latest → **Redeploy**). The server creates its tables on start.
4. Check `https://<domain>/health`: it should show `"accounts":"postgres"`. `"starting"` means the
   server can't reach the database yet (check the variable); `"off"` means `DATABASE_URL` isn't
   set. Then open the game: the main menu shows **Sign in** in its top-right corner.

No Vercel change is needed: the game finds the API from `VITE_SERVER_URL`. Postgres on Railway is
billed by usage, on top of the server. To switch accounts off again, remove the variable and
redeploy; the data stays in the database until you delete that service.

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
- `DATABASE_URL`: PostgreSQL for accounts. Without it, accounts are off (the API answers 503 and
  the game hides the Account entries) unless `ACCOUNTS_STORE=memory`, which keeps accounts in
  memory (lost on restart). `npm run server:dev` sets `ACCOUNTS_STORE=memory` for you.
- `ALLOWED_ORIGINS`: comma-separated origins. A `*` matches one host label or a port. The default
  is localhost, 127.0.0.1 and `https://toybox-trials.vercel.app`; setting the variable replaces
  the default.

`GET /health` returns `{ ok, protocol, rooms, players, connected, accounts }`. `accounts` is
`postgres` or `memory` when accounts work, `starting` while the database is being reached, and
`off` without a database.

Checks:

```bash
npm test                                   # includes online-hub and online-protocol
VITE_SERVER_URL=ws://localhost:2567 npx vite build --outDir /tmp/online-dist
npx vite preview --outDir /tmp/online-dist --port 4190 --strictPort &
npm run server:build
BASE_URL=http://localhost:4190/ node tests/e2e/online.cjs   # starts the server itself on 2567 (SERVER_PORT changes it)
# accounts: the client build must point at port 2570
VITE_SERVER_URL=ws://localhost:2570 npx vite build --outDir /tmp/acct-dist
npx vite preview --outDir /tmp/acct-dist --port 4198 --strictPort &
BASE_URL=http://localhost:4198/ node tests/e2e/account.cjs  # starts the server on 2570 (in memory, or ACCOUNT_DATABASE_URL=postgres://…)
TEST_DATABASE_URL=postgres://… npx vitest run tests/unit/accounts-pg.test.ts   # the Postgres store, on a throwaway database
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
- Unlock state and the cog wallet are client-side, so a modified client could wear a cosmetic or
  play a gesture it hasn't bought. Only catalogue ids are accepted. Accounts save the profile but
  don't make it trustworthy: the wallet has only a soft cap (docs/ECONOMY.md).
- Accounts were tested with unit tests (in-memory store and a real PostgreSQL 16 on localhost) and
  the browser test `tests/e2e/account.cjs`. Not tried on Railway's Postgres. No password reset, no
  email, no admin tools; rate-limit state lives in one process's memory and resets on restart.
