# Toybox Trials: roadmap

Source audit: 18 November 2026, starting commit `59744b7`. Status means code exists, not production readiness or a fresh test pass. This is the current summary; `DEVELOPMENT_ROADMAP.md` retains detailed historical milestones and decisions.

## Handoff recovery: newer Claude work exists outside this clone

The owner's Claude Code session, **Toybox Trials visual polish**, contains a saved worktree audit
from 17 November 2026 at 10:51 UTC. Its output reports the following newer work, which is **not
present in this clone or the remote branches fetched during this handoff**:

| Cloud worktree | Saved audit evidence |
| --- | --- |
| `.claude/worktrees/agent-ad9c73b387fffedb1` | Find the Original uncommitted: `src/minigames/findoriginal/`, unit/e2e tests, plus shared integration edits |
| `.claude/worktrees/agent-a3954cb82b71d5499` | `63b697f`: shared movement core + Red Light, Green Light; Wind-Up Dash uncommitted under `src/minigames/winddash/` with tests/integration edits |
| `.claude/worktrees/agent-a2d06c057f2628a2c` | `d9800b1`: WIP sunlit room, baked lighting, furniture and light shafts; further uncommitted room/dog-brief edits |

These are historical tool-output reports, not recovered or validated source. Agents ran again after
that audit, so their final state may differ. At inspection the cloud environment showed **Not connected**,
the account showed a weekly usage limit, and the Files panel required starting the session.
Recover all three worktrees, including untracked files, before recreating these features or merging
them. The completed/next sections below describe only the older local clone.

## Completed first passes

**Spellbox Showdown branch update:** `astra/spellbox-showdown` adds the seventh local playable
game: three-slot drafts, eight distinct spells, projectiles/AoE/pull/mines/shield/repair,
damage-scaled knockback, ring-outs, bots and keyboard/mouse/touch. It uses existing records,
results and local tournaments. Values and tie rules remain provisional in its module README.
Owner revision adds much larger population-based rings, 10-second shrink warnings, a smooth
moving edge, camera scaling and three role-specific choices per spell button. Human playtesting
should check the larger travel distances, camera readability, transition speed and slot grouping.
Visual follow-up adds eight generated ability icons to Spellbox draft/loadout/cooldown buttons
and disables focus blur during all minigames at every graphics tier. Hub focus effects remain.
Audio follow-up replaces Spellbox's repeated bells/cranks with eight short material sounds,
limits overlapping cues and quiets distant opponents; UI clicks and footsteps are softer.
The owner declined the later parallax trial, preserved separately on local `astra/parallax-trial`.
The current direction is 3D town polish guided by `docs/assets/town-concept-v1/HANDOFF.md` and
four reference views. No town geometry was rebuilt as part of the concept pack.
Four games remain absent here: Claude's Find the Original, Red Light/Green Light, Wind-Up Dash
and Music Box Rhythm. Recover/review that work before integration; do not recreate it.

**Blink Duel branch update:** `astra/blink-duel` adds the sixth local playable game: no-cooldown
blinks, one-hit sword eliminations, striped wind-up cones, simultaneous hits, solid living bodies,
bots, keyboard/mouse/touch and local tournament/record integration. See its module README for
provisional range/timing, cancellation and tie rules. At that revision five catalogue games lacked local modules:
Claude's Find the Original, Red Light/Green Light, Wind-Up Dash and Music Box Rhythm work, plus
Spellbox Showdown. Recover/review Claude's work before integration; do not recreate it.

**Toy Squad branch update:** `astra/toy-squad` adds the fifth local playable game, casual-only.
It now has ten rounds, a 62-unit five-rarity shop using the owner’s exact level odds, paid rerolls,
two-copy merges up to three stars, eight reserves, level-based 3–10 board slots, and passive
choices on rounds 3/6/9. The 8×8 drag board retains turning/attack particles and adds hit numbers.
Pathfinding now routes around living toys and resolves contested moves; dead toys never block.
All 62 units now also have individually named passives and automatic mana spells, with AoE/line
damage, buffs/debuffs, healing, shields and 11 formation traits. Unit kits and run-wide passive
choices remain separate. Next: human playtesting of kit combinations, readability and balance;
online/ranked integration remains future work.
Owner UX revision: pairs merge automatically; reserves sit below the player board; hover shows
details; Q sells hovered/selected toys, R rerolls, E readies. Gold rings preview shop recipients.
See `src/minigames/toysquad/README.md` and `CATALOGUE.md` for mechanics and provisional balance.
At that Toy Squad revision, six other local catalogue entries lacked modules, including
work the owner reports Claude is handling separately.

**Midnight branch update:** `astra/midnight-hunger` adds the fourth local playable minigame:
night/day energy rules, N−1 battery targets, shelters, bots, keyboard/touch controls and tournament
integration. Balance/interpretations are in `src/minigames/midnight/README.md`. It is based on the
Inferno branch; merge that work first. At that revision seven catalogue entries remained planned;
Claude's separate work is still described in the handoff section above.

Owner revision: Midnight now has solid player/target collision, pushes with opposite-input
resistance, and three-hit battery claims via Spacebar/Hit. Inferno uses Spacebar to break and R
to build. Details and provisional cooldown/chain rules are in the respective module READMEs.

**Astra branch update:** `astra/inferno-escape` adds a local Inferno Escape module, Pavilion practice
entry via the registry, bots and tournament eligibility. See `src/minigames/inferno/README.md` for
provisional rules and integration notes. Claude retains the three worktrees listed above; recover
and review those separately. This branch has not been merged or deployed.

- **Hub welcome and music (implemented, first pass):** Pipwick, a wind-up tin songbird mascot, gives new players a skippable, replayable camera tour of the Hub (`tourSeen`, store v2); a dressed greeter at each of the 14 gates pitches its trial in a speech bubble; the Jukebox by the Music Box Rhythm gate picks the Hub's track; calm generative background music synthesised in code with per-trial moods (silent in Music Box Rhythm); Music and Voice volume settings. Voice lines are scripted (`src/game/voiceLines.ts`) but not recorded yet (ElevenLabs pending). See `docs/VOICE.md`. How the music sounds has not been judged by ear.
- **M1–M3:** art direction, procedural tabletop/room, wind-up character, third-person exploration, collision, interactions/secrets, synthesised sound, menu, Workshop, settings and local persistence; keyboard/mouse and touch controls.
- **M4:** modular minigame host, intro/countdown/pause/results, local records, bot opponents, seeded Blitz (3), Normal (5), Treasure (8) tournaments, standings/final results and local history.
- **Copycat Conductor:** seeded growing sequences, four ASJK/touch instruments, elimination, solo/bot play and rules tests. Preserve its working functionality.
- **Historical M5 baseline:** Jack-in-the-Box rules, category bank/matching, bots, scene/HUD and tournament inclusion. At that point nine catalogue entries remained unimplemented.

**Hub gates pass:** the playmat is larger (play bounds x −48…46, z −43…33) and every playable
trial has its own building-block gate on a Trials Ring road (data in `src/scene/layout.ts`
`GATES`, accent colour from the registry), with themed, code-built surroundings per game
(`src/scene/gateDecor.ts`) and a fingerpost board per gate district. Interacting at a gate opens
that trial's lobby, which is the shared practice intro card (bots, difficulty, tutorial); online
lobbies are shown as unavailable until the M8 server exists. Dominoes everywhere keep a 1 : 2
face with pips only on the two big faces; the scoreboard frame is built from whole dominoes.
Checks: `tests/unit/hub-layout.test.ts`, `tests/e2e/hubgates.cjs`.

**Online Hub (first part of M8):** a Node `ws` server (`server/`, host: Railway) and the static
client. Players can join a public Hub (24 per instance, overflowing to the next) or a private room
(16 players, 5-character code or `#room=CODE` link) without logging in. They see each other with
name tags, walk around and use four emotes (keys 1–4 or a touch Emote menu). Trials stay local.
Checks: `tests/unit/online-*.test.ts` and `tests/e2e/online.cjs`, which runs against the built
server on localhost. **Not yet deployed:** latency, capacity and real devices are unmeasured.
Owner steps (Railway, then `VITE_SERVER_URL` on Vercel) and limitations: `docs/ONLINE.md`.

**Two tables, a domino bridge, the hub TV and the bedroom (19 November 2026):** the owner asked
for a roomier hub, the trial gates on a second table reached by a domino bridge, the leaderboard
as the spawn hub's centrepiece with a TV beside it, fixed hut roofs, and a believable bedroom with
room for the family dog. This supersedes the single-playmat layout in the "Hub gates pass" above.
- *Spawn table* (play mat x −68…68, z −46…36, was x −48…46, z −43…33): spawn, fountain and the
  secrets are where they were. The Scoreboard is the centrepiece behind the fountain (0, −19)
  facing spawn; the Pavilion moved to the plaza's east side (34, −10); the Workshop (−36, −6) and
  shop (−44, 12) moved west. The Pavilion's tent roof, the shop awning and the Workshop lid/sign
  were misplaced and are fixed.
- *Gates table*: a desk under the window (x −76…130, z −172…−86), 26 cm from the spawn table, with
  all eleven gates round a loop road and a signpost. *Bridge* at x = 24: a deck of 12 dominoes on
  two ruler beams, a domino ramp each end and a ruler rail each side. Where you can walk is a union
  of three rectangles (`src/game/hubBounds.ts`), used by the client and by the online server.
- *TV* beside the Scoreboard: a pixel-type screen cycling who is online, who is in a trial, a
  featured shop item (read from the cosmetics catalogue) and your records; Interact changes channel.
- *Bedroom* (room layer, baked): bed in the right-hand corner with bedside table and lamp, chest of
  drawers, toy chest and beanbag instead of the sofa, slippers, dog bed and bowl. The dog's route
  is data (`DOG_PATH` in `src/scene/room/roomLayout.ts`, 60 cm corridors, unit-tested) and a
  temporary code-built stand-in dog walks it until the generated GLB arrives. Slots for the dog,
  cat (beanbag) and plant GLBs are recorded; no GLB files were added.
- Renderer counts at the spawn view (`?debug` `renderInfo()`, SwiftShader, 1280 × 720; counts
  only, no frame rates): Low 256 → 230 draw calls, 81.5k → 98.5k triangles; Balanced 476 → 412
  calls, 153k → 181k triangles (Balanced includes the shadow pass, whose frustum now covers both
  tables). Felt trees and blocks became instanced to pay for the new content.
- Unverified: real-device performance, touch feel on the bridge on a real phone, how long the
  walk from spawn to the gates feels in play (about 100 cm, ~8–12 s), and the dog stand-in's look
  beyond the screenshots.

**Shop and cog economy (local, with an optional account):** one soft currency, **cogs**, earned by finishing
trials (scaled by placement), tournaments, a first win of the day and Playroom secrets. A 48-item
catalogue (paints, hats, keys, back/face/neck accessories, gestures) with rarities, prices and
unlock sources (starter, shop, secret, achievement). The Odds & Ends shop (hub building, main menu,
pause menu, `#shop`) has try-on, buy and equip, and a daily featured row. The Workshop equips
accessories and the four gestures. Six new gestures have their own animations and synthesised
sounds. A versioned profile replaces the old top-level cosmetics, with a migration that keeps
existing unlocks. Online looks carry accessories, and the server accepts the new gestures
(protocol v2), but ownership is not verified. Details: `docs/ECONOMY.md`. Checks:
`tests/unit/economy.test.ts`, `tests/e2e/shop.cjs`. Prices and rewards have not been playtested.

**Optional account (username and password):** the profile (cogs, items, loadout, achievements,
paid secrets) can be saved to an account on the online server, in a Railway PostgreSQL database,
so it follows the player across devices. Playing never needs it, and it hides when the server has
no database. Account entry in the main menu, Settings and the pause menu; first sign-in merges the
guest toy (items a union, the larger cog balance); debounced saves with conflict merging; a soft cap
on wallet growth (not anti-cheat); delete account. scrypt passwords, hashed bearer sessions, CORS,
rate limits. Tested with unit tests, a real local PostgreSQL 16 and `tests/e2e/account.cjs`; not
yet deployed (the owner adds the Postgres service: `docs/ONLINE.md`). Privacy: `docs/PRIVACY.md`.

**Online lobbies and server-run matches (19 Nov 2026, M8 first pass):** at the Pavilion and every
gate a player chooses practice with bots or hosting an online lobby; the Hub room is alerted and
anyone can join (lock, cap 2–8, kick, bot fill, difficulty, one trial or a Blitz/Normal/Treasure
tournament; host handover; join mid-match to watch and play from the next trial). The server owns
the seed, steps the shared rules cores (60 Hz sub-steps on a 30 Hz timer) with server-side bots,
filters hidden information per player (Jack's fuse, Copycat's undemonstrated notes, Red Light's
timings, seeds, Toy Squad's private shops and battles), decides results, and stores finished
tournaments on a leaderboard (Postgres when configured, else memory; `GET /api/leaderboard`;
Hub Scoreboard and TV). All thirteen trials run online (Odd Page Out and Toy Tower Tumble included). Tested with unit tests and
`tests/e2e/lobby.cjs` on localhost only; latency and capacity are unmeasured. Details: `docs/ONLINE.md`.
Toy Squad is in tournaments again, Normal and Treasure only (owner decision). Trial choosers show
a length chip (short ≤ 4 min, medium ≤ 6, long) and the practice/host pickers are picture-card grids.
Owner decision (20 Nov 2026): Normal and Treasure tournaments end with one strategy finale (Toy
Squad, Toybox Siege or Toy Tower Tumble, seeded) after party trials; Blitz stays party-only. The
pickers fold into Party games and Strategy games sections, and online lobby trials open on the same
intro card (How to play, then Ready) as practice and local tournaments.
Owner requests (21 Nov 2026): a third picker section, Team games (Hoop Clash, never in a tournament:
the group keeps it out); and every basketball shot meter (Hub ball, Hoop Hustle, Hoop Clash) winds
back and forth while held, with a cancel (X, right click outside Hoop Clash, or sliding off the touch
button), from one shared helper (`src/minigames/shared/shotMeter.ts`).

**Walk-in Pavilion and the Tournament Curator (owner request, 24 Nov 2026):** the Pavilion is now a
hollow gift box with an arched doorway facing the fountain. Inside are a rug, a trophy shelf, a
winners' podium (you can hop up), a TOURNAMENTS sign and bunting, and the **Tournament Curator**, a
peg-doll toy in a purple tailcoat and top hat with a prize rosette, who faces the door, watches you,
says hello in a speech bubble and hops when you talk. Talking to them (E or the prompt tap; the
interactable keeps the id `pavilion`) opens the same tournament panel as before. While you are inside,
the lid lifts off and the walls fold down to a low rim, and the camera comes in a little and looks
down into the room (`src/scene/pavilionView.ts`), so it is never trapped behind a wall. Layout and
colliders: `src/scene/layout.ts` (`PAVILION_WALL`, `PAVILION_PROPS`, `CURATOR`); geometry:
`src/scene/pavilionDecor.ts`. Checked with unit tests and `tests/e2e/hubgates.cjs pavilion,pavilionphone`
under software rendering only; no frame rates measured.

## Current milestone and priorities

**Current milestone: integrate and playtest the seven local games; recover Claude's separate work.**
All games previously assigned to Astra now have local modules. Online multiplayer remains future work.

1. Recover and review Claude's games and room pass, including uncommitted/untracked cloud work.
2. Integrate reviewed Astra/Claude branches into main with regression checks for the existing games,
   tournament flow, mobile controls and saved data.
3. Reconcile the separately supplied authoritative specification when available; do not invent it.
4. Human playtesting for Blink/Spellbox combat feel and Toy Squad balance, followed by measured fixes.
5. Real-device performance, mobile usability, audio mix and accessibility; then the online proof of concept.

## Future stages

| Stage | Planned scope / dependency |
| --- | --- |
| M8 | Host chosen (Railway, `ws`). Online Hub, lobbies and server-run matches for all thirteen trials built and tested locally, not yet deployed. Still to do: deploy, measure latency/capacity, prediction for the combat games |
| M9 | Friends rooms/codes, public casual, configurable Custom Party, guest nicknames and bot fill |
| M10 | Ranked ratings, history and leaderboards. Blitz/Normal/Treasure must have independent ratings; older plan stages launch one ladder first as population allows |
| M11 | Emotes, inspection, parties, lobby instancing and interest management; grow toward the unverified 500-player lobby-server goal |
| Remaining local games | Find the Original, Red Light/Green Light, Wind-Up Dash, Music Box Rhythm (Claude's separate work, unverified here) |
| Optional room polish | Room dog pending asset/delivery; denser village, evening lighting and other visual ideas remain proposals |

## Decisions and information still missing

- Separate authoritative conversation/specification, including any changes to the existing 11-game catalogue. Do not reconstruct missing conversation history from guesses.
- Confirm launch sequencing for the three independent ranked modes: older amendment A3 launches one ladder first; the current request specifies three independent modes without deciding release timing.
- Rating algorithm, first ranked format, ranked identity/guest policy, ranked bot policy and disconnect/reconnect rules. The older plan proposes no ranked bots; that is not implemented enforcement.
- Final balance, durations and tie/forfeit policies; Red Light penalty choice; Toy Squad scoring (its ten rounds are owner-confirmed; owner decision 19 Nov 2026: in Normal and Treasure tournaments only, never Blitz; still not ranked).
- Measured server cost and lobby capacity on Railway. Multiplayer proof game remains to be chosen between the existing Copycat scope and Jack's candidacy.
- Music source/licensing, room dog asset, hardware/device validation and any external competition requirements.
- Optional accounts (built): add the Railway Postgres service and redeploy (`docs/ONLINE.md`); publish a privacy policy and decide age requirements; whether usernames ever become public; password recovery (no email is stored).

Guest-friendly casual access remains an established design requirement: the optional account only saves the cosmetic profile. Social systems, persistent online progression and all ranked/online features remain future work. Cosmetics are bought with cogs earned in play; there are no real-money purchases.
