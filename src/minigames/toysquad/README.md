# Toy Squad

Local casual auto-battler, 1–8 contenders with solo clockwork squads or bot fill. Entry: Tournament
Pavilion → **Or practise one trial → Toy Squad**. Ten rounds; still excluded from ranked/tournament
pools. Online play is not implemented. Full unit/passive designs: [CATALOGUE.md](CATALOGUE.md).

## Owner-defined progression

- 8×8 battlefield; deploy in the near four rows. Drag toys to place them. Nonmatching occupied
  squares swap; enemy-side/off-board drops cancel. Mouse, touch and keyboard/tap placement work.
- Combine **two identical toys at the same stars** for the next star: two 1-stars → one 2-star;
  two 2-stars → one 3-star. Three stars is the maximum. Drag duplicates together or use the Merge
  button in **Formation, reserves & merges**. Paid upgrades have been removed.
- Start at Level 1 with three board slots. Level increases each round through Level 10; capacity
  is `min(10, level + 2)`, giving 3/4/5/6/7/8/9/10/10/10 slots over the ten rounds.
- Five shop offers roll independently using the exact odds below. A bought offer stays sold until
  a reroll or next round. All units within a rarity are equally likely; this prototype has no finite
  global shared-copy pool. Rarity counts are Common 16, Uncommon 14, Rare 13, Epic 12, Legendary 7.
- On rounds **3, 6 and 9**, choose one of three unowned passives. It lasts for the run. Ready waits
  for the choice; the build deadline selects the first offer if the player does not choose.

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
- Hit numbers and particles follow the simulation clock; reduced-motion uses stationary feedback.
  Stars and rarity colours mark units. These visuals do not affect damage.
- Solo faces level-weighted clockwork armies. Other fields use seeded cyclic **snapshot** opponents,
  not a shared live PvP arena. Win 3 points, draw 1, loss 0; accumulated surviving health breaks ties.
  A timeout with both armies alive is a draw. Records store points; no ranked ratings are awarded.

The owner has specified ten rounds, the counts/odds, stars, capacity progression and passive timing.
Unit stats/abilities, passive effects, costs/income, reserve size, timings and matchup/scoring balance
are first-pass designs for playtesting, not claims of a finished competitive meta.

## Implementation / handoff

`catalogue.ts`: 62 definitions, exact odds and 12 passive designs. `rules.ts`: validated commands,
shop, merges, currency, progression and results. `combat.ts`: pathfinding, abilities and damage.
HUD commands and 3D drops enter the existing fixed-step host. Input queues clear on pause/unmount;
dragging cancels on pause, focus loss and phase change. Storage keys/schemas are unchanged.

`astra/toy-squad` includes the preceding Midnight/Inferno commits. Preserve Claude's separate
games and room pass when merging; runtime edits outside this module are only its registry entry.

Checks: `npm test`, `npm run build`, `node tests/e2e/toysquad.cjs` against a preview server with
Playwright/Chromium. The test uses controlled duplicates to exercise real purchases, reserve limits
and merges, then plays all ten rounds and chooses the three passives. Real-device performance,
audio quality and strategic balance still need human playtesting.

Verified 18 November 2026: 82 unit tests and production build pass. Desktop, portrait-touch and
landscape-touch browser runs pass stocked purchases, board/reserves, manual merges through three
stars, paid rerolls, hit numbers, ten level/round transitions, passive picks on 3/6/9, records,
restart and hub return without console/page errors. The existing mobile hub/Copycat/Jack/Workshop
regression suite passes too. Headless software rendering is not a real-device FPS measurement.
