# Inferno Escape — local first pass

Entry: Tournament Pavilion → **Or practise one trial → Inferno Escape**. Also eligible for local bot tournaments. Supports 2–8 contenders through the shared host; online play remains future work.

- WASD/arrows or held directional pads move on the board and turn the facing marker.
- Space/Break removes the rock or wall ahead. E/Build wall places one blue wall on an empty, unoccupied tile ahead during the 15-second preparation.
- Everyone starts in a shared 3×3 centre clearing. All other interior tiles are rocks; the outside border is impassable.
- After preparation, the furnace appears in the centre and pursues survivors along routes weighted by travel and destruction time. It breaks rocks in 0.9 seconds and walls in 1.8 seconds; the block under attack glows coral. Shelters buy time rather than stopping it permanently.
- Players can break rocks and their own wall, but never another player's wall. Removing your own wall does not restore your build allowance.
- Contact eliminates a toy; the last survivor wins. Results use elimination time; personal records count seconds survived after preparation.

Provisional balance: 11×11 board, 220 ms movement, 500 ms player breaking cooldown, 300 ms furnace movement, 900 ms rock destruction and 1800 ms wall destruction. Breaking is allowed during the hunt; one wall allowance with no replacement after destruction. Unused walls expire rather than being placed automatically. After 90 seconds of hunting, remaining survivors share first place. Timings remain subject to playtesting.

Bot behaviour is a first pass: dig outward, build during preparation and flee danger without breaking opponents' walls. Difficulty changes reaction interval. Visuals use a fixed elevated board camera; smooth movement and richer furnace/character animation remain polish work.

Integration touches only `registry.ts` in the runtime outside this folder. The existing tournament browser test now recognises Inferno; keep that small change when merging Claude's updates. Do not overwrite Claude's movement core, other minigames or room pass.

Checks: `npm test`, `npm run build`, `node tests/e2e/inferno.cjs`, `node tests/e2e/minigame.cjs` (preview server running; Playwright/Chromium required). Real-device performance and game balance remain unverified.

Verified on 18 November 2026: 41 unit tests and production build pass; Inferno desktop/touch-portrait
entry, movement, pause, results, records and return pass; Copycat/Jack regression and a full mixed
Blitz pass without console/page errors. Browser checks use Chromium software rendering and are
not frame-rate benchmarks.

Centre-spawn revision: 43 unit tests and production build pass, including rock/wall destruction
timing and wall ownership. Inferno desktop and touch-portrait flows were rerun successfully.
