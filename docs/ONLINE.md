# Online Hub

Friends (or anyone) can enter the Playroom hub together, see one another (paint, hat, key and
accessories), walk around and use their four equipped gestures (emotes). Trials can be played two
ways: **practice with bots** (local, as before) or in an **online lobby**, where the server runs
the match (see "Lobbies and online matches" below). Other players see a "playing <game>" tag above
you until you're back ("in the Workshop" and "at the Odds & Ends shop" work the same way).

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
- Messages over 2 KB close the socket. Each connection may send 45 messages a second, in bursts of
  60 (match inputs go out about 30 times a second); persistent flooding closes it. The server pings every 10 s and drops sockets that miss
  three pings in a row (about 30 s; a busy phone can stop reading its socket for a few seconds). A socket that hasn't joined a room within 10 s is closed. The server turns players away
  above 1000 connected (`server_full`).
- Only origins in `ALLOWED_ORIGINS` may connect. Logs contain counts only, never nicknames or IP
  addresses.

## Lobbies and online matches

Anyone in an online Hub room can **host a lobby**: at the Tournament Pavilion (tab "Host an online
lobby", a tournament in the chosen format) or at any trial gate (the intro card's "Host this trial
online"). The other choice in both places is the existing **practice with bots**, unchanged.

- **The alert.** Everyone else in the same Hub room gets a banner, e.g. "Ticker is hosting a Blitz
  tournament · 1/8 · Join", until they dismiss it, join a lobby, or that lobby closes. The HUD's **Lobbies** button (and the Pavilion's online tab)
  lists every open lobby in the room with Join. Anyone can join at any time unless the host has
  locked the lobby or it is at its cap.
- **Host controls** (`server/lobby.ts` checks every one: only the host's are accepted): kick a
  player (they can't rejoin that lobby), player cap 2–8, lock/unlock, bot fill on/off, bot skill,
  and the mode: **one trial** (picked from a card grid of all trials) or a **tournament**
  (Blitz 3, Normal 5, Treasure 8 trials, as locally), then **Start**. When the host leaves, the
  longest-present member becomes host; when the last member leaves, the lobby closes.
- **The lobby screen** lists the members (host, ready, reconnecting) and shows the settings to
  everyone; non-hosts press "I'm ready". At most 8 lobbies per Hub room; a player may host a new
  one at most every 10 s; lobby actions are rate-limited (12 burst, 4 a second per player).
- **Joining mid-match:** the newcomer watches the match live (following a player's view, with
  "Watch next"), and is seated at the **next trial** (a tournament's next trial; for one trial, the
  next start). Their tournament row starts with 0 for the trials they missed. This works for all
  thirteen trials through the same path (no per-game special case).

### How a match runs on the server

- `server/lobbyMatch.ts` runs the phases: reveal (4.5 s) → countdown (3 s) → playing → results
  (9 s) → standings (8 s, tournaments) → … → final table (15 s) → back to the lobby. Everyone
  pressing Continue skips results, standings and the final table.
- **The server owns the seed** and picks the tournament's trials with the same `selectGames` as
  local tournaments, from the format's pool (`poolForFormat`: Toy Squad only in Normal and
  Treasure). Bots (`makeBots`, the same bot policies as practice) fill the empty seats up to the
  cap when the host turned bot fill on; if players leave and a trial would have fewer toys than it
  needs, bots top it up even with bot fill off.
- `server/matchRunner.ts` steps the **same pure rules cores** (`src/minigames/<game>/rules.ts`)
  in fixed **60 Hz sub-steps** (what the rules expect; the local host does the same). The server's
  match timer runs at **30 Hz** (`MATCH_TICK_HZ`), so each tick runs about two rules steps.
- **Inputs:** the browser calls the game's own `readLocalInput` every frame, exactly as in
  practice, and sends the queued inputs to the server about 30 times a second (`in`, at most 32
  per message, under the 2 KB frame limit). The protocol checks their shape (flat objects of plain
  values, no `__proto__`), and `server/games.ts` checks their meaning per game; a player may have at
  most 64 waiting for the next step. They are applied on the next server step (arrival time is the
  timestamp; Music Box Rhythm also carries its own song-time stamp, below). Held-input games
  (Inferno Escape, Midnight Hunger) repeat the latest batch on each step until the next arrives,
  for at most 250 ms of match time; an empty batch lets go.
- **State to clients:** after each tick, every member gets their view of the state: a full
  keyframe at the start of each trial (or after a reconnect), then **patches** (`src/net/delta.ts`:
  only what changed, numbers rounded to 3 decimals). **30 snapshots a second** (Toy Squad, whose
  state is large: 15). Rules events (sounds, animations) travel with them. The browser's match
  host (`src/minigames/remote.ts`, plugged into `session.ts` through `remoteHost`) applies them and
  renders through the game's unchanged `Scene` and `Hud`; between snapshots it runs the state's
  clock `t` on smoothly (at most 120 ms past the newest snapshot, never backwards), which keeps
  animations and the rhythm song clock at frame rate. Positions are not predicted or
  interpolated: moving toys step at 30 Hz (the Racer scenes smooth them; Blink Duel and Spellbox
  show the steps).
- **Results and placements come from the server**; the clients only show them.
- **Disconnects:** a dropped player's seat is kept for 30 s (`RESUME_WINDOW_MS`, the Hub's own
  resume window): the match goes on without their inputs, and on reconnect they get the lobby and
  a fresh keyframe. After 30 s (or on leaving, or a kick) they **forfeit**: last place in that
  trial (marked "forfeit"), out of the rest of the tournament, and not on the leaderboard.
- **Timing-sensitive games:**
  - Music Box Rhythm presses carry the song time the client saw them at (its song clock follows
    the server's state clock). Online, the rules accept a press up to 450 ms older than the server
    clock (`maxInputAgeMs`, 120 ms locally) and call a miss correspondingly later. This hides
    latency but means a modified client could claim good timings within that window.
  - Blink Duel and Spellbox Showdown: inputs act on the next server step after they arrive, so a
    blink or swing lands one network trip (plus up to ~33 ms of input batching) after the press.
    There is no client-side prediction. Not measured on a real network.
- **Spellbox Showdown** runs online through the generic path: its inputs are only shape-checked
  here and validated by its own rules core, so changes to its inputs keep working online. Like
  practice, it skips the 3 s countdown and opens on its draft (`skipStartCountdown`, mirrored in
  `src/minigames/facts.ts`).
- **New trials** join online play by adding an entry to `src/minigames/facts.ts` and
  `server/games.ts` (input validator, hidden-information filter). A trial without them is shown
  as "Not online yet" in the host's picker and is never drawn for an online tournament.

### Hidden information

`server/games.ts` removes secrets from every view before it leaves the server:
- **Jack-in-the-Box:** the fuse. `fuseMs`, `fuseTotalMs` and the pre-rolled `fuses` are replaced
  (clients only learn how long the box has been held this round, which the Scene's tension wobble
  uses and which anyone can count anyway); the category order is not sent.
- **Copycat Conductor:** notes not yet demonstrated are masked; the seed is not sent.
- **Red Light, Green Light:** the pre-rolled light timings (`cycles`) are not sent.
- **Every game with a seed** (Midnight Hunger, Find the Original, Blink Duel, Spellbox, Toy Squad,
  Odd Page Out, Toy Tower Tumble): the seed is not sent (it would predict batteries, crowds,
  shops, matchups and later pictures).
- **Toy Tower Tumble:** each board's random-draw state (`rng`) is not sent (it would tell which
  tower the next Build gives).
- **Blink Duel, Spellbox:** other players' queued inputs (`pending`) are not sent.
- **Toy Squad:** you get your own shop, passive offers and battle; other players' shops and
  offers are blanked and their battles are not sent.
- Inferno Escape, Wind-Up Dash and Music Box Rhythm have nothing hidden (the course and chart are
  what everyone plays). Find the Original's real Baldwyn is not a stored secret: it is whichever
  toy matches the card everyone sees. Likewise Odd Page Out's differences are drawn on the two
  pages everyone sees, so the round's picture data (including its list of differing slots) is
  sent: a modified client could read the answers from it, as it could from the pictures.
- A spectator gets the view of the player they watch.

### Leaderboard

- Every finished online **tournament** is stored per human player: name, format, final place,
  field size, points and date. Single-trial lobby matches are stored too, under the trial's id
  (points = what that place earns in a tournament). Bots and forfeits are not stored.
- **Names:** signed-in players appear by their account **username** (the client links the
  account with an `auth` message holding its session token; the server checks it against the
  accounts store); everyone else by their (sanitised) nickname. Guests with the same nickname share
  a line.
- **Storage:** the accounts PostgreSQL database when `DATABASE_URL` is set (table
  `leaderboard_results`, created by migration 2 of the existing migration list); otherwise in
  memory (lost on restart).
- **API:** `GET /api/leaderboard?board=blitz|normal|treasure|<trial-id>` (also `?format=`), with
  the accounts API's CORS rules, 60 requests a minute per IP. Answers `{ board, entries: [{ name,
  account, played, wins, points, best, last }], recent: [...] }`, ranked by wins, then points.
  There is no endpoint that accepts a result: results only come from matches the server ran.
- **In the game:** the Hub Scoreboard panel shows the top ten per format above your local records
  (which stay on this device), and the TV beside it has a "Leaderboard" channel (Blitz).

## Protocol (version 3)

Version 3 (lobbies): adds the lobby, match and account-link messages below. Version 2 (the shop)
added the accessory slots `back`, `face` and `neck`, ten emote ids and the `shop` activity.
Clients on an older version get the "refresh the page" message.


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
| `lobby` | `a`: `create {settings}`, `join {id}`, `leave`, `kick {id}`, `settings {settings}` (any subset), `ready {ready}`, `start`, `watch {id}`, `timescale {k, hold?}` | Lobby actions. Settings: `mode` (single, tournament), `game`, `format` (blitz, normal, treasure), `cap` 2–8, `locked`, `botFill`, `difficulty`. `timescale` (speed, 0 = frozen; `hold`: freeze on reaching that phase) is only honoured by a test server (`MATCH_DEBUG=1`). |
| `in` | `m` (match sequence), `i` (inputs) | Match inputs as the game's `readLocalInput` produces them; at most 32, each a flat object of plain values. |
| `auth` | `token` | Links a signed-in account (leaderboard name). At most 5 per connection. |

Server → client: `welcome` (your id, resume token, room, roster, spawn point, server time),
`joined`, `left`, `room` (host changed), `snap` (`now`, players: `id x y z r s g e es a off`),
`emote`, `look`, and `error` (`code`, `message`, `fatal`). The error codes are
`version_mismatch`, `room_full`, `no_such_room`, `bad_request`, `not_joined`, `replaced`,
`server_full` and `shutting_down`.

Lobbies (v3): `lobbies` (the room's list, on joining and on every change), `lobbyAlert` (someone
started hosting), `lobby` (your lobby: members, settings, and the running match's phase, field,
tournament table and result; `null` with a reason when you left, were kicked or it closed),
`lobbyErr` (a refused action, with player-facing text), and `ms` (match state: `m` sequence, `k`
1 = keyframe / 0 = patch, `d` data, `e` events, `n` server time).

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
- `MATCH_DEBUG`: `1` lets lobby members speed up, freeze or hold their match at a phase (`timescale`). Test servers only;
  never set it in production.
- `ALLOWED_ORIGINS`: comma-separated origins. A `*` matches one host label or a port. The default
  is localhost, 127.0.0.1 and `https://toybox-trials.vercel.app`; setting the variable replaces
  the default.

`GET /health` returns `{ ok, protocol, rooms, players, connected, lobbies, matches, accounts }`. `accounts` is
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
TEST_DATABASE_URL=postgres://… npx vitest run tests/unit/accounts-pg.test.ts   # the Postgres store (and leaderboard table), on a throwaway database
# lobbies and online matches: the client build must point at port 2572
VITE_SERVER_URL=ws://localhost:2572 npx vite build --outDir /tmp/lobby-dist
setsid nohup npx vite preview --outDir /tmp/lobby-dist --port 4199 --strictPort &
BASE_URL=http://localhost:4199/ node tests/e2e/lobby.cjs   # starts the server on 2572 with MATCH_DEBUG=1
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
- Online lobby matches were tested in this container only (unit tests, and `tests/e2e/lobby.cjs`
  with real browsers against the built server on localhost). **Nothing about real latency,
  jitter, bandwidth or how many matches one server can run has been measured.** The snapshot and
  input rates are design choices, not tuned values.
- Every trial runs headless on the server path with bots in the unit tests
  (`tests/unit/lobby-match.test.ts`). In real browsers, online play was exercised with Copycat
  Conductor (one trial) and Blitz tournaments whose seeds drew Find the Original, Midnight Hunger,
  Wind-Up Dash, Music Box Rhythm, Copycat Conductor and Inferno Escape, with the players idle. The
  other trials' Scenes and Huds have not been watched on server state in a browser yet, and
  nobody has played a trial online by hand.
- No client-side prediction or position interpolation in online matches (see above); no
  matchmaking queues, parties or ranked play (M9/M10). Online matches don't pay cogs or update
  local records yet.
- One process holds every lobby and match in memory: a restart or redeploy ends them.
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
- The client asks `GET /api/status` once on load (retrying twice, 20 s apart). If the server is
  down, the browser logs those failed requests in its console and the Account entries stay hidden.
