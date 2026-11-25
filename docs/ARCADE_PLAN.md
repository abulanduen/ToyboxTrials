# Arcade under the table: plan (proposal)

Status: agreed in outline with the owner on 25 Nov 2026. **Phase 1 is built** (two levels and the
arcade shell; reachable only through the `?debug` teleport hook until phase 2). Phases 2–5 are
planned.
It moves the trials off the gates table into an arcade on the floor under the spawn table, turns the
gates table into the Hub's sports ground, and adds wandering NPC toys.

## Owner decisions (25 Nov 2026)

- **The arcade is under the spawn table:** a den between its legs on the room floor (FLOOR_Y,
  75.5 cm below the table tops; about 160 × 106 cm, 72 cm of headroom). It has its own string
  lights and the glow of the screens.
- **The way down is a toy-car track ride** off the spawn table's front edge. It's an original
  track and car (no brand look).
- **The way back up is a toy lift** (a wind-up elevator or crane bucket) beside the track, which
  drops you at the table edge.
- **The trial arches leave the gates table.** That table becomes the sports ground for the Hub's
  basketball and football (today's pitch, hoop and nets already sit there, inside the arch loop).
- **Every single-player trial is showcased in the arcade** as its own machine, like an arcade
  cabinet.
- **NPC toys are shared and scripted**, like the dog. Each follows a script driven by the room's
  clock (stroll, play a machine, watch, cheer, chat), so every online player sees the same NPCs
  with no extra network traffic. They turn to look at players but don't otherwise react.
- **NPCs appear in all three places:** the arcade, the Hub plaza, and the stands round the sports
  ground.

## Where things stand (what the code assumes today)

- **One level.** Ground height starts at y = 0 (`groundHeightAt`, `src/game/collision.ts`). The
  camera never goes below 0.8 (`cameraFloorAt`). Walk areas are flat rectangles with no height
  (`src/game/hubBounds.ts`). The server clamps players to 0 ≤ y ≤ HUB_MAX_Y (`server/hubRoom.ts`).
  The only "levels" are collider tops and the bridge's stepped ramps.
- **Nothing carries the player.** The toy train has colliders but no ride code.
- **Gates** (`GATES`, `GATE_*`, `SIGNPOSTS` in `src/scene/layout.ts`; `src/scene/Gates.tsx`;
  `src/scene/gateDecor.ts`) open a trial through an interactable per gate
  (`src/game/interactables.ts`) → `openPractice`. Online lobbies are hosted from a trial's intro
  card (position-free).
- **Things tied to the gates or the gates table:**
  - the tour's "trials" stop and its recorded lines (`src/game/tour.ts`, `src/game/voiceLines.ts`)
  - the coach text (`src/game/coach.ts`)
  - the gate greeters (`src/scene/Greeters.tsx`)
  - the TV cards
  - `HUB_SOLIDS`, which the server's ball physics uses
  - the unit suites `hub-layout`, `welcome-tour`, `hub-play`, `online-hub`, `camera-floor` and
    `hub-solids`
  - the e2e suites `hubgates`, `functional`, `minigame`, `mobile`, `welcome`, `coach` and `visual`

## Phases

Each phase ships on its own: the build, the unit tests and the affected browser suites pass, on
desktop and phone.

1. **Two levels and the arcade shell.** *(Built.)* `src/game/hubBounds.ts` (levels, ARCADE_WALK),
   `src/game/collision.ts` (per-level queries, camera ceiling), `server/hubRoom.ts` (per-player
   level; test servers only change it), `src/scene/Arcade.tsx` (carpet, brick wall, bulbs, sign);
   tests: `tests/unit/hub-levels*.test.ts`, `tests/e2e/arcade.cjs`.
   - Walk areas, ground height and the camera floor get a level (table or floor). Changing level
     happens only by ride or lift: you can't walk or fall off a table edge, as now.
   - The server's movement checks learn the floor level. A ride or lift is a server-known state,
     so the speed check doesn't treat the drop as cheating.
   - Build the arcade shell: the floor, the table's underside and legs, string lights, the
     entrance.
2. **The ride down and the lift up.**
   - Both are scripted journeys: input is locked, the camera follows, and you board with
     Interact (the phone Interact button too).
   - Online, others see you ride. The server times the journey, so positions on it are valid.
   - The car track runs off the front edge with a dip and a loop; the lift is beside it.
3. **Machines for every trial; the arches go.**
   - Each playable game gets a machine showing its intro picture and title (the intro thumbnails
     already exist). Walk up and Play opens the same intro card as the gates do today: practice,
     bots, or hosting an online lobby.
   - The greeters stand by their machines.
   - The gates, arches and gate streets come off the gates table.
   - The signposts, the tour's trials stop (now "the arcade"), the coach text and the TV cards
     follow.
   - **Voice lines that mention the domino bridge or the gates need new recordings.** Their text
     changes in `voiceLines.ts`; until re-recorded they play as text-only captions
     (`docs/VOICE.md`).
4. **The sports ground.**
   - The pitch and court spread over the whole gates table, with stands. The bridge stays, as the
     way across.
   - The hub play constants and walk areas change (`src/game/hubPlay.ts`, `hubPlaySim.ts`), and
     `HUB_SOLIDS` is regenerated. The online server needs a redeploy.
5. **NPC toys.**
   - A pure, clock-driven script system like the dog's (`src/game/dogRoute.ts`): each NPC gets
     routes, stops and actions (play a machine, watch, cheer, sit, chat bubble).
   - They're drawn with `MiniContender`, in the arcade, on the plaza and in the stands.
   - Players pass through them (no colliders) at first, so the server needs no NPC physics.
   - Budget their count per quality tier; phones run the Low tier.

## Risks and costs

- **Phase 1 is the riskiest part:** it touches movement, the camera and server validation, which
  every suite depends on. It gets its own unit tests: walking on each level; that nothing crosses
  levels except the ride and lift; and that the server agrees.
- **The gates' removal (phase 3) rewrites a lot of tests:** seven browser suites walk to gates
  today. They'll walk to machines instead.
- **Performance:** an extra lit space plus NPCs. The arcade and its NPCs only need full detail
  while you're down there.
