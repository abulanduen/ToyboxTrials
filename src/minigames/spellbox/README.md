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

These numerical choices and the nine spells are provisional designs for playtesting.

- **No host countdown before the draft** (owner request, 19 Nov 2026). The registry entry sets the
  generic `skipStartCountdown` opt-in (`MinigameDefinition`, `src/minigames/types.ts`), so the host
  (`session.ts`) goes from Start (and Play again) straight to playing and the draft appears at once.
  Every other game keeps the host 3-2-1. Pause, `timeScale`, practice and tournaments are unchanged.
- The draft has **no time limit** (owner request, 19 Nov 2026). Each button has exactly **three
  options**, shown only when that button is selected. Defaults are Pop Rocket, Spring Fan, Bubble Ward.
  Bots obey the same slot restrictions and lock in after a seeded 0.7–2.2 s look at their build.
- **Lock build** is final: a locked player cannot change spells or un-ready. When every player has
  locked in, a 3-second "Fight in 3…" countdown (`config.countdownMs`, simulation time, freezes on
  pause) runs and cannot be cancelled, because nobody can change their build any more. The draft
  never ends while anyone is still choosing; a solo player who idles can pause or quit via the host.
- Events: `spellbox-countdown` `{seconds}` for 3, 2, 1 (sounded as count ticks), then `spellbox-start`.
- The HUD shows a compact card (max 720 px wide) centred over a dimmed, blurred arena, with the
  three slots, the three offers, everyone's lock-in state and the Lock build button. Phones keep it
  inside the viewport and safe areas; in landscape the card scrolls internally if it must.

| Button | Three options |
| --- | --- |
| Q · Ranged | Pop Rocket, Marble Burst, Ribbon Tether |
| E · Area | Spring Fan, Pinwheel Storm, Button Mine |
| R · Utility and movement | Bubble Ward, Repair Stitches, Blink |

Each of the nine spells sits on exactly one button. Blink (the owner's requested ninth spell, a
mobility option) took the R place Button Mine used to share with E, so every button still offers
exactly three and Button Mine stays draftable on E. Spells outside a button's offers are rejected
by the rules, not just hidden in the UI. The build-uniqueness swap in `rules.ts` is kept for any
future shared offer.

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
| Blink | 5 | 11 | 0.12s | 4.2s | Teleport 7 cm along your aim; arrival shockwave, radius 3.2 cm |

**Blink** (`SPELLS.blink`, `BLINK` and `blinkLanding` in `spells.ts`/`rules.ts`; provisional tuning):
- After its 0.12 s cast (rooted, interruptible by a hit, like every spell) the toy teleports up to
  7 cm in the locked aim direction: the farthest point on that line that stays inside the **live**
  radius minus body radius minus a 0.6 cm margin. Aimed outward from beyond that margin it lands
  on the margin circle instead, so Blink can never carry you out of the ring, even mid-shrink.
- It never lands inside another living toy: the landing steps back along the path (0.25 cm steps)
  to the first clear spot, so it stops beside a toy in the way.
- On arrival a shockwave hits every other living toy whose body overlaps 3.2 cm around the landing:
  5 damage and an 11 base push straight outward, through the normal batch, so it scales with the
  target's damage, is reduced by Bubble Ward, causes hitstun and counts as a hit for the caster.
- The caster keeps 40% of their existing momentum, so it is an escape but not a full reset.
- Events: `spellbox-cast` (release), then `spellbox-blink` `{id,fromX,fromZ,x,z}`. Effects:
  `depart` puff at the start, `trail` to the landing, `wave` ring at the landing.
- Bots blink toward the centre when near the (future) edge or flying outward near it, and
  otherwise blink next to an enemy that is near the edge or clustered with others.
- Visuals: a cast ring marks the intended landing during the wind-up; then a ring of cream puffs
  at the departure, a streak to the landing and an expanding honey shockwave ring. All are
  fixed-size instanced pools in `Scene.tsx` with no per-frame allocation.
- Icon: `public/assets/ui/spellbox/blink.webp`, an original hand-drawn SVG
  (`docs/assets/spellbox-blink-icon.svg`) rasterised to 512 px; recorded in the asset manifest.

Mines are limited to two per owner and clamp placement inside the arena. Their button turns from
brass to coral when armed; a ground ring marks the trigger radius. Spell damage excludes its owner.
Pull + mine and rocket + fan are intended combinations, not proven optimal builds.

## Population scaling and shrinking

The owner requested a larger arena for 3, 4–5, 6–7 and 8 players, retaining duel size for two.
The following actual dimensions are first-pass tuning; the bands and 10-second warning are confirmed.

| Living players | Radius | Diameter | Area relative to duel |
| --- | ---: | ---: | ---: |
| 2 | 15 cm | 30 cm | 1× |
| 3 | 21 cm | 42 cm | 1.96× |
| 4–5 | 27 cm | 54 cm | 3.24× |
| 6–7 | 33 cm | 66 cm | 4.84× |
| 8 | 39 cm | 78 cm | 6.76× |

- Spawn spacing scales with the initial population; toy size, speed and spell reach stay unchanged.
- Crossing a population band announces **10 seconds** before contraction. A dashed gold ring marks
  the future edge. Then the physical floor, rim and ring-out boundary shrink together over 3 seconds.
  Bodies outside the moving edge fall out; mines outside it are removed. The camera follows size.
- Another lower band during the warning gets a fresh full 10-second warning to its new target;
  eliminations within a band do not reset it. During contraction, finish the announced target first,
  then warn for a further reduction. No shrink continues after the outcome is known.
- Countdown, contraction and sound cues use simulation time and freeze on pause. Bots seek the
  future safe area. Mouse aim is reprojected through the camera zoom; touch retains its tapped
  world target. `config.radius` is the duel baseline; `state.radius` is the live boundary.

## Combat and provisional balance

- Toy body radius 1.05 cm. Move at 8.5 cm/s with normalized diagonals.
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
- Maximum combat duration 90s; the 1.4s final animation, draft and fight countdown do not count toward survival
  records. Same-tick ring-outs tie; timeout survivors tie. Damage/hits do not break placement ties.
- Bots react to public positions, projectiles, cast warnings and arena edges, with seeded choices
  and 420/260/140 ms decision intervals (easy/normal/hard). They use wards/repair situationally.
  Human combat feel, build balance and real-device performance still need playtesting.

## Controls and implementation

**WASD/arrows** move and face. **Mouse/tap arena** aims. **Q/E/R** cast the three slots; mouse
left-click also casts Q. Touch uses direction pads and three labelled cooldown buttons (≥56 px),
with both orientations and safe-area placement. Native draft cards and Ready support keyboard
focus/Enter as well as touch. Reduced-motion removes decorative effect expansion.

`rules.ts` is renderer/DOM-free and internally fixed at 10 ms. `spells.ts` is the nine-spell data
catalogue. `bot.ts` is fresh per match; `index.ts`/`local.ts` adapt shared actions and bounded pointer
input. Scene/HUD reuse the existing host for loading, pause, results, records and
tournaments. Animation/effect timing follows simulation time. Queues and virtual movement release
on pause/unmount; aim also clears on blur. Nothing here is an online multiplayer server.

Audio (owner: "way too quiet, no feedback when bolts release and hit", 19 Nov 2026). Cues are
synthesised on the shared bus: `playSpellCue` in `src/game/audio.ts` (the older soft `playToyCue`
set is unchanged for Toy Squad). `spellbox/audio.ts` holds the pure event-to-cue mapping
(`spellboxVoice`) and the mixer:

| Event | Cue |
| --- | --- |
| `spellbox-cast` (release) | Pop Rocket `rocket` (pop and whoosh), Spring Fan `gust`, Marble Burst `marbleShot`, Bubble Ward `ward` (bubble bloom), Ribbon Tether `tether` (whip), Pinwheel Storm `whirl`, Repair Stitches `mend` (three tines), Button Mine `mineSet`, Blink `zip` |
| `spellbox-blink` | `thump` (shockwave) |
| `spellbox-burst` (marble or mine pops) | `burst` |
| `spellbox-hit` | `impact`, heavier, lower and louder with the knockback applied (`impulse`, cm/s) |
| `eliminated` | `ringout` (falling whistle, then a thud) |
| `spellbox-shrink-warning` / last 3 shrink seconds / contraction starts | `alarm` / `tick` / `rumble` |
| `spellbox-countdown` 3-2-1 / `spellbox-start` | `tick` / `go` |
| own `spellbox-windup` | `charge` (opponents' wind-ups stay visual) |

- Levels: peaks are similar to Copycat's instruments and Blink Duel's spring sounds (roughly
  0.15–0.32 per voice before the master compressor), up from 0.03–0.1 before.
- Ownership: the local toy's casts, Blink, and every hit it lands **or takes** play at full level
  (gain 1, never attenuated). Opponents play at 0.5 × 1/(1 + distance/14 cm). Ring-outs never drop
  below 0.55.
- Throttling: separate caps per lane (local 3, opponents 2, arena 2 voices per simulation tick),
  one cue per lane per tick (one storm hitting three toys is one impact) and rolling windows
  (local 4 per 250 ms, opponents 2 per 250 ms, arena 2 per 600 ms). Lanes never share a cap, so
  opponents can never crowd out the local toy.
- `?debug`: `__toybox.spellbox.audio()` returns the cues the bus received (counts and loudest gain
  per cue), counted even while audio is locked. It is a test aid, not a loudness measurement.
- These are presentation limits, independent of simulation timing and gameplay events. The cues
  have not been listened to by the author of this pass: real loudness and balance against other
  games need a human ear on real devices.

Run `npm test` (Blink: `tests/unit/spellbox-blink.test.ts`; audio mapping:
`spellbox-audio.test.ts`; host opt-in: `host-countdown.test.ts`), `npm run build`,
`node tests/e2e/spellbox.cjs` and the existing
`node tests/e2e/minigame.cjs` against a preview with Playwright/Chromium. Unit tests cover every
spell, collision, simultaneous impulses, draft locks, limits and natural seeded bot ring-outs.
The browser test uses controlled combat arrangements and real keyboard/mouse/touch adapters for
draft, Q/E/R, damage, cooldown, repair, ring-out, pause, records, restart and hub return.

Verified 19 November 2026: 136 unit tests and production build pass. Desktop/portrait/landscape
checks cover three offers per button, eight-player sizing, the full warning and contraction to
duel size, mouse/touch aim through zoom, casting, ring-outs, records and restart, without console
or page errors. Copycat/Jack practice and a seeded Spellbox/Copycat/Blink Blitz also pass. Real-device
performance, audio quality, online behaviour and competitive balance remain unverified.

Untimed draft, 19 November 2026: unit tests (never-ending draft, countdown start, lock during the
countdown, bot lock-in timing, countdown cues), production build, and `spellbox.cjs` on desktop
(1280×800), phone portrait (390×844) and phone landscape (844×390) pass, including the centred,
blurred draft card, lock-in markers and "Fight in 3…". `spellbox-art.cjs` now uses one bot so the
duel-size ring is centred by the camera. Real-device blur cost and readability are unverified.

Blink, audio and no start countdown, 19 November 2026: 522 unit tests pass (Blink landing, edge
clamp, body clearance, damage-scaled shockwave, ward, cooldown, interrupt, determinism, bot use;
event-to-cue mapping and caps; host `skipStartCountdown` path) and the production build passes.
`spellbox.cjs` passes on desktop (1280×800), phone portrait (390×844) and phone landscape
(844×390): the draft appears with no host countdown (on Start and Play again), Blink is picked in
the draft and cast through the real keyboard/touch adapters (toy moves, stops beside a bot, the
shockwave pushes it, trail/puff/wave effects present, zip/thump/impact/ring-out/alarm cues reach
the audio bus), no console or page errors. `minigame.cjs` passes, and a run of it with a draw that
starts with Spellbox (Spellbox, Midnight Hunger, Inferno Escape) also passes. Nobody has listened
to the new cues: loudness, balance against other games and the effects on real devices are unverified.
