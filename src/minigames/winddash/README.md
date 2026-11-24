# Wind-Up Dash

A sprint down a tabletop road. Every match deals a different road and a different set of traps from
the match seed. Design notes are in `GAME_DESIGN.md` §4 · 07.

| File | What it holds |
| --- | --- |
| `course.ts` | Pure generator. `generateCourse(seed)` returns plain data: the road outline, the trap sections and the roadside clutter. Also the time functions for moving traps (`jawPhase`, `crayonOpenFor`, `marbleX`, `bobX`, `topX/topZ`) and `courseProblems`, the fairness validator the unit tests run. |
| `rules.ts` | Rules core. Steps toys with the shared movement core, applies each trap, places the field. |
| `bot.ts` | Bots. They navigate from the course data, one small policy per trap kind. |
| `Scene.tsx` | Road mesh, kerbs, cameras, sounds. |
| `Traps.tsx` | One view per trap kind, plus the clutter. Shared unit geometries, instanced repeats. |
| `Hud.tsx` | Banner, clock, progress strip with a mark per trap. |

## Adding a trap

1. Add the kind to `SectionKind` and `KINDS` in `course.ts` (length per level, road width range,
   whether it is a timing trap), a section interface, and a case in `buildSection`.
2. Add its fairness checks to `courseProblems`.
3. Apply it in `rules.ts` `step` (solids, or an effect on the toy inside the section).
4. Teach `bot.ts` to get through it at every level, and add a view in `Traps.tsx`.
5. Add a rules test in `tests/unit/winddash.test.ts`. The "every trap at every level" bot test
   and the 300-seed course test pick the new kind up on their own.

## Rules the generator keeps

- Same seed, same course. The clutter has its own dice, so restyling it cannot change play.
- Four or five traps, no kind twice, levels from a fixed budget, never level 3 first, two timing
  traps never back to back.
- Road 92–122 cm long, at least 17 cm wide, edges never steeper than 0.8 cm sideways per cm.
- At least 5 cm of clear road before every trap and before the finish.

## Test aids

- `DashConfig.plan` forces the trap list (unit tests use one trap at a time).
- With `?debug`, `window.__toybox.dashCam = 'overview'` shows the whole course from the side.
  `tests/e2e/dashshots.cjs` uses it to save a gallery of courses.

## Not yet tuned

Trap timing and spacing, the level budget and bot skill are first guesses checked by headless
simulation only. Nobody has played these courses on a real phone.

## Online: own-toy prediction

Online, your own toy answers the stick on the frame you press it instead of a network round trip
later: `predict.ts` replays your not-yet-stepped stick input on the newest server state with the
rules' own movement (`moveDashToy`) against the course's walls at each moment (`dashWorld`), both
shared with `rules.ts`. What traps do to a toy and toppling dominoes stay the server's. See
docs/ONLINE.md, "Own-toy prediction". Tests: `tests/unit/winddash-predict.test.ts`.
