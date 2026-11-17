# 02 · Technical implementation plan

_Concise plan, Milestones 1–6. Each milestone ends in a testable, shippable state._

## Stack (confirmed for this prototype)

| Concern | Choice | Why |
| --- | --- | --- |
| App | React 19 + TypeScript (strict) + Vite 8 | Matches typical Base44 front ends; fast builds; static output |
| 3D | three.js + React Three Fiber + drei | Declarative scenes, instancing, rounded boxes, environment lighting |
| Post FX | @react-three/postprocessing | Tilt-shift (Balanced), depth of field (High), bloom, vignette |
| State | Zustand (+ persist) | Tiny, works outside React (frame loop reads it without re-renders) |
| UI | DOM + CSS + inline SVG | Crisp text, accessible buttons, no icon libraries |
| Audio | Web Audio API synthesis | Original, tiny, tactile; no licensing questions |
| Physics | None (planar collision) | Add Rapier only if a minigame truly needs rigid bodies (e.g. Inferno Escape debris) |
| Backend | None | Solo play is fully local. Multiplayer needs a real-time relay later (see below) |

## Mobile & touch: required for every screen and minigame

Toybox Trials is a web game that must be fully playable on phones and tablets.

- **One action layer** (`src/game/input.ts`). Keyboard, the on-screen joystick and touch buttons
  all produce the same actions (`getMoveAxis()`, `isDown('jump')`, …). Gameplay and rules code never
  read raw keys or touches.
- **Hub touch scheme (implemented):**
  - a floating joystick on the left half (push to the rim to run)
  - drag anywhere else to look
  - Jump and a contextual Interact button on the right
  - the prompt pill is tappable too
  - pause button top-right
- **Every minigame declares a `touch: TouchLayout`** in its definition (movement, look, buttons,
  orientation). Placeholder layouts (`TOUCH_TBD`) block shipping.
- **Rules:** touch targets ≥ 56 px, safe-area aware, both orientations unless there's a strong
  reason, no hover-only UI, and portrait widens the camera FOV.
- **Performance:** touch devices default to the Low tier (no shadows or post-processing, DPR ≤ 1.25).
- **Testing:** `tests/e2e/mobile.cjs` drives an emulated phone with real touch events. A real-device
  pass on iOS Safari and Android Chrome is part of every milestone.
- **Planned per-game touch schemes:**

  | Game | Touch scheme |
  | --- | --- |
  | Copycat | Instruments are the buttons (2×2 in portrait) |
  | Music Box Rhythm | Four lane pads |
  | Red Light | Hold-to-run pad |
  | Find the Original | Tap the toy |
  | Wind-Up Dash | Joystick + jump |
  | Blink Duel / Spellbox | Joystick + 2–3 ability buttons, tap-to-aim |
  | Toy Squad | Drag to place |
  | Trivia | Big answer cards |

## Frame-loop architecture

```
input.ts ──► PlayerController (useFrame)
              ├─ movement + collision.ts (planar, heights)
              ├─ writes ToyAnim  ─────────► WindupBot (procedural animation)
              ├─ interactables  ──► store / events ──► UI overlay, props
              └─ camera (damped boom, ray-cast vs camera blockers)
```

Rules: no React state changes per frame. The UI reads the store, and the scene reads plain objects.

## Milestones

Milestones moved to **[DEVELOPMENT_ROADMAP.md](../DEVELOPMENT_ROADMAP.md)**, which merges this plan with
the master brief ([GAME_DESIGN.md](../GAME_DESIGN.md)). M1–M3 are done, and M4 (minigame host, tournament
framework, Copycat Conductor) is in progress.

## Minigame framework (contract drafted in `src/minigames/types.ts`)

Each minigame provides:
- **`RulesCore`**: a pure, deterministic `init / step / isOver / result`. No DOM, no timers. It can be tested, replayed and later run server-side.
- **A React component** for its scene, HUD, controls, timer and VFX. It is lazy-loaded (`load()`), so each game is code-split.
- **Metadata**: title, accent colour, player counts, control legend.

The host shares character identity (`Contestant.paint`), the audio bus, settings, the results screen,
and progression and records. Minigames never re-implement these.

## Multiplayer readiness (not implemented, by design)

- Keep authoritative game state in `RulesCore` (serialisable, deterministic).
- Use the input-action seam (`input.ts` actions, not raw keys) so remote inputs can be injected.
- Use the animation seam (`ToyAnim`) so remote toys are animated from replicated state.
- **Database sync (e.g. Base44 entities) is not suitable for fast competitive play.** Use it for
  lobbies, profiles and records only. Real-time rounds need a WebSocket or WebRTC relay with a tick
  rate (e.g. 20 Hz) and client interpolation. Turn-based or slow games (Trivia, Copycat turns) can
  tolerate lighter approaches.

## Performance budget (targets for M5)

| Metric | Target | Current (measured in headless SwiftShader, not representative) |
| --- | --- | --- |
| Draw calls (scene) | ≤ 300 | ~270 (Low tier, no shadow pass) |
| Triangles | ≤ 150k | ~47k |
| JS (gzip) | ≤ 600 kB | ~400 kB |
| Frame time on integrated GPU @1080p, Balanced | ≤ 16.7 ms | **Not yet measured on real hardware** |
