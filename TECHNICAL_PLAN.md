# Toybox Trials: technical plan

Source audit: 18 November 2026, starting commit `59744b7`. Source-inspected, not freshly runtime-tested. `docs/01-architecture-audit.md` and `docs/02-technical-plan.md` contain historical snapshots; this file describes the current implementation.

## Implemented client

Spellbox Showdown: seventh local playable module on `astra/spellbox-showdown`. Pure fixed-10 ms
rules own a three-slot/eight-spell draft, cooldowns, swept projectiles, mines, exact fan geometry,
damage-scaled impulses, momentum/solid bodies and simultaneous ring-outs. Damage batches share
one post-hit multiplier per target. Seeded bots choose builds and respond to public threats/edges.
Scene/HUD provide keyboard/mouse and touch; instanced effects cap at 64 projectiles/64 bursts and
16 mines. Shared host, scoring and storage schemas remain unchanged. This is local simulation;
server authority and online latency handling remain future work. Balance details are in the module README.
Spellbox population revision: live `state.radius` derives from the initial field and contracts
to surviving-player bands after a 10-second warning. Pure fixed-step rules drive contraction,
ring-outs, unsupported mines and cues; the scene scales only the stage and camera, leaving toys
and spell ranges unchanged. Camera zoom reprojects mouse aim, while touch keeps a world target.
`SLOT_OPTIONS` validates exactly three offers per button for both humans and bots; Mine moves
between E/R with a legal fallback, preserving unique builds.
Validation: 136 unit tests and production build pass; desktop/portrait/landscape Spellbox checks
cover three-option drafts, eight-player sizing, countdown/contraction, mouse/touch aim through
zoom, casting and ring-outs. Copycat/Jack practice and seeded Spellbox/Copycat/Blink Blitz pass
without console/page errors.
Combat balance, real-device performance and online behaviour remain unverified.

Blink Duel: sixth playable local module on `astra/blink-duel`. Pure rules use a 10 ms internal
quantum, validated blink endpoints, solid living bodies and exact circle/sector hit tests.
Telegraphed swings commit origin/facing, allow blink cancellation, and resolve simultaneous hits
from one living snapshot. Seeded delayed bots react to visible attacks. Shared actions plus a
bounded pointer queue drive keyboard/mouse/touch; R3F reads mutable simulation state for cones,
toy swords and bounded blink/strike effects. Existing host, records and tournament scoring remain
unchanged. This is local simulation, not an authoritative online server. Details and provisional
balance are in `src/minigames/blink/README.md`.
Validation: 112 unit tests and production build pass; desktop/portrait/landscape Blink browser
flows and the existing Copycat/Jack plus seeded Blink/Jack/Copycat Blitz regressions pass without
console/page errors. Real-device performance, combat balance and online latency remain unverified.

Toy Squad: fifth local playable module, casual-only. The owner’s ten-round format uses a
62-unit weighted shop, reserves, two-copy star merges, level-based deployment limits and
passive offers on rounds 3/6/9. `catalogue.ts` stores exact odds/unit/passive data; `rules.ts`
validates purchases, rerolls, merges and rounds; `combat.ts` runs living-unit pathfinding,
contested movement and simultaneous ability damage. Dead units never block or render.
The 8×8 drag board reuses the host queue; bounded particle/damage-number pools use match time.
`kits.ts` supplies 62 individual passive/spell pairs and 11 formation traits. `spellcraft.ts`
handles pure target selection, capped support effects and distinct-kind trait bonuses. Combat
tracks mana, cooldowns, temporary buffs/statuses and one bounded reaction batch; spells emit named
render events. Mana bars and spell particles read simulation state without per-frame React updates.
Toy Squad purchases now auto-merge pairs and chain to three stars, preferring deployed recipients.
Merge previews and capacity checks share pure rules helpers. Reserves render in a physical row
below the board and use the same validated move/drop command as deployment. Q/R/E use shared
action bindings; an ephemeral UI store coordinates hover/selection, details and upgrade rings.
Prior Toy Squad revision validation: 98 unit tests and production build passed; ten-round desktop/portrait/landscape
checks pass automatic merges, hover kits, Q/R/E, reserve drags/swaps, spells, records and restart.
No host, storage-key/schema, multiplayer or ranked-system changes are needed. Exact design and
provisional economy/balance are in the module README and CATALOGUE.md.
The existing mobile regression suite passed with the prior unit-kit update. Strategic balance,
audio quality and real-device performance remain unverified.

Midnight branch update: `astra/midnight-hunger` adds a fourth lazy-loaded local game. Its pure rules
split elapsed time at phase, target-movement and energy-depletion boundaries; seeded target movement
and collection tie order are repeatable. Scene/HUD are separate; existing input, sound, characters,
host lifecycle and local record storage are reused. No online/ranked functionality is added.
Validation: 55 unit tests and production build pass; Midnight desktop/portrait/landscape flows,
Copycat/Jack and mixed Blitz regressions, and the existing mobile suite pass without reported
console/page errors. Balance and real-device performance remain unverified.

Branch update: `astra/inferno-escape` adds a third playable local module, Inferno Escape, with
independent deterministic tile rules, bots, scene/HUD and lazy registry integration. Earlier
two-module counts below describe the starting audit. Eight catalogue entries remain planned
in this clone; Claude's separate cloud work is recorded in `ROADMAP.md`.

| Area | Current implementation |
| --- | --- |
| Build | React 19, strict TypeScript, Vite; `npm run build` typechecks and emits static `dist/` with relative asset paths |
| Rendering | three.js via React Three Fiber/drei; browser WebGL canvas, procedural geometry/textures, DOM/CSS overlays |
| Quality | Low: no shadows/post FX, DPR up to 1.25; Balanced: 1024 shadows, DPR up to 1.5; High: 2048 shadows, DPR up to 2. Hub uses tilt-shift/DOF respectively; minigames disable focus blur at both tiers |
| State | Zustand; localStorage settings, cosmetics, secrets, records and limited tournament history; no secure online persistence |
| World | Tabletop hub and oversized room; third-person movement, simple planar/height collision, camera blockers, interactive props |
| Input/audio | Shared keyboard/touch action layer; Web Audio synthesis |
| Screens | Menu, hub (`playing`), Workshop, minigame; store-driven navigation and hub/Workshop hash deep links |
| Play | Copycat Conductor and Jack-in-the-Box; local practice/bots and unranked 3/5/8-round tournaments |
| Tests | Vitest rules/scoring/selection tests; standalone Playwright desktop/mobile scripts |

No backend, network transport, remote players, matchmaking, accounts, ranked ratings or online leaderboards are implemented. `eligibility.ranked` is metadata, not ranked functionality. Local records are editable client data.

## Modular minigames

- `src/minigames/registry.ts`: 11 definitions; only two are `playable` with lazy `load()` functions. Others are previews/plans.
- `types.ts`: metadata, player bounds, input/touch layouts, eligibility, scoring, `RulesCore`, bots, scene and HUD contracts.
- A module supplies deterministic `init`, `step`, `isOver`, `result`, `drainEvents`, optional bot policy, input adapter, `Scene` and `Hud`. Rules accept seeded randomness and explicit timestep/input.
- `session.ts`: shared local host with intro, countdown, fixed 60 Hz stepping, queued ordered input, bots, pause, results, records and tournament transitions. This 60 Hz loop is not a multiplayer server tick.
- `tournament.ts` and `scoring.ts`: seeded game selection, repeat avoidance where possible, soft category cap, placements and cumulative standings. The two-game pool necessarily repeats in longer formats.
- `MatchStage.tsx` and `ui/MatchOverlay.tsx`: canvas/DOM presentation; scenes read live rules state without per-frame React updates.

Preserve these seams and Copycat behaviour. Add games independently, reusing shared input, characters, cosmetics, audio and host lifecycle.

## Planned authoritative multiplayer

Keep static client hosting separate from an always-on game server. Colyseus/TypeScript is an existing candidate, not an installed dependency or final hosting decision.

| Service | Required responsibility |
| --- | --- |
| Lobby | Presence, validated movement, nearby visibility, emotes and party grouping |
| Matchmaking | Casual/ranked queues, private room codes, assignments and lobby-to-match handoff |
| Game session | Run shared rules; own seeds, timers, valid inputs, eliminations, scoring and final results |
| Progression | Trusted inventory/rewards, independent format ratings, history and leaderboards |
| Browser | Input collection, rendering, animation, interpolation and approved prediction |

Clients send intent, not trusted scores or outcomes. Plan validation/rate limits, state visibility (including hidden Jack fuse data), disconnect/reconnect handling and fair timing before competitive launch. Database storage is suitable for durable profiles/results; polling it does not replace authoritative real-time simulation. Protocol, tick rates, hosting, identity and latency policies remain undecided.

First proof: two real browser clients in one hub and one complete authoritative minigame. The existing roadmap proposes Copycat; the design file also identifies Jack-in-the-Box as a candidate. Choose scope before implementation, then verify agreement on timing, outcomes and return to the lobby.

## Lobby instancing and capacity goals

**500 concurrent players per lobby server is a long-term target, not supported or measured capacity.** Minigame sessions remain separately configured, typically 2–8 players (some support solo practice).

Stage capacity increases through measured load tests. Use regional/logical lobby instances, proximity subscriptions, distance-based update rates, client interpolation, simplified/instanced remote avatars and render culling. The older proposal of roughly 50 visible players is a starting hypothesis, not a proven limit or a redefinition of the 500-player goal. Transfer parties into separate match rooms and restore them afterward.

## Validation limits

The initial documentation-only audit did not rerun tests. The subsequent Inferno implementation
passes 41 unit tests and the production build. Its desktop and emulated touch-portrait browser
flows pass entry, movement, pause, results, record persistence and return to the hub without page
errors. Real-device FPS, startup cost, audio quality, pointer lock and iOS/Android touch behaviour
still require verification. Optimise from measurements; do not publish headless FPS as device performance.
