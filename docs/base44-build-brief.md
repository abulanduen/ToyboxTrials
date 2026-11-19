# Base44 build brief — Toybox Trials: The Living Playroom

Build a complete, original browser party game called **Toybox Trials: The Living Playroom**. It is a
single-page web app: a small explorable playroom hub, a tournament pavilion, and eleven short
multiplayer-against-bots minigames. It must play in full on a phone and on a desktop browser with no
login, no account, no download and no network calls.

---

## 1. Look and feel

- When the humans leave, the toys come alive and hold a tournament on a tabletop inside a huge,
  dim playroom at night. One unit ≈ 1 cm; a contender is about 3.5 cm tall.
- Handcrafted miniature world: felt, painted wood, brass, cardboard, paper and plasticine. Chunky
  rounded silhouettes, visible toy seams, brass keys in the toys' backs. Warm window light, dust in
  the air, soft shadows, a night-blue room behind a warm table lamp.
- Palette: honey `#E3A72F`, coral `#E4674F`, sage `#8FAE8B`, toy blue `#4F86C6`, ink purple
  `#4B3F6B`, cream `#F4E9D8`, wood brown `#8A5A3B`.
- Type: a rounded display face for titles, a clean humanist sans for body text. Large, legible
  numbers.
- Sound: everything synthesised in the browser (no audio files) except the rhythm trial's music
  tracks. Wooden clacks, springs, bells, tiny brass keys. No voices.
- Nothing may resemble an existing toy brand, game, film, character or logo. All art is original.

## 2. Non-negotiables

- Free in full, no login, no paywall, no in-app purchase, no analytics, no tracking.
- Works portrait and landscape on phones, and on desktop keyboard/mouse. Every control has a
  56 px+ touch target and a keyboard equivalent. Respect safe-area insets.
- Playable within one tap of load; first paint under 2 seconds on a mid-range phone; total assets
  under 5 MB.
- Deterministic matches: one seed per match drives every roll, so a replay of the seed is identical.
- Simulation runs on a fixed 60 Hz step, independent of rendering; never drive gameplay from React
  state per frame.
- Progress (best records, cosmetics, settings) saves locally on the device. No backend needed.
- Pause with Esc or a gear button; pause must freeze the match clock.

## 3. Structure

```
Main menu
  └── Playroom hub  (explore, walk to a gate, press E / tap the prompt)
        ├── Copycat Conductor gate
        ├── Jack-in-the-Box gate
        ├── Tournament Pavilion  → Blitz (3), Normal (5), Treasure (8), or practise any of the 11 trials
        ├── Workshop (name your contender, paint, hat, key skin)
        └── Scoreboard (records, secrets found)
```

- The hub is a small 3D tabletop village: a honey arch, a coral arch, a striped tent, a pencil-case
  workshop, a domino scoreboard, a fountain, a book tower. Walk with WASD/arrows or a thumb
  joystick; Space jumps; E or the on-screen prompt enters.
- Four hidden secrets are findable in the hub (behind the tent, by the fountain, behind the
  workshop, on top of the book tower). They unlock cosmetic items only.
- Every match shares one host: title card → 3-2-1 countdown → play → results (placement, personal
  best, play again, back to hub). Bots fill any empty seats 1–8.

## 4. The eleven trials

Each trial is self-contained: its own scene, HUD, rules and bots. All are playable solo against
bots; all support 1–8 contenders.

### 4.1 Copycat Conductor — 1–8 players, 60–180 s

A wind-up bandleader plays a tune on four toy instruments; repeat it.

- **Controls:** A = coral drum, S = golden bell, J = blue xylophone, K = green music box. On touch,
  the four pads sit 2×2 in portrait and in a row in landscape; tapping the 3D instrument also counts.
- **Rules:** every round the conductor plays a brand-new sequence (not the last one plus a note),
  one note longer than the previous round. Demonstrations speed up each round (interval ×0.93 down
  to a 280 ms floor). Then everyone repeats it; the time allowed per note shrinks slightly each
  round. A wrong note or running out of time eliminates you. Finishing early is fine — you wait.
- **Win:** last toy standing. Toys knocked out in the same round rank by how far they got, then by
  who was out last. Solo practice ends at the first mistake; the score is rounds completed.

### 4.2 Inferno Escape — 2–8 players, 60–120 s

Dig shelter, build one wall, outlast a creeping furnace.

- **Controls:** WASD/arrows or a held direction pad to move and turn the facing marker. Space/Break
  removes the rock or your own wall ahead. R/Build wall places one blue wall ahead during
  preparation.
- **Board:** 11×11 tiles. Everyone starts in a shared 3×3 centre clearing; every other interior tile
  is rock; the outside border is impassable.
- **Preparation:** 15 seconds. Break rock, walk, and place your single wall.
- **Hunt:** the furnace appears in the centre and pursues survivors along routes weighted by travel
  and destruction time. It breaks rock in 0.9 s and walls in 1.8 s; the block under attack glows
  coral. Shelters buy time, never stop it. You may break rock and your own wall — never another
  player's wall — and breaking your wall does not give the allowance back.
- **Win:** contact eliminates a toy; last survivor wins. Placement by elimination time; personal
  record = seconds survived after preparation. After 90 s of hunting, remaining survivors share
  first place.

### 4.3 Midnight Hunger — 2–8 players, 90–180 s

Scavenge batteries by night, shelter by day.

- **Controls:** WASD/arrows or held direction pads; Space/Hit strikes the tile straight ahead (held
  repeats on a 400 ms cooldown).
- **Board:** 11×11, shared centre spawns, living toys and battery bots collide. Moving into an idle
  toy pushes it one cell; chains push only if every destination is free. Holding the opposite
  direction resists; dead toys do not block.
- **Loop:** 10-second night, 8-second day. Start and cap at 100 energy.
- **Night:** N−1 battery bots appear for N living players. Face one and land three hits (damage is
  shared between attackers) to claim it: +40 energy, one battery per player per night. Unclaimed
  targets vanish at dawn. Someone goes unfed.
- **Day:** four roofed green corner shelters. Energy drains everywhere — 2/s at night, 9/s exposed
  by day, 3/s sheltered. Shelters slow the loss; they never stop it.
- **Win:** zero energy eliminates you; last survivor wins. 180 s cap, survivors share first. Records
  count seconds survived.

### 4.4 Find the Original — 1–8 players, 40–120 s

Spot Baldwyn among his look-alikes.

- **Build Baldwyn:** every match assembles a gentleman toy from random parts — body shape and paint,
  belt, button count and colour, head shape, eyes, nose, moustache, hat style with band and tilt, key
  style and side, neckwear, eyewear, and a held item (cane, umbrella, flower). He always wears a hat.
  No two neighbouring parts share a paint.
- **Round:** five rounds. A reference card ("This is Baldwyn") opens each round, then shrinks into a
  corner. A crowd of look-alikes appears, each built by swapping parts of *this match's* Baldwyn.
  Tap the real one. Crowds grow (6 → 24), differences get fewer and subtler (2–3 obvious in round 1,
  one subtle in round 5), and from round 3 the crowd shuffles and turns side to side.
- **Controls:** click/tap the toy; arrows move a ring and Enter picks (keyboard).
- **Scoring:** correct pick scores by finishing order (100/70/50/…) plus up to +50 speed bonus. Wrong
  pick costs 15 points and locks you out briefly ("wound down"), for longer with each mistake that
  round. Once the first toy finds him the rest get a few seconds ("hurry"). The round ends when all
  but one have found him, or on time.
- **Win:** highest total score; ties go to the faster total correct-pick time.

### 4.5 Red Light, Green Light — 2–8 players, 25–90 s

Race a runway while a clockwork referee watches.

- **Controls:** WASD/arrows or joystick to run; Space/Jump. On touch, push the joystick up to run and
  let go to stop.
- **Loop:** `go` — the Signalman faces away, run. `warn` — its key ratchets and it begins to turn
  (always at least a minimum warning). `stop` — it faces the runway; after a short grace, any toy
  still moving is caught and flicked all the way back to the start line, held there until the next
  go. Cycle lengths are rolled from the seed up front, so timing never depends on player input.
- **Win:** first across the finish line wins. The rest have a short closing window to get home;
  placement is by finish time, then distance down the runway.

### 4.6 Blink Duel — 2–8 players, 45–120 s

Teleport, bait, strike.

- **Arena:** 32 × 32 cm with a bounded cardboard rail; toy collision radius 1.05 cm; move speed
  8 cm/s.
- **Controls:** WASD/arrows to move and face; mouse or tapping the arena aims. Space blinks. J or
  left click swings. On touch: four hold-to-move pads, a Blink button and a Swing button.
- **Blink:** no cooldown, up to 8 cm in the aimed direction. It may cross living toys, but the
  endpoint cannot overlap a toy or leave the rail — search backwards along the line for the nearest
  free point. A blink that goes nowhere is ignored.
- **Swing:** a 5.5 cm, 120° sector with a 0.95 s visible wind-up (a striped cone fills as it
  charges). One successful hit eliminates. Movement and facing lock during the wind-up; you may
  still blink, which cancels the swing and starts a 0.35 s recovery. Recovery never blocks blinking.
- **Resolution:** inputs apply before hits on each 10 ms tick, so blinking on the strike tick dodges.
  Simultaneous strikes use the same living snapshot, so mutual eliminations happen.
- **Win:** last survivor. 90 s cap; simultaneous eliminations and timeout survivors tie.

### 4.7 Wind-Up Dash — 2–8 players, 20–75 s

A new road and new traps every race.

- **Controls:** WASD/arrows or joystick to steer; Space/Jump to hop.
- **Course:** generated from the match seed. 92–122 cm long, at least 17 cm wide, edges never
  steeper than 0.8 cm sideways per cm, at least 5 cm of clear road before the first trap. Four or
  five trap sections from ten kinds, no kind twice, never level 3 first, two timing traps never back
  to back — and every trap always leaves a way through.
- **Trap kinds:** dominoes (knock a run over), spring pad (launch), sticky jam (slows), snap jaws
  (one of a pair always open), crayon gates (one gate always open), marble run (marbles spaced wider
  than a toy; jump them), pendulum (sweeps), spinning tops (move), conveyor belt (pushes), book
  steps (climb and drop).
- **Win:** first across the line. Placement by finish time, then distance along the course.

### 4.8 Music Box Rhythm — 1–8 players, 60–80 s

Four lanes on a giant music box.

- **Controls:** A / S / J / K for the coral drum, gold bell, blue xylophone and green music box.
  On touch, four multi-touch pads in a row along the bottom, one under each lane.
- **Play:** pins ride the rotating cylinder toward the comb; hit each pin as it meets the bright
  line. Perfect within ±45 ms, Good within ±100 ms, and a 120 ms miss grace. Combo multiplier ×1,
  ×2 at 10, ×3 at 20, ×4 at 30; a miss or a stray tap resets it.
- **Win:** highest score, then accuracy ((perfect + ½ good) ÷ notes), then longest combo.
- **Music:** two or three short original tracks (composed for this project, or explicitly licensed
  and credited). Schedule audio with a ~200 ms lookahead against the audio clock, re-anchoring when
  it drifts more than 30 ms from the match clock. In headless or muted contexts the game must keep
  time silently.

### 4.9 Toy Squad — 1–8 players, 300–630 s

A pocket-sized auto-battler.

- **Board:** 8×8 battlefield, deploy in the near four rows; eight reserve slots sit below the near
  edge. Drag between board and reserves; non-matching occupied squares swap. Keyboard: F selects a
  toy, arrows/WASD move it square by square. Tap a toy to select it, Sell to sell it (or Q), or drag
  it onto the shop dock.
- **Flow:** ten rounds. Each round: shop, arrange, Ready, auto-battle, results.
- **Economy:** ten coins per round, unused coins carry over. Five independent shop offers whose
  rarity odds follow the level (Round 1: 80% common / 20% uncommon; by Round 10: 12% common, 18%
  uncommon, 28% rare, 32% epic, 10% legendary). Costs 1–5 coins by rarity; a reroll costs 2.
- **Capacity:** board slots = min(10, level + 2): 3, 4, 5, 6, 7, 8, 9, 10, 10, 10.
- **Merging:** two identical 1-stars merge automatically into a 2-star; two 2-stars into a 3-star;
  3 stars is the maximum. Stars double health and damage each step. Deployed toys take priority as
  merge recipients. Selling refunds base cost × copies.
- **Passives:** on rounds 3, 6 and 9 choose one of three unowned passives; it lasts the whole run.
- **Combat:** automatic. Units have health, damage, range, attack speed, mana or cooldown abilities,
  and status effects. Ten auto-battles decide the run.
- **Win:** placement by score; ties broken by remaining unit health. Keep this trial out of the
  tournament pool (it takes too long); it is casual practice only.

### 4.10 Spellbox Showdown — 2–8 players, 90–180 s

Knock rivals out of a shrinking ring with toy spells.

- **Arena:** a circular wooden/plastic ring on a tabletop; larger fields start on larger rings.
- **Build phase:** up to 20 seconds. Three buttons — Q (ranged), E (area), R (utility) — each offers
  exactly three spells, shown when that button is selected. Ready locks the build and all-Ready
  starts early; the deadline keeps current choices.
- **Roster:** Pop Rocket (14 damage, 30 cm fast projectile, 1.3 s cooldown), Spring Fan (8 damage,
  6 cm 120° cone, strong knockback, 2.4 s), Marble Burst (10 damage, 26 cm travel, 3.5 cm blast,
  3 s), Bubble Ward (−65% incoming damage and knockback for 1.2 s, 5 s), Ribbon Tether (6 damage,
  pulls its target toward you, 3.4 s), Pinwheel Storm (12 damage, 5.5 cm radial blast around you,
  4.4 s), Repair Stitches (−20 accumulated damage, 6.5 s), Button Mine (16 damage, placed just
  ahead, arms in 0.6 s, 3 cm radius, lasts 6 s, max two).
- **Combat:** damage accumulates and increases knockback — it is not health. Crossing the ring edge
  eliminates you.
- **Shrinking:** after eliminations the ring moves in bands by survivors (8 → 2), with a 10-second
  warning before each smaller edge.
- **Controls:** WASD/arrows or hold pads to move; mouse or tap the arena to aim; Q/E/R or the three
  spell buttons to cast.
- **Win:** last toy inside the ring.

### 4.11 Jack-in-the-Box — 2–8 players, 60–240 s

Name one, pass the box, pray it doesn't pop.

- **Rules:** each round shows a category ("Name a fruit"). The holder types an answer. A valid
  answer that hasn't been said this round cranks the handle and passes the box clockwise; a wrong
  or repeated answer keeps it. A hidden fuse (12–28 s, never shown) is ticking. When it runs out the
  jack pops and the holder is out. Next round: new category, new fuse, and the box starts with the
  toy after the one who popped.
- **Controls:** type and press Enter; on touch, a large Crank button with the answer box at the top
  of the screen so the phone keyboard never hides it.
- **Win:** last toy in. Toys pop one at a time, so no tie-break is needed.
- **Answer checking:** accept lowercase, plurals and simple variants; keep a generous per-category
  list of valid answers plus a "said already" check that ignores case and spacing. Never block a
  player for ten seconds on a debatable word — lean permissive.

## 5. Tournaments

- The Pavilion runs a **Blitz** (3 trials), **Normal** (5) or **Treasure** (8) tournament over
  randomly chosen trials, excluding Toy Squad.
- Points per trial follow the placement table (1st 100, 2nd 70, 3rd 50, then descending). The
  scoreboard shows each contender's running total, and the final screen names the champion.
- Bots fill every seat. Difficulty (easy, normal, hard) changes bot reaction time only, never the
  information they can see.

## 6. Accessibility and quality bar

- Every screen reachable and fully playable by keyboard only, touch only, and mouse only.
- Colour is never the only signal: shapes, patterns and labels carry meaning too.
- Respect `prefers-reduced-motion`: no camera shake or screen flash when it is set.
- No console errors. No layout that overflows sideways on a 360 px-wide phone.
- Menus, results and pause all work on a phone in landscape with the notch on either side.

## 7. Acceptance checklist

1. `Main menu → Playroom → every gate → match → results → back` on phone (portrait and landscape)
   and desktop.
2. All eleven trials start, resolve, show placement and record a personal best.
3. A full Blitz tournament completes and names a champion.
4. Reloading the page keeps records, cosmetics and settings.
5. No network requests after load; no login screen anywhere; no cookies or local storage beyond
   records, cosmetics and settings.
6. 60 fps in the hub on a mid-range phone; every trial's frame time stays under 16 ms.
