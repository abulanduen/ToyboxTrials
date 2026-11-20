# Toybox Trials: master game design & multiplayer brief

**Tiny contenders. Big chaos.**
Multiplayer party game · competitive minigame collection · social world · browser.

This is the master product and gameplay specification. It's the creative director's brief
(17 Nov 2026) with the amendments agreed on the same day. Amendments are marked **🔧 Amended**
inline and summarised first. Everything marked _proposal_ is not final.

---

## Current status and source authority (19 November 2026)

This existing specification is preserved pending the owner's separately supplied authoritative
game-design conversation, which has not yet been provided in this chat. Do not invent missing mechanics.
Current owner instructions take precedence over historical amendments: preserve the working Copycat
Conductor implementation. Amendment A1 records the earlier Base44 decision, not permission to rewrite it now.

**Implemented in this branch:** explorable 3D hub, menu, Workshop, local persistence, Copycat
Conductor, Jack-in-the-Box, Inferno Escape, Midnight Hunger, Toy Squad, Blink Duel and Spellbox Showdown, with local
practice/bots. Local unranked Blitz/Normal/Treasure tournaments include all except Toy Squad.
**Not implemented here:** the other four games (Claude's separate work), online
multiplayer, matchmaking, ranked ratings or online leaderboards.
Registry eligibility flags describe intended use, not available online/ranked modes.

The planned ranked modes have three independent ratings: **Blitz (3 rounds), Normal (5 rounds),
Treasure (8 rounds)**. The older A3 amendment proposes a staged launch; launch timing awaits reconciliation
with the separate specification. The catalogue below retains existing rules; proposals and unresolved
choices are not final mechanics. See `AGENTS.md`, `ART_DIRECTION.md`, `TECHNICAL_PLAN.md` and `ROADMAP.md`
for current development instructions and source-audited status. Older milestone reports may be stale.

## 0. Amendments agreed on 17 Nov 2026

| # | Topic | Original brief | Agreed amendment |
| --- | --- | --- | --- |
| A1 | Existing Base44 app | Preserve existing Copycat logic, audit the old repo | **Not ported.** This repo is the canonical game, and **Copycat Conductor is redesigned** (core rules below kept) |
| A2 | Backend | "No backend" (prototype rule) | The client stays a **static web build**. Multiplayer, matchmaking and ranked play need a separate **authoritative real-time game server**. The candidate is Colyseus (TypeScript) on an always-on host. It is chosen at the multiplayer proof-of-concept stage, not before |
| A3 | Ranked ladders | Three ladders (Blitz, Normal, Treasure) from the start | **Start with Casual / Friends / Custom Party with bots.** Launch **one** ranked ladder once real players exist. Add the other two when the population can fill three queues. All three formats exist as tournament *formats* from day one |
| A4 | Base44 hosting | "Potentially Base44" | Base44 (and Vercel) can host the **client only**, not real-time game servers. Whether a competition entry may use externally developed code is still unconfirmed |
| A5 | Find the Original anti-cheat | Prevent players getting the target from frontend data | The client must render the target, so this can only be made **impractical**, not impossible: no target flag in the client data, and identity comes from render parameters. Fine for a party game |
| A6 | Music | All sound is synthesised | Sound effects stay synthesised. **Music Box Rhythm needs real songs**, which may be composed in code, commissioned or licensed and recorded in the asset manifest. Music only |
| A7 | Bots | Bots everywhere | Bots are planned per game, in order of difficulty. Combat bots (Blink Duel, Spellbox) are a substantial job, which is one reason those games come late |
| A8 | Toybox Trivia | Timed multiple-choice quiz | **Replaced by Jack-in-the-Box**, a hot-potato category game in the style of Krillion's Puffer Party, adapted with original content (owner decision, 17 Nov 2026). The shared category and answer bank can later also power a solo "rare answers score more" daily challenge |

---

## 1. Game overview

Players control customisable little wind-up toys living inside an enormous real-world playroom.
A miniature playable world sits on a tabletop, surrounded by oversized household objects and
lifelike scenery. Players move around the tabletop, meet other toys, explore and enter competitions.

It combines:
- a shared explorable social lobby
- short competitive minigames with different mechanics
- randomised tournaments
- casual minigame selection and practice
- multiplayer with friends or other players
- bots when there aren't enough players
- character customisation and progression
- a cohesive miniature toy-world aesthetic

Inspirations (design qualities only, all content original): Club Penguin (social exploration,
customisation), Warcraft III custom maps such as Uther Party (unpredictable minigame tournaments),
Boomerang Fu (readability), It Takes Two (miniature scale).

**Design philosophy:** easy to understand, difficult to master, visually charming, highly replayable.
**It must stay fun with very few players online.**

---

## 2. Game modes

### 2.1 Tournaments (ranked, later)

| Format | Minigames | Ranking |
| --- | --- | --- |
| Blitz | 3 | Independent Blitz rating |
| Normal | 5 | Independent Normal rating |
| Treasure | 8 | Independent Treasure rating |

🔧 **Amended (A3):** these formats are playable unranked from the start (Custom Party and
bot tournaments). Ranked play launches with **one** ladder first. Each ladder, once live, has its own
rating, progression, match history and leaderboard. A Blitz rank must not determine a Normal or
Treasure rank.

**Tournament flow**
1. Enter the shared tabletop lobby.
2. Choose Blitz, Normal or Treasure.
3. Enter the matchmaking queue (or start a bot or Custom Party tournament).
4. A tournament lobby forms when enough players are available.
5. The server randomly selects the required number of minigames.
6. Play each minigame.
7. Award points by placement.
8. Update the cumulative scoreboard between rounds.
9. Show tournament results after the final minigame.
10. Give rewards. In ranked play, update that format's rating.
11. Return to the lobby.

**Randomisation**
- Pick from tournament-eligible games, with no repeats within a tournament while enough distinct games exist.
- The server is authoritative in competitive play. Locally, use a seeded RNG so the same seed gives the same order.
- All players get the same games in the same order. Reveal the next game between rounds.
- Store the sequence and results in match history.
- Avoid over-favouring one category (_proposal:_ at most two games from one category per tournament).
- Each minigame has configurable **ranked** and **casual** eligibility flags.

**Scoring** (_preliminary, configurable_), for 8 players:

| Place | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Points | 10 | 8 | 6 | 5 | 4 | 3 | 2 | 1 |

- Elimination games place players by elimination order (last out = 1st). Score or time games rank by result.
- Ties, disconnections, forfeits and incomplete rounds need consistent rules (see §10, open).
- Rating is a **separate skill system**. Cumulative tournament points are not a permanent rank.
- Ratings should eventually support placement matches, opponent-strength adjustment and seasons.
  Tiers are configurable, not hard-coded.

### 2.2 Casual and practice (never affects ranked ratings)

- **Solo Practice:** play any game alone, with bots where opponents are needed, and restart instantly.
- **Play with Friends:** a private room with a room code, any game, match settings, and bots to fill slots.
- **Public Casual Match:** pick a game and join an open room, with bots if it doesn't fill.
- **Custom Party:** host a private tournament, choosing specific games or random ones, the number of rounds, rules and bot difficulty.

These may award limited ordinary progression rewards (to be balanced later).

---

## 3. The shared tabletop lobby

A miniature toy village on a large tabletop inside a realistic room. It's built from wooden blocks,
felt playmats, cardboard buildings, plastic toys, marbles, dominoes, toy train tracks, miniature signs,
clockwork mechanisms and household objects repurposed as scenery. The huge room supplies the sense of scale.

**Activities:**
- walk with WASD (or touch) and rotate the camera within limits
- see other players, use emotes and inspect their cosmetics
- approach minigame entrances
- queue for tournaments or join casual games
- customise and shop
- view leaderboards
- invite friends into private parties

**Capacity:** _long-term target_ is up to 500 concurrent players per lobby server. The client must
not render or animate all of them:
- proximity-based interest management and distance-based visibility
- lower update rates for distant players
- instanced or simplified avatars
- regional or logical lobby instances
- separate game-session servers for matches

**Match size:** 2–8 players per minigame, configurable per game. Lobby population and match size are separate systems.

**Social (initially):** preset emotes, basic gestures, friend invites and room codes, visible nicknames,
party grouping. No unrestricted public text chat early on.

---

## 4. Minigame catalogue

Every game is an independent module in the shared framework (§5). The original gameplay concepts are
kept while the visuals are adapted to the Toybox Trials universe. Inspirations are named for
mechanics only. Names, art and audio are original.

### 01 · Copycat Conductor (Memory / Reflexes · 1–8)
A mechanical wind-up bandleader demonstrates a sequence on four instruments, each with its own
colour, sound and animation: **A coral drum · S golden bell · J blue xylophone · K green music box**.
- The sequence starts short. Players watch, then reproduce it in order.
- Correct players progress and incorrect players are eliminated.
- Each round plays a brand-new sequence, one action longer than the last (owner decision, 18 Nov 2026: not the previous tune plus a note), and demonstrations get faster.
- The last player standing wins.

**Practice:** solo, scored by rounds survived. **Multiplayer:** every player gets the same sequence and
timing, and input correctness is validated fairly.
🔧 **Amended (A1):** redesigned rather than preserved.

### 02 · Inferno Escape (Survival / Strategy / Sabotage · 2–8)
**Local first pass on `astra/inferno-escape`:** rules, bots, scene and touch/keyboard controls now
exist. This supersedes the earlier two-game status snapshot for this branch only. The nine-game
planned count in that snapshot is now eight. See `src/minigames/inferno/README.md` for explicit
provisional balance and the surviving-player tie/time-limit policy; these are not final design decisions.

- All players start in a shared centre clearing; the rest of the arena interior is rocks. There are about 15 s of preparation before the Inferno appears.
- During preparation, players break rocks to make paths and shelter, and each builds **exactly one** wall.
- Players can break rocks and their own wall, but cannot destroy another player's wall.
- The Inferno follows passages and destroys blocking rocks; built walls take longer to destroy.
  Shelters delay the Inferno rather than stopping it permanently. The last survivor wins.

**Toybox:** a wooden-block and cardboard fortress, with a roaming wind-up furnace or spreading
mechanical hazard. **Tech:** top-down destructible tile grid, no 3D destruction physics, and pathfinding that
updates as tiles change.

### 03 · Midnight Hunger (Survival / Scarcity · 2–8)
**Local first pass on `astra/midnight-hunger`:** rules, bots, scene, energy HUD and keyboard/touch
controls now exist (four local playable games on this branch, seven remaining planned entries).
See `src/minigames/midnight/README.md` for provisional phase/drain balance, one-catch-per-night policy,
shelter layout and time-limit ties. These choices await playtesting and are not final design.

Each contender's energy drains continuously, and play alternates between two phases until one player remains.
- **Night:** about 10 s to catch a target. Only **N−1** targets spawn for N survivors, so at least one player goes without.
  Catching one restores energy.
- **Owner revision:** players collide and can push unresisting toys; holding against the push
  resists it. Battery bots require three hits with Spacebar (touch: Hit), rather than contact
  collection. Damage is shared; the third attacker claims the recharge. See the module README
  for provisional range/cooldown and push-chain details.
- **Day:** "sunlight" drains energy much faster. Players retreat to shelters, which slow the drain but don't stop it.

**Toybox:** nocturnal clockwork toys whose targets are battery-carrying bots, and sunlight overheats them.
**Tech:** deterministic drain maths and server-controlled phase timing, with rates balanced in playtests.

### 04 · Find the Original (Observation / Speed · 1–8) — ✅ built (M5)
- **Baldwyn** is an original wind-up tin gentleman built from a different combination of toy parts every match
  (seeded): body shape and paint, belt, buttons, head, eyes, nose, moustache, hat and its band and tilt, key
  style and side, neckwear, eyewear and something held in a mitt. **Not-Baldwyns** are that match's Baldwyn with
  one to three parts swapped, from obvious (body, paint, hat) through medium (belt, nose, key side, bow tie) to
  subtle (a button more or less, hat tipped the other way, one eye shut). See `src/minigames/findoriginal/README.md`.
- **Five rounds.** Each opens with a reference card ("This is Baldwyn"), which then stays in the corner of the
  screen. Crowds grow 6 → 12 → 15 → 20 → 24. Mistakes go from two or three obvious ones to a single subtle one,
  and from round 3 the crowd shuffles and turns on the spot.
- Players tap or click the toy they think is Baldwyn (keyboard: move a ring with the arrows, pick with Enter).
- **Scoring:** a correct pick scores by finishing order (100 / 70 / 50 / 40 / 30 / 20 / 10) plus a speed bonus
  of up to 50. Picks in the same server step tie. A **wrong pick costs 15 points** (never below zero) and winds
  you down for 1.5 s, longer for each further mistake that round. A decoy can't be picked twice.
- Once the first toy finds him, the rest have 7 s ("hurry"). The round ends when all but one have found him,
  so the last player scores nothing, or after 20 s. Nobody is shown where he was until the round ends.
- Placement is by total points. Ties go to the faster total correct-pick time, then share the place.
- **Bots** scan the crowd: time grows with crowd size and how subtle the round is, and weaker bots sometimes
  pick the most convincing fake first or run out of time on the last rounds.

**Tech:** the rules core generates each round's crowd from the match seed, and every toy's position is a pure
function of the state, so all clients agree without sending positions. Portrait screens show the same grid
turned on its side. The crowd is instanced (one draw call per body part). Picking is in screen space with
finger-sized targets. All values above are first-pass and untuned with real players.
🔧 **Amended (A5):** client-side anti-cheat is "impractical, not impossible". There is no target flag in the
match state: a toy is Baldwyn only because its look equals that match's Baldwyn.

### 05 · Red Light, Green Light (Reflexes / Movement · 2–8)
- A giant mechanical referee alternates green (move) and red (stop) on a toy-soldier runway.
- Moving on red is eliminated or penalised (configurable until finalised).
- First to the finish wins. Others are placed by finish order or progress.

**Tech:** clear transition cues and fair latency handling.

**Built (first pass, M6):** a 106 cm felt runway along the long side of the table, with the **Signalman** (an
original clockwork referee on a turntable) at the far end.
- Cycle: **go** (1.3–2.7 s, with an occasional 0.75–1.15 s "snap" go, never twice running and never first) →
  **tell** (0.6–0.9 s: its key ratchets, the lamps flicker amber and it swings round) → **stop** (1.7–2.9 s).
  The whole schedule is rolled from the match seed, so timing never depends on inputs.
- 140 ms after the lamps turn red, any toy moving faster than 1 cm/s is caught. **Decision: a knock-back, not
  elimination.** The toy is flicked back to the start line and held until the next green, so everyone keeps
  playing. A partial knock-back (24 cm) was tried first, but then never stopping still finished the race.
- The signal is shown four ways: the Signalman's facing and paddles, its beacon, lamps along both kerbs, and the
  HUD word (GO! / It's turning… / STOP!), plus a different sound for each. It never relies on colour alone.
- First across the line wins. Once somebody finishes, the rest have 15 s. The clock is 90 s. Placement is finish
  time, then distance. Score: finishers get 100 + seconds left on the clock, others get the percentage covered.
- Toys don't collide with each other, so nobody can be shoved into a penalty.
- **Bots:** start delay, reaction time to the tell and an over-run chance per stop (easy 14%, normal 6%, hard 2%).
- **Untuned:** all the timings above, the grace, and how harsh a full reset feels. They need real players.

### 06 · Blink Duel (PvP / Precision / Mind games · 2–8)
- Teleport (blink) with **no cooldown**. One successful hit eliminates.
- Attacks have a **long, clearly telegraphed** wind-up, so players bait and blink out.
- The last survivor wins.

**Toybox:** wind-up ninja toys with oversized toy swords, and blinks shown as a spring-pop burst.
**Tech:** server-authoritative hits, with blink destinations validated inside the arena.
**Implemented local first pass on `astra/blink-duel`:** seeded 2–8 player rules, bots, sword
telegraphs, keyboard/mouse and touch, records and local tournament integration. Space blinks;
J/left-click swings; WASD/arrows move; mouse/tap aims. Blink cancels wind-up and may cross toys,
but its endpoint must be free and inside the arena. Simultaneous hits resolve together.
Wind-up/recovery/range, the 90-second limit and tie policy are provisional; see
`src/minigames/blink/README.md`. Online authority and real PvP remain future work.

### 07 · Wind-Up Dash (Racing / Obstacles · 2–8)
- A narrow course of tight passages, moving hazards, timing obstacles, and traps that slow, stun or reset.
- First to finish wins. Others are placed by time or progress.

**Toybox:** a course built from train track, dominoes, ramps, springs and mechanical traps.
**Tech:** simple collision, deterministic obstacle patterns, a clear camera and readable boundaries.

**Built (M6, generated courses):** every match deals its own course from the match seed, so the same seed
gives every client (and a future game server) the same course and no two races are alike. The generator is
pure TypeScript (`src/minigames/winddash/course.ts`); the rules core, the bots and the Scene all read its output.
- **Road:** one felt strip, 92–122 cm long, whose width (17–23 cm) and centre line change from trap to trap,
  joined by gentle bends. Seeded tabletop clutter (blocks, buttons, cotton reels, pencils, felt trees) lines it
  and never affects play.
- **Traps:** four or five per course out of ten, never the same kind twice, each at level 1–3 from a fixed
  budget (never all hard, never level 3 first, two timing traps never back to back).
  1. **Domino rows:** rows block the road except for gaps; a domino you walk into topples (about 0.3 s lost)
     and stays down, so leaders clear a path.
  2. **Spring pad:** a block wall with one narrow gate; the pad on the other side throws a toy 15 cm over it.
  3. **Sticky jam:** top speed drops to 38%; a ruler (two in a dog-leg at level 3) crosses it at full speed.
  4. **Snap jaws:** rows of two jaws that rattle for 0.55 s then shut for 0.75 s. A toy inside is stunned for
     1.1 s and spat out; one jaw of each pair is always open.
  5. **Crayon gates:** a fence with three doorways whose crayon barriers lift in turn; a shut gate just blocks.
  6. **Marble run:** marbles roll across in lanes. One bowls a toy back and dazes it; a hop clears them.
  7. **Pendulum:** a bead on a long string sweeps the road and knocks toys back.
  8. **Spinning tops:** wandering tops that bounce a toy away on touch; they never block.
  9. **Tape-measure belts:** three lanes of conveyor, one forwards and the rest backwards (or still); the quick
     lane moves between stretches.
  10. **Book steps:** books lie across the road. Hop up (1.5 cm, then 1.2 cm more), or use the ramp at the side.
- First across the line wins. Once somebody finishes, the rest have 15 s. The clock is 75 s. Placement is finish
  time, then distance. Score: finishers get 100 + seconds left on the clock, others get the percentage covered.
- Toys don't collide with each other. Train track and laps are not built.
- **Bots** read the course data: they pick a line through the next trap with sideways noise and time whatever
  moves. Easy bots barge, queue for ramps and walk into things; hard bots hold a clean line and wait properly.
- **Checked by unit tests, not by people:** 300 seeds give valid courses and bots of every difficulty finish
  240 of them (headless bot runs take about 10–21 s). **Untuned:** trap spacing and timing, level budget, how
  each trap feels to a human, and whether a race this short wants laps.

### 08 · Music Box Rhythm (Rhythm / Timing · 1–8)
- A four-lane rhythm game on **A S J K**, with Perfect, Good and Miss judgements.
- Includes combo multiplier, accuracy percentage, increasing complexity and multiple tracks. Ranked by score.

**Toybox:** a stage inside a giant mechanical music box, with notes as toy pieces.
**Tech:** judge input against the **audio clock**, provide latency calibration, and use original or licensed music.
🔧 **Amended (A6):** music is exempt from the "synthesised only" rule.

✅ **Built (first pass, `src/minigames/rhythm/`):**
- **Stage:** notes are coloured pins on a turning cylinder. Each pin rides over the top and meets a bright strike
  line, in front of the steel comb, as its note sounds. Beat and bar lines are drawn on the cylinder. The band
  (all contestants) stands on a shelf behind and hops on its hits.
- **Tracks:** three original tunes composed in code (recorded in the asset manifest): *Tin Waltz* (easy, 3/4,
  112 bpm), *Clockwork Parade* (medium, 124 bpm) and *Spring-Loaded* (hard, 150 bpm), each about 65–70 s. Practice
  picks the track on the intro card; a tournament draws it from the match seed.
- **Charts follow the tune:** every pin is a melody note. The lane follows the melody's contour (up = right, a leap
  = two lanes). Sections get denser: on-beat notes only, then every note, then a second pin on each downbeat.
- **Judging:** Perfect ±45 ms (100), Good ±100 ms (50), otherwise a Miss. A tap with no pin in reach is a stray.
  Misses and strays reset the combo. Multiplier ×2 / ×3 / ×4 from combo 10 / 20 / 30. Accuracy = (Perfect + ½ Good)
  ÷ notes. Ranked by score, then accuracy, then longest combo. No hold notes yet.
- **Timing:** the host's match clock stays the authority (so pause and the test time-scale work). Presses carry a
  high-resolution timestamp from the shared input layer and are converted to song time, so judging is not rounded
  to the 60 Hz step. Music is scheduled ahead on the audio clock, anchored to the match clock and re-anchored if
  they drift apart by more than 30 ms. With no audio the game plays silently.
- **Calibration:** a timing offset (−150…+250 ms, saved with the settings) on the intro card, set by ± buttons or
  a tap-along test.
- **Bots** play every note with a normally distributed timing error, and skip or fumble some (by difficulty).
- **Not verified:** the music has never been heard and latency has never been measured on real devices; the
  windows, the default offset (0 ms) and the bot tuning all need real-player testing. Music has no volume slider
  of its own yet (it follows the master volume).

### 09 · Toy Squad (Strategy / Auto-battler · 1–8)
**Implemented on `astra/toy-squad`, revised by the owner:** ten rounds, an 8×8 battlefield,
automatic two-copy merges up to three stars, a five-slot weighted shop with paid rerolls, reserves,
level-based deployment caps, and passive choices on rounds 3/6/9. The roster has 62 units:
16 Common, 14 Uncommon, 13 Rare, 12 Epic, 7 Legendary. Level 1 starts with three deployed slots;
each round increases level and cap by one, up to level 10 and ten deployed toys. Exact shop odds,
the roster, passives and provisional balance are in `src/minigames/toysquad/README.md` and
`src/minigames/toysquad/CATALOGUE.md`. Auto-combat, bots, dragging, particles and damage numbers
are local; online play and ranked eligibility remain future work. Casual-only for now.
Every unit also has its own named passive and automatic mana spell. Area/line damage, healing,
shields, buffs, marks, poison, stun, silence and cleansing enable mixed formations. Two/four distinct
deployed kinds activate matching-trait bonuses; duplicates and reserves do not count. These kits
are separate from the run-wide choices on rounds 3/6/9. Exact kits, 11 traits and provisional
balance rules are recorded in the module catalogue and README.
Reserves occupy eight slots below the player board. Hover reveals kits; gold highlights show
shop upgrade recipients. Q sells the hovered/selected toy, R rerolls and E readies, with touch
buttons and tap selection retained. Matching purchases merge immediately and can chain upgrades.

A short, simple auto-battler. Each round, players:
1. get some currency
2. buy units from a small shop
3. position them
4. optionally upgrade or combine them
5. watch the auto-battle and get results

**Toybox:** soldiers, wind-up animals, robots and plastic creatures on a tabletop strategy board.
**Tech:** deterministic combat with pathfinding around living units; dead units never block. Ten
rounds are confirmed. Current scoring (wins 3, draws 1; surviving health breaks ties) and unit
balance remain provisional pending playtesting.

### 10 · Spellbox Showdown (Arena / Builds / Knockback · 2–8)
- Players pick spells to form a build, each with its own effects and cooldowns.
- **Damage increases knockback**, and the goal is to push opponents out of the ring. Positioning is everything.
- The last player in the ring wins.

**Toybox:** toy mages in a plastic-and-wood ring, with spells as toy explosions, springs, bubbles and fireworks.
**Tech:** planar arena physics, authoritative damage and knockback, and a small spell roster to start.
**Implemented local first pass on `astra/spellbox-showdown`:** an untimed three-slot draft from eight
spells (a 3-second countdown starts once everyone has locked in), seeded bots, projectiles, AoE/cone blasts, pull, mines, ward and damage repair. Q/E/R cast;
mouse/tap aims; WASD/arrows or touch pads move. Damage increases knockback, and crossing the
circular edge eliminates. Records, local tournaments and both mobile orientations use the shared
host. Spell values, countdown length, momentum, hitstun and tie policies are provisional; exact data
is in `src/minigames/spellbox/README.md`. Online authority and real PvP are not implemented.
Owner revision: Q/E/R each offer three choices instead of the full roster. Arena size follows
2 / 3 / 4–5 / 6–7 / 8 living-player bands, then contracts after a visible 10-second warning as
players are eliminated. Default radii are 15/21/27/33/39 cm, with a 3-second transition; exact
sizes and transition speed remain provisional. The marked edge, physics and camera agree.

### 11 · Jack-in-the-Box (Knowledge / Nerve · 2–8) — 🔧 Amended (A8), replaces Toybox Trivia
A hot-potato category game. The contenders sit in a ring around a cranking jack-in-the-box.
- Each round reveals a category ("Name a fruit"). Whoever holds the box must **type a valid answer
  that hasn't been used yet this round**, and a correct answer passes the box to the next player.
- Wrong or repeated answers are rejected, and the crank keeps turning while you try again.
- The box has a **hidden fuse** (about 12–28 s, rolled from the match seed). It ticks and rattles harder the longer
  a round runs. That is based on time elapsed, not time left, so it builds tension without giving the fuse away.
  Whoever holds it when it springs is knocked out.
- A new category starts each round, beginning with the next player. The last toy standing wins.
- Placement is by elimination order. The score is valid answers given.

**Matching:** case, accents, "a/the", simple plurals and small typos are forgiven. Aliases cover spelling
variants (grey/gray). Answer lists are curated per category with common, uncommon and rare tiers.
**Bots** know only the tiers that suit their difficulty, so they "blank" as the easy answers run out.
**Tech:** turn-based and latency-tolerant, so it's a strong candidate for the first online game (M8). Server-side
validation is needed in competitive play. Mechanic inspiration: Krillion's Puffer Party and classic
hot-potato word games. Content and theme are original.

### 12 · Odd Page Out (Observation / Speed · 1–8) — first pass built
The owner's "spot the difference" game. A picture book lies open on the table with the same storybook
scene on both pages, except for 15 differences. See `src/minigames/spotdiff/README.md`.
- **Scenes:** four code-drawn scenes (The Toy Shop, The Garden Picnic, Pirate Bath-Time, Bedtime), each with
  exactly **60 variable slots** of 2–4 variants: colour, pattern, swapped shape, count, a feature on or off,
  rotation, a nudge, size, or missing altogether.
- **Each round (seeded):** a new scene (no repeats in a match); the **reference page** gives every one of the 60
  slots a random variant, so even the original is different each time; **15 of the 60** slots, spread over the
  page, get a different variant on the second page. Everything else is identical on both pages.
- Players tap or click either page (keyboard: arrows move a ring between the scene's things, Enter circles).
  A find is ringed on both pages. A **wrong tap** shows a red X, buzzes and locks you out for **1 s**.
- **Scoring:** 10 per difference. Finding all 15 adds a bonus by finishing order (**60 / 40 / 30 / 20**) plus up to
  **40** for time left, so the first to find everything scores the most. Finishing in the same server step ties.
- **Rounds:** four pages of **30 s** each (a page ends early once everyone has found all 15), about 2–2.5 minutes.
  Everyone has the same pictures; each player's finds are their own. A mini leaderboard shows everyone's count.
- Placement is by total points, then differences found, then quicker finds; ties share the place.
- **Bots** find a difference every ~3 s (easy), ~2 s (normal) or ~1.4 s (hard), with occasional wrong taps.

**Tech:** pictures are SVG drawn from data (prop library + scene backdrops), so hit areas are exact circles in
picture units and the two pages provably differ in exactly the 15 slots (unit-tested). Generated raster art is not
used for anything you can tap. All values above are first-pass and untuned with real players.

### 13 · Toy Tower Tumble (Strategy / Tower defence · 1–8)
**Implemented (owner brief, 19 Nov 2026):** a 5–10 minute random-merge tower defence. Every player
defends their own 8×8 board (23-square winding path, 41 felt squares) against **20 shared waves**:
walkers, armoured beetles, fast racers, marble swarms, flying paper gliders, and **bosses on waves
5, 10, 15 and 20**.
- **Build** pays 20 gold for a *random* tower, usually tier 1. Tier 1 has five toy lines with one
  role each: tin soldiers (single target), paper & craft (splash), clockwork (chain), rubber &
  string (slow) and plush (support aura).
- **Any two towers of the same tier merge into a random tower one tier up**, to **tier 7** (the cap). Press **M** to merge an available pair without selecting a tower; the destination is automatic. Higher
  tiers add Toy Squad's status vocabulary: fury, burn, pierce, multishot, shred, stun, mark, execute.
- **Builder levels** 1–6 shift the build odds towards tiers 2–3 and add a lucky-merge chance (a
  merge jumps two tiers, never past tier 5). The odds table is in the HUD.
- **Quick quests:** all five tier-1 towers; three of one tier-2 tower; three each of a seed-picked
  tier-1, tier-2 and tier-3 tower; five clean waves; a tier-3+ tower of every family; and the
  lobby-wide **first to own a tier 6**.
- **Boss rewards:** a free random tier-4 (wave 5), tier-5 (wave 10), tier-5 plus a builder level
  (wave 15), and a 500-point bounty (wave 20).
- Leaks cost lives (20 to start). At 0 a player is knocked out and can watch the other boards;
  once every human is out, the remaining bot boards can be fast-forwarded ×2 or ×4.
- Placement: waves survived, then lives, then damage score. Clearing wave 20 wins.

**Toybox:** a felt board in a wooden tray, a cardboard path over an open-book bridge, a toy box the
enemies climb out of and a toy chest they fall into. Towers reuse Toy Squad's toy models.
**Tech:** pure seeded, serialisable rules core (per-board RNG streams), bots, instanced and pooled
rendering, tap-to-select with a 56 px action sheet on phones. Exact tables, decisions and the
provisional balance (tuned on headless bot lobbies only) are in `src/minigames/towertumble/README.md`.
Casual-only (too long for tournaments). Online lobbies are future work. The owner named Pumpkin TD
(Warcraft III) as the reference; its details were not available, so its specifics are not reproduced.

### 14 · Toybox Siege (Survival / Horde / Builds · 1–8)
**Status:** implemented locally (one local player plus bots); balance is provisional. This is the
owner's five-minute horde-survival brief, in an original toy theme.

- **One board each.** Every player holds out on their own quilted patch of the table, and the
  camera follows their toy. Weapons fire on their own; the player only moves (joystick, WASD or
  arrows).
- **Classes.** The choice is untimed: a centred card over a blurred board.
  - Warrior: Tin Soldier, Bayonet Sweep, tough.
  - Ranger: Pop-Gun Ranger, Pop-Gun, fast.
  - Mage: Clockwork Wizard, Chime Burst, area.
- **The run.**
  - Swarms of dust bunnies, wind-up mice, rolling marbles and paper planes ramp up over five
    minutes. They drop experience gems, which a magnet reach pulls in.
  - An elite arrives at 1:00, 2:00 and 3:00, each with an attack pattern: a charge, bullet rings
    or summons. Each drops a treasure chest.
  - The boss, the Boiler Baron, arrives at 4:00. Slaying it wins. Otherwise the match ends at 5:00.
- **Builds.**
  - Each level-up offers a card of three, sometimes four. A run holds at most four weapons and
    four passives, from a pool of six weapons and six passives, each with a maximum of five levels.
  - **Evolution:** a weapon at level 5, plus its partner passive, plus an opened elite chest.
- **Rivals.**
  - Skip a chest, or use the Rally Horn active skill, to send an elite to another board. The target
    is the leader by default, or a rival you pick.
  - The target gets a 3-second warning.
  - Rate limits: 25 s between sends, 30 s of protection after receiving, and at most 2 sent elites
    per board.
- **Down and out.**
  - Revive once by spending in-match points: 100 + 1 per second of run time.
  - After that you are a ghost. Ghosts cycle through the other boards and can see each other.
- **Placement:**
  1. victory, with earlier boss kills ranked higher;
  2. survival time;
  3. knockouts;
  4. points.
- **Eligibility:** practice and casual only for now (not tournaments), like Toy Squad. The
  medium-length band is `durationSec` [240, 330].
- **Details:** exact tables, rate limits, caps and open questions are in
  `src/minigames/siege/README.md`. Online play, real-player balance and real-device performance are
  not verified.

---

## 5. Shared minigame framework

**Lifecycle:**
1. Initialise
2. Load players
3. Prepare round
4. Countdown
5. Start
6. Update and handle input
7. Determine placements
8. Display results
9. Clean up
10. Return to tournament or lobby

**Each game defines:**
- id, name and description
- minimum and maximum players, and estimated duration
- supported inputs (keyboard, mouse, **touch**) and bot support
- ranked and casual eligibility
- scoring method and tie-break method
- scene configuration and rules configuration

**Movement games** (Red Light Green Light, Wind-Up Dash, and later ones) share `src/minigames/shared/`:
a pure, deterministic movement core with the hub toy's tuning (`movement.ts`: position/velocity per contestant,
circle and box collision, jump, input sanitising and latching), the local input sampler (`moveInput.ts`),
and the render pieces (`Racer`, `ChaseCam`, `MoveTouch` joystick + Jump, `RaceHud`). Inputs reach the rules
core as data (`{ ax, ay, run, jump }`), so the same core can run on the game server.

The tournament controller needs **no game-specific logic** to know a round has finished. Minigames
are independently testable. Implementation: `src/minigames/types.ts` (`MinigameDefinition`, a pure
`RulesCore` and the host interface).

---

## 6. Multiplayer architecture (long-term)

| Service | Responsible for |
| --- | --- |
| Shared Lobby | Presence, movement, nearby visibility, emotes, social |
| Matchmaking | Tournament and casual queues |
| Game Session | Match sync, timers, input validation, eliminations, results |
| Progression | Cosmetics, currency, unlocks, rank history, rewards |
| Client rendering | World, animation, particles, UI, camera |

- Don't substitute frontend state or database polling for authoritative real-time networking.
- **First implementation:** a small proof of concept with two real browser sessions.
- Never assume 500 players share a single minigame.
- 🔧 **Amended (A2):** the game server is a separate deployable. The rules cores (pure TypeScript) are
  shared between client and server.

---

## 7. Player profiles & customisation

**Categories:** body colour, face and expressions, hats, accessories, wind-up key variants, decorative effects,
outfits and collectible badges. Paint, hats and keys exist today.

**Eventually:** display name, profile, per-format ranks, match history, cosmetic inventory, currency,
achievements and statistics.

**Guest access is always available. No account is needed to play.** Permanent progression and secure
ranked identity may need an *optional* account, subject to platform and competition rules.

---

## 8. Development order

See **[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)** for milestones and dependencies.
In summary:
1. Foundation
2. Tabletop hub
3. Tournament framework with simulated players
4. First five games: Copycat, Jack-in-the-Box (replaces Trivia), Find the Original, Red Light Green Light, Wind-Up Dash
5. Two-client multiplayer proof of concept
6. Ranking and matchmaking (one ladder first)
7. Social expansion

---

## 9. Open design decisions (proposals only until decided)

| Question | Current proposal |
| --- | --- |
| Do tournaments always use 8 players? | No: 2–8, and the points table scales to player count |
| Bots in ranked? | No bots in ranked. Ranked launches only once queues fill with humans (A3) |
| How are ratings calculated? | Undecided. Candidates are Glicko-2 or TrueSkill-style multiplayer rating |
| Ties | Tied players share the higher placement's points. The next placement is skipped |
| Disconnections and forfeits | Forfeit = last place for that round. A bot takes over in casual play |
| Do eliminated players spectate? | Yes, with a spectate camera until the round ends |
| Round durations | Per game, roughly 60–150 s, tuned in playtests |
| Can guests play ranked? | Undecided. Depends on account system and competition rules |
| Lobby scaling to 500 | Logical lobby instances of about 50 visible players with interest management |
| Lobby → match transfer | Matchmaking hands players a match-server room ID, and the client switches connections |

---

## 10. Constraints

The full vision is long-term. Build **one complete, testable system at a time**, keep functioning
features, keep a clean git history, and stay playable on phones and desktops (see `CLAUDE.md`).
For any competition version, keep public no-login play and confirm the eligibility of
externally developed code before deploying.
