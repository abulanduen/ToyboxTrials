# Spellbox Showdown

Local playable first pass on `astra/spellbox-showdown`, based on Blink Duel. Enter through
Pavilion → **Or practise one trial → Spellbox Showdown**. Two to eight contenders; solo practice
uses bots. Included in local tournaments; registry ranked eligibility does not implement online
PvP, ratings or server authority. No dependency or saved-data schema changes.

## Established mechanics

Choose spells to make a build. Each spell has its own effect and cooldown. Damage accumulates
and increases knockback; it is not health. Crossing the circular edge eliminates you. Last toy
inside wins. The wooden/plastic ring, wand toys and spell effects use original procedural geometry,
the shared palette, WindupBot/MiniContender and synthesised sound.

## First-pass draft and roster

These numerical choices and the eight spells are provisional designs for playtesting.

- Draft lasts up to 20 seconds. Choose one of three slots, then a spell card. Equipping a spell
  already in another slot swaps the slots, keeping three distinct spells. Ready locks the build;
  all Ready starts combat early. The deadline keeps the current build. Choices reset each match.
- Default build: Pop Rocket, Spring Fan, Bubble Ward. Bots use varied seeded builds with at least
  one ranged spell and one close-range push. Human builds may freely combine any three spells.

| Spell | Damage | Base impulse | Wind-up | Cooldown | Effect |
| --- | ---: | ---: | ---: | ---: | --- |
| Pop Rocket | 14 | 9 | 0.18s | 1.3s | Fast single-target projectile; range 30 cm |
| Spring Fan | 8 | 13 | 0.42s | 2.4s | 6 cm, 120° cone; affects multiple enemies |
| Marble Burst | 10 | 10 | 0.32s | 3s | Range 26 cm; explodes on contact/expiry with 3.5 cm radius |
| Bubble Ward | — | — | Next tick | 5s | Reduce incoming damage and impulse by 65% for 1.2s |
| Ribbon Tether | 6 | 8 inward | 0.24s | 3.4s | Range 25 cm; pulls its target toward the caster |
| Pinwheel Storm | 12 | 16 | 0.65s | 4.4s | Marked 5.5 cm radial blast around the caster |
| Repair Stitches | −20 | — | 0.45s | 6.5s | Remove damage; existing momentum continues |
| Button Mine | 16 | 17 | 0.3s | 3.8s | Place 3.5 cm ahead; arms in 0.6s, radius 3 cm, lasts 6s |

Mines are limited to two per owner and clamp placement inside the arena. Their button turns from
brass to coral when armed; a ground ring marks the trigger radius. Spell damage excludes its owner.
Pull + mine and rocket + fan are intended combinations, not proven optimal builds.

## Combat and provisional balance

- Arena radius 15 cm; toy body radius 1.05 cm. Move at 8.5 cm/s with normalized diagonals.
  Living bodies block movement; dead toys do not. You can walk off the edge yourself.
- Hits add damage, capped at 300. Impulse scales by **1 + post-hit damage / 70**. All hits in one
  tick use the same total, then vector-sum their impulses. Shield reduction applies to both damage
  and new impulse; it does not erase existing momentum. Maximum knockback speed is 40 cm/s.
- Momentum decays exponentially at 2.4/s. A hit removes movement control for 180 ms, then allows
  steering against momentum. Casting roots walking; momentum still moves the caster. Aim locks
  for the pending spell. A hit interrupts an unfinished cast without refunding its cooldown.
- Cooldown starts at commitment. One cast at a time, with a 150 ms action gap; repeated/held
  key presses cannot bypass timers. Bubble Ward activates before that tick's damage batch.
  Repair likewise resolves before incoming damage. Neither spell resurrects eliminated toys.
- Projectiles use swept segment/body collision and hit the nearest living enemy. Area effects
  use body-circle overlap; the fan uses exact circle/sector intersection. Mines/projectiles cast
  before an elimination may still resolve in the same tick; combat stops when the outcome is known.
- Maximum combat duration 90s; the 1.4s final animation and draft do not count toward survival
  records. Same-tick ring-outs tie; timeout survivors tie. Damage/hits do not break placement ties.
- Bots react to public positions, projectiles, cast warnings and arena edges, with seeded choices
  and 420/260/140 ms decision intervals (easy/normal/hard). They use wards/repair situationally.
  Human combat feel, build balance and real-device performance still need playtesting.

## Controls and implementation

**WASD/arrows** move and face. **Mouse/tap arena** aims. **Q/E/R** cast the three slots; mouse
left-click also casts Q. Touch uses direction pads and three labelled cooldown buttons (≥56 px),
with both orientations and safe-area placement. Native draft cards and Ready support keyboard
focus/Enter as well as touch. Reduced-motion removes decorative effect expansion.

`rules.ts` is renderer/DOM-free and internally fixed at 10 ms. `spells.ts` is the eight-spell data
catalogue. `bot.ts` is fresh per match; `index.ts`/`local.ts` adapt shared actions and bounded pointer
input. Scene/HUD reuse the existing host for loading/countdown, pause, results, records and
tournaments. Animation/effect timing follows simulation time. Queues and virtual movement release
on pause/unmount; aim also clears on blur. Nothing here is an online multiplayer server.

Run `npm test`, `npm run build`, `node tests/e2e/spellbox.cjs` and the existing
`node tests/e2e/minigame.cjs` against a preview with Playwright/Chromium. Unit tests cover every
spell, collision, simultaneous impulses, draft locks, limits and natural seeded bot ring-outs.
The browser test uses controlled combat arrangements and real keyboard/mouse/touch adapters for
draft, Q/E/R, damage, cooldown, repair, ring-out, pause, records, restart and hub return.

Verified 19 November 2026: 130 unit tests and production build pass. Desktop, portrait-touch and
landscape-touch Spellbox flows pass without console/page errors. The existing Copycat/Jack
practice checks and a seeded Spellbox/Copycat/Blink Blitz pass results, scoring, standings,
history and hub return. Real-device performance, audio quality, online behaviour and competitive
balance are not established by these checks.
