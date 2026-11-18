# Toy Squad — local first pass

Entry: Tournament Pavilion → **Or practise one trial → Toy Squad**. Supports solo clockwork
opponents and up to eight local contenders with bot fill. Casual-only: existing tournament/ranked
eligibility stays off until this longer strategy game is balanced. No online play is added.

Buy Tin Soldiers (balanced melee), Wind-up Robots (durable melee) and Spring Hares (fragile ranged).
Select a toy on the six-square formation board, then select a destination to move/swap it. The enemy
is to the right. Upgrade a selected toy for 3 coins (maximum level 3), or sell it for a partial refund.
Ready locks the squad and starts combat when everyone is ready; the timer starts it otherwise.
All controls work with mouse, touch, or keyboard Tab/Enter. There are no drag-only interactions.

## Provisional format and balance

- Three rounds. Each grants 10 coins; unused coins and units carry over. Units heal fully for each fight.
- Build 30 seconds; battle maximum 20 seconds; round recap 3 seconds. A finished field ends combat early.
- Board capacity six units, two rows of three. Front squares are on the right; ranged units benefit
  from back positions. No combining mechanic yet; explicit upgrades provide the optional progression.
- Units cost 3/4/4 coins. Upgrades add 5 health and 1 damage per level. Refund is base cost minus 1;
  upgrade spending is not refunded. No interest, reroll, paid shop or permanent currency.
- Combat ticks every 500 ms. Toys seek nearby enemies, advance, and automatically attack in range.
  Damage uses simultaneous intents; mutually lethal attacks tie. Combat positions never overlap.
  A timeout with both squads alive is a draw, rather than arbitrarily declaring a health winner.
- With several contenders, a seeded cyclic pairing gives each squad an independent battle against
  a **snapshot** of the next contender's formation. Odd fields need no bye; results are not a shared
  live PvP arena. Solo uses an explicit clockwork army that grows from 2 to 4 units over the rounds.
- Win = 3 points; draw = 1; loss = 0. Highest total wins; accumulated surviving unit health breaks ties.
  Equal totals/health share a placement. Local records store points; this is not a ranked rating.

The round count, matchups, unit stats, costs and victory/scoring rules are first-pass choices for
the open design questions, not final owner-approved balance.

## Implementation and handoff

Pure rules own currency, inventory, formation, ready locking, combat, round transitions and results.
The HUD queues typed commands into the existing fixed-step host. Queue size is bounded and cleared
on pause/unmount. Scene/HUD guard against other modules' retained state during loading/intro.
The host retains countdown, pause, restart, results and local record persistence.

Branch `astra/toy-squad` builds on `astra/midnight-hunger` (including Inferno). Merge/review those
commits first. Runtime edits outside this folder are limited to Toy Squad's registry entry. Preserve
Claude's work on Find the Original, movement games, Music Box Rhythm and the room when merging.

Checks: `npm test`, `npm run build`, `node tests/e2e/toysquad.cjs`, and the existing mobile regression
against a preview server (Playwright/Chromium required). Real-device performance, sound mix,
strategic balance and visual polish still need playtesting.

Verified 18 November 2026: 71 unit tests and production build pass. Desktop, touch portrait and
touch landscape browser flows pass purchasing/budget limits, upgrades, formation, selling,
pause, keyboard/touch Ready, three battles, next-round income, records, restart and hub return
with no console/page errors. The portrait/short-screen editor scrolls to reach Ready.
The existing mobile hub/Copycat/Jack/Workshop suite also passes. Its test now queues Copycat
touches while debug simulation time is frozen and waits for Jack's actual interaction prompt,
avoiding protocol-latency failures; production game rules were not changed for those checks.
