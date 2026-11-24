# Hoop Clash

Team basketball on a toy court: Red against Blue, two-a-side or four-a-side, in jerseys, with
the Hub's basketball. The owner asked for "a longer 4v4 or 2v2 game of actual basketball with
basketball rules, like you would play in the hub, but give each player a jersey for their team,
blue vs red". "Hoop Clash" is a working title: it lives only in the registry entry
(`src/minigames/registry.ts`); the HUD, the results card and the lobby read it from there (the
tutorial text, the gate greeter's line and this README name it too).

## Files

| File | What |
| --- | --- |
| `court.ts` | Court geometry (72 × 42 cm, hoops 4 cm inside each baseline, 18 cm 3-point arc), team names. |
| `rules.ts` | The deterministic rules core (phases, clocks, scoring, inbounds, possession, steals). |
| `ai.ts` | The AI for bots, filler toys and leavers (one policy for all three). |
| `bot.ts` | The `BotPolicy` wrapper for bot contestants. |
| `local.ts` | Bindings and the local input adapter (keys, the touch buttons, the mouse on the court). |
| `Scene.tsx` | Court, hoops, bleachers and crowd, toys in jerseys, the ball and its dribble, the gold arc, confetti, the broadcast camera, sounds. |
| `Hud.tsx`, `hoopclash.css` | Scoreboard, shot clock, ball line, your team, announcements, charge meter, touch controls, the results extra. |
| `../shared/courtBall.ts` | The Hub ball, generalised for a court with any hoops (see below). |
| `../../character/Jersey.tsx` | The jersey, a shared `jersey` option of `WindupBot` and `MiniContender`. |

## The ball is the Hub's

`src/minigames/shared/courtBall.ts` re-runs the Hub physics (`src/game/hubPlaySim.ts`) with the
hoops as parameters and a flat floor: the same gravity, 60° throw, power range, release and held
points, rim and backboard sizes and bounces, floor bounce and roll, and the same pick-up, mid-air
snatch, dribble-steal reach and steal guard (all imported from hubPlaySim and hubPlay, not copied).
The Hub's own exports and behaviour are untouched (`tests/unit/hub-play*.test.ts`). Its
`solveCourtShot(distance, angle)` finds the power that sinks a shot from anywhere on the floor
(cached per 0.5 cm and 4°), for the bots and the tests. The shot meter (the shared
`src/minigames/shared/shotMeter.ts`: 1.1 s to full, then back down, back and forth while held), the aim
assist (bends onto the attacking rim within 40 cm and 0.75 rad of your facing) and the arc preview
that turns gold when it will drop are the Hub's too.

## Rules (provisional, all in `rules.ts`)

- **Teams.** 4 toys or fewer play 2 v 2; 5 to 8 play 4 v 4 (`assignTeams`). Humans alternate Red,
  Blue in seat order (the local player is first, so plays for Red; lobby friends end up split
  evenly), then each bot contestant joins the smaller side, then the rules core adds **filler**
  toys to make both teams full. Fillers are driven by the same AI as bots, inside the rules core,
  so they play identically on every device and on the server. Their level is the bot contestants'
  difficulty (else normal). A player who leaves an online match is handed to the AI.
- **Jump ball** at centre to start (and to start overtime): the two jumpers stand at the circle,
  everyone else on their own half; the referee tosses it up after 1.6 s and it is snatched as it
  falls. The team that wins it is noted for halftime.
- **Scoring.** 2 points, or 3 if the shooter's feet were beyond the 18 cm arc when the shot left
  their hands. A ball through your own basket counts 2 for the other team. Points are credited to
  the shooter.
- **After a basket** the other team inbounds from behind the baseline under the basket it was
  scored on, after a 1.3 s dead ball.
- **Out of bounds**: a loose ball that touches the floor outside the lines (or hits the stands),
  or a holder whose feet cross a line. The other team inbounds from the sideline it went out on,
  level with where it went out.
- **Inbounds.** The nearest player of the inbounding team takes the ball out of bounds. They can
  turn but not walk, and can only pass (Pass, or the action button). After 5 s they pass
  automatically to the most open teammate. The game clock and the shot clock start when the ball
  is passed in.
- **Shot clock: 14 s** (a little over the brief's 12 s: the court is 72 cm long and a sprinting
  toy needs about 5 s to cross it). It runs while a team holds or passes the ball, pauses while a
  released shot is in the air, and a shot that touches the rim gives the next possession a fresh
  clock (offensive rebound or not). A violation gives the other team a sideline inbound.
- **Game clock.** Two halves of 2:00 (four minutes of play; about five with the stops). The clock
  runs only in live play. A shot released before the buzzer counts if it drops (it is decided when
  it scores, touches the floor or is caught).
- **Halftime** (3.8 s): the teams switch ends, line up on their new halves, and the team that lost
  the opening jump ball inbounds at the far sideline's centre.
- **Overtime** if tied: a jump ball, then the **next basket wins**; capped at 60 s, then a tie.
- **No fouls**, no backcourt or travelling rules. Holding the ball still is safe; moving with it
  is dribbling (drawn as the Hub's dribble), and a dribbler can have it stolen.
- **Steals and snatches** follow the Hub exactly. A swipe (the action button without the ball)
  reaches for 0.28 s with a little hop, then rests for 0.62 s. It steals off a holder who is
  dribbling (moving on the ground at 2 cm/s or more, not charging), within 2.6 cm, once 1.5 s have
  passed since the last change of hands. It snatches a ball in mid-air within the Hub's snatch
  reach. A snatch of an opponent's shot on the way up is a **block**. A pass to your team flies
  into your hands without a swipe; any other flying ball (not a shot) that hits a toy's body is
  caught. A loose ball on the floor is picked up by walking into it (1.8 cm), or with a swipe at
  the Hub's pick-up reach.
- **Shooting** roots you: press the action button to plant your feet and charge, let go to shoot.
  The meter winds up to full in 1.1 s and back down again while held (owner request, 21 Nov 2026), so
  the release is timed; the shot goes at the power it shows. A `cancel` input (X, or sliding off the
  touch Shoot button) drops the charge without a shot (event `uncharge`): you can move again, and a
  fresh press starts a new charge. The stick still turns you. A press held through a catch doesn't start a shot: let go and press
  again (as in the Hub).
- **Passing** throws a flat, quick pass (about 55 cm/s, 0.16 to 0.8 s in the air) to the teammate
  nearest your facing (within a wide cone, else the nearest), leading them if they are running.
  Opponents can snatch it. Pass without the ball calls for it: a bot teammate holding the ball
  passes it to you.
- **Results.** The winning team shares 1st place; the losing team shares the place after them
  (the shared `rankByKey` placement scoring; 2 v 2: 1st, 1st, 3rd, 3rd). Within a team the list is
  ordered by points. A tie after overtime: everyone shares 1st. Fillers are not contestants and
  get no placement, but the results card's team lists (`HoopResults`) show every toy's points.

## Controls

- **Desktop:** W A S D or arrows move, Shift sprints. Hold E, Space or the left mouse button to
  charge, let go to shoot. X cancels a shot you are charging. Without the ball the same button
  swipes (steal, snatch, pick up). Q or right click passes, or calls for the ball (so the right
  button is not a cancel here, unlike the Hub and Hoop Hustle).
- **Touch:** the shared floating joystick on the left (push it all the way to sprint). On the
  right, Shoot (hold; slide off it to cancel a shot; it reads Steal or Grab without the ball, Pass
  in when inbounding) and Pass (Call without the ball). Both fire on pointer-down, so they work while the other thumb holds
  the stick.

## Bots

One AI (`ai.ts`), with the shared bot difficulty setting how fast it thinks, its shooting range
(15 / 20 / 24 cm), its power error, and how often it tries steals, blocks and interceptions.

- **With the ball** it drives towards a spot at a comfortable range, swinging round the hoop
  away from the nearest defender (never behind the board). It shoots when open in range, or from
  close in. It passes when marked and a teammate has a clear lane, and always to a calling human.
  It heaves it up as the shot clock runs out.
- **Off the ball** on offence it spreads to open spots around the attacking hoop and runs ahead
  of the ball up the court.
- **On defence** it marks an opponent goal-side (help defence takes an unguarded ball handler).
  It swipes at a dribbler once the steal guard is over, and at shots and passes in reach.
- **Loose balls:** the two nearest on each team chase them; the shooters' teammates crash the
  boards and the others get back.

In headless bot-only games (a dev check, not a measurement of play), hard bots make about half
their shots, easy bots about a quarter.

## Online

`server/games.ts` runs the same rules core. Inputs are the stick and the held action button
(`{ type: 'in', ax, ay, run, act }`, sent every frame and latched) and passes
(`{ type: 'pass', to? }`) and cancelling a charge (`{ type: 'cancel' }`, sent before the frame's
stick-and-button input, so a cancel and a let-go in one frame shoot nothing); the rules see the
button's presses and releases in order, so charge time online is the time you held it. The seed
and the rules' random stream are hidden from clients. It is a team trial in the online lobby's
one-trial mode.

Online, your own toy is predicted on your client (`predict.ts`, see docs/ONLINE.md): it moves,
plants its feet for a shot, turns and winds the meter the frame after you press instead of a
network round trip later. On letting go, the input carries the charge your meter showed
(`charge`), which the rules honour within `CHARGE_CLAIM` (250 ms below to 50 ms above their own
count), so the shot's power is the one you saw. The ball, passes, steals and other toys stay the
server's.

## Tournaments

Never: it is the **Team games** section's trial (`group: 'team'` in the registry entry and in
`src/minigames/facts.ts`, the server's copy; owner decision, 21 Nov 2026), and `poolForFormat` in
`tournament.ts` leaves team trials out of every tournament, local and online, whatever their
eligibility says (`tests/unit/tournament.test.ts`). Tournaments rank every toy for itself.
`eligibility.tournament` is `false` too.

## Not done / ideas

- No free throws or fouls (by design: toy-simple). No travelling, backcourt or 3-second rules.
- No player switching: you always control your own toy.
- The camera follows your toy and the ball from the near sideline; there is no manual camera.
- Crowd and benches are cheap dressing (two instanced meshes; fewer seats on Low).
