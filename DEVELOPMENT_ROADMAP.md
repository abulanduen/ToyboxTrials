# Toybox Trials: development roadmap

Milestones, dependencies and status. The gameplay spec is in [GAME_DESIGN.md](GAME_DESIGN.md), and the rules
for working in this repo are in [CLAUDE.md](CLAUDE.md). Each milestone ends shippable: a deployed web
build, desktop and phone e2e tests passing, and docs updated.

Legend: ✅ done · 🚧 in progress · ⏳ next · 🔒 blocked on a decision or asset

---

## Done

| # | Milestone | Brief stage | Notes |
| --- | --- | --- | --- |
| M1 | Audit & art direction | 1 | Audit, visual guide, concept prompts, asset manifest |
| M2 | Explorable 3D hub prototype | 2 | Tabletop village, contender, movement, camera, collision, room, synthesised audio |
| M2b | Mobile / touch | 2 | Shared action layer, joystick, touch buttons, portrait. A requirement for everything since |
| M3 | Main menu, Workshop, hub polish | 2 | Live-diorama menu, customisation + unlocks, signage, loading, deep links |

## Single-player foundation (no server)

### M4 · Minigame host + tournament framework + Copycat Conductor ✅ (first pass)
Built: the contract, the shared host (lazy load, intro, countdown, pause, results, records), a tournament
controller (Blitz/Normal/Treasure, seeded selection, standings, final podium, history) with bots,
Copycat Conductor (rules core, bots, theatre scene, touch pads), unit tests and e2e tests.
Copycat-only tournaments repeat Copycat until M5–M6 add games. The plan below is kept for reference.
Brief stages 3 and 4 (first game).

1. **Contract:** extend `MinigameDefinition` with the brief's fields: players min/max, duration,
   inputs, bot support, ranked and casual eligibility, scoring method, tie-break and category.
2. **Shared host:**
   - lazy-load a minigame module and dispose of it afterwards
   - intro card with keyboard and touch controls
   - 3-2-1 countdown
   - pause and quit
   - each game reports placements through `host.finish()`
3. **Shared results:**
   - placements → points table, with ties, forfeits and player-count scaling
   - per-game personal records
   - cosmetic rewards
4. **Tournament controller** (Blitz 3 / Normal 5 / Treasure 8, unranked):
   - seeded random game order with no repeats while possible and a category cap
   - next-game reveal and a cumulative scoreboard between rounds
   - final standings
   - local bot opponents fill the field
5. **Copycat Conductor (redesigned):**
   - a pure rules core with a seeded sequence, rising speed, input window, elimination and scoring
   - the theatre scene and four 3D instruments
   - the contender as conductor
   - touch: the instruments are the buttons
   - bots with per-difficulty mistake rates
6. **Hub entry points:** the Copycat gate opens Solo Practice. The Tournament Pavilion opens a tournament picker,
   which runs Copycat-only until more games exist.
7. **Tests:** rules-core unit tests, plus desktop and phone e2e for the full loop.

_Depends on:_ M3. _Unblocks:_ every later minigame.

### M5 · Jack-in-the-Box + Find the Original 🚧
**Jack-in-the-Box** ✅ (first pass; replaces Toybox Trivia, amendment A8) is a hot-potato category game.
Built: an original bank of 26 categories with tiered answers, forgiving answer matching (aliases, plurals, small
typos), a rules core with a hidden fuse, bots that know more of the unusual answers at higher difficulty, the
biscuit-tin arena, and a typing HUD that keeps the answer box clear of phone keyboards. The coral hub gate opens it,
and it joins the tournament rotation. Untuned: fuse range (12–28 s) and bot speeds need real-player testing.
**Find the Original** ✅ (first pass) is a five-round spot-the-real-one race. Built: Baldwyn and his look-alikes
as a trait table (11 possible mistakes in three tiers of subtlety), a seeded rules core (crowds of 6 → 24,
order points plus a speed bonus, wrong-pick penalty and lockout, a "hurry" clock after the first find), bots
with per-difficulty scan speed and slip rates, an instanced crowd with a reference card that stays on screen,
and tap / click / keyboard picking with finger-sized targets in portrait and landscape. It is in the tournament
rotation. Still to do: a hub entrance (for now `__toybox.match.practice('find-the-original')` with `?debug`,
or a tournament), and tuning of timings, points and bot speeds with real players on real phones.
Both are easy to make bots for and work well alone or with bots.
_Depends on:_ M4.

### M6 · Red Light, Green Light + Wind-Up Dash 🚧 (first pass of both)
Built: a shared deterministic **movement core** for minigames (`src/minigames/shared/`: the hub toy's tuning,
circle/box collision, jump, input as data) with a chase camera, a touch joystick + Jump HUD and a race progress
strip. The hub's `PlayerController` is untouched.
**Red Light, Green Light** ✅ (first pass): the Signalman referee, seeded go / tell / stop cycles, a knock-back to
the start for moving on red, bots with reaction noise and over-runs.
**Wind-Up Dash** ✅ (smaller first pass): one straight sprint with dominoes, a spring pad over a block wall, a
ruler across jam, and snap jaws; bots follow lines with noise.
Both are in the tournament rotation. Unit tests cover the core and both rules cores; `tests/e2e/movement.cjs`
plays both on desktop and an emulated phone (landscape and portrait) through the `?debug` hook
`__toybox.match.practice(id)`.
Not done: **hub entrances** (gates) for both games, real-device tuning of every timing, and a longer Dash course
(train track, ramps, moving hazards). No frame rates have been measured.
_Depends on:_ M4.

### M7 · Performance, real devices & polish ⏳
- iPhone Safari, Android Chrome and a low-end laptop
- frame-rate budget, static geometry merging, shadow budget
- audio mix
- accessibility: reduced motion, remapping, colour-blind instrument shapes

Ideas from the latest reference to try: glowing windows, chimney smoke, a denser village, an evening lighting mode.
_Depends on:_ the creative director's device testing. Can run in parallel with M5–M6.

### Parallel track · Room dog 🔒
Waiting on the Meshy/Tripo model (brief: `docs/06-room-dog-asset-brief.md`). Then the play-table
scale change, lazy-loading, and the sniff routine.

## Multiplayer (needs a server)

### M8 · Multiplayer proof of concept 🔒
🔒 **Decision needed:** game-server host. The proposal is Colyseus (TypeScript, authoritative rooms, built-in
matchmaking) on an always-on host (Fly.io, Railway or similar). This has a small monthly cost.
- Two real browsers see each other move in the hub and play **one full Copycat match**.
- The rules cores run on the server, and clients send inputs and render state.
- The client stays a static build on Vercel.

_Depends on:_ M4, and the hosting decision.

### M9 · Casual online: friends rooms & public casual ⏳
- room codes and private rooms
- Custom Party (pick games, number of rounds, bot fill)
- public casual queues per game
- guest nicknames

_Depends on:_ M8.

### M10 · Ranked: one ladder ⏳
- Pick the first format (proposal: Normal). Separate rating, history and leaderboard.
- No bots in ranked.
- Rating system decided (Glicko-2 or a TrueSkill-style system). Placement matches later.

_Depends on:_ M9 and an active player base. Blitz and Treasure ladders follow when queues can sustain them.

### M11 · Social & lobby scale ⏳
- emotes and gestures, cosmetic inspection, parties
- presence with interest management and lobby instances (target of about 50 visible players each, scaling toward 500 per server)

_Depends on:_ M8.

## Remaining minigames (one at a time, each a full milestone)

| Game | Why this position |
| --- | --- |
| Music Box Rhythm | Reuses the ASJK instruments and audio. Needs a music source (A6) and audio-clock judging |
| Inferno Escape | Tile grid + pathfinding. Bots can use the same pathfinding |
| Midnight Hunger | Phase timing + scarcity. Bots need simple target and shelter logic |
| Toy Squad | Deterministic auto-battle. Bots pick from a heuristic shop |
| Blink Duel | Combat, with harder bots (A7) |
| Spellbox Showdown | Combat + build system, the hardest bots. Comes last |

---

## Decisions log

| Date | Decision |
| --- | --- |
| 16 Nov 2026 | Web game. Mobile required for every screen and game |
| 17 Nov 2026 | Base44 version not ported. This repo is canonical, and Copycat is redesigned |
| 17 Nov 2026 | Adopted the master brief (GAME_DESIGN.md) with amendments A1–A7 |
| 17 Nov 2026 | Start with casual and bots. One ranked ladder first, the other two later |
| 17 Nov 2026 | Toybox Trivia replaced by Jack-in-the-Box (hot-potato categories, Puffer Party-style) |
| _pending_ | Game-server host for multiplayer (M8) |
| _pending_ | Rating algorithm, ranked guest access, Base44 competition eligibility |
