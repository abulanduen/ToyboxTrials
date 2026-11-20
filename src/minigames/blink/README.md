# Blink Duel

Local first playable module on `astra/blink-duel`, based on the pushed Toy Squad branch.
Pavilion → **Or practise one trial → Blink Duel**. Two to eight contenders; solo practice adds
bots through the existing host. Included in local tournaments. Ranked eligibility is catalogue
metadata only; online PvP, accounts and ratings are not implemented.

## Established design

- Blink has **no cooldown**. Each distinct press teleports in the aimed direction. No mana,
  charges, invulnerability frames or blink cooldown have been added.
- One successful sword hit eliminates a toy. The last survivor wins.
- Every attack has a long, visible wind-up. A striped cone shows the full threatened sector;
  its fill and the HUD bar show charging. Toy swords and spring-pop blinks are procedural.

## First-pass choices for playtesting

All numbers below are provisional `BlinkConfig` values, not additional owner-specified mechanics.

| Setting | Default |
| --- | --- |
| Arena | 32 × 32 cm, bounded cardboard rail |
| Toy collision radius | 1.05 cm |
| Movement | 8 cm/s, normalized diagonals |
| Blink reach | Up to 8 cm |
| Sword sector | 5.5 cm, 120 degrees; exact body-circle/sector intersection |
| Wind-up | 950 ms |
| Attack recovery / cancelled-attack recovery | 350 ms |
| Match limit | 90 s |
| Final animation | 1.2 s, excluded from survival score |

- Movement and facing lock during wind-up. You may aim a different blink direction, then blink
  to cancel the attack. Cancelling starts attack recovery; it never blocks further blinks.
  Neutral blinks do not reset an existing attack-recovery timer.
- Blink can cross living toys. Its endpoint is clamped inside the rail; if occupied, the rules
  search backwards along the blink segment in 64 samples for a free endpoint. No landing overlap.
  A blink into a boundary with no meaningful movement is ignored, rather than counted as success.
- Living toys block walking. Dead toys cannot move, attack or block. Movement uses small fixed
  steps with sliding and rotating priority for contested destinations.
- Inputs apply before hits on each 10 ms simulation tick, so a blink on the strike tick can dodge.
  Simultaneous strikes use the same living snapshot: mutual eliminations are possible. Eliminations
  on the same tick tie; timeout survivors tie. Kills are feedback, not a placement tie-break.
  Records use whole survival seconds; no online ranking is awarded.
- Bots read public positions and wind-up cones, with seeded choices and 420/260/140 ms decision
  delays (easy/normal/hard). They get one dodge decision per observed enemy swing, with a
  40%/65%/90% success-attempt chance. They do not read future human inputs. Balance needs playtesting.

## Controls and accessibility

- **WASD / arrows:** move and face. Opposite directions cancel; diagonals are normalized.
- **Mouse / tap arena:** aim. Touch taps retain a world target; mouse aim follows the cursor.
- **Space:** blink; release and press again for another instant blink.
- **J / left click:** start a sword swing. Repeated presses cannot bypass wind-up or recovery.
- **Touch:** steer with the shared floating joystick (lower left); tap the arena to aim; use the Blink
  and Swing buttons, which fire on touch-down so they work while the other thumb holds the stick. All buttons
  are at least 56 px, with both portrait and landscape layouts and safe-area margins.
- Pause uses the existing host. Local aim/queues and held virtual directions clear on pause,
  blur/unmount; simulation time drives cones, blink bursts and strike flashes. Reduced-motion
  keeps blink rings stationary and removes the decorative sword sweep.

## Implementation and checks

`rules.ts` is DOM/renderer-free, seeded and internally fixed at 10 ms; `bot.ts` is a fresh seeded
policy per match. `index.ts` and `local.ts` translate existing shared actions and pointer aiming;
`Scene.tsx` reuses WindupBot/MiniContender and the shared palette/synth sounds; `Hud.tsx` supplies
native buttons. The existing host owns countdown, pause, records, results and tournaments.
No saved-data keys, dependency changes, shared movement rewrites or Claude-owned games were added.

Run `npm test`, `npm run build`, and `node tests/e2e/blink.cjs` against a preview server with
Playwright/Chromium available. Browser checks cover all three layouts with real input adapters;
controlled combat arrangements make wind-up, cancel and one-hit assertions repeatable. Unit tests
also run natural seeded bot matches and check actual eliminations. The existing
`tests/e2e/minigame.cjs` handles Blink in tournament draws while retaining Copycat/Jack checks.
Real-device performance, human combat feel and online latency remain unverified.

Verified 18 November 2026: 112 unit tests and production build pass. Desktop, portrait-touch and
landscape-touch Blink flows pass without console/page errors. The existing Copycat/Jack practice
checks and a seeded Blitz containing Blink, Jack and Copycat pass results, scoring, standings,
history and hub return. No fresh claim is made about real-device performance or audio quality.
