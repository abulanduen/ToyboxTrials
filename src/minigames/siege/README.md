# Toybox Siege

A five-minute horde survival trial with a final arena. Every player holds out on their own board
(a quilted patch of the table). Toys auto-attack with their weapons, and the player only moves.
Swarms of toy mobs close in, an elite arrives every minute, and the Boiler Baron arrives at 4:00.
Slaying it earns three chests and a moment to upgrade. Then every toy still standing is pulled
into one shared arena to fight with its build: the last toy standing wins. Rivals can send elites
onto each other's boards during the run.

Status: **implemented, local only** (one local player plus bots, each on its own board). All
balance numbers are **provisional**. They come from headless bot matches, not from play-testing
with people. They live in one place, `config.ts`, which the rules, bots, HUD and this README read.

## Hub gate

Both south-row spots beside the bridge landing are taken (Odd Page Out and Toy Tower Tumble), so
the Siege gate stands **inside the loop road**: at (46, −127), east of the avenue and facing it,
with a cardboard toy-fort tower and a chest guarded by dust bunnies. The loop road makes a short
detour to its door between Toy Tower Tumble and the bridge landing (`paths.ts`).

## Files

| File | What it is |
| --- | --- |
| `config.ts` | Every balance table: classes, weapons, passives, evolutions, the swarm, elites, the boss, the experience curve, revive cost, the send-elite limits and the entity caps. Pure data. |
| `rules.ts` | The deterministic rules core (`siegeRules`). It is seeded and uses no DOM, three.js or clock. The state is plain JSON, so it can run on the authoritative server unchanged. |
| `bot.ts` | Bots that kite, pick upgrades, take their prep cards, fight in the arena and summon the Baron. |
| `Scene.tsx` | The renderer: one board on screen (or the arena ring), with pooled instanced meshes. |
| `Hud.tsx`, `siege.css` | The DOM HUD: clock, bars, kit, rivals panel, cards, the prep banner, the out-popup, the touch skill button and spectator controls. |
| `icons.tsx` | Code-drawn SVG icons for every weapon, passive and card kind (cards and the kit strip). |
| `models.ts` | Toy part specs, baked by Toy Squad's `bakeParts`. |
| `look.ts` | Colours and labels, taken from the palette. |
| `sounds.ts` | Event-to-cue mapping and a voice limiter, played through `game/audio.ts`. |
| `local.ts`, `index.ts` | The local input queue, key bindings and `readLocalInput`. |

## Flow

1. **Class pick**: an untimed, centred card over a blurred board, like the Spellbox draft. There is
   no 3-2-1 before it (`skipStartCountdown` on the definition and the server facts). The run clock
   starts when everyone has picked. Bots pick after a short think.
2. **The run** lasts 5:00. Mobs spawn just outside the view and close in. Gems drop and are pulled
   in within the pickup reach. Each level up opens a card. **Your board freezes while a card is
   open, but the run clock does not**, so dawdling costs farming time, never health.
3. **Elites** arrive at 1:00 (Rag Bear), 2:00 (Tin Drummer) and 3:00 (Ratchet Rhino). Each drops a
   **treasure chest**. Walking onto the chest opens the treasure card.
4. **The boss**, the Boiler Baron, arrives at 4:00. Slaying it starts that toy's **prep window**
   (below): three chests, every gem pulled in, the board cleared, 15 s to upgrade.
5. **5:00**: every toy still fighting is pulled out the same way (no chests).
6. **The arena** opens for every toy still in, then the match ends with the last toy standing.
   With fewer than two toys left, there is no arena, and the match ends after the prep window.
   It also ends as soon as nobody is left in.

## The finale (owner request, 20 November 2026)

All numbers live in `FINALE` and `DEFAULT_CONFIG` (`prepMs`, `arenaMs`) in `config.ts`.

- **Boss slain:** it drops **three treasure chests** where it fell. Every mob, elite and bullet on
  the board is removed, and every gem and chest flies to the toy (the magnet, 60 cm/s). Level-up
  and treasure cards open as they arrive. The boss's chests offer an evolution when one is ready,
  otherwise +1 to two owned items. They never offer *Send an elite*.
- **The prep window** lasts **15 s** from the kill. Nothing can hurt the toy. The board does not
  freeze for cards here (there is nothing left to freeze), so the magnet keeps pulling while you
  choose. When the 15 s are up, anything still on the floor is collected at once and every open
  card is settled with its first option. The toy can then walk its quiet board, or press **Watch
  rivals** to follow the toys still fighting.
- **Toys that do not slay the boss:** at **5:00** (the end of the run) every toy still fighting is
  pulled out the same way, with no chests, and gets its own 15 s. A toy that is **downed** at 5:00
  keeps its revive window; if it revives, it joins the prep at once.
- **When the arena opens:** as soon as every toy still in has finished its prep window, and **15 s
  after 5:00 at the latest** (5:15). A toy still downed then misses the arena and becomes a ghost.
  So an early boss slayer may wait (up to about 40 s, if it killed the boss right at 4:00 and a
  rival fights on until 5:00), watching the others if it likes.
- **Ghosts** (out during the run) do not fight. They watch the arena: a ghost that never reached
  it follows a fighter and can cycle through the fighters.
- **The arena** is one shared board (`s.arena`, square, 44 cm across), a felt ring with cotton-reel
  posts. There is no 3-2-1: the toys appear on a ring 14 cm from the middle, at full health, and
  fight at once. Every weapon works as on the board, but aims at **rival toys and their summoned
  bosses**:
  - weapon damage is the run damage × **0.013** (so it is not instant: a duel of two starting toys
    lasts well over 15 s; arenas of 2 to 8 bots last 13 to 44 s);
  - each point of armour takes 4% off, up to 40%;
  - **overtime** from 40 s: all damage grows by +100% every 10 s, so the arena always ends, with a
    hard limit of 90 s;
  - no revives, no snacks, no knockback on toys.
- **The Rally Horn in the arena** summons a **Boiler Baron that fights for its owner** (smaller,
  ringed in the owner's colour). It chases the nearest rival, charges and fires bullet rings that
  hurt only rivals. Health 70 / 100 / 135 by horn level; one at a time; ready 2 s into the arena,
  then a 32 / 26 / 20 s cooldown from each summon. Rivals' weapons can destroy it. It vanishes if
  its owner is knocked out. Space or the big touch button summons it.
- **Knocked out** of the arena (0 health): the toy is out (a ghost with `inArena` set). The last
  toy hit it is credited (+150 points); the last toy standing gets +300.
- **Placement:** arena toys above everyone else, ordered by arena survival (still standing, then
  later knockouts first); then the run's tiebreaks (below).
- **Length:** the run is 5:00, then up to 15 s of prep and an arena that bot matches end in 13 to
  44 s (90 s at most), plus the untimed class pick. Headless bot matches take 313 to 360 s of
  match time in all (`durationSec` [300, 390], a *long* game; a match where everyone falls early
  is shorter).

## Classes

| Class | Toy | Starting weapon | Health | Speed (cm/s) | Lean |
| --- | --- | --- | --- | --- | --- |
| Warrior | Tin Soldier (Toy Squad's soldier model) | Bayonet Sweep | 150 | 9.2 | 2 armour |
| Ranger | Pop-Gun Ranger | Pop-Gun | 115 | 11.6 | ×1.35 pickup reach |
| Mage | Clockwork Wizard | Chain Lightning | 105 | 10 | ×0.9 cooldowns, ×1.15 area |

## Weapons (maximum level 5, maximum 4 weapons held)

Every weapon is open to every class. Only the starting weapon depends on class.

| Weapon | Level 1 | Levels 2–5 | Evolution (level 5 + partner + chest) |
| --- | --- | --- | --- |
| Bayonet Sweep | 150° arc at the nearest enemy, reach 6, 14 damage, every 1.15 s | +6 damage · swings behind too · +25% reach · +8 damage and faster | **Whirling Brigade**: a full 360° sweep, reach 9.5, 44 damage. Partner: **Tin Plating** |
| Pop-Gun | 3 corks, one at each of the 3 nearest enemies; each hits one, then hops to the nearest it has not hit (1 hop); 8 damage, every 1 s | +1 cork · 2 hops, +2 damage · +1 cork, +2 damage · 3 hops, +2 damage, faster | **Prism Ray**: 6 instant laser beams, each striking one of the nearest enemies and chaining on 4 times (5 enemies a beam), 20 damage. Partner: **Fast Gears** |
| Chain Lightning | Strikes the nearest enemy within 18, then leaps 3 times (6 cm × area) to the next nearest not yet struck, 18 damage, every 1 s | +2 bounces · +8 damage, faster · +2 bounces, leaps further · +8 damage, +2 bounces, faster (9 bounces) | **Thunderhead**: 12 bounces, 40 damage, and every 1.3 s **4 bolts from the sky** shock everything round where they land. Partner: **Magnifying Glass** |
| Yo-Yo Orbit | 1 yo-yo orbiting at radius 5.5, 8 damage per touch (0.45 s per enemy) | +1 yo-yo · +5 damage · +1 yo-yo and wider · +5 damage and faster | **Yo-Yo Cyclone**: the level-5 yo-yos, plus a **whirlwind** (radius 7 × area) that hurts every enemy inside it, 12 damage every 0.3 s. Partner: **Tight Mainspring** |
| Paper Planes | 1 plane out 14 cm along your heading and back, pierces everything, 10 damage | +1 plane · +6 damage · +1 plane · further and faster | **Origami Squadron**: 6 planes in every direction, 24 damage. Partner: **Magnet Button** |
| Marble Rain | 3 marbles fall on enemies within 20 (radius 2.4), 18 damage, every 2.4 s | +2 marbles · +8 damage · +2 marbles · bigger and faster | **Marble Avalanche**: 14 marbles, 36 damage. Partner: **Sharp Crayon** |

The full per-level rows are in `WEAPONS` in `config.ts`.

## Passives (maximum level 5, maximum 4 held)

| Passive | Per level |
| --- | --- |
| Tin Plating | +1 armour, +12 maximum health |
| Sharp Crayon | +10% damage |
| Tight Mainspring | −8% weapon cooldowns |
| Magnifying Glass | +10% weapon area |
| Fast Gears | +8% move speed, +10% projectile speed |
| Magnet Button | +35% pickup reach, +4% experience |

**Evolution rule (decided here):** a weapon at level 5, plus its partner passive at any level,
plus opening an elite's treasure chest. The chest then offers the evolution. The **Rally Horn** has a
secret upgrade too: at its top level (3) the next chest offers it (it has no partner; three horn cards
are its price). Weapons are offered first when both are ready. If no evolution is ready, the chest
raises up to two owned items by one level. If everything is maxed, it gives full health and 50 points.

## Ranger, Mage and Yo-Yo redesigns (owner request, 21 November 2026)

The owner redesigned the Ranger's Pop-Gun, replaced the Mage's meteors with chain lightning, and made
the Yo-Yo's secret upgrade an aura. This replaces the 20 November ranged upgrades (piercing and gentle
homing corks, a laser through a line, Chime Meteors and their Firebell flame pools). All numbers are in
`config.ts` (`WEAPONS`, `RANGER`, `SKY`, `AURA`) and are **provisional**. The owner calls the Ranger's
shots "arrows"; in the game they stay **corks** (the toy is a pop-gun), which is an open naming choice.

- **Pop-Gun (Ranger):** every volley picks the **nearest enemies** within 30 cm and fires **one cork at
  each** (3 at level 1). With fewer enemies than corks, the extra corks go to the nearest again (fanned
  out a little so they read as separate corks); with none in reach they fan out the way the toy faces
  and look for a foe as they fly. A cork flies straight at its target and strikes **only that one** (it
  passes over other enemies on the way, so a volley really reaches the nearest few). After each hit it
  **hops**: it turns to the **nearest enemy within 12 cm that it has not hit yet** and flies at that one,
  once per hop. With no enemy left in hop range it flies on straight, strikes the first enemy it meets
  (if its hops allow) and then looks again, until its 0.9 s run out. Levels add corks and hops (corks 3 / 4 / 4 / 5 / 5, hops 1 / 1 / 2 / 2 / 3, so a cork
  hits up to 2 / 2 / 3 / 3 / 4 enemies) and a little damage (8 / 8 / 10 / 12 / 14 per hit, every 1.0 /
  1.0 / 0.95 / 0.9 / 0.8 s). Fast Gears (its partner) makes corks fly and hop faster.
- **Prism Ray** (Pop-Gun 5 + Fast Gears + a chest): **one more cork and one more hop** (6 and 4), and
  the corks become **instant lasers**: each of the six beams strikes one of the nearest enemies (within
  30 cm; extra beams go to the nearest again) and then **chains** to the nearest enemy within 12 cm it has
  not struck, four times, all in the same instant (hitscan): up to 5 enemies a beam, 20 damage each,
  every 0.75 s. Each hop is drawn as a short-lived coral beam (0.2 s) from one enemy to the next. Damage
  never depends on the effect pool: a full pool only skips drawing a hop.
- **Chain Lightning (Mage, replaces Chime Meteors):** a bolt strikes the **nearest enemy** within 18 cm
  (20 from level 4), then **leaps** to the nearest enemy it has not struck within its leap reach (6 cm,
  7 from level 4, × area: the Mage's ×1.15 and Magnifying Glass make it leap further), instantly.
  Levels add **bounces** (3 / 5 / 5 / 7 / 9, so 4 to 10 enemies a cast), **cast speed** (1.0 / 1.0 /
  0.9 / 0.9 / 0.75 s) and **damage** (18 / 18 / 26 / 26 / 34). Drawn as jagged lilac-and-white bolts
  from foe to foe (0.22 s, instanced).
- **Thunderhead** (Chain Lightning 5 + Magnifying Glass + a chest): the chain strikes 13 enemies (12
  bounces), 40 damage, every 0.65 s, leaping 8 cm (× area); **and** every 1.3 s (× cooldowns) **4 bolts
  fall from the sky**, each on a random enemy within 20 cm (so mostly where the swarm is thickest),
  shocking everything within 4.5 cm (× area) for 50 (× damage). Drawn as a jagged bolt down from the sky
  with a honey flash and a lilac ring where it lands.
- **Yo-Yo Cyclone** (Yo-Yo 5 + Tight Mainspring + a chest): the **level-5 yo-yos keep spinning as
  before**, and a **whirlwind** of radius 7 cm (× area) round the toy hurts every enemy inside it for
  12 (× damage) every 0.3 s (× cooldowns, so its partner Tight Mainspring speeds it up). Drawn as a soft
  toy-blue disc with a white rim and two sweeping arcs (instanced, one per toy).
- **Unlock rules are unchanged:** level 5, the partner passive (Fast Gears, Magnifying Glass, Tight
  Mainspring) and a chest. Card texts and blurbs say what each level adds.
- **In the arena** all of these hit rival toys and their summoned Barons (never their owner) at the
  usual arena multiplier (0.013): corks and beams pick the nearest rivals, lightning leaps between
  rivals, sky bolts fall on rivals, the whirlwind hurts rivals inside it (bots that do not fight up close
  keep out of a rival's whirlwind).
- **Bots** need no new rules: they rate an evolution 100 and partner passives of their weapons above
  other passives, and keep their usual ranges (close for sweeps and yo-yos, 11 cm otherwise).

**Measured, not guessed** (deterministic weapon simulation in a scratch harness: one toy holding one
weapon, no passives, its own class's multipliers; *single* = a still Rag Bear 5 cm away, damage per
second over 10 s; *crowd* = 60 still dummies scattered 2–20 cm round the toy, total damage per second;
*swarm* = a live swarm at 2:00 health, 60 alive and walking in, kills per second over 20 s; the swarm
figure is capped by how fast mobs reach short-range weapons):

| Weapon | Level | Single target (dmg/s) | Crowd (dmg/s) | Swarm (kills/s) |
| --- | --- | --- | --- | --- |
| Knight: Bayonet Sweep (unchanged) | Lv 1 | 13 | 50 | 6.50 |
| Knight: Bayonet Sweep (unchanged) | Lv 3 | 20 | 100 | 12.55 |
| Knight: Bayonet Sweep (unchanged) | Lv 5 | 35 | 246 | 14.95 |
| Knight: Bayonet Sweep (unchanged) | secret | 53 | 528 | 17.95 |
| Ranger: Pop-Gun → Prism Ray | Lv 1 | 14 → **24** | 14 → **48** | 0.55 → **3.10** |
| Ranger: Pop-Gun → Prism Ray | Lv 3 | 34 → **44** | 67 → **132** | 2.70 → **6.80** |
| Ranger: Pop-Gun → Prism Ray | Lv 5 | 97 → **91** | 324 → **364** | 14.15 → **12.90** |
| Ranger: Pop-Gun → Prism Ray | secret | 135 → **168** | 406 → **840** | 15.00 → **38.95** |
| Mage: Chime Meteors / Firebell → Chain Lightning / Thunderhead | Lv 1 | 13 → **22** | 61 → **86** | 10.25 → **4.40** |
| Mage: Chime Meteors / Firebell → Chain Lightning / Thunderhead | Lv 3 | 48 → **34** | 348 → **203** | 15.00 → **7.50** |
| Mage: Chime Meteors / Firebell → Chain Lightning / Thunderhead | Lv 5 | 117 → **51** | 933 → **510** | 24.90 → **14.85** |
| Mage: Chime Meteors / Firebell → Chain Lightning / Thunderhead | secret | 494 → **252** | 3100 → **2051** | 64.65 → **36.00** |
| Yo-Yo Orbit → Yo-Yo Cyclone (on a Knight) | Lv 1 | 5 | 20 | 4.50 |
| Yo-Yo Orbit → Yo-Yo Cyclone (on a Knight) | Lv 3 | 16 | 72 | 7.95 |
| Yo-Yo Orbit → Yo-Yo Cyclone (on a Knight) | Lv 5 | 41 | 239 | 16.45 |
| Yo-Yo Orbit → Yo-Yo Cyclone (on a Knight) | secret | 48 → **82** | 290 → **443** | 18.40 → **16.45** |
| Marble Rain (on a Knight, unchanged) | Lv 1 | 22 | 63 | 8.50 |
| Marble Rain (on a Knight, unchanged) | Lv 3 | 65 | 174 | 9.70 |
| Marble Rain (on a Knight, unchanged) | Lv 5 | 144 | 468 | 12.85 |
| Marble Rain (on a Knight, unchanged) | secret | 302 | 1228 | 23.75 |

**Whole matches** (headless bots, 48 matches × 8 bots, classes and skills rotated so each class has
the same share; not people):

| Class | Boss kills | Reach the arena | Arena wins (of entries) | Mean place (1–8) | Evolved weapons by the end |
| --- | --- | --- | --- | --- | --- |
| Warrior | 50% → 48% | 77% → 81% | 19% → 19% | 4.05 → 3.92 | 1.90 → 1.88 |
| Ranger | 32% → 52% | 79% → 91% | 8% → 10% | 5.22 → 4.84 | 1.91 → 2.22 |
| Mage | 77% → 79% | 90% → 95% | 18% → 13% | 4.23 → 4.73 | 2.42 → 2.45 |

So the Ranger is stronger early (three corks that always land, where one cork often missed) and its
Prism Ray clears a swarm more than twice as fast as before, while its level-5 numbers stay close to the
old ones. The Mage trades the meteors' huge area for a reliable chain: Chain Lightning does about half
the old meteors' area damage at level 5, and Thunderhead about two thirds of Firebell's (both still the
most crowd damage in the table), and much less against a single target. The Yo-Yo Cyclone now nearly doubles
the level-5 yo-yos' damage (the old Cyclone added a sixth of it); its swarm kill rate does not move,
because a short-range weapon only kills as fast as the swarm walks in. In whole
matches no class dominates: the gap in mean place between the best and worst class narrowed from 1.17
to 0.92. The Ranger gained the most; the Mage lost some ground, mostly in the arena (13% of its arena entries won, from 18%); the Warrior still places best. Both
columns use the same seeds (100–147); an earlier sample of 24 matches put all three classes within 0.1
places of each other, so treat differences of a few percent as noise.

## Level-up cards

Each card offers three options, drawn by weighted chance from new weapons or passives (while
slots are free) and upgrades to items you own. Owned upgrades weigh more. From level 4 onwards,
in a match with rivals, a fourth card, the **Rally Horn** active skill, appears 40% of the time.
When nothing is left to raise, the card offers "Oil and polish" (full health and 50 points), so a
card is never empty. Keys 1 to 4 pick a card; on touch, tap it.

Each option shows the item's **icon** (code-drawn SVG, `icons.tsx`), its **level change**
("New · Lv 1", or "Lv 2 → 3" with the new pip lit) and, when it matters, a **secret upgrade**
badge (`evolutionHint` in `rules.ts`):

- **Unlocks the secret upgrade** (gold): taking it completes a weapon's evolution pair (the weapon
  reaches level 5 with its partner owned, or the partner of a level-5 weapon), or takes the Rally
  Horn to level 3, so the next chest evolves it;
- **Secret upgrade pair** (dashed): a new partner passive for a weapon you hold, or a weapon whose
  partner you hold, with the levels still needed;
- **Max level, add the partner**: the weapon reaches level 5 without its partner;
- the Rally Horn's levels below 3 show how many more it needs for the Boiler Heart;
- the treasure card's evolution itself.

The kit strip under the clock uses the same icons, with level pips (gold when evolved), and shows
the Rally Horn (three pips) once taken. The Prism Ray, Thunderhead, Yo-Yo Cyclone and Boiler Heart have
their own icons (a ray gun, a storm cloud dropping a bolt, a yo-yo in a whirlwind, a boiler throwing
rivets); the other evolutions keep the star. Chain Lightning's icon is a bolt leaping between three foes.

Experience to the next level is `5 + 3(L−1) + ⌊0.3(L−1)²⌋`, giving 5, 8, 11 … 56 at level 10 and
170 at level 20. In bot matches, toys reach about level 12 by 2:00, 20 by 4:00 and 25–32 by 5:00.

## The swarm, elites and boss

| Enemy | Health | Speed | Bite | XP | Appears from | Moves |
| --- | --- | --- | --- | --- | --- | --- |
| Dust bunny | 7 | 4.4 | 6 | 1 | 0:00 | straight at you |
| Wind-up mouse | 5 | 7.2 | 5 | 1 | 0:30 | dash, pause, dash |
| Rolling marble | 18 | 9 | 9 | 2 | 1:30 | rolls straight and overshoots, re-aims every 2.2 s |
| Paper plane | 7 | 8.5 | 6 | 2 | 2:30 | swoops side to side |

- **Health** ×(1 + 0.6 per minute).
- **Bite** ×(1 + 0.15 per minute), minus your armour (at least 1 damage gets through), then 0.4 s of invulnerability.
- **Spawn rate**: 1.5 + 0.07/s per second (1.5 at the start, 18 at 4:00), halved while the boss is up.
- **Waves**: every 25 s a ring of 8 + 1 per 10 s of run time closes in.

| Elite or boss | Health | Pattern | Drops |
| --- | --- | --- | --- |
| Rag Bear (1:00) | 420 | Telegraphed charge (0.9 s wind-up, dash at 30 cm/s) every 3.8 s | Chest + 20 XP |
| Tin Drummer (2:00) | 1000 | Ring of 10 slow bullets every 2.8 s | Chest + 30 XP |
| Ratchet Rhino (3:00) | 2000 | Charge every 4.2 s and summons 4 mice every 9 s | Chest + 40 XP |
| The Boiler Baron (4:00) | 6500 | Ring of 16 bullets every 2.6 s, charge every 8 s, a ring of 10 mice at ⅔ and ⅓ health | Victory (+600 and +300 points) |

Charges show a coral lane on the floor during the wind-up.

A board holds at most `bigCap` (4) elites at once, and the last free slot is kept for the boss
until it is beaten: scheduled and sent elites that find the board full wait for a slot rather
than being dropped, and the boss always arrives at 4:00.

## Rivals: sending elites

- **From a chest:** the treasure card has a second option, *Send an elite*. You skip the chest
  and pick a target. The default is the **leader**, the rival still in with the most points.
- **Rally Horn (active skill):** an optional level-up card at levels 1 to 3, with cooldowns of
  75, 60 and 45 s, first ready 8 s after it is taken. Press Space or the big touch button.
  Clicking a rival's row aims it (otherwise it goes to the leader).
  At level 3 its secret upgrade, the **Boiler Heart**, is offered by the next chest (see above): the
  horn keeps sending elites and also fires rivet rings all round the toy.
- **Telegraph:** the target sees "Elite incoming from X!" for 3 s before it lands. The rivals
  panel marks boards with an elite on the way.
- **The elite sent** depends on the clock: Rag Bear before 2:00, Tin Drummer before 3:00, then
  Ratchet Rhino. It has 85% health and drops a 25 XP gem instead of a chest, so it is mostly
  pressure, with a small reward.
- **Rate limits (`config.ts`):**
  - after sending, you cannot send again for **25 s**, whether by chest or by horn;
  - after receiving, a board is protected from every sender for **30 s**;
  - a board never holds more than **2** sent elites, alive or incoming;
  - ghosts, victors and yourself are never valid targets.
  
  A blocked chest skip keeps the card open, and the HUD shows why each target is unavailable.

## Down, revive once, ghosts

- At 0 health, a toy that has not revived yet and can pay is **downed**. Its board freezes, and it
  has 12 s to choose:
  - **Revive** costs **100 + 1 point per second of run time**: 220 at 2:00, 340 at 4:00. You come
    back with 60% health, 2.5 s of invulnerability and a shockwave that hurts and shoves nearby
    enemies and clears bullets.
  - **Stay down.** Waiting out the 12 s does the same.

  Points are the in-match score: knockouts, elites, level-ups and the boss.
- A toy that cannot pay, or has already revived, becomes a **ghost** at once.
- **Out for good, a toy stays on its own board** (lying where it fell, its ghost above it). A popup
  offers **Watch other players** (Space, or tap) and **Stay here**; staying leaves a small *Watch
  other players* button. Watching is the player's choice (`spectate` input): the leader's board
  first, then Prev/Next, Q/E or Space (or tap a rival's row to jump to that board), and the stick
  or WASD drifts the ghost around the watched toy. **Mine** goes back to your own board. Every
  ghost watching a board is drawn over it as a translucent toy, so ghosts can see each other.
  A toy knocked out of the arena gets the same popup.

## Placement and scoring

1. **The arena**: toys that reached it place above everyone else; the last toy standing first,
   then later knockouts above earlier ones (survivors of the 90 s limit tie here).
2. **Victory**: earlier boss kills place higher.
3. **Survival time**: toys that reached 5:00 (or the arena) count the full run.
4. **Knockouts** (of mobs, during the run).
5. **Points**.

Toys equal on all of these share a place. The record score is the toy's remaining points (after any
revive). The game counts as long (`durationSec` [300, 390], see the finale).

## Performance

- **Entity caps:** gameplay caps are per board, in `DEFAULT_CONFIG`:

  | Entity | Cap |
  | --- | --- |
  | Mobs | 150 |
  | Player projectiles | 96 |
  | Enemy bullets | 64 |
  | Gems | 160 |
  | Area hits (including beam and lightning hops, sky strikes) | 40 |
  | Chests | 4 |
  | Elites | 4 |

  A full gem pool folds new experience into existing gems, so nothing is lost.
- **Allocation:** every pool is allocated once at init and recycled through an `on` flag. The board
  step is split into one small function per entity kind with indexed loops (no `for…of`, closures or
  helper calls the JIT cannot inline in the hot loops), and pooled number fields start as fractions
  (`D` in `rules.ts`) so the shared hidden classes never deprecate: a late-game step of eight full
  boards and seven bots allocates about 2.4 KB (it was 79 KB: iterator results, boxed numbers and an
  optimise/deoptimise loop in the bots' steering). Time per step, old and new rules run back to back
  in the same harness and under the same (heavy) load: 0.84–0.98 ms before, 0.34–0.39 ms after,
  new weapons included (node; timings on a shared machine are rough, the allocation is not).
  The 21 November redesign keeps this: target picking uses small scratch typed arrays outside the
  state (the nearest few by insertion into a sorted list of at most 16, chain hits in a 32-slot list),
  chains are hitscan (no projectile, a seeking cork checks contact with its one target only), and the
  hop effects reuse the blast pool. Old and new rules run back to back in a scratch harness (eight
  immortal bot boards at 3:20, each kept full at 150 mobs, bots included, no level-up cards; mixed
  classes, all Rangers, all Mages, and every toy holding the three redesigned secret upgrades; three
  rounds each) on a machine under heavy shared load: 0.20–0.40 ms per step before and 0.20–0.42 ms
  after (medians 0.28 and 0.29, no difference within the noise); 1.4–3.1 KB allocated per step before
  and 1.3–3.0 KB after (lower in every mix but all-Mage, where it is the same).
- **Collisions:** a uniform spatial hash (4 cm cells) is rebuilt per board per step from scratch
  typed arrays held outside the state. Mob separation checks at most six neighbours in the mob's
  own cell.
- **Rendering:** only the board on screen is drawn. Each mob kind, projectile kind, gem kind and
  effect shape is one `InstancedMesh`, sized to the gameplay cap; only the live instances are
  uploaded each frame. Single toys (hero, elites, rivals) use their own material, not the swarm's:
  one material drawn by instanced and plain meshes made three.js rebuild its program key on every
  switch, every frame. Nothing in Siege casts a moving shadow, so the sun's shadow map is drawn when
  the set changes, not every frame (about 50 draw calls into a 2048- or 4096-texel map saved per
  frame on Balanced and High). HUD bars fill with `transform: scaleX`, not an eased width. Effect shapes come from Toy
  Squad (`fxShapeGeometry`, an additive export). The Low tier (touch default) uses a 48-particle
  pool instead of 140 and drops impact bursts. Gameplay caps are the same on every tier, because
  the rules must agree across clients.
- **Headless CPU:** see the unit test `runs a full five-minute match of eight bots headless`. Its
  timing is printed. On the development container, a full 8-board, 5-minute bot match takes about
  5–10 s of CPU depending on machine load, about 0.3–0.5 ms per 60 Hz step for all eight boards and their bots.

No frame-rate claims: the development container renders with software GL. Renderer counts
measured with `__toybox.renderInfo()` in `tests/e2e/siege.cjs` (Low tier, whole frame including
the room; ranges over the final runs):

| Moment | View | Board entities | Draw calls | Triangles |
| --- | --- | --- | --- | --- |
| Mid-swarm (~2:44) | desktop 1280×800 | 146–150 mobs, 1 elite | 48–51 | 71–82k |
| Boss fight (4:04) | desktop | 143–150 mobs, boss + 2 elites, 27–30 bullets | 54–63 | 56–74k |
| Mid-swarm | phone portrait 390×844 / landscape 844×390 | 71–112 mobs | 50–55 | 48–63k |
| Boss fight | phone portrait / landscape | 55–134 mobs, boss + elites, 13–28 bullets | 57–70 | 46–70k |

The scene holds 137 meshes in total, whatever the entity count.

## Online (server entry)

`server/games.ts` runs the same rules core and bots on the authoritative server, and
`src/minigames/facts.ts` lists it (a strategy trial: tournament finales only). The server entry:

- validates every input shape;
- hides the seed and the match-wide random counter;
- sends whole boards only for the viewer's own toy and the board it watches, cutting every other
  board to its live elites; once the arena opens, every board is cut and the shared arena goes out
  whole;
- accepts the `spectate` input (watch the others, or go back to your own board);
- snapshots every tick (30 a second), copying only the boards some viewer is sent whole;
- predicts your own toy's movement on your client (`predict.ts`, see docs/ONLINE.md), so it answers
  the stick at once instead of a network round trip later;
- closes the class pick after 60 s and any card after 20 s, so an idle player cannot stall a
  shared match (both untimed locally). The finale needs no extra timer: the prep window settles its
  own cards after 15 s, the arena opens by 5:15 and ends by 90 s.

Tested headless with a full bot field (`tests/unit/lobby-match.test.ts`). **Not yet played online
in a browser.** A full board is still a sizeable snapshot (a few hundred pooled entities), so the
wire size needs measuring.

## Decisions and open questions (provisional)

- **Tournaments:** a strategy trial (`group: 'strategy'`, owner decision 20 Nov 2026), like Toy
  Squad and Toy Tower Tumble: never in Blitz, and in Normal and Treasure only ever the finale
  (`selectTournament` in `src/minigames/tournament.ts`).
- **Clocks:** the board freezes during cards and while downed, but the run clock does not. This is
  fair locally. On a server, `choiceTimeoutMs` and `pickTimeoutMs` (both 0, meaning untimed, by
  default) can force a choice.
- **Sent elites** carry no chest, so sending is pure pressure. An alternative is a smaller chest.
- **Finale balance** (provisional): the arena weapon multiplier (0.013), overtime and the summoned
  Baron's numbers come from headless bot arenas only. Whether 15 s of prep is enough to read three
  chests and several level-ups needs people to try it. Early boss slayers wait for the arena (up to
  about 40 s); a shorter shared deadline is an alternative if the wait feels long.
- **The arena and the ranged classes:** in bot arenas, armour (4% per point, up to 40%) and melee
  builds win most often; after the 21 November redesign the Ranger reaches the arena and slays the boss
  more often but still wins the arena least (see the table above). A per-weapon arena multiplier, or a
  lower armour cap, is the obvious lever if people find the same. In a duel every cork, beam and the
  lightning go to the one rival (extra corks go to the nearest), which is the Ranger's best case there.
- **Secret upgrades for the other three weapons** (Whirling Brigade, Origami Squadron, Marble
  Avalanche) are unchanged bigger versions; the owner singled out the sword as the bar. The Prism Ray,
  Thunderhead, Yo-Yo Cyclone and Boiler Heart each change how the weapon plays.
- **Naming:** the owner's "arrows" are corks in the game (the Ranger's toy is a pop-gun). If arrows
  are wanted, it is a text and model change only (`config.ts`, `models.ts`, the cork shape in `Scene.tsx`).
- **Unverified:** balance and feel with real players, especially how strong the Ranger is, boss
  kill rates, revive costs and the arena. Bot matches suggest 0 to 5 boss kills per 8-toy match
  and 2 to 8 toys in the arena. Touch feel, audio mix (the lightning crackle and sky-bolt rumble reuse the soft `charge` and `storm` toy cues; the beam's zap and the rivet ring)
  and real-device frame rates have not been measured.
