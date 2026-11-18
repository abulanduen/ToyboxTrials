# Toybox Trials town — Claude Code handoff

The owner chose not to adopt the parallax trial. Build a cohesive **3D handcrafted town** using
these images as visual direction. This pack is concept art, not a screenshot, measured model
sheet, new gameplay specification or proof that illustrated content is implemented.

## Read the four views

1. [Layout overview](01-layout-overview.png): landmark relationships and clear walking routes.
2. [South overview](02-south-overview.png): primary facade designs, materials and playroom scale.
3. [North reverse](03-north-reverse.png): backs, supports and rear construction; east is on the left.
4. [Player approach](04-player-approach.png): atmosphere and the approach into the plaza.

All four were generated with the built-in image tool. Views 2–4 used view 1 as the design
reference. They are not calibrated projections of a single 3D model: the overview is oblique,
the approach camera is higher than the actual gameplay camera, and relative dimensions can
vary. Use the source anchors below to reconcile discrepancies. The existing wind-up character
implementation/blueprint takes precedence over the illustrative character in view 4.

## Preserve the existing town layout

Local source: `src/scene/layout.ts`. Coordinates are `(x,z)` in centimetres. North is `-z`, east
is `+x`, tabletop is `y=0`; contender height is approximately 3.5 cm. Read the latest source
before editing: Claude's separately developed cloud room pass may contain newer reviewed work.

| Landmark | Anchor | Visual target |
| --- | --- | --- |
| Fountain | `(0,-1)` | Crimped bottle cap, spool pedestal, blue glass marble |
| Tournament Pavilion | `(0,-21)` | Coral/cream fabric panels, honey pennant, brass fittings |
| Workshop | `(-26,-9)` | Open pencil case, gear emblem, small craft tools |
| Shop | `(-30,11)` | Matchbox body, striped canopy, pulled-out drawer counter |
| Scoreboard | `(31,7)` | Cream display, domino frame, believable rear braces |
| Copycat gate | `(15,-24)` | Honey wooden block arch |
| Jack gate | `(26.5,-18.5)` | Coral wooden block arch |
| Dash gate | `(34.5,-8)` | Toy-blue wooden block arch; preserve registry eligibility |
| Oval track | centre `(19,21.5)` | Wooden toy rail loop; radii `11 × 6.5` |
| Spawn / fingerpost | `(0,22)` / `(-5.5,14)` | Clear approach to the plaza |
| Climbing stack | around `(-29,25)` | Existing domino/book/eraser/block jump route |
| Music box / jack prop | `(11,-27.5)` / `(-35,-22)` | Existing secret interactions |
| Outer desk lamp | base `(-62,-54)` | Huge brass household object, existing lamp aim |
| Book cliffs | around `(56,-36)` | Large hardback books at the northeast table edge |
| Mug | `(57,14)` | Preserve the existing large solid prop and camera blocker |

Table bounds are `x=-80…80`, `z=-60…46`. Keep existing rotations, collider extents, front-of
interaction points, spawn, camera blockers and jump heights. The drawings compress these
distances for composition; do not trace pixel positions into world coordinates.
In particular, the concept stages the mug on the west edge; the working game's mug is east.
Keep its existing anchor/camera blocker unless a relocation is separately reviewed.

## Model and material direction

- Original town built from recognizable household objects: pencil case, matchbox, bottle cap,
  thread spool, dominoes, books, eraser and wooden blocks. Give each landmark a strong silhouette.
- Rounded painted wood, cardboard thickness/folds, felt seams, cloth bunting, brass hinges and
  simple structural backs. Keep details readable at actual third-person gameplay scale.
- Palette: cream `#F4E8CE`, honey `#EFAE45`, coral `#E76B62`, blue `#6BA7C8`, sage `#89B78A`,
  purple `#574D69`, brass `#C8973A`. Warm afternoon/lamp light and cool window fill.
- Room is oversized, muted and realistic-leaning; interactive toy scenery remains brighter and
  clearly distinct. Keep the existing gameplay camera at toy height.
- Extra perimeter cottages, brass path studs, dense felt planting, train embellishments and
  some illustrated construction details are **proposals**, not existing functionality. Add
  visual detail only where it preserves walking lanes, sightlines and mobile readability.
- Keep signs as live readable game text. The blank illustrative scoreboard is not a request to
  remove its real content. Pictures do not authorize new shops, economies or playable gates.

## Suggested implementation order

1. Read `AGENTS.md`, the current room/hub source and Claude's saved cloud work. Reconcile the
   room pass before replacing overlapping work. Review the images with an image-capable tool.
2. Polish one landmark at its existing anchor first. Check silhouette from the real camera,
   interaction range, collision and low-quality/mobile appearance before applying the style.
3. Continue fountain → pavilion → workshop/shop → gates/scoreboard → paths/optional perimeter
   details. Keep geometry modular, repeated decoration instanced and materials reusable.
4. Preserve all working minigames, especially Copycat Conductor, shared host/tournaments,
   records, settings, secrets, Workshop and localStorage key `toybox-trials:prototype:v1`.
5. Run the repository's required tests/build and relevant hub/mobile/minigame browser checks.
   Compare actual gameplay screenshots from opposing directions; artwork alone is not QA.

## Git handoff

Minigame branches now on GitHub: `astra/blink-duel` at `226f179` and
`astra/spellbox-showdown` at `e11ef8e` (includes Blink history and the audio/icon follow-ups).
Review/merge in dependency order, preserving Claude's uncommitted work. Neither is merged into
main merely by being pushed.

This concept pack is on `art/town-concepts`. To review it without switching a working branch:

```sh
git fetch origin art/town-concepts
git show origin/art/town-concepts:docs/assets/town-concept-v1/HANDOFF.md
```

If this new folder has no local work, copy only `docs/assets/town-concept-v1/` from that ref.
Do not reset or replace Claude's active worktree to obtain the pictures. The declined parallax
experiment is preserved separately on local branch `astra/parallax-trial` at `a0afbb3`;
it is not included in the pushed minigame branches.
