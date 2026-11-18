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

## Unit kits and synergies

All 62 toys have a distinct named **passive** and **spell**, in addition to their basic attack
style. Unit passives are independent of the three run-wide passive choices. Inspect shop kits
inside Formation before buying, or select an owned toy for its full kit. Compact names appear
on shop cards. Battle mana bars and **Unit spells & mana** show charging and cast counts.

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
Playwright/Chromium. The test uses controlled duplicates to exercise real purchases, reserve limits
and merges, then plays all ten rounds and chooses the three passives. Real-device performance,
audio quality and strategic balance still need human playtesting.

Unit-kit verification, 18 November 2026: 97 unit tests and production build pass. Desktop, portrait-touch and landscape-touch
ten-round checks pass kit descriptions, distinct-kind trait counts, mana-driven spells and particles,
alongside purchases, merges, passive picks, records and restart, without console/page errors.

The existing mobile hub/Copycat/Jack/Workshop regression suite passes too. Headless software
rendering is not a real-device FPS measurement.
