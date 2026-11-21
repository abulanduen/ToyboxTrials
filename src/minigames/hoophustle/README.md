# Hoop Hustle

A 75-second shootout for 2–8 toys (bots fill) at one shared hoop on a toy-sized court. Party trial:
practice, Blitz / Normal / Treasure tournaments and online lobbies. Gate: inside the gates table's
loop, west of the avenue, facing it (Toybox Siege's mirror). Owner-approved design (20 Nov 2026).

## Files

| File | What |
| --- | --- |
| `physics.ts` | The ball: the Hub basketball's launch angle, throw speeds, gravity, release point, ball and rim sizes and bounces (imported from `src/game/hubPlay*.ts`), on the trial's own court whose hoop slides along x. `perfectPower` solves the throw that drops through the middle of the rim. |
| `rules.ts` | Deterministic rules core (60 Hz, seeded, `drainEvents`): spots, throws, assists, hops, the slide, gold balls, the buzzer, results. |
| `bot.ts` | Bots shoot on a rhythm; accuracy from the difficulty. |
| `local.ts`, `index.ts` | The local player's aim and charge (keyboard, mouse, joystick, Throw button) → inputs. |
| `Scene.tsx`, `Hud.tsx`, `hoophustle.css` | Court, hoop and track, toys, balls, aim marker and the gold arc preview; the HUD. |

## Rules as built

- **Spots:** three taped arcs at 16, 23 and 30 cm from the hoop, 8 spots each across ±62°, worth 1,
  2 and 3 points. Everyone starts on a different 1-point spot (seeded). After a make the toy hops
  (0.7 s) to a new free spot: a ring chosen evenly among rings with room, then a spot on it, from
  `subSeed(seed, "<id>:spot:<makes>")`. A spot is reserved the moment the hop starts, so no two toys
  ever share one.
- **Throwing:** hold to charge, let go to throw. The meter is the shared shot meter
  (`src/minigames/shared/shotMeter.ts`, also the Hub's and Hoop Clash's): it winds up from empty to
  full in 1.1 s, then back down to empty in the next 1.1 s, and so on while held (owner request,
  21 Nov 2026: "wind back and forth", so timing the release matters and holding on never parks it
  at full). Letting go throws at the power the meter shows. **Cancel** (X, the right mouse button, or
  sliding the thumb off the Throw button) drops the charge without a throw (`cancel` input,
  `hh-cancel` event); the button must come up before it charges again. One ball per
  toy: the next arrives 0.35 s after a miss is decided, or when a hop lands. A shot is decided when it
  drops through the rim (make) or first touches the court (miss; "short" or "long" for the HUD).
- **Aim assist (the Hub's):** a facing within 0.75 rad of the hoop bends onto it.
- **Power assist (this trial's own, interpretation):** the Hub's raw scoring window is only about
  ±0.02 of power (±20 ms of holding), too tight for a scored party trial. Letting go within
  `assistBand` of the perfect power (±0.06 / ±0.045 / ±0.035 for 1 / 2 / 3-point spots, about
  ±66 / 50 / 38 ms) throws the perfect power. The charge meter shows that band as its gold zone, and
  the arc preview (which runs the rules' own physics, assists included) turns gold exactly when the
  throw will go in. Further off, the throw flies as charged (it can still rattle in).
- **Sliding hoop:** from half time (37.5 s) the hoop slides ±5 cm on its wind-up track, one
  left-right-left cycle every 5 s, as a clipped sine so it rests about 1.3 s at each end. Warned for
  3 s before (banner, the track's key winds, the hoop shudders, arrows flash, a ratchet sound). The
  aim assist bends onto where the hoop is when you let go; the perfect power accounts for its slide
  during the flight, and is null (no gold zone) when the hoop will have moved away.
- **Gold ball (interpretation of "each toy's next ball"):** in the last 15 s each toy gets one gold
  ball: the ball in hand at that moment, or the next one. It scores double. `goldBalls` in the config
  makes it more than one.
- **Buzzer:** at 75 s nobody can shoot; balls already in the air still count. The match ends when the
  last ball is decided and the last hop has landed, plus 1.5 s.
- **Winner:** most points; ties by baskets made, then a shared place (`rankByKey`). Record score:
  points.
- **Bots:** wait 0.8–1.5 s (easy), 0.5–1.0 s (normal) or 0.32–0.65 s (hard) with a ball in hand, pick
  a release time when the (sliding) hoop has a perfect power, charge for as long as their intended
  power needs on the meter's first rise (`holdForPower`), and let go. Intended power = perfect + a seeded error (sd 0.09 / 0.062 / 0.04), so they
  miss short or long. Measured in an 8-bot match (seed 99): about 40 % / 52 % / 68 % of shots made.

## Controls

- Desktop: A / D or the arrow keys turn the aim; the mouse aims too (point on the court). Hold Space,
  E or the left mouse button to charge (the meter winds up and back); let go to throw. X or the right
  mouse button cancels.
- Touch: the floating joystick (lower left) aims, relative to the camera (up is towards the hoop). The
  big Throw button (lower right) is held to charge and let go to throw; sliding the thumb off it
  cancels (the shared hold-to-shoot button, `src/minigames/shared/holdToShoot.ts`). It acts on
  pointer-down, so it works while the other thumb holds the stick.
- The meter's needle carries a chevron pointing the way it is winding, and the fill fades on the way
  back down (`shotMeterView.ts`, `shotMeter.css`).

## Online

`server/games.ts`: inputs `aim {yaw}`, `charge`, `cancel`, `throw {power?, yaw?, at?}`. A throw carries
the power the player's meter showed and the match time they let go; the rules honour that time up to
`maxLagMs` (250 ms) back, flying the ball the missed steps at once, so the gold arc a player saw is
the throw they get (with the sliding hoop too). A modified client could choose its power, as it
could by timing; the assist already makes a perfect power easy to hit. Hidden: the seed (it deals the
next spots) and queued inputs.

## Look and cost

Court, lines, spots and track are one Kit merge (2 draws), the hoop's moving parts one more plus the
net; balls share one material (orange or gold geometry). MiniContenders for opponents, the WindupBot
for you. Headless rendering here is software-only: no frame rate has been measured on a phone.
