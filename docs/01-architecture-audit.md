# 01 · Repository architecture audit

_Milestone 1 deliverable · 16 Nov 2026_

## 1. What was inspected and what was not

**The existing Toybox Trials application could not be audited.** It was not available in this
working environment, and neither GitHub repository visible to this session contains it:

| Repository | Contents | Relevant? |
| --- | --- | --- |
| `abulanduen/WorshipGuessr` | Next.js + Prisma music-guessing game | No |
| `abulanduen/njnj` | Empty (no commits) | No |

The app described in the brief (main menu, wind-up mascot, customisation screen, settings,
**Copycat Conductor** with ASJK input, sequence memory, scoring, progression, saved records)
most likely still lives only inside **Base44** and has not been synced to GitHub.

Because of that, this repository is a **new, standalone prototype** (Milestones 1–2) that was built
to slot into a typical Base44 front end later. **Nothing in the existing app has been changed,
replaced or removed.** No claims are made here about its code. Section 4 is the checklist to run
once it is connected.

## 2. What this repository contains (verified)

| Area | Implementation | Status |
| --- | --- | --- |
| Build tooling | Vite 8 · TypeScript 5.9 (strict) · React 19 | ✅ `npm run build` passes, 0 type errors |
| 3D | three.js 0.181 · @react-three/fiber 9 · drei 10 · @react-three/postprocessing 3 | ✅ |
| State | Zustand 5 (+ `persist` → `localStorage`) | ✅ settings & secrets persist across reload |
| Hub scene | Tabletop village: fountain, pavilion, workshop, shop, scoreboard, 3 gates, train, tower | ✅ |
| Character | Procedural wind-up robot with idle / walk / run / turn-lean / jump / interact / elimination / respawn | ✅ |
| Controls | WASD/arrows, Shift run, Space jump, E interact, Esc/P pause, mouse look (pointer lock + drag fallback) | ✅ |
| Collision | Planar footprints + heights (standable surfaces), rounded-rect play bounds | ✅ |
| Camera | Third-person follow, damped, pitch-limited, ray-cast collision against large props | ✅ |
| Audio | Web Audio synthesis (no samples), volume settings, autoplay-safe unlock | ✅ (runs without errors; listen on a real device to judge it) |
| UI | Title sign, HUD, prompts, tickets, pause/settings, cardboard info panels, ASJK instrument bench | ✅ |
| Minigame framework | Type contract + registry (`src/minigames/`) | 📝 Design only, no runtime yet |
| Copycat Conductor | Entrance + panel + new instrument voices | ⚠️ The game itself is not here (see §4) |
| Backend | None (pure static site) | ✅ by design |

### Source layout

```
src/
  App.tsx                 shell (becomes the screen router at Milestone 3)
  main.tsx                entry, fonts, global CSS
  game/                   framework-free game systems
    store.ts              Zustand store: persisted settings + session state
    input.ts              key/mouse sampling, rebindable action map
    collision.ts          planar collision, standable heights, play bounds
    audio.ts              synthesised sound palette (incl. A/S/J/K instrument voices)
    events.ts             typed one-shot event bus (scene ↔ UI)
    interactables.ts      hub interaction points + handlers
    player.ts             read-only player snapshot, camera-blocker registry
    palette.ts            colour tokens + paint jobs
    debug.ts              ?debug test hooks (teleport/aim/render stats)
  character/
    anim.ts               controller-agnostic animation state (network-ready seam)
    WindupBot.tsx         the mascot model + procedural animation
    PlayerController.tsx  movement, physics, prompts, third-person camera
  scene/
    PlayroomScene.tsx     Canvas, lighting, quality tiers, post-processing
    layout.ts             single source of truth for positions + colliders
    Room.tsx              oversized real-world room (table, lamp, books, mug, window, bed…)
    Village.tsx           playmat, paths, domino fence, composition
    Buildings.tsx         fountain, pavilion, workshop, shop, scoreboard, gates
    Interactive.tsx       train, marble, music box, jack-in-the-box, key tower, pencil
    props.tsx             blocks, dominoes, felt trees, bunting, arch geometry
    textures.ts           procedural canvas textures (wood, felt, cardboard, stripes…)
  ui/                     DOM overlay (Overlay.tsx, icons.tsx, styles.css)
  minigames/              module contract + catalogue
```

## 3. Architectural decisions and why

1. **Separation of rules from rendering.** Collision, input, store and audio are plain TS modules
   with no React dependency. The character's animation reads a plain `ToyAnim` object, so a
   remote player or AI can drive the same model later without touching the animation code.
2. **No physics engine.** Planar footprints with heights give walls, standable blocks and books,
   and play bounds in about 200 lines. A physics engine would add 0.5–1 MB and its own tuning costs
   with no gameplay benefit yet.
3. **No downloaded 3D or texture assets.** Every model is built from primitives and every texture is
   generated on a canvas at start-up. The build is 1.9 MB total, around 400 kB of gzipped JS, plus fonts.
   It is fully original and needs no network at runtime.
4. **Quality tiers** (Low / Balanced / High) live in one table in `PlayroomScene.tsx`, so tuning for
   low-end hardware is a single-file change.
5. **Static deployment.** `base: './'` builds a folder that can be dropped into any static host or
   embedded in another app, which fits Base44 or GitHub sync. There is no server and no secrets.

## 4. Integration checklist (superseded)

> **Update, 17 Nov 2026:** the owner decided not to port the Base44 version's menu, customisation or
> settings. This repository is the canonical game, so the checklist below no longer applies to those
> systems. It's kept for reference in case any Base44 code is ever reused.


Do these before Milestone 3/4. Each answer changes the plan.

**Framework & build**
- [ ] Framework and bundler (Base44 apps are typically React + Vite, often JSX + Tailwind + shadcn/ui; *verify*).
- [ ] JS or TS? If JS, keep this prototype's TS modules and allow mixed `.jsx/.tsx` (Vite handles both).
- [ ] Router in use (react-router?) and the route names for menu / customise / settings / Copycat.
- [ ] Any Base44 SDK usage (`@base44/sdk` entities/auth). Identify what is stored server-side and what is stored locally.

**Copycat Conductor (preserve exactly)**
- [ ] Locate the sequence generator, timing table (playback speed per round), input window, scoring and restart.
- [ ] Note where state lives (component state? context? store?) and what triggers the transitions.
- [ ] Confirm the key map (A/S/J/K) and any touch/click fallback.
- [ ] Find how records are saved (localStorage key? Base44 entity?) so that history carries over.
- [ ] Write a characterisation test: fixed seed → sequence, scoring for N correct and fail at N+1.
      It must pass before and after the visual redesign.

**Shared systems**
- [ ] Mascot: how it's drawn (SVG/CSS/image?) and the customisation options it supports. Map them onto `PAINT_JOBS` and accessories.
- [ ] Settings: which settings exist (volume, etc.) and their storage keys. Merge with this store's `persist` keys.
- [ ] Audio: existing sounds and how they're triggered. Swap them for the synthesised palette, keeping the trigger points.

**Integration approach (recommended)**
1. Copy `src/game`, `src/character`, `src/scene`, `src/ui` and `src/minigames` into the existing app as a folder (`src/toybox/`).
2. Mount `<PlayroomScene/>` + `<Overlay/>` on a new route (e.g. `/playroom`) behind the existing menu. The old screens keep working.
3. At Milestone 4, wrap the **existing** Copycat Conductor logic as a `MinigameDefinition` and
   render it inside the 3D theatre. Only the presentation layer changes.

## 5. Architectural limitations (current)

- **No router yet.** The prototype has two screens (title → playroom), toggled through store state.
  A router arrives with the main-menu work at Milestone 3, or the existing app's router is reused.
- **Minigame runtime not built.** `src/minigames/types.ts` is a reviewed contract, not executable code.
- **One local player only.** The state is shaped for networking (pure rules core, animation seam,
  serialisable store), but there is no transport, no prediction and no authority model.
- **The DOM overlay and canvas are siblings.** This is fine for menus. Diegetic in-world UI (e.g. the 3D
  scoreboard) is rendered as canvas textures, which re-upload when their text changes.
- **Single scene graph.** Minigame scenes will need lazy loading and disposal when entered or left
  (planned via `MinigameDefinition.load`).

## 6. Version control / rollback

- Rollback point **`rollback/m0-scaffold`** (empty scaffold, before any game code).
- Milestone 2 prototype: **`milestone/m2-prototype`**.
- Both are published as branches on GitHub (`abulanduen/ToyboxTrials`). The session's git proxy
  rejected tag pushes, so the tags exist only in the original local repository.
- To roll back: `git checkout rollback/m0-scaffold`.
