# Find the Original

Entry: Tournament Pavilion → practise **Find the Original**, or as part of a local tournament. 1–8 toys, bots available.

Five rounds. Each opens with a reference card (“This is Baldwyn”), which then shrinks into the corner. A crowd of
look-alikes appears and everyone races to tap the real Baldwyn. Wrong picks cost 15 points and wind you down for a
moment. Scoring, timing and bot behaviour are described in `rules.ts`, `bot.ts` and GAME_DESIGN.md §04.

## A different Baldwyn every match

`looks.ts` (pure data, shared with a future server) describes Baldwyn as one option per **slot**:

| Slot | Options |
| --- | --- |
| body / bodyPaint | barrel, bell, box, ball · sage, blue, coral, honey, purple |
| trim (belt) | honey, coral, cream, blue, sage, purple |
| buttons / buttonPaint | one, two, three · cream, honey, ink, coral |
| head / eyes / nose / tache | round, square, tall · dots, wink, sleepy · coral, blue, honey, purple · none, bar, handlebar, walrus |
| hat / hatPaint / band / tilt | none, bowler, top, fez, beret · 5 paints · coral, cream, honey, blue (band or fez tassel) · left, right, straight |
| key / keySide | loop, bow (butterfly), paddle · right, left |
| neck / neckPaint | none, bow tie, scarf · 5 paints |
| eyewear | none, monocle, specs |
| held (in a mitt, away from the key) | none, cane, umbrella, flower |

- `makeBaldwyn` rolls every slot from the match seed (`subSeed(seed, 'baldwyn')`). He always wears a hat.
- Looks are **canonical**: a slot that can't be seen (colour of a missing hat, band on a beret, colour of no
  neckwear) is reset to 0, so equal-looking toys compare equal. `valid` stops neighbouring parts sharing a paint
  (belt, buttons and neckwear never match the body; a band never matches its hat; ink never sits on purple).
- Each swap has a **tier** (`tierOf`): 0 obvious (body, paint, hat, hat colour, scarf, cane/umbrella), 1 medium
  (belt, nose, square head, moustache on/off, band, key style/side, bow tie, neck colour, specs, flower), 2 subtle
  (button count/colour, eyes, hat tilt, round vs tall head, bar vs handlebar, monocle, fez tassel).
- `rollDecoy` (rules.ts) makes a look-alike by swapping parts of *this match's* Baldwyn one at a time; every swap
  must add exactly one visible difference (`differences`). The round's `diffs`, `tierWeights` and `needTier`
  keep the old curve: 2–3 mostly obvious differences in round 1, one mostly subtle difference in round 5.
- A toy is Baldwyn only because its look equals `state.baldwyn` (amendment A5: no target flag).

`figure.ts` turns a look into chunky parts (one shared geometry each). The crowd draws one `InstancedMesh` per
part and hides the parts nobody in the round has; the card builds a stand-alone figure from the same table.

## The reference card

`card.ts` draws the card on its own small canvas over the game canvas (DOM frame and name, WebGL figure). The
figure gets the screen's full pixel ratio (up to 3×), antialiasing and no post-processing, with copies of the
room's lights and environment and the crowd camera's elevation. It used to be part of the 3D scene, where the
Balanced tier's tilt-shift and the High tier's depth of field (focused on the crowd) blurred it, and the Low tier
rendered it at ≤ 1.25× without antialiasing, which looks soft on phones. Once the card arrives it is placed on
whole device pixels with no CSS scaling, so it is not resampled. If PlayroomScene's lights or `<Environment>`
change, update `card.ts` to match.

## Checks

- `npm test` (`tests/unit/findoriginal.test.ts`): determinism, Baldwyn variety across seeds, every swap and every
  look-alike visibly different in what the renderer draws, the difficulty curve, scoring and bots.
- `node tests/e2e/findoriginal.cjs`: desktop mouse/keyboard and phone touch (portrait, landscape), ≥ 56 px target
  spacing, card resolution, a different Baldwyn in a second match.
- `node tests/e2e/findoriginal-card.cjs`: screenshots of the big and small card for several matches on a
  Balanced desktop at 2× and a Low phone at 3× (`tests/e2e/output/fo-card-*`), with resolution checks.

Not verified: how the card and crowd look on real phones and GPUs (the e2e runs use software rendering), and
whether the part set and tiers are well balanced for real players.
