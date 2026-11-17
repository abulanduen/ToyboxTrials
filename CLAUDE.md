# Toybox Trials: project rules

Original browser party game. Miniature wind-up toys compete on a tabletop inside a huge real room.
Read `docs/` (audit, plan, visual guide, prompts, limitations) before major work.

## Non-negotiables

- **It is a web game.** Static build (`npm run build` → `dist/`), no backend, `base: './'`.
  It must stay deployable to any static host and embeddable in Base44 later.
- **Mobile is required for everything.** Every screen and every minigame must be fully playable on
  phones and tablets (touch, portrait and landscape) as well as keyboard and mouse.
  - Input goes through the shared action layer (`src/game/input.ts`): keys, joystick and touch
    buttons all feed the same actions. Never read raw keys or touches in gameplay code.
  - Each `MinigameDefinition` must declare a real `touch` layout (`src/minigames/types.ts`).
    `TOUCH_TBD` is a placeholder and blocks shipping.
  - Touch targets ≥ 56 px, thumb-reachable, inside safe-area insets. No hover-only affordances.
  - Test every feature with `tests/e2e/mobile.cjs` (emulated phone, real touch events) as well as
    the desktop tests.
  - Budget for phones: touch devices default to the Low quality tier.
- **Preserve Copycat Conductor's rules.** Its sequence, timing, ASJK mapping, scoring, restart and
  records come from the existing Base44 app and must not change unless fixing a confirmed defect.
- **Original work only.** No recreated characters, levels, art or sounds from reference games.
  All sound is synthesised (`src/game/audio.ts`). No emoji or icon packs for important visuals.
- **Honesty.** Don't claim performance or behaviour that hasn't been measured. This container has
  no GPU, so headless frame rates mean nothing.

## Conventions

- 1 world unit = 1 cm. Table top is y = 0. The contender is 3.5 cm tall.
- Positions and colliders live in `src/scene/layout.ts`. Collision box `rot` uses the same
  convention as three.js `rotation.y`.
- No React state changes per frame. The frame loop reads the Zustand store and plain objects.
- Colours come from `src/game/palette.ts`.
- `?debug` exposes `window.__toybox` test hooks. Gameplay must never depend on them.
- Screens: `menu` | `playing` | `workshop` in the store (`goTo`, `openWorkshop`). Camera moves between
  screens must orbit or cut. Never lerp in a straight line through the contender.
- Cosmetics live in `src/game/cosmetics.ts`. Unlocks are keyed by secret id.

## Commands

```bash
npm run dev          # dev server
npm run build        # typecheck + production build
npm run preview -- --port 4173
node tests/e2e/functional.cjs   # desktop gameplay checks (preview server running)
node tests/e2e/secrets.cjs
node tests/e2e/mobile.cjs       # touch/phone checks
node tests/e2e/menu.cjs         # main menu, Workshop, unlocks, persistence, deep links
```
