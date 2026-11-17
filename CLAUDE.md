# Toybox Trials: project rules

Original browser party game. Miniature wind-up toys compete on a tabletop inside a huge real room.
**Specs:** `GAME_DESIGN.md` (master gameplay and multiplayer spec, with amendments A1–A7) and
`DEVELOPMENT_ROADMAP.md` (milestones, dependencies, decisions log). Read them and `docs/` before major work.
Build one complete, testable system at a time.

## Non-negotiables

- **It is a web game.** The client is a static build (`npm run build` → `dist/`, `base: './'`), deployable
  to any static host (live on Vercel). Single-player and bot play need no server. Multiplayer
  (M8+) will use a **separate authoritative game server**, sharing the pure TypeScript rules cores.
  Never fake multiplayer with frontend state or database polling.
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
- **This repo is the canonical game.** The earlier Base44 version is not being ported (owner decision,
  17 Nov 2026). Copycat Conductor is being **redesigned**. Keep its core: repeat a growing sequence on
  four instruments (A coral drum / S golden bell / J blue xylophone / K green music box, or tap them).
- **Many minigames are planned (11+).** Each is a self-contained, lazy-loaded module behind the
  `MinigameDefinition` contract, with a pure rules core plus a render layer. It reuses the shared
  systems (input actions, audio bus, contender/cosmetics, results, settings). Never fork or
  re-implement a shared system inside a minigame; extend the shared one instead.
- **Two art layers.** Toys and the village are stylised, chunky and code-built. The real-world room can be
  lifelike. Generated 3D models (Meshy/Tripo) are allowed for the room layer only (e.g. the family
  dog). They must be GLB, compressed, lazy-loaded after the hub is interactive, skipped or simplified
  on the Low tier, and recorded in `public/assets/asset-manifest.json` with source and licence.
- **Original work only.** No recreated characters, levels, art or sounds from reference games.
  All sound effects are synthesised (`src/game/audio.ts`). Music for Music Box Rhythm is the only exception
  (composed, commissioned or licensed, and recorded in the manifest). No emoji or icon packs for important visuals.
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
