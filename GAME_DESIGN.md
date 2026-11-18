# Toybox Trials: master game design & multiplayer brief

**Tiny contenders. Big chaos.**
Multiplayer party game · competitive minigame collection · social world · browser.

This is the master product and gameplay specification. It's the creative director's brief
(17 Nov 2026) with the amendments agreed on the same day. Amendments are marked **🔧 Amended**
inline and summarised first. Everything marked _proposal_ is not final.

---

## Current status and source authority (18 November 2026)

This existing specification is preserved pending the owner's separately supplied authoritative
game-design conversation, which has not yet been provided in this chat. Do not invent missing mechanics.
Current owner instructions take precedence over historical amendments: preserve the working Copycat
Conductor implementation. Amendment A1 records the earlier Base44 decision, not permission to rewrite it now.

**Implemented in this branch:** explorable 3D hub, menu, Workshop, local persistence, Copycat
Conductor, Jack-in-the-Box, Inferno Escape, Midnight Hunger, Toy Squad and Blink Duel, with local
practice/bots. Local unranked Blitz/Normal/Treasure tournaments include all except Toy Squad.
**Not implemented here:** the other five games (including Claude's separate work), online
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
- Each round adds one action, and demonstrations get faster.
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

### 04 · Find the Original (Observation / Speed · 1–8)
- A crowd of similar characters fills a shared arena. One is the target, **Baldwyn**, an original wind-up toy
  with distinctive details. The rest are Not-Baldwyn decoys.
- Players click or tap the one they think is Baldwyn. The first correct pick scores most, and later correct picks
  score by order. The last player scores nothing.

**Tech:** identical positions and target on every client, with details readable at the target resolution.
🔧 **Amended (A5):** client-side anti-cheat is "impractical, not impossible".

### 05 · Red Light, Green Light (Reflexes / Movement · 2–8)
- A giant mechanical referee alternates green (move) and red (stop) on a toy-soldier runway.
- Moving on red is eliminated or penalised (configurable until finalised).
- First to the finish wins. Others are placed by finish order or progress.

**Tech:** clear transition cues and fair latency handling.

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

### 08 · Music Box Rhythm (Rhythm / Timing · 1–8)
- A four-lane rhythm game on **A S J K**, with Perfect, Good and Miss judgements.
- Includes combo multiplier, accuracy percentage, increasing complexity and multiple tracks. Ranked by score.

**Toybox:** a stage inside a giant mechanical music box, with notes as toy pieces.
**Tech:** judge input against the **audio clock**, provide latency calibration, and use original or licensed music.
🔧 **Amended (A6):** music is exempt from the "synthesised only" rule.

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
