# Toybox Trials: project rules

Read **[AGENTS.md](AGENTS.md)** first: it is the shared current instruction source for Codex and Claude Code.
The guidance below is retained from earlier milestones. Where it differs, follow AGENTS.md and the
owner's current instructions, especially preserving the working Copycat implementation. Current status
is in [ROADMAP.md](ROADMAP.md) and [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md); the separate authoritative
design conversation is still pending.

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
- **Minigames** (`src/minigames/`):
  - `types.ts` holds the contract and `registry.ts` the catalogue; mark a game `status: 'playable'` with a lazy `load()`.
  - `session.ts` is the shared host (lifecycle, fixed 60 Hz stepping, bots, results, tournaments,
    records). `MatchStage.tsx` is the in-canvas side and `ui/MatchOverlay.tsx` the DOM side.
  - A game module provides `rules` (deterministic, seeded, with `drainEvents`), `createBot()`, `bindings`,
    `readLocalInput(presses)` (an ordered press log), `Scene` and `Hud`. Don't touch the hub from a game.
  - Use `MiniContender` for opponents and crowds. The full `WindupBot` is for the local player only.
  - Rules cores get vitest unit tests in `tests/unit/`.
  - The `?debug` hook `__toybox.match.timeScale(k)` speeds up or freezes match time for e2e tests.

## Commands

```bash
npm run dev          # dev server
npm run build        # typecheck + production build
npm run preview -- --port 4173
node tests/e2e/functional.cjs   # desktop gameplay checks (preview server running)
node tests/e2e/secrets.cjs
node tests/e2e/mobile.cjs       # touch/phone checks
node tests/e2e/menu.cjs         # main menu, Workshop, unlocks, persistence, deep links
node tests/e2e/hubgates.cjs     # hub: every trial gate opens its lobby (desktop + phone Interact), gate screenshots
node tests/e2e/minigame.cjs     # Copycat + Jack-in-the-Box practice, full Blitz tournament flow
node tests/e2e/findoriginal.cjs # Find the Original, desktop + phone portrait
node tests/e2e/movement.cjs     # Red Light, Green Light + Wind-Up Dash, desktop + phone joystick
node tests/e2e/dashshots.cjs    # Wind-Up Dash course gallery (screenshots of freshly dealt courses; not pass/fail)
node tests/e2e/inferno.cjs      # Inferno Escape, desktop + phone portrait
node tests/e2e/midnight.cjs     # Midnight Hunger, desktop + phone portrait/landscape
node tests/e2e/toysquad.cjs     # Toy Squad, desktop + phone portrait/landscape
node tests/e2e/rhythm.cjs       # Music Box Rhythm, desktop + phone portrait/landscape (slow: ONLY=desktop|portrait|landscape)
npm test                        # vitest unit tests for rules cores, scoring, tournament selection
npm run server:dev              # online Hub server on ws://localhost:2567, rebuilt on change (dev builds connect to it)
npm run server:build            # typecheck + esbuild bundle → server-dist/index.cjs (Railway runs this)
npm run server:start            # run the built server (PORT, ALLOWED_ORIGINS)
node tests/e2e/online.cjs       # online Hub: build with VITE_SERVER_URL=ws://localhost:2567, serve on a port, server:build; starts the server itself
```

Online Hub (Railway + `ws`; see `docs/ONLINE.md`): the protocol lives in `src/net/protocol.ts` (shared, no DOM),
the pure room logic in `server/hubRoom.ts` and `server/hubDirectory.ts`; `server/index.ts` is only the socket
layer. Remote players' positions live in plain objects (`src/net/remotes.ts`), never per-frame React state.
