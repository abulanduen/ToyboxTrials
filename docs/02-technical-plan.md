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

**M3 · Main menu & hub polish.** Connect the existing repo, then:
- Router: Main Menu → Playroom → (Workshop customisation) → Minigame → Results.
- Main menu as a live 3D diorama (the title camera already orbits the village).
- Port the existing customisation options to `PAINT_JOBS` + hat/accessory slots (SVG in UI, low-poly in 3D).
- Merge the settings store with the existing app's settings keys.

**M4 · Copycat Conductor integration.**
1. Characterisation tests on the *existing* rules (sequence, timing, scoring, restart, records).
2. Wrap the existing logic as a `MinigameDefinition` (see `src/minigames/types.ts`). Keep its state machine unchanged.
3. New presentation: fixed, gently elevated camera on a cigar-box stage; four instruments
   (A coral drum, S golden bell, J blue xylophone, K green music box) as 3D props with hit
   animations; a wind-up conductor (the mascot model with a baton) demonstrates sequences.
4. Swap the sound triggers to the synthesised voices (`sfx.drum/bell/xylophone/musicBox`), which already exist.
5. Re-run the characterisation tests and fix only *confirmed* defects.

**M5 · Performance & polish.** Real-device testing (integrated GPU laptop, mid-range phone, Safari),
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
