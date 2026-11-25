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
| `server/voiceRelay.ts`, `src/net/voicePlan.ts`, `src/net/voiceConfig.ts` | Voice chat, the pure parts: mic states and the handshake relay's checks (server), who links to whom and the distance/stereo shaping (client), ICE servers. |
| `src/net/voiceChat.ts`, `src/character/VoiceProximity.tsx`, `src/ui/VoiceUI.tsx` | Voice chat in the browser: microphone, WebRTC links, Web Audio playback; the frame loop that feeds it positions; the mic button, name-tag marks and the pause menu's Voice chat section. |
| `src/game/hubPlay.ts`, `src/game/hubPlaySim.ts`, `src/game/hubSolids.ts` | Hub play (the shared marble, football nets, basketball hoop): where things are, the **pure physics** both sides run, and the hub's solid props as data (generated from the layout). |
| `src/hubplay/runtime.ts`, `src/scene/HubPlay.tsx`, `src/ui/HubPlayHud.tsx` | Hub play in the browser: offline physics or the server's state (interpolated), controls, sounds, celebrations; the 3D objects; the score chip and throw meter. |
| `server/hubChat.ts` | **Pure** per-room text chat and Who Am I? cards: cleaning, rate limits, the word filter, dealing, guessing, per-recipient messages (owned by `hubRoom.ts`). |
| `src/net/chatFilter.ts`, `src/game/whoAmI.ts`, `src/game/whoAmICards.ts` | Shared and pure: chat text cleaning and the word filter; the box's spot, answer matching and anti-spoiler masking; the deck of everyday things. |
| `src/net/chat.ts`, `src/ui/ChatUI.tsx`, `src/character/FaceCard.tsx` | Client: the chat store and message handlers; the chat log, phone sheet, name-tag bubbles and the Who Am I? chip; the paper card drawn on a toy's face. |

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

### Hub play: the shared marble and basketball

Every Hub room has **one marble** and **one basketball** that everyone in it sees and plays with.
The server is the authority: `server/hubRoom.ts` steps the pure, deterministic physics in
`src/game/hubPlaySim.ts` in fixed 1/60 s steps on the room clock (caught up on each 15 Hz
snapshot tick and before applying a kick or a throw), and puts the result in every snapshot. Offline,
the browser runs the very same code with your toy as the only body, so single-player behaves alike.

- **Where:** the marble starts where it always was, on the spawn table (it is still a playroom
  secret). The pitch is the green inside the trials table's loop road: a net at each end, just inside
  the road, with the end arches (Inferno Escape, Spellbox Showdown) behind them across the road, so
  nothing blocks a net's mouth. The hoop stands on the pitch's north edge, east of the Siege fort; the
  ball waits on a chalk ring in front of it. Numbers in `src/game/hubPlay.ts`, re-exported by
  `src/scene/layout.ts`, whose colliders include the nets and the hoop's pole.
- **Physics:** the marble rolls in 2D with felt drag, bounces off the hub's solid props
  (`HUB_SOLIDS`: every collider of `hubColliders()`, as data the server can import; a unit test fails
  if it falls out of step with the layout, `UPDATE_HUB_SOLIDS=1 npx vitest run
  tests/unit/hub-solids.test.ts` regenerates it) and off toys (where the server has them), stays on
  walkable ground, and rolls over the domino bridge (its mouths gently gather a marble rolling at
  them, like a shallow gutter). The ball is 3D: thrown at 60° with a speed from the charged power
  (the client's shared shot meter, `src/minigames/shared/shotMeter.ts`, which winds up and back
  down while Interact is held; X, right click or sliding off the touch button cancels, all in the
  browser: the server only ever sees the `p` of a throw, so the meter needed no protocol change),
  under gravity, bouncing on the table, props, the backboard and the rim; it scores when it drops
  through the rim. Left alone 30 s (or stuck on top of something) it goes back to its spot.
- **Kicks and pushes** (`kick {dx, dz, p}`): Interact kicks at power 1; walking into the marble
  sends pushes (power 0.45, 0.62 running) at most every 200 ms while you press into it. The server
  checks the player is in the hub (not in a trial), within reach of the marble where the **server**
  has them (3.6 cm centre to centre, plus 1.5 cm for move lag), not kicking it backwards through
  themselves, and not kicking again within 120 ms (extras are dropped).
- **The ball** (`ball {a: grab}` / `ball {a: throw, yaw, p}`): `grab` takes the ball one of three
  ways, decided by the server (`grabBall`):
  - **Pick up:** a ball lying still needs to be within 3.2 cm (+1.5) of where the server has you,
    with nobody holding it.
  - **Snatch:** a ball in mid-air (moving, more than 0.4 cm off the floor) needs to be within 3.2 cm
    across and between 1 cm under and 5.4 cm over your feet (a jump adds about 2.4 cm). Anyone can
    catch a throw or a rebound like this.
    - The press is also checked against where the ball was in the last 400 ms (`SNATCH_REWIND_MS`),
      because a player sees the ball 100 ms behind the server plus their press's trip.
  - **Steal:** a held ball can be taken only from a holder who is **dribbling**, meaning the server
    has them moving at 2 cm/s or more on the ground. The thief must be within 2.6 cm (+1.5) of the
    ball, and not within 1.5 s of the ball last changing hands, so it can't ping-pong.
    - Standing still protects the ball.
  - Only the holder can throw, from where the server has them. A holder who disconnects, leaves or
    goes into a trial or the Workshop drops it. At most one ball action per player per 150 ms.
- **Dribbling** is drawn by every client: a holder on the move bounces the ball between hand and
  floor (in front, a little to the side), with a soft bounce sound. The server keeps a held ball at
  the hands; dribbling only matters to it for steals. The prompt reads **Snatch** or **Steal** when
  one is possible.
- **Scoring:** a marble wholly over a goal line scores for the other team (Coral attacks the east
  net, Blue the west), sits in the net 1.6 s, then goes back to the centre spot. Baskets are counted
  for the room; the browser also counts your own this session. The room's score lives as long as
  the room (a server restart resets it).
- **Snapshots** carry `hp` (marble position and velocity, in-net flag, ball position and velocity,
  holder, goals, baskets); **`play`** messages carry the events since the last snapshot (kicks, goals,
  baskets, rim/board/floor bounces, pick-ups, snatches, steals (with `from`), throws, drops; at most 12
  per tick). Older clients drop the snatch and steal kinds and still see the holder change in snapshots. Clients draw the
  marble and ball 100 ms behind the newest snapshot like remote toys, but blend with **cubic Hermite**
  interpolation using the velocities, so a thrown ball follows its arc between 15 Hz snapshots; a
  jump the velocities can't explain (back to the centre after a goal) is drawn as a jump. Events
  play their sounds, confetti and tickets 100 ms late, in step with the drawing.
- **Your own actions** feel immediate: the kick and throw sounds play on the press; a ball you pick
  up is in your hands at once (if the server refuses, it goes back within 0.8 s); your own throw is
  drawn from a local prediction with the same physics until it comes to rest (at most 2.6 s), then
  blends into the server's ball. Kicks are not predicted: the marble starts rolling one network
  trip plus the 100 ms buffer after the press.
- **Test servers only** (`MATCH_DEBUG=1`): `hpdebug {x, z}` puts the marble somewhere (the e2e test
  uses it to stage a goal). Ignored by real servers.
- The toy train does not stop the marble (its position isn't shared between clients).

### Text chat

Online Hub rooms (public and private) have a text chat. Nothing of it exists offline.

- **Server** (`server/hubChat.ts`): relays each message to everyone connected in the room, the
  sender included (the client shows its own line when it comes back). The text is cleaned
  (`cleanChatText`: control, zero-width and bidi characters and private-use characters removed,
  combining marks limited, whitespace collapsed, trimmed, at most **120 characters**), then
  filtered (`filterChat`: an original word list of swear words and slurs, matched per word after
  undoing letter swaps such as "5h1t", repeated letters and spaced-out letters, masked with stars).
  The sender's name comes from the server's roster (the message carries no name). **Rate limit:**
  a burst of 3, then one every 1.5 s per player; a refused message gets a `chatNote` (`slow`),
  shown in the log. (The socket's general limit of 45 messages a second still applies.)
- **Desktop:** the log sits bottom-left above the controls card; lines fade after about 12 s and
  come back while the chat is open. **Enter** or **T** opens the box (Enter keeps interacting
  while an interaction prompt is showing, so it never steals the toy's key), Enter sends, Esc
  closes. Opening lets go of the pointer lock without pausing; sending with Enter asks for it back
  (if the browser refuses, a click takes it back as usual). The game's key handler ignores keys
  typed into a text box (`isTypingTarget` in `src/game/input.ts`), and opening the box clears any
  held key, so the toy never walks while you type.
- **Phones:** a **Chat** button (64 px, above Emote, with an unread count) opens a sheet: the log,
  a **People** list (Mute / Unmute per player), the text box, **Send** and **Close** (all ≥ 56 px).
  The sheet is sized to the visual viewport, so the on-screen keyboard pushes it up instead of
  covering the box.
- **Speech bubbles:** each message also shows for a few seconds above the speaker's toy, inside
  their name tag (plain DOM that the remote-player frame loop already positions).
- **Settings:** "Text chat (online Hub)" off hides the log, the bubbles, the button and the box.
  **Mute** (click a name in the open log on desktop, or People on phones) hides that player's
  messages and bubbles for this session.

### Who Am I? (the suspicious box)

Online, the jack-in-the-box in the Playroom plays **Who Am I?**. Opening it pops the jack (the
first open still finds the secret and pays out as before) and the jack slaps a paper card on your
toy's face, with an everyday thing on it: an animal, a job, a food or an object (172 cards in
`src/game/whoAmICards.ts`). Everyone else can read it, on the card and under your name tag; you
see a blank card with "?" and a chip: "Something's stuck to your face! Ask the others, then guess
in chat." Offline the box springs its old ambush (elimination and rewind) and a ticket says that
Who Am I? needs other players.

- **Server-authoritative.** The client sends `card {a: deal}`; the server checks the player is in
  the Hub (not in a trial, the Workshop or the shop), within 6.4 cm of the box's spot (where the
  server has them), wears no card, and hasn't had one in the last 4 s. It deals a card nobody in
  the room wears and that the player hasn't had in their last 12, with the room's CSPRNG-backed
  random. The holder is told only that a card went on (`card {k: on}` without `w`); everyone else
  gets the word. A player arriving later gets `cards`, built for them.
- **Guessing:** every chat message from a holder is checked against their card first: the name,
  its aliases (`also`), regular plurals, with case, accents, spacing, hyphens, "a/an/the" and
  phrasings such as "am I a …?" or "is it …" ignored. Right: the card comes off, no chat line is
  posted, and everyone (the holder included) gets `card {k: solved, w, ar}`: the log shows
  "Ticker guessed it: a penguin!", confetti bursts over the toy and a paper-flutter sound plays.
  Wrong guesses are posted like any message.
- **Cogs:** a right guess pays 5 cogs (`EARN.whoAmI`), client-side like every other reward, at
  most 3 times in any hour and only for a card worn at least 8 s (`rewardWhoAmI`).
- **Anti-spoiler:** when someone else's message contains a holder's answer (or an alias, a plural,
  a word starting with a long answer, or the answer spelled out letter by letter), that holder's
  copy has it masked ("p******", `m: 1`); everyone else sees the message as written.
- **Peel it off** (`card {a: peel}`) gives up: the answer is revealed to everyone, the holder too.
  The card also falls off, unrevealed to the holder, on leaving the room, going into a trial, the
  Workshop or the shop, or disconnecting. One card per player at a time; opening the box while
  wearing one says so.
- **Privacy:** the holder's own word is never in any message sent to them while the card is on
  (unit test `tests/unit/hub-chat.test.ts`, and the browser test checks every message A received).
### Proximity voice chat (optional)

Players can talk to the toys near them in any Hub room (public or private). It is optional and
Hub-only, and the microphone is never asked for until the player presses the mic button or V.

- **Controls.** The mic button sits at the top right of the Hub HUD while online (desktop: in the
  corner, with a small V key cap in push-to-talk mode; touch: left of the gear button). Settings:
  **Hear voice chat** (on by default), **Voice chat volume** (separate from "Voice volume", which is
  Pipwick's lines; both are multiplied by the master volume) and **Mic mode**:
  - *Push to talk (V)*, the default: hold V (desktop) or hold the mic button (touch, or a mouse)
    to talk. A tap with no hold sends a fraction of a second at most and toggles nothing.
  - *Always on*: the mic button (or V) switches the mic on and off.

  The first press in either mode only asks for the microphone; in push to talk the next hold
  talks. A refused permission shows a ticket explaining how to allow it, and the button stays
  usable to try again. In push to talk the microphone stays open (the browser shows its recording
  indicator) but sends silence until you hold the key; **Turn my mic off** in the pause menu closes it.
  The mic closes by itself on entering a trial, the Workshop or the shop, on the main menu, and
  when the connection drops; it is never on at the start of a session. V goes through the shared
  input layer (`talk`, a Hub-only action like the emotes, so it never reaches a minigame), and is
  ignored while typing in a text box.
- **Who hears whom.** Listening is on by default: anyone whose mic is on can be heard by players
  near them unless those players mute them or switch hearing off. A listener links to a speaker who
  comes within **45 cm** and lets go beyond **60 cm** (hysteresis), keeping the nearest **6**
  speakers; a speaker sends to its nearest **8** listeners (within 60 cm plus 15 cm of slack, since
  the two see each other ~100 ms apart). Up to two new links start every 300 ms; a link that hasn't
  connected in 15 s is given up and retried after 10 s; a speaker who is full answers `bye` and is
  asked again after 6 s. The rules are the pure `src/net/voicePlan.ts` (unit-tested).
- **Links.** Each link is one-way WebRTC audio (Opus where the browser lets us choose), speaker →
  listener, and the listener starts it with a receive-only transceiver, so **hearing needs no
  microphone and no permission**. The speaker answers by putting its one microphone track on the
  link (echo cancellation, noise suppression and auto gain requested). Audio goes directly between
  the two browsers; the server only relays the handshake.
- **Playback.** Each voice goes through Web Audio: an analyser (the speaking ring on that player's
  name tag), a gain that is full up to 12 cm and eases to silence at 60 cm, a stereo pan from the
  direction relative to the camera, then the voice chat bus (master × Voice chat volume, 0 with
  hearing off) into the shared output stage of `src/game/audio.ts`. It respects the audio unlock:
  until the first tap or click there is no sound. These are updated every frame from plain objects,
  never React state. (Chrome only feeds a remote WebRTC stream into Web Audio while a media element
  plays it, so each voice also has a muted `<audio>` element.)
- **Mute.** The pause menu's **Voice chat** section lists the players whose mic is on (nearest first)
  with Mute / Unmute; muting closes that player's link and doesn't ask for it again. Mutes last for
  the session (player ids are per room). Name tags show a mic mark while that player's mic is on,
  a ring that grows with their voice level (measured on your side) and a slash when you muted them.
  Your own level shows on the mic button.
- **Server checks** (`server/voiceRelay.ts`, called by `hubRoom.ts`): a `sig` is relayed only
  between two players **of the same room** (ids are per room, so it can't cross rooms), never to
  yourself, only when both are connected and walking the Hub (not in a trial, the Workshop or the
  shop; a `bye` always passes), an offer only to a player whose mic is on and an answer only from
  one. Each player gets a signalling budget of 80 messages in a burst, refilled at 25 a second;
  mic changes 6 in a burst, 1 a second (a refused change is answered with the real state). Shapes
  and sizes are checked by the protocol: SDP at most 6000 characters and starting `v=0`, at most 8
  candidates per message of at most 512 characters, link ids positive integers. A `sig` frame may
  be up to **8 KB**; every other message keeps the 2 KB limit. The server turns a player's mic off
  when they disconnect or start an activity, and tells the room.
- **ICE servers.** `VITE_ICE_SERVERS` (JSON, the `RTCIceServer` shape, baked in at build time)
  configures STUN/TURN, e.g. `[{"urls":"stun:stun.example.org:3478"},{"urls":"turns:turn.example.org:5349","username":"u","credential":"p"}]`;
  `[]` means none (same network only). The default is one public STUN server
  (`stun:stun.l.google.com:19302`) and **no TURN**. Some networks (strict NATs, many company and
  school networks, some mobile carriers) block direct connections: players there need a TURN relay,
  which has to be run or rented and configured here. TURN credentials in a static build are visible
  to anyone who opens it, so use short-lived or restricted credentials.

**Voice chat privacy and safety.**
- STUN shares each player's public IP address with the STUN provider, and a peer-to-peer link shows
  each player's IP address (public, and on the same network local) to the players they talk to.
  The pause menu says so. A TURN relay would hide it from peers but not from the relay.
- The server never receives audio and logs nothing about voice. Nothing is recorded anywhere.
- No moderation beyond per-player mute and switching hearing off: no reporting, no blocking across
  sessions, no age gate. Anyone in a public Hub can talk to players standing near them.

### The family dog (shared)

The dog that strolls round the room and stands up at the spawn table now and then is the **room's**
dog online: everyone in a room sees it in the same place, and a pet from anyone keeps it at the
table for everyone. Its route and clock are pure (`src/game/dogRoute.ts`): where it is follows from
a few numbers (`DogClock`: the loop offset, the last pet, the held perch's end, the pets this visit)
and the server clock, so the server only steps it when someone pets it, and never per tick.

- **Joining:** `welcome` carries the room's dog (`dog`). The client then runs the dog on the server
  clock (the snapshot clock, or the welcome's `now` until the first snapshot).
- **Petting:** the client sends `dog`; the server checks the petter is on the Hub floor (no
  activity), within 9 cm of the pet spot, and the dog is up and ready (half a second after it
  stands up). If so it tells everyone (`dog` with `k` pet/lick and `by`); the tenth pet in a visit,
  by anyone, is the lick, and only the one who gave it gets the "Slobbery lick!" ticket. A pet that
  doesn't count just sends the petter the current dog. The petter's own heart shows at once.
- **Trials:** during a match the dog sits by the table at its perch time instead of standing up
  (nobody in a trial can pet it anyway). It is the same place and time, so it stays in step.
- **Offline / leaving:** the page takes the dog over from wherever it is (no jump).
- **Tests:** on a test server (`MATCH_DEBUG=1`), `dog` with `at` moves the room's dog to a point in
  its loop (`__toybox.dog.perch()` online); a production server ignores it.

### Rides between the levels

The Hub has two levels: the tables, and the arcade on the room floor under the spawn table
(`src/game/hubBounds.ts`). A toy only goes between them on a ride (`src/game/hubRides.ts`, pure and
shared with the server): the **toy car** off the spawn table's front edge, down the drop, round the
loop and into the arcade, and the **lift** from the arcade back up to the table top. A ride is a
scripted journey: input is locked, and the ride's clock alone says where the toy is.

- **Boarding:** Interact by the car (on the table) or the lift (in the arcade) sends `ride` with the
  ride's kind. The server checks the toy is in the Hub (no activity), on that ride's level, within
  reach of its boarding spot (plus the reach slack), and not riding already, then answers the rider
  (`ride`, `ok`). The client starts the ride on `ok: true`; on `false` it shows "Not just now".
- **On the ride:** the server moves the rider itself from the ride's clock and ignores its moves (the
  client stops sending them). Snapshots carry the rider's ride and how far into it they are (`rd`,
  `rt`), so other players draw them, car or platform included, from the same path (smooth through
  the loop) as far behind as they draw everything else.
- **Landing:** when the ride's time is up the server puts the rider down at its landing spot on the
  other level, with a fresh move budget. A rider who drops the connection lands all the same.
- A ride takes about 4 s (the car) or 7 s (the lift). The toy holds nothing on a ride (a held
  basketball is let go when it boards), and hub play, the dog and Who Am I? ignore riders.

### Reconnects and limits

- The welcome message carries a secret resume token. If a connection drops, the player's slot is
  held for 30 s, and others see "reconnecting…". The client retries with backoff and gets the
  same room, slot and player id back. The client also treats 6 s without any message as a drop.
- Messages over 2 KB are refused (`bad_request`), except voice handshakes (`sig`, up to 8 KB);
  frames over 8 KB close the socket. Each connection may send 45 messages a second, in bursts of
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
  and the mode: **one trial** (picked from three folded sections, Party games, Strategy games and Team games,
  with the pick shown compactly) or a **tournament** (Blitz 3, Normal 5, Treasure 8 trials, as
  locally: Normal and Treasure end with a strategy finale), then **Start**. When the host leaves, the
  longest-present member becomes host; when the last member leaves, the lobby closes.
- **The lobby screen** lists the members (host, ready, reconnecting) and shows the settings to
  everyone; non-hosts press "I'm ready". At most 8 lobbies per Hub room; a player may host a new
  one at most every 10 s; lobby actions are rate-limited (12 burst, 4 a second per player).
- **Joining mid-match:** the newcomer watches the match live (following a player's view, with
  "Watch next"), and is seated at the **next trial** (a tournament's next trial; for one trial, the
  next start). Their tournament row starts with 0 for the trials they missed. This works for all
  thirteen trials through the same path (no per-game special case).

### How a match runs on the server

- `server/lobbyMatch.ts` runs the phases: reveal (the trial's intro card, up to 30 s) → countdown
  (3 s) → playing → results (9 s) → standings (8 s, tournaments) → … → final table (15 s) → back to
  the lobby. The intro card is the same as in practice: the How to play steps (opening by
  themselves when the player's tutorial setting is on), the field, and **Ready**. Everyone seated
  pressing Ready starts the countdown at once; everyone pressing Continue skips results, standings
  and the final table. A `ready` carries the phase it was pressed in, and the server drops one
  whose phase has passed (a late "Next trial" never counts as Ready on the next intro).
- **The server owns the seed** and picks the tournament's trials with the same `selectTournament`
  as local tournaments, from the format's pool (`poolForFormat`): Blitz draws party trials only;
  Normal and Treasure draw party trials, then exactly one strategy trial (Toy Squad, Toybox Siege or
  Toy Tower Tumble) as the finale. Bots (`makeBots`, the same bot policies as practice) fill the empty seats up to the
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
  state is large: 15).
  - A game with a large state can cut what no viewer gets before the copy (`trimForViews` in
    `server/games.ts`). Toybox Siege copies only the boards some viewer is sent whole, their own and
    the one they watch, and sends every dead pool slot as `{ on: false }`.
  - Measured in node, late in a run with 8 toys: a snapshot cost the server 8.1 ms with 1 human
    and 11.9 ms with 4, and now costs 0.8 ms and 2.5 ms. That is why Siege could go from 15 to 30
    snapshots a second. Rules events (sounds, animations) travel with them. The browser's match
  host (`src/minigames/remote.ts`, plugged into `session.ts` through `remoteHost`) applies them and
  renders through the game's unchanged `Scene` and `Hud`; between snapshots it runs the state's
  clock `t` on smoothly (at most 120 ms past the newest snapshot, never backwards), which keeps
  animations and the rhythm song clock at frame rate. Positions are not interpolated: moving toys
  step at 30 Hz (the Racer scenes smooth them; Blink Duel and Spellbox show the steps).
- **Own-toy prediction (Toybox Siege, Hoop Clash, Red Light, Green Light, Wind-Up Dash, Midnight
  Hunger, Inferno Escape):** a game can give its module a `predictLocal`
  (`src/minigames/types.ts`). The client numbers its input messages (`q` on `in`; a predicting game
  sends one every flush, even empty), and the server puts the newest number its rules have stepped
  on that player's snapshots (`a` on `ms`, `GameRun.ackFor`). The client keeps each rendered
  frame's inputs until they are stepped and replays them on the newest server state with the rules'
  own movement (`src/minigames/<game>/predict.ts`), so your
  toy moves the frame after you press instead of a round trip later. A frame's inputs act after
  that frame's time, as on the server. The snapshot also says how long the rules have already run
  on that newest stepped message (`g` on `ms`, `GameRun.ackAgeFor`), and the replay skips that much
  of the unstepped frames' time: without it, slow frames walked the toy past its stop by 2–4 cm
  (measured at 450–650 ms frames) and it snapped back. Only your own toy is predicted (in Hoop Clash also its
  facing and shot meter); in Wind-Up Dash what traps do to a toy (snaps, knocks, bounces, the
  spring) and toppling dominoes are the server's (the toy's own movement is the rules'
  `moveDashToy` against `dashWorld`, shared with them); enemies, the ball, passes, steals, damage, pickups and other toys are the
  server's, and so is being pushed by another toy. A snapshot that shifts the replayed position
  fades in over about 0.1 s (jumps over 4 cm show at once; shared in
  `src/minigames/shared/predictSmooth.ts`). Offline, a key moves the toy over the frame it was
  read in; the strict replay only starts it on the next frame, so the drawn toy (in the games with
  smooth movement) runs on by the newest frame's time on the newest input, at most 50 ms, after the
  smoothing: online then answers on the same frame as offline. (The tile games already hop on the
  frame the key is read.) Both fields are optional: a client or server without
  them behaves as before (no prediction), so no protocol version change. Tested in node through a
  simulated 80 ms each-way link at 60 fps and at 220 ms frames (`tests/unit/*-predict.test.ts`)
  and in a browser through a delay proxy; not yet on a real network.
  - Hoop Clash shots: since the meter is predicted, a let-go carries the charge the meter showed
    (`charge` on the `in` input), and the rules take it if it is at most 250 ms below or 50 ms above
    their own count (`CHARGE_CLAIM`), so the power you saw is the power you get. A modified client
    could choose its power within that window; every player gets the same allowance.
  - Midnight Hunger and Inferno Escape (tile games with held inputs): a held direction turns the
    toy at once and hops it a cell per cooldown; Inferno also predicts breaking the rock ahead.
    Hops into another toy (a push), building, batteries and the furnace stay the server's. The
    server keeps stepping a player's newest input batch until the next arrives (`HELD_INPUT_MS`, now
    in `src/net/protocol.ts`), so the snapshot carries on with that batch: the client passes the
    newest stepped message's inputs to the replay (`held`), on the server's 60 Hz step grid
    (`src/minigames/shared/predictGrid.ts`). When the server took each message in is only known to
    about a tick, so a hop near the moment you let go could go either way. The replay leans late
    (a hop waits one tick past the cooldown, held repeats stop a tick short), and a hop already
    drawn is kept up to 250 ms while a new snapshot moves its moment (`GridSettle`). Without these,
    the toy hopped a cell too far and back. Tested in node through simulated links (10–150 ms each
    way, 17–240 ms frames) and in a browser through an 80 and a 150 ms delay proxy: the toy moves
    5–60 ms after the key (the frame after), against 200–400 ms for the server's cell, with no
    hop taken back. Not yet on a real network.
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
  - Red Light, Green Light: a player sees red one trip and a snapshot late, and their stop reaches
    the rules another trip and an input batch later, about 130–180 ms on a good connection. That is
    more than a reaction-sized grace, so online toys were caught after their players had let go.
    Online the grace is 170 ms longer than practice's 320 ms (`config.graceMs`). A modified client
    could use the extra time; every player gets the same allowance.
  - Blink Duel and Spellbox Showdown: inputs act on the next server step after they arrive, so a
    blink or swing lands one network trip (plus up to ~33 ms of input batching) after the press.
    There is no client-side prediction. Not measured on a real network.
  - Hoop Hustle throws carry the power the player's meter showed and the match time they let go
    (`at`); the rules honour that time up to 250 ms back (`maxLagMs`) and fly the ball the missed
    steps at once, so the gold arc a player saw (the sliding hoop included) is the throw they get.
    A modified client could choose its power; the trial's power assist already makes the perfect
    power easy to hit. Not measured on a real network.
- **Spellbox Showdown** runs online through the generic path: its inputs are only shape-checked
  here and validated by its own rules core, so changes to its inputs keep working online. Like
  practice, it skips the 3 s countdown and opens on its draft (`skipStartCountdown`, mirrored in
  `src/minigames/facts.ts`).
- **Hoop Clash** (team basketball) runs through the same path, in one-trial lobbies only (it is
  the Team games section's trial, `group: 'team'`, and `poolForFormat` keeps team trials out of
  every tournament). Its input is the stick and the held action button, sent every
  frame (`{ type: 'in', ax, ay, run, act }`) and latched by the rules, which see the button's
  presses and releases in order (so a charge lasts as long as the button was held; the shared shot
  meter winds up and back down over it), plus `{ type: 'pass', to? }` and `{ type: 'cancel' }`
  (drop the charge unshot; added 21 Nov 2026 in the game's own validator, no protocol bump: no
  wire message changed shape, but an older server drops the cancel, so redeploy the server with the client). Humans are split evenly between Red and Blue; bots, then AI "filler"
  toys the rules core drives itself, make both teams full; a player who forfeits is handed to the
  same AI so the teams stay even (their seat still forfeits). Toys and the ball are smoothed in the
  Scene between snapshots. Its own Hub-ball core is `src/minigames/shared/courtBall.ts`.
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
- **Hoop Clash:** the seed and the rules' own random stream (`rng`, the filler toys' AI) are not
  sent.
- **Toy Tower Tumble:** each board's random-draw state (`rng`) is not sent (it would tell which
  tower the next Build gives).
- **Blink Duel, Spellbox, Hoop Hustle:** other players' queued inputs (`pending`) are not sent.
- **Hoop Hustle:** the seed (it deals every toy's next spot) is not sent.
- **Toy Squad:** you get your own shop, passive offers and battle; other players' shops and
  offers are blanked and their battles are not sent (except the one board you are viewing, whose
  battle is added).
- **Public on purpose** (what a player has on their board, so the player rail can show anyone's
  whole picture): Toy Squad squads (units on the board and reserves, hence traits), chosen
  passives, level, coins, points, wins and last result; Toy Tower Tumble boards (towers, gold,
  lives, builder level, quests and progress, gifts waiting, score). Unit tests:
  `tests/unit/board-views.test.ts`.
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

## Protocol (version 8)

Version 8 (rides between the levels): adds `ride` both ways, and the snapshot's `rd` and `rt`.
Version 7 (the shared dog): `welcome` carries `dog`, and adds `dog` both ways.
Version 6 (voice chat): adds `mic`, `mics` and `sig`, and allows `sig` frames up to 8 KB.
Version 5 (chat and Who Am I?): adds `chat` (both ways), `chatNote`, `card` (both ways) and `cards`.
Version 4 (hub play): adds `kick`, `ball` and the test-only `hpdebug`, the snapshot's `hp` and the
`play` events. Version 3 (lobbies): adds the lobby, match and account-link messages below. Version 2 (the shop)
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
| `lobby` | `a`: `create {settings}`, `join {id}`, `leave`, `kick {id}`, `settings {settings}` (any subset), `ready {ready, phase?}`, `start`, `watch {id}`, `timescale {k, hold?}` | Lobby actions. Settings: `mode` (single, tournament), `game`, `format` (blitz, normal, treasure), `cap` 2–8, `locked`, `botFill`, `difficulty`. `timescale` (speed, 0 = frozen; `hold`: freeze on reaching that phase) is only honoured by a test server (`MATCH_DEBUG=1`). |
| `in` | `m` (match sequence), `i` (inputs) | Match inputs as the game's `readLocalInput` produces them; at most 32, each a flat object of plain values. |
| `auth` | `token` | Links a signed-in account (leaderboard name). At most 5 per connection. |
| `kick` | `dx, dz` (direction, each within ±2), `p` (power 0–1) | Kick or push the room's marble (v4). Checked for reach and rate (above). |
| `ball` | `a`: `grab`, or `throw {yaw, p}` (yaw within ±10, power 0–1) | Pick up or throw the room's basketball (v4). |
| `hpdebug` | `x, z` | Test servers only (`MATCH_DEBUG=1`): put the marble at (x, z). |
| `chat` | `text` (at most 300 characters as sent) | Say something in the room (v5). Cleaned to at most 120 characters, filtered, rate-limited (3, then 1 per 1.5 s). |
| `card` | `a`: `deal` or `peel` | Who Am I? at the suspicious box (v5): ask for a card, or give up on yours. |
| `dog` | `at?` (test servers only) | Pet the room's dog (v7): checked on the server (in the Hub, by the pet spot, the dog up at the table). |
| `ride` | `k`: `car` \| `lift` | Board a ride between the levels (v8): checked on the server (in the Hub, on its level, by its boarding spot, not riding). |
| `mic` | `on` (boolean) | Voice chat (v6): my mic is on (willing to send) or off. Refused outside the Hub; 6 in a burst, 1 a second. |
| `sig` | `to` (player id), `c` (link id, positive integer chosen by the listener), `s` (1 = sent by the link's speaker side, 0 = listener side), `k`: `offer` (s 0, `d` SDP) / `answer` (s 1, `d` SDP) / `ice` (`d`: 1–8 `{c, m, i}` candidates) / `bye` | WebRTC handshake for one voice link (v6). Relayed only to a connected player in the same room, both in the Hub; offers only to a player whose mic is on, answers only from one. SDP ≤ 6000 characters; up to 8 KB per frame. |

Server → client: `welcome` (your id, resume token, room, roster, spawn point, server time, and
from v7 `dog`: the room's dog `{o, p, e, n, v}`, seconds on the server clock),
`joined`, `left`, `room` (host changed), `snap` (`now`, players: `id x y z r s g e es a off`, from v8
`rd` and `rt` while riding (the ride and seconds into it), and
from v4 `hp`: `m` marble `[x, z, vx, vz]`, `n` in a net, `b` ball `[x, y, z, vx, vy, vz]`, `h` holder,
`s` goals `[Coral, Blue]`, `k` baskets), `play` (`e`: hub play events `{k, by?, net?, score?, total?,
p?, v?}`), `emote`, `look`, and `error` (`code`, `message`, `fatal`). The error codes are
`version_mismatch`, `room_full`, `no_such_room`, `bad_request`, `not_joined`, `replaced`,
`server_full` and `shutting_down`.

Chat and Who Am I? (v5), built per recipient:

| `t` | Fields | Notes |
| --- | --- | --- |
| `chat` | `id` (sender), `name` (from the roster), `text`, `n` (room message number), `m?` | `m: 1` when this copy had the recipient's Who Am I? answer masked. |
| `chatNote` | `code`, `message`, `wait?` | Only to the player concerned: `slow` (rate limit, `wait` ms), `card_busy`, `card_far`, `card_wait`, `card_none`, `card_away`. |
| `card` | `k`: `on` \| `solved` \| `peeled` \| `off`, `id` (holder), `name`, `w?` (word), `ar?` (article) | `on` carries `w` for everyone except the holder; `solved` and `peeled` reveal `w` to everyone; `off` (left, trial, Workshop, shop, disconnect) carries `w` for the others only. |
| `cards` | `c`: `[{id, w?}]` | Who wears a card, sent to a player arriving in a room where someone does; their own entry (none on arrival) would have no `w`. |

Lobbies (v3): `lobbies` (the room's list, on joining and on every change), `lobbyAlert` (someone
started hosting), `lobby` (your lobby: members, settings, and the running match's phase, field,
tournament table and result; `null` with a reason when you left, were kicked or it closed),
`lobbyErr` (a refused action, with player-facing text), and `ms` (match state: `m` sequence, `k`
1 = keyframe / 0 = patch, `d` data, `e` events, `n` server time).

Voice chat (v6): `mic` (`id`, `on`: a player's mic changed; sent to the others, and to the player
only when the server overrode them), `mics` (`on`: the ids whose mic is on, sent right after
`welcome` when there are any), and `sig` (`from`, set by the server, plus `c`, `s`, `k`, `d` as sent).

Rides (v8): `ride` (`k`, `ok`), to the rider only: their boarding was accepted (the ride starts now)
or refused.

The dog (v7): `dog` (`c`: the room's dog `{o, p, e, n, v}`, plus `k` pet/lick and `by` when someone
petted it; to everyone, or to the petter alone when their pet didn't count).

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
BASE_URL=http://localhost:4190/ node tests/e2e/online.cjs   # starts the server itself on 2567 (SERVER_PORT changes it), with MATCH_DEBUG=1 for the hub play goal
# (SKIP_HUBPLAY=1 skips the long marble/basketball part; chat and Who Am I? always run)
# the phone chat sheet and Who Am I? chip: a plain build for BASE_URL plus this online build
BASE_URL=http://localhost:4173/ CHAT_BASE_URL=http://localhost:4190/ CHAT_SERVER_PORT=2567 node tests/e2e/mobile.cjs
ONLY=voice BASE_URL=http://localhost:4190/ node tests/e2e/online.cjs   # just the raw-socket and voice chat checks (fake microphone, two pages)
BASE_URL=http://localhost:4190/ node tests/e2e/mobile.cjs   # with this online build it also checks the phone mic button (starts the server)
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
   `https://toybox-trials.vercel.app,https://toybox-trials-*.vercel.app`. If the game is also
   published on Base44 (`.github/workflows/deploy-base44.yml`), add that app's address too, e.g.
   `https://toybox-trials.vercel.app,https://<name>.base44.app`. Don't set `PORT`; Railway
   provides it.
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
  Wind-Up Dash, Music Box Rhythm, Copycat Conductor, Inferno Escape and Odd Page Out, with the players idle. The
  other trials' Scenes and Huds have not been watched on server state in a browser yet, and
  nobody has played a trial online by hand.
- Client-side prediction only for your own toy, and only in Toybox Siege, Hoop Clash, Red Light,
  Wind-Up Dash, Midnight Hunger and Inferno Escape; no position interpolation in
  online matches (see above); no
  matchmaking queues, parties or ranked play (M9/M10). Online matches don't pay cogs or update
  local records yet.
- One process holds every lobby and match in memory: a restart or redeploy ends them.
- No interest management: everyone in a room receives everyone, and rooms are capped at 24.
- Remote toys are always full `WindupBot`s. The planned fallback to `MiniContender` for distant
  players in a crowded room is not built.
- Remote toys don't collide with the local toy.
- Hub play was tested with unit tests (physics and room logic) and real browsers against the built
  server on localhost only. Kicks are not predicted on the client, so on a real connection the
  marble starts rolling a network trip plus 100 ms after the press; nobody has played it over a real
  network or measured how it feels. Two players kicking the marble in the same instant are applied
  in arrival order.
- One server process holds all rooms in memory, so a restart or redeploy empties every room.
  Clients then reconnect into a fresh room; private room codes are lost.
- Text chat has a short, original word filter (masking, not blocking) and per-player mute for the
  session. There is no reporting, no moderation tools, no blocking across sessions, no chat
  history on the server, and no filtering of other languages or determined spelling tricks.
  Nickname filtering is a short word list.
- Who Am I? and chat were tested with unit tests and real browsers (two desktop pages, and phone
  emulation for the chat sheet) against the built server on localhost. Not verified: a real
  on-screen keyboard (emulated phones have none, so the keyboard-safe layout is checked against the
  visual viewport only), iOS Safari, IME/composition input (Chinese, Japanese, Korean), screen
  readers, and how readable the card is on real phone screens. The anti-spoiler mask catches the
  answer, its aliases, plurals and spelled-out letters, not paraphrases or other languages. The
  cog reward is client-side like all rewards, so a modified client could award itself.
- No text chat, moderation, reporting or blocking. Nickname filtering is a short word list.
- **Voice chat was tested in this container only**: unit tests, and headless Chromium pages on one
  machine with Chromium's fake microphone (a beeping tone) against the built server on localhost,
  where every link connects over local host candidates. **Not verified:** real devices (iOS Safari
  and Android Chrome in particular, including Web Audio playback of WebRTC streams and the
  permission prompts), real networks across NATs (how often STUN alone is enough, and when a TURN
  relay is needed), echo cancellation quality with speakers rather than headphones (whether the
  browser's echo canceller removes voices played through Web Audio varies by platform), audio
  quality and latency, CPU and battery cost on phones with several links, and Firefox or Safari at
  all. No TURN server is configured.
- Unlock state and the cog wallet are client-side, so a modified client could wear a cosmetic or
  play a gesture it hasn't bought. Only catalogue ids are accepted. Accounts save the profile but
  don't make it trustworthy: the wallet has only a soft cap (docs/ECONOMY.md).
- Accounts were tested with unit tests (in-memory store and a real PostgreSQL 16 on localhost) and
  the browser test `tests/e2e/account.cjs`. Not tried on Railway's Postgres. No password reset, no
  email, no admin tools; rate-limit state lives in one process's memory and resets on restart.
- The client asks `GET /api/status` once on load (retrying twice, 20 s apart). If the server is
  down, the browser logs those failed requests in its console and the Account entries stay hidden.
