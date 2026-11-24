# Midnight Hunger — local first pass

Entry: Tournament Pavilion → **Or practise one trial → Midnight Hunger**. Also available in local
bot tournaments, 2–8 contenders. Also playable online (server-run; see the end of this file).

Move with WASD/arrows or the four held/tapped direction pads. During the 10-second night,
face a battery-carrying clockwork bot and use **Spacebar / Hit** three times to claim its recharge.
Three pips show remaining hits. Contact never collects it. Each night spawns **N−1** targets for N living
players. During the day, head to one of the four roofed green corner shelters. Energy drains
everywhere; daylight accelerates it and shelter slows it. Zero energy eliminates a contender;
the last survivor wins. Eliminated players watch until results.

Living contenders also have camera-facing overhead energy bars. Fill tracks the existing
energy pool; green above 50%, yellow above 25%, red at 25% or below. Your bar has a honey frame,
bots have cream frames. Bar height scales for small screens. Eliminated toys have no overhead
bar. HUD energy values remain available; the survival/recharge rules are unchanged.

## Provisional balance and interpretations

These implement the existing concept; they are playtest choices, not final mechanics:

- 11×11 board, shared centre spawns. Living toys and battery bots collide. Moving into an idle
  toy pushes it one cell; chains push only if all destinations are free and in bounds. Holding
  opposite to the push resists it; moving with it or perpendicular does not. Dead toys do not block.
- Movement intent is refreshed by held input; release clears resistance. Stale intent expires after
  three movement intervals so disconnected/idle input cannot resist indefinitely.
- Battery damage is shared between attackers; the third hit claims the battery. Hits reach one tile
  straight ahead, at a provisional 400 ms cooldown. Held Space/Hit repeats. Attacks do not damage players.
- Night 10 seconds, day 8 seconds, movement interval 190 ms, target movement every 750 ms.
- Start/cap 100 energy. A battery restores 40. Each player can catch one per night; caught targets
  disappear and unused targets expire at dawn. This makes the N−1 scarcity leave someone unfed.
- Drain per second: night 2, exposed day 9, sheltered day 3. Shelters do not stop energy loss.
- A maximum 180-second run prevents tournaments stalling; surviving players share first place.
  Other placements follow elimination time, with simultaneous exits tied. Records count seconds survived.
- Simultaneous attacks use a seeded, per-night contestant order; do not mistake this local
  tie policy for a finished online latency/fairness solution.
- Bots chase and hit available targets, then seek shelter; difficulty changes decision interval/return timing.

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

Collision/combat revision: 59 unit tests and production build pass. Midnight desktop/portrait/
landscape checks verify solid battery collision and exactly three Spacebar/Hit attacks to recharge.
Inferno desktop/touch checks verify Spacebar breaking, R building and touch equivalents. The
existing mobile hub/Copycat/Jack/Workshop regression remains green.

## Online: own-toy prediction

Online, your own toy turns and hops a cell the frame after you press, instead of a network round
trip later: `predict.ts` replays your not-yet-stepped inputs on the newest server state with the
rules' timing and the server's held-input repeat (`../shared/predictGrid.ts`; see docs/ONLINE.md,
"Own-toy prediction"). Everything else stays the server's. Tests: `tests/unit/midnight-predict.test.ts`.
