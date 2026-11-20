# Toy Squad

Casual auto-battler, 1–8 contenders with solo clockwork squads or bot fill. Entry: Tournament
Pavilion → **Or practise one trial → Strategy games → Toy Squad**, or an online lobby (the server
runs the rules and hides each player's shop and passive offers; see `server/games.ts`). Ten rounds;
not ranked. A strategy trial (owner decisions 19 and 20 Nov 2026): never in Blitz, and only ever the
finale of a Normal or Treasure tournament. Full unit/passive designs: [CATALOGUE.md](CATALOGUE.md).

## Owner-defined progression

- 8×8 battlefield; deploy in the near four rows. Drag toys to place them. Nonmatching occupied
  squares swap; enemy-side/off-board drops cancel. Mouse, touch and keyboard placement work.
- **Pairs merge automatically**, across board and reserves: two identical 1-stars → one 2-star;
  two identical 2-stars → one 3-star. Three stars is the maximum. Deployed recipients take priority,
  then oldest ID; their ID and square stay fixed. Purchases chain immediately, even at full capacity
  when they can merge. Gold rings show deployed recipients for shop upgrades and briefly flash
  after upgrading. Hovering a shop offer narrows highlights to that offer's upgrade chain.
- Eight physical reserve slots sit directly below the near edge of the board. Drag between board
  and reserves; occupied nonmatching squares swap, and the deployment cap still applies. Keyboard:
  **F** selects the next toy and the arrow keys or WASD move it one square (back off the near row
  onto the reserves, forward from a reserve onto the board). There is no formation drawer.
- Selling: drag a toy from the board or reserves onto the shop dock (it turns into a "Drop here to
  sell" target showing the refund), or select a toy and press the **Sell** button between Reroll
  and Ready, or press **Q** (hovered toy, else the selected one). All three send the same `sell`
  command. **R** rerolls; **E** readies. Shortcuts use the shared input queue, ignore held-key
  repeats, and respect pause/phase/Ready locks.
- Tap or click a toy to select it: a white ring marks it, Sell names it with its refund, and its
  details open with a **Close** button (Escape also closes panels). Tapping the bare table clears
  the selection. Hovering a shop card or toy shows the same details on desktop.
- Start at Level 1 with three board slots. Level increases each round through Level 10; capacity
  is `min(10, level + 2)`, giving 3/4/5/6/7/8/9/10/10/10 slots over the ten rounds.
- Five shop offers roll independently using the exact odds below. A bought offer stays sold until
  a reroll or next round. All units within a rarity are equally likely; this prototype has no finite
  global shared-copy pool. Rarity counts are Common 16, Uncommon 14, Rare 13, Epic 12, Legendary 7.
- On rounds **3, 6 and 9**, choose one of three unowned passives. It lasts for the run. The choice
  is a centred modal over a blurred, dimmed screen and nothing else (shop, drags, Sell, Q/R/E,
  arrows) is accepted until it is made; the build deadline selects the first offer otherwise.

| Level | Common | Uncommon | Rare | Epic | Legendary |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 80% | 20% | 0% | 0% | 0% |
| 2 | 70% | 30% | 0% | 0% | 0% |
| 3 | 55% | 35% | 10% | 0% | 0% |
| 4 | 45% | 40% | 15% | 0% | 0% |
| 5 | 35% | 40% | 25% | 0% | 0% |
| 6 | 25% | 35% | 35% | 5% | 0% |
| 7 | 20% | 30% | 40% | 10% | 0% |
| 8 | 18% | 24% | 35% | 20% | 3% |
| 9 | 15% | 21% | 30% | 28% | 6% |
| 10 | 12% | 18% | 28% | 32% | 10% |

## Provisional economy and combat balance

- Ten coins each round; unused coins and owned units carry over. Units cost 1/2/3/4/5 by rarity.
  A reroll costs **2 coins** (1 with Bargain Bin). Eight reserve slots hold purchases when deployed
  capacity is full. Select reserves then a square to deploy or merge; To reserves removes a board unit.
- Stars double base health and damage each step (1×/2×/4×). Selling refunds base cost × copies
  represented minus 1, minimum 1. No interest or permanent economy is added.
- Build 35 seconds, battle up to 25 seconds, recap 3 seconds. Ready locks the squad. Units heal
  before combat. Dead units disappear and never block pathfinding or pick input.
- Living-unit pathfinding seeks attack squares, routes around allies and resolves contested moves
  rather than making every unit wait. Attacks apply simultaneously. Armour, shields, poison, stun,
  healing, splash, chain, pierce, execute, fury and lifesteal are data-driven abilities.
- Hit numbers and effects follow the simulation clock; reduced-motion uses stationary feedback.
  Stars and rarity colours mark units. These visuals do not affect damage.
- Solo faces level-weighted clockwork armies. Other fields use seeded cyclic **snapshot** opponents,
  not a shared live PvP arena. Win 3 points, draw 1, loss 0; accumulated surviving health breaks ties.
  A timeout with both armies alive is a draw. Records store points; no ranked ratings are awarded.

The owner has specified ten rounds, the counts/odds, stars, capacity progression and passive timing.
Unit stats/abilities, passive effects, costs/income, reserve size, timings and matchup/scoring balance
are first-pass designs for playtesting, not claims of a finished competitive meta.

## Unit kits and synergies

All 62 toys have a distinct named **passive** and **spell**, in addition to their basic attack
style. Unit passives are independent of the three run-wide passive choices. Hover a shop card
before buying, hover/select an owned toy, or open the Toy Handbook for the full kit. Compact names appear
on desktop shop cards. Battle mana bars and **Unit spells & mana** show charging and cast counts.

- Basic attacks grant 20 mana. Losing health grants 8 once per tick; fully absorbed hits do
  not. Traits and kits can grant extra mana. Mana is capped at the spell cost (60–100).
- At full mana and off cooldown, the next unstunned action casts instead of attacking. Spells
  can target the nearest enemy anywhere on the board; basic attacks retain their range/pathfinding.
  Silence blocks spells while allowing basic attacks. Stun blocks attacks, casts and movement.
- Every tick is 0.5s. Spell cooldowns are 6–10 ticks. All timers use simulation time and pause.
  Stars multiply spell damage, healing, shields, poison and marks by 1/2/4. Buff values, mana,
  durations, cooldowns and range stay fixed. Spell power adds damage; healing power adds healing.
- AoE enemy effects centre on the targeted enemy; ally auras centre on the caster. Radius uses
  grid distance including diagonals. Line spells extend through the target towards the board edge.
  Lowest-health targeting uses health percentage, then stable ID ties. Healing never revives toys.
- Marks add damage to subsequent hits from any ally. Tricksters can add more against marks.
  Poison refreshes duration and keeps the strongest damage value rather than stacking. Cleanse
  removes poison, stun, silence, marks and negative buffs. Positive buffs remain.
- Buffs refresh per source/effect rather than stacking repeated casts. Different sources can add
  together, capped at ±20 damage/spell power, ±10 armour, ±3 range and ±1 haste. Armour is floored
  at zero; hits deal at least one before shields. Shields accumulate up to maximum health.
  Haste adds an extra basic attack on even ticks; slow skips basic attacks on even ticks.
- Two/four **distinct deployed kinds** activate trait bonuses for matching members. Duplicates
  and reserves do not advance thresholds. Bonuses lock at battle start; losses do not remove them.
  See the catalogue's 11-trait table for exact bonuses.
- Start passives initialize once. Attack/cast triggers count actual actions; hurt triggers count
  ticks losing health. Wounded passives trigger once while alive below 40% health. Actions and
  primary damage resolve as a batch, followed by support effects and one bounded reaction batch.
  A new shield cannot absorb damage already dealt that tick. Reactions do not recurse.

Example formations: Tin Soldier marks a target for Paper Panther's marked-target spell;
Bottle-cap Captain shields Tin allies; Music-box Mage buffs allied spell power; Clockwork and
Artificer mana bonuses help casters cycle. Venom Violinist poisons groups while Pendulum Paladin
holds them with stun. These are strategic options, not established optimal builds.

## Toys and effects (presentation only)

- `models.ts` holds one part list per roster id, built from 17 shared primitives with palette
  colours (tokens or blends of two tokens). `toys.ts` bakes each list into a single vertex-coloured
  geometry, cached per id and drawn with one shared material, so a toy is one draw call. Clockwork
  toys carry a brass key. Each toy also has an idle style (march, hop, float, rock and so on).
- Teams are told apart by the stand: cream on toy blue for the local squad, coral on ink for the
  opponent. The stand's outer band and front notch carry the rarity colour. Star tier, HP/mana bars, the gold upgrade ring
  and glow, dragging, hover and facing work as before; fighters now glide between squares, lunge
  when they attack, spin when they cast, squash when hit and topple when defeated.
- `effects.ts` gives every unit a basic-attack look (shape, flight path, colours, impact) and a
  spell look (shape, colours, cast flourish). `Fx.tsx` plays them from the battle's attack events
  through one pool of 384 particles and one InstancedMesh per shape (18 shapes). Ability visuals:
  splash and spell blast rings at the real radius, chain hop to the second target, pierce and line
  beams, cleave arc, drain drops returning to the attacker, heal crosses to the healed ally.
- Status feedback comes from what changed on each fighter that tick (health or shield up, stunned,
  poisoned, newly marked or silenced, buffs), so it always matches the simulation.
- `prefers-reduced-motion`: no idle motion, lunges or gliding; each attack and spell shows
  stationary markers only (shape on the target, static radius ring or line).
- `?debug` hooks: `__toybox.squad.gallery(yaw, x, z, distance)` shows all 62 toys on the board
  (`null` to leave); `__toybox.squadFx.active()` / `.draws()` report live particles and effect draw calls.
- Budget, counted from the geometry (not a frame-rate claim): toys average about 1,500 triangles
  (largest about 2,700). A fighter is 4 or 5 draw calls (toy, stand, HP, stars, mana in battle).
  Real-device frame rate has not been measured.

## HUD (presentation only)

- **Coins:** shown with the game's coin mark (the brass cog of the Hub's wallet and shop prices,
  `CogIcon`): a large purse counter at the top of the shop's actions (beside them on phones), on
  every shop price, on Reroll and Sell, on the drop-to-sell target, in the banner, and in the
  read-only view of another squad.
- **Shop dock:** the five offers always fit side by side with no sideways scrolling (upright cards
  on phone portrait, compact rows in landscape). A card shows a small picture of the toy, name,
  cost, rarity colour, both trait symbols, a star if the toy is a handbook favourite, and the
  copies already owned by star tier (for example one 1-star and one 2-star), plus the
  auto-upgrade note. Actions are Reroll, Sell, Ready in that order; all targets are at least 56 px.
- **Pictures:** `portraits.ts` renders each toy's baked geometry once with the game's own renderer
  into one shared off-screen target (no extra WebGL context), at most one picture per frame, and
  caches a PNG data URL per roster id.
- **Rarity colours:** common grey, uncommon green, rare blue, epic purple, legendary yellow
  (`RARITY` in `src/game/palette.ts`). Used for shop card borders and picture panels, the handbook,
  health bars, and the outer band and front notch of each toy's stand. The stand's inner rim and
  top still show the team (cream on blue for you, coral on ink for the opponent).
- **Traits:** each of the 11 traits has an original code-drawn SVG symbol (`TraitIcon.tsx`). The
  traits of your deployed toys sit in a column at the left edge in build and battle, with a count
  towards the next threshold and a highlight when active. Tapping one opens its bonus, your
  progress and every toy with that trait, with a Close button.
- **Toy Handbook:** the Toys button (top left) lists all 62 toys with picture, rarity, cost, trait
  symbols, stats, passive and spell, filterable by rarity and trait. Each has a star toggle;
  favourites are saved in the shared settings (`squadFavourites`) and marked on shop cards.
- **Player rail** (`shared/PlayerRail.tsx`, shared with Toy Tower Tumble): every player in a column
  at the right edge (a 64 px chip column on phones), in standings order (points, then surviving
  health: the placement order), with points and wins. A rosette, an even sign or a cross marks how
  each player's last match went (a public `last` field the rules set at the recap); during the
  build, players still building glow. Tap or click a row (or Tab and Enter) to view that player's
  board, read-only: their deployed toys and reserves while building, their battle, damage numbers,
  effects and damage overview while fighting. "Watching X · Back to my board" (or Escape) returns.
  The HUD shows **their** picture (owner request, 20 Nov 2026): the trait column is their traits
  (tap one: their progress), the banner their level, points, coins and passives, and in the shop
  dock's place a read-only panel with their level, coins, board count, ready state, the three
  run-wide passives they chose (their build) and every toy on their board and reserves with stars
  (tap one, here or on the board, for its kit). Their shop stays private. **Nothing acts while you
  look**: no shop, Reroll, Sell, Ready, drags or shortcuts until you go back to your own board (a
  passive choice brings you back on its own). An online spectator following a seat sees the same
  read-only HUD. Toy Squad has no quests. It replaces the old standings box, which covered the board on phones.
  On phones the camera frames the board in the space left of the rail. Online, the server is told
  whose board you are viewing (the lobby `watch` message, for a seated player) and adds that
  board's battle to your snapshots; shops and passive offers stay private.
- **Debuff badges:** the shared code-drawn status badges (`shared/statusIcons.ts`, the same as Tower
  Tumble's) float over fighters that are poisoned, stunned, marked, silenced, or have a net
  negative haste (slowed), armour (armour broken) or damage, spell power or range (weakened)
  buff, read by `fighterStatus` in `info.ts` exactly as the next battle tick reads them. One
  instanced quad mesh per status kind; the key is in the battle's "Spells, mana & badges" tab.
- **Damage overview:** during the battle and the recap, a panel at the right (beside the player
  rail, opposite the traits) lists the viewed squad's toys with picture and name, damage dealt high to low with a bar each (the blue
  part is spells and passives), and a Taken toggle for health lost. A row flashes when that toy
  lands or takes a hit (a static outline with reduced motion). It starts folded into a Damage tab on
  phones and can be folded anywhere. The numbers are a read-only `stats` tally on each fighter that
  the rules never read; it adds up to exactly the hit numbers shown over the board.
- **Sound:** only your own purchases and upgrades click, and only your own battle makes combat
  sounds; the other contenders' boards are silent. Each battle tick plays at most three voices
  (one spell chime, light hits, one heavier thump when four or more attacks land). `sounds.ts`
  holds this filter as pure, unit-tested logic.
- Pure helpers for these panels are in `info.ts`; `local.ts` holds drag/selection UI state.

## Implementation / handoff

`catalogue.ts`: 62 definitions, exact odds and 12 run-passive designs. `kits.ts`: 62 individual
passive/spell pairs and 11 traits. `spellcraft.ts`: targets, bounded support effects and synergies.
`rules.ts`: validated commands, shop, merges, currency, progression and results. `combat.ts`:
pathfinding, mana, automatic spells, attack styles and simultaneous damage.
HUD commands and 3D drops enter the existing fixed-step host. Input queues clear on pause/unmount;
dragging cancels on pause, focus loss and phase change. Storage keys/schemas are unchanged.

`astra/toy-squad` includes the preceding Midnight/Inferno commits. Preserve Claude's separate
games and room pass when merging; runtime edits outside this module are only its registry entry.

Checks: `npm test`, `npm run build`, `node tests/e2e/toysquad.cjs` against a preview server with
Playwright/Chromium (`SQUAD_LAYOUTS=desktop|portrait|landscape` runs one layout). The test uses
controlled stock to exercise automatic merges, owned 1/2-star indicators, shop pictures, rarity
colours, the five offers fitting without sideways scrolling, trait symbols and trait details, the
Toy Handbook with filters and a saved star shown on a shop card, unit details Close, the Sell
button, drag-to-sell, keyboard placement, Q/R/E shortcuts and physical reserve dragging/swaps.
It checks the damage overview in battle, then plays all ten rounds, where the passive modal must
block Q/R/E until a choice is made. Real-device performance, audio quality and strategic balance
still need human playtesting.

Verification, 20 November 2026 (player rail, debuff badges, board viewing): 920 unit tests (whole
suite), the production build and the server build pass; `tests/e2e/toysquad.cjs` passes on desktop,
portrait-touch and landscape-touch, now with three bot squads, the rail (standings order, compact on
phones, keyboard and touch switching, the viewed battle in the damage overview, last-match marks) and
the badges.

Verification, 18 November 2026 (HUD update): 284 unit tests and the production build pass. The
desktop, portrait-touch and landscape-touch ten-round checks above pass without console/page errors.

The existing mobile hub/Copycat/Jack/Workshop regression suite passed with the prior unit-kit update. Headless software
rendering is not a real-device FPS measurement.
