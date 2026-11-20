# Toy Tower Tumble

A 5–10 minute random-merge tower defence for 1–8 players. Every player defends an 8×8 board
against 20 shared waves of wind-up toys. **Build** pays for a *random* tower; **any two same-tier towers
merge into a random tower one tier up**, all the way to tier 7. Level your **builder** for better
odds, finish **quick quests** for gold (some give a free tower), beat the **bosses** on waves 5, 10, 15
and 20 for free towers, and hold out longer than everyone else. After wave 20 comes a just-for-fun
**damage check**. The **player rail** at the side lists everyone: tap a player to look at their board.

Registry id `toy-tower-tumble` · gate on the gates table (south row at x = 45, between the bridge
landing and Blink Duel: the mirror of Odd Page Out's spot west of the landing) · tutorial in `tutorials.ts` · browser test `tests/e2e/towertumble.cjs` · unit tests
`tests/unit/towertumble.test.ts`.

## Status: what is decided and what is provisional

- **Implemented and tested:** everything below (rules, bots, quests, bosses, spectating, HUD on
  desktop / phone portrait / phone landscape).
- **Provisional (balance):** every number in `catalogue.ts`. The tables were tuned against headless
  bot lobbies only (see "Balance"), never against people. Treat them as a first pass.
- **Owner's reference game.** The owner asked for "the balancing and idea from Pumpkin TD in
  Warcraft III". I do not have reliable, detailed knowledge of that map's numbers, so nothing here
  is copied from it: I implemented the core the owner described (a random basic build, two identical
  towers merging into a random higher tier, builder levels that improve the odds, quick quests, boss
  rewards, a tier-7 cap) and filled the gaps with the design below. Names, models and text are
  original to Toybox Trials.

Owner revision, 20 November 2026: matching is now by **tier**, not tower identity. **M** merges
one available pair without a selection; clicking/dragging and bots use the same eligibility.

Owner revision, 20 November 2026 (later): round rewards are paid the moment your own board clears
its wave, and the rail highlights who is still going; the final boss gives a random tier-6 tower,
then a 15 s prep and the damage check; three quests also give a free tower; quests show a picture of
their tower; prices use the top bar's coin style; anyone's board can be viewed from the rail; knocked
out players stay on their board and are offered (not forced) to watch; status badges over enemies;
on phones the quests sit left and the rail right, with drag-to-pan and pinch/wheel zoom.

Owner revision, 20 November 2026 (board views): viewing another board, or spectating, shows that
player's whole picture (their quests, towers, builder level and odds, gold and lives, and a Board panel
with towers by tier and by family) read-only; the tower sheet and hover tip float beside their square
instead of pushing the layout; on touch, a tap (or drop) on another tower never merges: only the
sheet's Merge button does.

## The board

```
       A B C D E F G H
   1   . . . . . . . .
   2 → P P P P P P P .      enemies climb out of the toy box on the left of row 2,
   3   . . . . . . P .
   4   . P P P P P P .      zig-zag down the board (over the open-book bridge on row 6),
   5   . P . . . . . .
   6   . P P P P P P .
   7   . . . . . . P .
   8   . . . . . . P .  ↓   and drop into your toy chest past the bottom of column G.
```

- 64 squares: 23 path, 41 felt squares you can build on (`board.ts`). The same board for everyone.
- Walkers follow the path (24 squares long). **Paper gliders fly straight** from the toy box to the
  chest (9.9 squares), so towers near the diagonal matter on flying waves.
- Squares are named like a chessboard in the HUD (column letter A–H, row 1–8 from the far edge).

## Flow

1. **Build phase** — 20 s before wave 1, 8 s between waves (3 s once no human is left in). Any
   human can press **Next wave** to start early (all humans still in must be ready).
2. **Wave** — every board spawns the same enemies at the same moments. Building, merging, moving
   and selling stay open during waves.
3. **Your round rewards come the moment your board is clear:** once every enemy of the wave has
   been killed or has leaked on your board, you are paid the clear bonus at once (and the
   no-leak streak counts). The wave ends for everyone when every board still in is clear; until
   then the boards still fighting glow on the player rail, so you can see whom Next wave is
   waiting for. After wave 20 come the damage check's 15 s prep and the damage check itself.
4. **Safety cap:** a wave still running 90 s after it started ends anyway, and whatever is left
   leaks. (Slows are capped at 60% and only stuns from hits exist, so this should never trigger.)

Measured length (headless, 8 bots): about 7–8.5 minutes of match time for the whole 20 waves. With a
human in the lobby the build phases are 8 s instead of 3 s, which adds about 1.5 minutes if nobody
presses Next wave. `durationSec` is [300, 600].

## Towers

Five toy lines, one role each (`FAMILY` in `catalogue.ts`). Tier 1 has exactly one tower per family;
higher tiers have five (tier 6) or three (tier 7) towers. Each tier is about **×2.2 damage**, so two
towers merged are worth a little more than the two apart. Towers reuse **Toy Squad's toy models**
and their attack looks (shape, colours, impact) from `toysquad/effects.ts`.

| Family | Role | How it works |
|---|---|---|
| Tin soldiers | Single target | Hard hits on the leading enemy in reach. |
| Paper & craft | Splash | Full damage within half the splash radius of the target, 60% to the edge. |
| Clockwork | Chain | The spark jumps to the nearest unhit enemy within 1.6 squares, 2–5 times, 75% per jump. |
| Rubber & string | Slow | Slows 25–50% for about 2 s. The strongest slow wins; never more than 60%; bosses take half. |
| Plush | Support aura | Towers within the aura hit harder and faster. The strongest aura wins (no stacking). |

Abilities use Toy Squad's status vocabulary: **Fury** (every third shot double), **Burn** (30% of the
hit again per second for 3 s, strongest wins), **Pierce** (ignores armour), **Multishot** (a second
target), **Shred** (strips armour equal to the tower's tier, for good), **Stun** (every fourth shot,
0.6 s; bosses immune), **Mark** (+25% damage from every tower for 2.5 s) and **Execute** (topples a
non-boss under 15% health). Targeting: the enemy furthest along its route, within reach.

| Tier | Tower | Family (role) | Hit | Every (s) | Reach | Extra | Abilities | Model reused |
|---|---|---|---|---|---|---|---|---|
| 1 | Tin Sentry | Tin soldiers (Single target) | 7 | 0.80 | 2.4 | – | – | soldier |
| 1 | Paper Popper | Paper & craft (Splash) | 6 | 1.30 | 2.2 | splash 0.9 | – | paper-medic |
| 1 | Spark Bot | Clockwork (Chain) | 5 | 1.00 | 2.3 | chain +2 | – | robot |
| 1 | Band Slinger | Rubber & string (Slow) | 3 | 0.90 | 2.2 | slow 25% 1.8s | – | marble-slinger |
| 1 | Felt Cub | Plush (Support aura) | 3 | 1.00 | 2 | aura 1.5: +12% dmg, +6% speed | – | felt-fox |
| 2 | Cork Musketeer | Tin soldiers (Single target) | 15.4 | 0.78 | 2.52 | – | Fury | cork-knight |
| 2 | Crayon Mortar | Paper & craft (Splash) | 13.2 | 1.28 | 2.32 | splash 1 | Burn | crayon-cannon |
| 2 | Zap Mouse | Clockwork (Chain) | 11 | 0.98 | 2.42 | chain +3 | – | clockwork-mouse |
| 2 | Gum Frog | Rubber & string (Slow) | 6.6 | 0.88 | 2.32 | slow 30% 1.95s | – | rubber-frog |
| 2 | Ribbon Mascot | Plush (Support aura) | 6.6 | 0.98 | 2.12 | aura 1.5: +17% dmg, +9% speed | – | ribbon-rookie |
| 3 | Graphite Lancer | Tin soldiers (Single target) | 33.6 | 0.76 | 2.64 | – | Pierce | pencil-lancer |
| 3 | Bead Barrage | Paper & craft (Splash) | 28.8 | 1.26 | 2.44 | splash 1.1 | Multishot | bead-bomber |
| 3 | Dynamo Mole | Clockwork (Chain) | 24 | 0.96 | 2.54 | chain +3 | Shred | magnet-mole |
| 3 | Yo-yo Snare | Rubber & string (Slow) | 14.4 | 0.86 | 2.44 | slow 35% 2.1s | Stun | yo-yo-yak |
| 3 | Patchwork Nanny | Plush (Support aura) | 14.4 | 0.96 | 2.24 | aura 1.5: +22% dmg, +12% speed | – | patchwork-nurse |
| 4 | Chess Cavalier | Tin soldiers (Single target) | 73.5 | 0.74 | 2.76 | – | Mark | chess-chevalier |
| 4 | Paint-pot Howitzer | Paper & craft (Splash) | 63 | 1.24 | 2.56 | splash 1.2 | Burn | paint-pot-pyro |
| 4 | Arpeggio Engine | Clockwork (Chain) | 52.5 | 0.94 | 2.66 | chain +4 | Stun | music-box-mage |
| 4 | Silk Spinner | Rubber & string (Slow) | 31.5 | 0.84 | 2.56 | slow 40% 2.25s | Shred | silver-spider |
| 4 | Porcelain Warden | Plush (Support aura) | 31.5 | 0.94 | 2.36 | aura 2.3: +27% dmg, +15% speed | – | porcelain-panda |
| 5 | Quill Marshal | Tin soldiers (Single target) | 161 | 0.72 | 2.88 | – | Execute | quill-quarreller |
| 5 | Rivet Rocketeer | Paper & craft (Splash) | 138 | 1.22 | 2.68 | splash 1.3 | Multishot | rivet-raccoon |
| 5 | Prism Conductor | Clockwork (Chain) | 115 | 0.92 | 2.78 | chain +4 | Mark | prism-princess |
| 5 | Venom Fiddler | Rubber & string (Slow) | 69 | 0.82 | 2.68 | slow 45% 2.4s | Burn | venom-violinist |
| 5 | Sphinx Matron | Plush (Support aura) | 69 | 0.92 | 2.48 | aura 2.3: +32% dmg, +18% speed | Mark | suture-sphinx |
| 6 | Rocking Regent | Tin soldiers (Single target) | 350 | 0.70 | 3 | – | Fury, Stun | royal-rocking-horse |
| 6 | Pinwheel Phoenix | Paper & craft (Splash) | 300 | 1.20 | 2.8 | splash 1.4 | Burn, Multishot | phoenix-pinwheel |
| 6 | Aurora Dynamo | Clockwork (Chain) | 250 | 0.90 | 2.9 | chain +5 | Shred, Mark | aurora-automaton |
| 6 | Thread Viper | Rubber & string (Slow) | 150 | 0.80 | 2.8 | slow 50% 2.55s | Stun, Shred | stitch-serpent |
| 6 | Star Seamstress | Plush (Support aura) | 150 | 0.90 | 2.6 | aura 2.3: +37% dmg, +21% speed | Stun | celestial-seamstress |
| 7 | The Last Monarch | Tin soldiers (Single target) | 770 | 0.68 | 3.12 | – | Execute, Pierce, Multishot | crownless-king |
| 7 | Patchwork Wyrm | Paper & craft (Splash) | 660 | 1.18 | 2.92 | splash 1.5 | Burn, Shred | velvet-dragon |
| 7 | Endless Jack | Clockwork (Chain) | 550 | 0.88 | 3.02 | chain +5 | Stun, Mark | infinity-jack |

(Reach and splash are in board squares, centre to centre. Formulas are in `makeTower`.)

## Building, merging and the builder

- **Build: 20 gold** for one random tower, on the selected empty square (or, with nothing selected,
  on the free square that reaches the most path). The tier comes from the builder odds; the tower is
  uniform within that tier.
- **Merge:** any two towers of the same tier, regardless of name or family → one random tower of the next tier,
  on the square of the tower you merged *into*. The other square empties. Tier 7 never merges.
  With a mouse, select a tower and click (or drag it onto) a glowing partner. **On touch a tap never
  merges** (owner request: stray taps merged towers): tapping or dropping onto a same-tier tower selects
  it and pairs it with the previous one, and its sheet's first button, *Merge tier N with B3*, merges.
  Touch is the shared `touchUI` setting (coarse pointer), not the user agent.
- **M quick merge:** no selection required. It keeps the result on the selected tower if that
  tower has a partner; otherwise it picks the lowest-tier pair, keeping the lowest-cell position.
  Each press merges one pair; invalid/capped selections fall back to another available pair.
- **Lucky merge:** with the builder's lucky chance a merge jumps two tiers instead of one, but never
  past tier 5. Tiers 6 and 7 require two same-tier towers from the preceding tier.
- **Move:** drag a tower onto an empty square (free); onto a different tower to swap.
- **Sell:** 10 gold per tier (10, 20 … 70).

**Builder levels** (`BUILDER`): the odds table shown in the HUD.

| Level | Cost to reach | Build tier 1 | Build tier 2 | Build tier 3 | Lucky merge |
|---|---|---|---|---|---|
| 1 | – | 100% | 0% | 0% | 0% |
| 2 | 50 | 85% | 15% | 0% | 3% |
| 3 | 90 | 70% | 26% | 4% | 6% |
| 4 | 140 | 58% | 32% | 10% | 8% |
| 5 | 200 | 46% | 38% | 16% | 10% |
| 6 | 280 | 36% | 42% | 22% | 12% |

## Economy

- Start: **70 gold, 20 lives**.
- Kill bounty: `2 + floor(wave / 8)` gold per walker, × the enemy's bounty factor (racers and
  gliders ×1, beetles ×1.5, marbles ×0.3, at least 1). Bosses pay `25 + 2 × wave`.
- Clear bonus: `8 + wave` gold to every board still in when a wave ends. No interest.
- Quests and bosses (below). Everything is per board: nothing is shared or stolen.

## Enemies and waves

| Enemy | Health (× wave base) | Speed (squares/s) | Armour (× wave) | Leak cost | Notes |
|---|---|---|---|---|---|
| Wind-up Walker | 1 | 1.6 | 0 | 1 life | the basic toy |
| Tin Beetle | 1.25 | 1.3 | 0.5 | 2 lives | armoured: each hit loses that much (min 1) |
| Pull-back Racer | 0.6 | 2.7 | 0 | 1 life | fast |
| Rolling Marble | 0.3 | 1.9 | 0 | 1 life | swarms of 20–36 |
| Paper Glider | 0.8 | 1.05 | 0 | 1 life | flies the straight diagonal |
| Boss | see below | 0.75 | 0.5 | 5 lives | immune to stun, slows half as well |

Wave base health: `(15 × 1.26^(w−1) + 4(w−1)) × (1 + 0.1 × max(0, w − 9))`, so it ramps hard after
wave 10.

| Wave | Enemies | Walker HP | Bounty per walker | Clear bonus |
|---|---|---|---|---|
| 1 | 10 Wind-up Walker | 15 | 2 | 9 |
| 2 | 12 Wind-up Walker | 23 | 2 | 10 |
| 3 | 12 Pull-back Racer | 32 | 2 | 11 |
| 4 | 24 Rolling Marble | 42 | 2 | 12 |
| 5 | **Rumble Ram** (756 HP, 35 gold) + 6 Wind-up Walker | 54 | 2 | 13 |
| 6 | 10 Tin Beetle | 68 | 2 | 14 |
| 7 | 10 Wind-up Walker + 6 Pull-back Racer | 84 | 2 | 15 |
| 8 | 12 Paper Glider | 104 | 3 | 16 |
| 9 | 30 Rolling Marble | 127 | 3 | 17 |
| 10 | **Tin Juggernaut** (3096 HP, 45 gold) + 5 Tin Beetle | 172 | 3 | 18 |
| 11 | 16 Pull-back Racer | 230 | 3 | 19 |
| 12 | 14 Tin Beetle | 305 | 3 | 20 |
| 13 | 16 Paper Glider | 403 | 3 | 21 |
| 14 | 10 Wind-up Walker + 8 Pull-back Racer + 4 Paper Glider | 532 | 3 | 22 |
| 15 | **Kite Dragon** (11200 HP, flies, 55 gold) + 6 Paper Glider | 700 | 3 | 23 |
| 16 | 36 Rolling Marble | 919 | 4 | 24 |
| 17 | 16 Tin Beetle | 1205 | 4 | 25 |
| 18 | 18 Pull-back Racer + 6 Paper Glider | 1578 | 4 | 26 |
| 19 | 10 Tin Beetle + 20 Rolling Marble | 2066 | 4 | 27 |
| 20 | **The Grand Wind-Up** (81090 HP, 65 gold) + 6 Tin Beetle + 6 Pull-back Racer | 2703 | 4 | 28 |

**Boss rewards** (only for a board that topples its own boss; a leaked boss costs 5 lives):

| Boss | Wave | Reward |
|---|---|---|
| Rumble Ram | 5 | a free random **tier-4** tower |
| Tin Juggernaut | 10 | a free random **tier-5** tower |
| Kite Dragon | 15 | a free random **tier-5** tower **and** a free builder level |
| The Grand Wind-Up | 20 | a free random **tier-6** tower and a 500-point score bounty |

A gift lands on the best free square at once. On a full board it waits and appears as soon as a
square frees up (sell or merge).

## Quick quests

Always on show (left column on desktop and landscape; the Quests button on portrait). Each pays once.

| Quest | Reward |
|---|---|
| Own all 5 different tier-1 towers at once | 40 gold |
| Own 3 × the ordered tier-1 tower | 25 gold |
| Own 3 of the same tier-2 tower | 30 gold + a free random **tier-2** tower |
| Own 3 × the ordered tier-2 tower | 30 gold + a free random **tier-3** tower |
| Own 3 × the ordered tier-3 tower | 80 gold + a free builder level |
| Clear 5 waves in a row without a leak | 50 gold |
| Own a tier-3+ tower of every family at once | 50 gold + a free random **tier-4** tower |
| **Be the first in the lobby to own a tier-6 tower** | 150 gold + 5 lives |

Free quest towers are rolled from your own board's stream and placed like boss gifts (a full board
keeps them until a square frees). Balance reasoning, provisional: a tier-2 tower is two builds (40
gold), a tier-3 four (80), a tier-4 eight (160), so each of those quests is worth a little more than
before (60, 50 and 100 gold), more so the later it tends to land; the gold part is cut so the gift is
the draw. Each quest shows a picture: the ordered tower's own portrait, or a tier tile.

- The owner's "3 of a specific tier-1, tier-2 and tier-3" is three quests: the **ordered** towers
  are picked per match from the seed and are the same for everyone (fair, and named in the HUD).
- "First in the lobby" is cross-board: `state.firstSix` records who claimed it. Boards that reach
  tier 6 in the same 1/60 s step share it; everyone else sees it marked as claimed.
- Added beyond the brief: *clean sweep* (5 waves without a leak) and *family album* (a tier-3+
  tower of every family at once), to reward defence and variety.

## The damage check (after the final wave)

Just for fun. When wave 20 ends, everyone still in gets a **15 s** build phase (Next wave starts it
early), then **The Tally Bear**, a huge wind-up practice target, walks the path of every board still
in at boss speed (slows half as well, no stuns). It has **no health bar** and can't be toppled; a
sign above it counts the damage it has taken, the bar shows yours (and per second), and the player
rail turns into a damage leaderboard. When it walks off the board it costs **no lives**. When every
board's bear is off (or after 60 s) the match ends. The damage goes into `checkDamage`, never into the
score, so it **never changes placements**; the best total is the match's `damageCheck` stat. Bots
play it like any build phase. `damageCheck: false` in the config skips it.

## Scoring and placement

Placement order: **waves survived** (cleared), then **lives left**, then **score** (damage dealt / 10,
plus the final boss's 500 bounty). Equal on all three shares a place. Clearing wave 20 is a win; if
several boards clear it, lives and score separate them. The record unit is *waves*. A strategy
trial (owner decision 20 Nov 2026), like Toy Squad and Toybox Siege: never in Blitz, and only ever
the finale of a Normal or Treasure tournament.

## The player rail, knockout and spectating

The shared **player rail** (`shared/PlayerRail.tsx`) lists every player at the side of the screen:
lives, best tier and score (during the damage check: damage, highest first). Click or tap a row
(or Tab to it and press Enter) to view that board, read-only: a "Watching X · Back to my board"
banner appears (Escape also goes back). The HUD is the same one, showing **their** board: the bar
has their gold and lives, the quest column their quests and progress, and the dock turns read-only
(Board details, their builder level, their Odds, whether they are building, ready or fighting). The
**Board** panel lists everything on that board: gold, lives, score, waves, best tier, merges, the
builder level and odds, the five tower families with how many towers and the best tier of each (the
game's equivalent of traits), every tower grouped by tier, free towers waiting, and the quests. Tap
one of their towers for its sheet (read-only: no Merge or Sell). Nothing acts while you look (no
buttons, no shortcuts) until you go back to your own board. An online spectator following a seat sees
the same read-only HUD. Rows of boards still fighting the current wave glow.

At 0 lives a board is out: its enemies vanish, its towers stay. You are **not** moved anywhere: a
popup offers **Watch other players** or **Dismiss**. The knocked-out bar keeps a **Board** button
for the board on show. Watching puts **‹ ›** in the banner to cycle
through the boards still in; the rail works too. Once **every** human is out, the knocked-out bar
also offers **×1 / ×2 / ×4**: the rules themselves run 1, 2 or 4 sub-steps per step (a `speed`
input, accepted only from a human and only then), so it stays deterministic and works the same on
a server. `watchable`, `cycleWatch`, `viewedBoard` and `stillGoing` in `rules.ts` are pure. Online,
every board is already in the public view (only the seed and each board's roll stream are hidden),
so viewing another board needs nothing extra from the server.

## Multiplayer readiness

The rules core is pure TypeScript, seeded and serialisable (plain objects and arrays; a JSON round
trip mid-match steps on identically, see the unit test). Each board has its own mulberry32 stream
(`rng`) for build and merge rolls, so one player's actions never change another's luck. Inputs are
small and validated (`TdInput`); bad ones are ignored. Locally the host runs one human plus bots.

## Bots

`bot.ts`: easy / normal / hard think every 1.5 / 0.65 / 0.3 s. They merge any pair (lowest tier
first, keeping the result on the better-placed square), hold a pair while collecting an ordered
tower if there is room, level the builder to a per-wave plan, build on the square that reaches the
most path (easy bots build anywhere), sell their weakest tier-1/2 tower when the board is full, and
hard bots move their strongest tower to the best empty square.

## Layout, pan and zoom, and why tap-to-select plus a sheet

Every layout has the quests on the left and the player rail on the right (as on desktop). On
phones both are slim 56–64 px columns: the quest column is a strip of quest pictures with progress
(tap it for the full list), the rail a column of player chips. The 3D camera fits the board into
the HUD's `.td-board-slot` (the space left between the bar, the columns and the dock) with
`setViewOffset`, so the board is **centred** in it on every layout; on a tall, narrow slot it fits
the tray only (the toy box tucks under the quest strip), so the squares get every pixel of width.

**Pan and zoom** (`shared/panZoom.ts`, Tower Tumble's `camera.ts`): a drag that does not start on one
of your towers pans the board; two fingers pinch-zoom and the mouse wheel zooms, toward the fingers
or the cursor; zoom runs 1–3.2 × and the look-at point is clamped near the board, so it can't be
lost. A press that moves less than 10 px is a tap, so selecting and building work as before, also
while zoomed. **Reset view** appears whenever the view has moved. The canvas has `touch-action:
none`, so the browser's own pinch and scroll never fire over the game.

On a phone a square is small (about 28 px in portrait at the fitted zoom): below the 56 px rule. So
squares **only select** (a wrong tap just selects another square, and is undone by Close), and every
action that changes the board is a **≥ 56 px button** in the sheet that opens for the selected
square: *Build here*, *Merge tier N at B3* (up to three partner choices), *Sell* and *Close*. The
selected square has a white ring and its same-tier partners glow gold. With a mouse, clicking a
glowing partner (or dragging onto it) also merges; on touch it only selects the pair (see Merge).
The sheet is a **floating popover** (`shared/popover.ts`, pure and unit-tested): it sits beside its
square (above or below it in portrait, left or right in landscape and on desktop), clamped inside
the board's space widened over the quest column (never over the bar, the player rail or the dock,
which stay reachable; panels such as Odds open above it), and follows the square when the board is
panned. Nothing else moves: the board, the
columns and the dock keep their places (the browser test compares their boxes). With a mouse,
resting on a tower shows the same facts as a floating tip. The dock (Build, Builder, Odds, Next wave) is at the bottom in portrait,
in thumb reach, and at the right in landscape. Prices on the dock and in the sheet use the top
bar's coin and Fredoka 17 px figure. Keyboard: arrows move a cursor, Enter selects or merges, B
builds, U levels the builder, M automatically merges a same-tier pair without selection, Q sells,
N or Space starts the wave; Tab reaches the rail. Same-tier partner highlights also apply to
different tower kinds.

## Rendering and performance

- Only the watched board is drawn. Felt squares, path squares, tower stands, tier pips, plush aura
  rings, hp bars and each enemy kind are **InstancedMeshes**; a tower is one mesh (its Toy Squad
  toy is a single baked geometry); bosses are one mesh.
- Effects (`Fx.tsx`) are one fixed pool of 320 particles feeding one InstancedMesh per shape, reading
  each board's fixed **ring buffers** of shots (48) and pops (24). The rules write those in place,
  so a busy wave allocates nothing for presentation; render loops reuse scratch objects.
- **Status badges** over enemies (slowed, burning, stunned, marked, armour broken) are the shared
  code-drawn badges (`shared/statusIcons.ts`): one InstancedMesh of camera-facing quads per status
  kind, filled from `enemyStatus` (`status.ts`, pure and unit-tested) each frame; at most five extra
  draw calls, none when nothing is debuffed. The legend is under the quests and in the Odds panel.
- The damage check's sign is one sprite whose canvas is redrawn at most ten times a second.
- The HUD re-renders 10 times a second; nothing in React changes per frame.
- Peak renderer counts measured by the browser test are in "Measured" below. This container has no
  GPU (SwiftShader), so there are no frame-rate claims.

## Reuse of shared systems

Toy Squad: toy models and baked geometry (`toyGeometry`, `bakeParts`, materials), toy portraits for
the tower sheet, the attack looks (`EFFECT_SPECS`), status colours and effect shapes (`SHAPE_PARTS`,
now exported: the only change to Toy Squad, additive). Host: `session.ts` lifecycle, bots, results,
records; `audio.ts` cues (`sfx`, `playToyCue`) for every sound; `palette.ts` for colours.

## Historical balance (before the same-tier merge revision)

The figures below used the former identical-tower requirement. The owner's same-tier revision
makes merging easier; these figures are not validation of the revised balance.

Twelve simulated 8-bot lobbies (2 easy, 4 normal, 2 hard per lobby), 1/60 s steps:

- Waves survived: easy averaged 9.6, normal 16.5, hard 16.4. About half the normal and hard bots
  cleared all 20 waves; easy bots mostly fell between waves 5 and 13.
- Best tier: survivors typically finished on tier 6. **13 of 96 boards reached tier 7**, almost all
  on waves 18–20.
- The lobby's first tier 6 came 3–6 minutes in.
- CPU: an 8-bot, 20-wave lobby takes about 0.15–1 s on this container (the unit test reports
  8.2 simulated minutes in 340 ms).

Known balance risks: the bots merge perfectly and never misplace; people will be slower. Hard bots
are not clearly better than normal ones. Boss waves swing hard (a leaked boss costs 5 lives and its
reward). None of this has been played by a person.

## Measured (browser test)

Peak `__toybox.renderInfo()` counts sampled by `tests/e2e/towertumble.cjs` (SwiftShader, Low
quality, 1 human + 3 bots; samples at the mid-wave (with status badges), boss-wave, boss-reward,
spectator and damage-check moments; whole frame including the room, shadows and post passes).
Re-measured 20 November 2026 with the player rail, status badges and the damage check:

| Layout | Draw calls | Triangles | Geometries | Meshes in scene | Live effect particles |
|---|---|---|---|---|---|
| Desktop 1280×800 | 71 | 35,380 | 156 | 186 | 54 |
| Phone portrait 390×844 | 70 | 31,482 | 148 | 186 | 60 |
| Phone landscape 844×390 | 76 | 34,644 | 159 | 186 | 60 |

"Meshes" counts every mesh object, hidden pooled ones included (41 tower slots, the instanced
layers, the effect shapes, eight status-badge layers (one per kind; hidden while empty) and the
damage-check sign), so it is constant.
The portrait figure rose from 57 draw calls. The cause has not been isolated: the badge layers and
the sign add a few calls, and the centred, smaller board leaves more of the room in view. No frame rates are claimed: there is no GPU here.
These boards held a handful of towers; a full 41-tower board at wave 20 has not been measured.

## Unverified

Balance and feel with real players; touch reliability on real phones (only emulated touch);
audio mix; frame rate on any real device; the online version (local bots only for now).
