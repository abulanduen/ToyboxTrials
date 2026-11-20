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
| Ranger | Pop-Gun Ranger | Pop-Gun | 100 | 11.6 | ×1.35 pickup reach |
| Mage | Clockwork Wizard | Chime Burst | 105 | 10 | ×0.9 cooldowns, ×1.15 area |

## Weapons (maximum level 5, maximum 4 weapons held)

Every weapon is open to every class. Only the starting weapon depends on class.

| Weapon | Level 1 | Levels 2–5 | Evolution (level 5 + partner + chest) |
| --- | --- | --- | --- |
| Bayonet Sweep | 150° arc at the nearest enemy, reach 6, 14 damage, every 1.15 s | +6 damage · swings behind too · +25% reach · +8 damage and faster | **Whirling Brigade**: a full 360° sweep, reach 9.5, 44 damage. Partner: **Tin Plating** |
| Pop-Gun | 1 cork at the nearest enemy, 9 damage, every 0.75 s | +1 cork · pierce 1 · +5 damage · +1 cork and faster | **Cork Gatling**: 2 corks every 0.23 s, pierce 3. Partner: **Fast Gears** |
| Chime Burst | 1 blast (radius 4.5) on a random enemy within 20, 16 damage, every 1.6 s | bigger · +1 burst · +8 damage · +1 burst and faster | **Grand Carillon**: 4 blasts, radius 7.5, 36 damage. Partner: **Magnifying Glass** |
| Yo-Yo Orbit | 1 yo-yo orbiting at radius 5.5, 8 damage per touch (0.45 s per enemy) | +1 yo-yo · +5 damage · +1 yo-yo and wider · +5 damage and faster | **Yo-Yo Cyclone**: 5 yo-yos, radius 8, 24 damage. Partner: **Tight Mainspring** |
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
plus opening an elite's treasure chest. The chest then offers the evolution. If no evolution is
ready, the chest raises up to two owned items by one level. If everything is maxed, it gives full
health and 50 points.

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
  reaches level 5 with its partner owned, or the partner of a level-5 weapon), so the next chest
  evolves it;
- **Secret upgrade pair** (dashed): a new partner passive for a weapon you hold, or a weapon whose
  partner you hold, with the levels still needed;
- **Max level, add the partner**: the weapon reaches level 5 without its partner;
- the treasure card's evolution itself.

The kit strip under the clock uses the same icons, with level pips (gold when evolved).

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
  | Area hits | 40 |
  | Chests | 4 |
  | Elites | 4 |

  A full gem pool folds new experience into existing gems, so nothing is lost.
- **Allocation:** every pool is allocated once at init and recycled through an `on` flag.
- **Collisions:** a uniform spatial hash (4 cm cells) is rebuilt per board per step from scratch
  typed arrays held outside the state. Mob separation checks at most six neighbours in the mob's
  own cell.
- **Rendering:** only the board on screen is drawn. Each mob kind, projectile kind, gem kind and
  effect shape is one `InstancedMesh`, sized to the gameplay cap. Effect shapes come from Toy
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
`src/minigames/facts.ts` lists it (casual only, no tournaments). The server entry:

- validates every input shape;
- hides the seed and the match-wide random counter;
- sends whole boards only for the viewer's own toy and the board it watches, cutting every other
  board to its live elites; once the arena opens, every board is cut and the shared arena goes out
  whole;
- accepts the `spectate` input (watch the others, or go back to your own board);
- snapshots every 2 ticks;
- closes the class pick after 60 s and any card after 20 s, so an idle player cannot stall a
  shared match (both untimed locally). The finale needs no extra timer: the prep window settles its
  own cards after 15 s, the arena opens by 5:15 and ends by 90 s.

Tested headless with a full bot field (`tests/unit/lobby-match.test.ts`). **Not yet played online
in a browser.** A full board is still a sizeable snapshot (a few hundred pooled entities), so the
wire size needs measuring.

## Decisions and open questions (provisional)

- **Tournaments:** off for now (`eligibility.tournament: false`), like Toy Squad. A five-minute
  run is long for a tournament round. Flip it once the formats account for game length.
- **Clocks:** the board freezes during cards and while downed, but the run clock does not. This is
  fair locally. On a server, `choiceTimeoutMs` and `pickTimeoutMs` (both 0, meaning untimed, by
  default) can force a choice.
- **Sent elites** carry no chest, so sending is pure pressure. An alternative is a smaller chest.
- **Finale balance** (provisional): the arena weapon multiplier (0.013), overtime and the summoned
  Baron's numbers come from headless bot arenas only. Whether 15 s of prep is enough to read three
  chests and several level-ups needs people to try it. Early boss slayers wait for the arena (up to
  about 40 s); a shorter shared deadline is an alternative if the wait feels long.
- **Unverified:** balance and feel with real players, especially how strong the Ranger is, boss
  kill rates, revive costs and the arena. Bot matches suggest 0 to 5 boss kills per 8-toy match
  and 2 to 8 toys in the arena. Touch feel, audio mix (including the new, softer Chime Burst cue)
  and real-device frame rates have not been measured.
