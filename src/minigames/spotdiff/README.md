# Odd Page Out (spot the difference)

Entry: the Odd Page Out gate on the trials table (south row, between Midnight and the bridge), the Tournament
Pavilion's practice list, or a local tournament. 1–8 toys, bots available. Registry id `odd-page-out`.

A picture book lies open on the table. Both pages show the same storybook scene, except for 15 differences. Tap or
click them on either page within 30 seconds. Four pages (rounds), a new scene on each.

## How a round is built (`rules.ts`, seeded)

1. **Scene:** the match shuffles the four scenes from its seed (`themeOrder`), so each appears once per match.
2. **Reference page:** every one of the scene's **60 slots** gets a random variant. The "original" picture is
   therefore different every round, not a fixed drawing with fixed changes.
3. **Differences:** `pickSpread` chooses **15 of the 60** slots, at least 64 picture units apart (relaxing only
   if a scene can't fit that; with the shipped scenes it never has to). Each gets a different variant on the
   second page. `ref` and `alt` (the two variant lists) differ in exactly those 15 places.

The renderer only draws state: `drawPicture(theme, variants)` is the static backdrop plus every slot drawn from its
own parameters, so the two pages are identical except for the 15 slots. The unit tests check this on the drawn
shapes, not just on the lists.

## Scenes and slots (`themes.ts`, `props.ts`, `backgrounds.ts`)

| Scene | What's in it |
| --- | --- |
| The Toy Shop | four shelves of toys (teddies, balls, rockets, robots, ducks, drums, jars, blocks, cars…) and toys hanging on hooks |
| The Garden Picnic | sky, apple tree, hill, meadow, and a gingham blanket of cakes, cups, sandwiches and jars |
| Pirate Bath-Time | pirate bunting, towels, a porthole, boats and ducks in the tub, pictures on the tub, toys on the floor |
| Bedtime | night window, bookcase, chest of drawers, bed with a mobile, toys on the rug and floor |

Each scene has exactly 60 slots. A slot is one prop from the library (`props.ts`: about 50 chunky, code-drawn
storybook props) with 2–4 variants: **colour, pattern, swapped shape, count, a feature on or off, rotation, a
nudge, size, or missing**. Props are at least 20 units apart, and sized so a change is visible on a 390 px wide
phone (a picture is about 374 px wide there). Every slot has a **hit circle** of at least 32 picture units (≥ 56 px
across on that phone).

Pictures are 400 × 300 picture units. Taps arrive in normalised picture coordinates (0..1), so the rules never know
the screen size. All colours come from `palette.ts` (tints and shades are mixed from palette colours).

## Play and scoring

- A tap inside an unfound difference's hit circle finds it: **+10**, ringed on both pages, a crayon "ink" sound.
  Where circles overlap, the nearest one (distance ÷ radius) that you haven't found wins.
- A tap inside a difference you already found does nothing. Anywhere else is a **wrong tap**: a red X, a buzz,
  and a **1 s lockout** (taps in that time are ignored). The rest of that step's taps are dropped.
- Find all 15: bonus by finishing order **60 / 40 / 30 / 20** (20 for everyone after the third) plus up to **40**
  for the time left (`finishBonus`). Players finishing in the same step tie (same order, same bonus).
- A page lasts **30 s**, or until every player has found all 15. Then the missed differences are shown (3 s).
- **Four pages**, about 2–2.5 minutes in all (registry `durationSec: [60, 145]`).
- Placement: total points, then differences found, then quicker finds (sum of find times). Ties share a place.
- Everyone has the same pictures; each player's finds are their own. The HUD's mini leaderboard shows everyone's
  count and score.

## Bots (`bot.ts`)

A bot finds one difference every so often in its own random order and taps inside its hit circle, like a player.
Gaps average 3 s (easy), 2 s (normal) and 1.4 s (hard), ±40 %. Wrong taps (16 % / 8 % / 3.5 % of taps) land on a
slot that is the same on both pages, and the bot waits out the lockout. In unit tests over 4-page matches: easy
bots almost never clear a page, hard bots clear most.

## Rendering

- `Hud.tsx` draws the open book in the DOM over the canvas: two pages with paper grain, gutter shading, stacked
  page edges, a page curl in each outer corner (inside the paper margin, never over a picture) and a page-turn
  animation. Landscape: side by side. Portrait: stacked (`layout.ts`). The pictures are inline **SVG**, so they are
  sharp at any device pixel ratio. They are memoised per round; the HUD itself updates at 12 Hz.
  Desktop pictures can now grow to 820 px wide each (formerly 640), within the available window.
  Short landscape phones retain their previous cap; portrait sizing is unchanged.
- `Scene.tsx` puts a 3D hardback under the DOM book (the camera looks straight down and is fitted every frame to
  the same layout), with pencils, crayons, an eraser, a magnifying glass and a toy block round it.
- Keyboard: arrows hop a ring between the scene's 60 things (all of them, so it gives nothing away), Enter or Space
  circles there.
- Sounds (`audio.ts`): `pageTurn`, `inkRing`, `buzz`, plus shared ones.

## Should the pictures come from ChatGPT (or another image generator)?

Asked by the owner. Honest answer: **not for the parts you play with.** Spot-the-difference needs:

- **exact, known differences:** the game must know precisely what changed and where, to mark taps right or wrong.
  A generator redraws the whole image on every request, so the "same" picture comes back with dozens of unintended
  changes (line wobble, shading, small objects), and inpainting one change at a time is slow and still leaks
  pixels outside the masked area;
- **unlimited, seeded variety:** here each round is 60 slots × 2–4 variants plus a random choice of 15. That is far
  more combinations than could ever be generated and stored, and every client (and a future server) rebuilds the
  same round from a seed number, with no image download;
- **hit areas that match the drawing:** with code-drawn props the hit circles come from the same data as the
  drawing; with generated art someone would have to mark every difference by hand, per image;
- **crispness and size:** vector drawings are sharp on any screen and cost no download.

Generated art could be used for a **non-interactive** backdrop (for example the room or table around the book), or
a menu thumbnail, if it is recorded in `public/assets/asset-manifest.json`. None is used, and none was added.

## Checks

- `npm test` (`tests/unit/spotdiff.test.ts`): scene data (60 slots, 2–4 variants, every variant draws differently,
  a slot never changes anything else), determinism from the seed, exactly 15 differing slots per round on the drawn
  pictures, a different reference picture every round, spread, hit testing and overlaps, scoring and the
  finish-order bonus, the lockout, timing, bots, placements, the screen layout, and that the arrow keys can
  reach every slot from every slot in every scene.
- `node tests/e2e/spotdiff.cjs`: opens the game from the Pavilion; desktop mouse and keyboard; phone portrait
  (390 × 844) and landscape (844 × 390) with real touch events; wrong-tap lockout; a page completed; results; back to
  the hub. Screenshots: `tests/e2e/output/sd-*.png` (every scene, both phone layouts).

Not verified: how it looks and feels on real phones and GPUs (the e2e runs use software rendering at a few frames
a second), whether every one of the 240 slot changes is easy enough (or hard enough) to spot for real players, and
the balance of scores and bots. All numbers are first-pass.
