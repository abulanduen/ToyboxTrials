# Midnight Hunger — local first pass

Entry: Tournament Pavilion → **Or practise one trial → Midnight Hunger**. Also available in local
bot tournaments, 2–8 contenders. Online multiplayer is future work.

Move with WASD/arrows or the four held/tapped direction pads. During the 10-second night,
touch a battery-carrying clockwork bot to recharge. Each night spawns **N−1** targets for N living
players. During the day, head to one of the four roofed green corner shelters. Energy drains
everywhere; daylight accelerates it and shelter slows it. Zero energy eliminates a contender;
the last survivor wins. Eliminated players watch until results.

## Provisional balance and interpretations

These implement the existing concept; they are playtest choices, not final mechanics:

- 11×11 board, shared centre spawns; players can pass through one another (no blocked shelters).
- Night 10 seconds, day 8 seconds, movement interval 190 ms, target movement every 750 ms.
- Start/cap 100 energy. A battery restores 40. Each player can catch one per night; caught targets
  disappear and unused targets expire at dawn. This makes the N−1 scarcity leave someone unfed.
- Drain per second: night 2, exposed day 9, sheltered day 3. Shelters do not stop energy loss.
- A maximum 180-second run prevents tournaments stalling; surviving players share first place.
  Other placements follow elimination time, with simultaneous exits tied. Records count seconds survived.
- Simultaneous target arrivals use a seeded, per-night contestant order; do not mistake this local
  tie policy for a finished online latency/fairness solution.
- Bots chase available targets, then seek shelter; difficulty changes decision interval/return timing.

## Integration and validation

The module owns its rules, input adapter, bots, scene, HUD and CSS. The shared host handles loading,
countdown, pause, results, records, restart and tournament scoring. Only the Midnight registry entry
changes runtime code outside this directory. Scene/HUD guard against the prior game's retained state
during transitions. Shared input/audio/characters are reused.

Branch `astra/midnight-hunger` is based on `astra/inferno-escape`: merge Inferno first, or review
both branches together. Keep Claude's Find the Original, movement games and room pass when resolving
registry/doc/test overlaps. Do not replace the entire registry or host with an older copy.

Checks: `npm test`, `npm run build`, `node tests/e2e/midnight.cjs`, `node tests/e2e/minigame.cjs`
and `node tests/e2e/mobile.cjs` against a preview server (Playwright/Chromium required).
Real-device performance, audio mix and balance need playtesting. No server or ranked system is added.

Verified 18 November 2026: all 55 unit tests and production build pass. Midnight's desktop,
touch portrait and touch landscape checks pass scarcity, movement, recharge, pause, day/shelter,
results, record persistence, restart and hub return with no console/page errors. Existing
Copycat/Jack checks, a mixed Blitz including Midnight, and the mobile regression suite pass.
Chromium software rendering is functional evidence, not a real-device performance benchmark.
