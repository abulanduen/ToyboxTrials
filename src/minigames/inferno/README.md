# Inferno Escape — local first pass

Entry: Tournament Pavilion → **Or practise one trial → Inferno Escape**. Also eligible for local bot tournaments. Supports 2–8 contenders through the shared host; online play remains future work.

- WASD/arrows or held directional pads move on the board and turn the facing marker.
- Space/Break removes the rock or wall ahead. E/Build wall places one blue wall on an empty, unoccupied tile ahead during the 15-second preparation.
- After preparation, the furnace follows the shortest open route to a reachable survivor. Destroying blocks changes those routes immediately. An enclosed shelter is safe until opened.
- Contact eliminates a toy; the last survivor wins. Results use elimination time; personal records count seconds survived after preparation.

Provisional balance/interpretations: 11×11 seeded board, 220 ms movement, 500 ms breaking, 300 ms furnace movement, breaking allowed during the hunt, one wall allowance with no replacement after destruction. Unused walls expire rather than being placed automatically. After 90 seconds of hunting, survivors share first place to prevent permanently sealed shelters stalling a tournament. These choices need owner/playtest approval before treating them as final design.

Bot behaviour is a first pass: explore, build during preparation, flee reachable danger and remain in sealed shelters. Difficulty changes reaction interval. Visuals use a fixed elevated board camera; smooth movement and richer furnace/character animation remain polish work.

Integration touches only `registry.ts` in the runtime outside this folder. The existing tournament browser test now recognises Inferno; keep that small change when merging Claude's updates. Do not overwrite Claude's movement core, other minigames or room pass.

Checks: `npm test`, `npm run build`, `node tests/e2e/inferno.cjs`, `node tests/e2e/minigame.cjs` (preview server running; Playwright/Chromium required). Real-device performance and game balance remain unverified.

Verified on 18 November 2026: 41 unit tests and production build pass; Inferno desktop/touch-portrait
entry, movement, pause, results, records and return pass; Copycat/Jack regression and a full mixed
Blitz pass without console/page errors. Browser checks use Chromium software rendering and are
not frame-rate benchmarks.
