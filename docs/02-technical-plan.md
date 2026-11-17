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

**M1 · Audit & art direction ✅** Audit (with integration checklist), this plan, visual design
guide, concept prompts + 2 generated concepts, asset manifest.

**M2 · Explorable prototype ✅** Tabletop hub, toy character, movement and camera, collision, room
background, quality tiers, synthesised audio, toy UI. This is a separate project, so the existing app is untouched.

**M3 · Main menu & hub polish ✅** This repository is now the canonical game. The owner decided not to port the
Base44 version's menu, customisation or settings (17 Nov 2026), so nothing here waits on it:
- ✅ Screens: Main menu → Playroom ⇄ Workshop, with `#play` / `#workshop` deep links (store-driven,
  no router dependency).
- ✅ Main menu as a live 3D diorama: the contender faces the camera in front of the village
  (concept 01 framing), hops now and then, and turns round to face the village when you press Play.
  It has Settings and How to play sheets and a contender card.
- ✅ Workshop screen: a turntable camera (drag to spin), name, 5 paint jobs, 5 hats, 4 key skins.
  Secrets unlock 4 of them (the first progression loop). It opens from the menu, the pause menu,
  or the Workshop building.
- ✅ Hub polish: a loading card, a fingerpost and gate name boards, dust motes in the lamp light,
  and the contender's name on the HUD.
- The results screen arrives with the first minigame (M4).

**M4 · Copycat Conductor integration.**
1. Characterisation tests on the *existing* rules (sequence, timing, scoring, restart, records).
2. Wrap the existing logic as a `MinigameDefinition` (see `src/minigames/types.ts`). Keep its state machine unchanged.
3. New presentation: fixed, gently elevated camera on a cigar-box stage; four instruments
   (A coral drum, S golden bell, J blue xylophone, K green music box) as 3D props with hit
   animations; a wind-up conductor (the mascot model with a baton) demonstrates sequences.
4. Swap the sound triggers to the synthesised voices (`sfx.drum/bell/xylophone/musicBox`), which already exist.
5. Re-run the characterisation tests and fix only *confirmed* defects.

**M5 · Performance & polish.** Real-device testing (integrated GPU laptop, mid-range Android phone, iPhone Safari, tablet),
static-geometry merging, shadow budget, loading screen, resize/orientation, audio mix pass,
accessibility (reduced motion, remappable keys, colour-blind instrument shapes).

**M6 · Further minigames, one at a time.** Suggested order by reuse: Music Box Rhythm (reuses ASJK
and the instrument voices), Red Light Green Light (reuses hub movement), Find the Original (reuses
character paint system), Wind-Up Dash, then the combat and strategy titles.

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
