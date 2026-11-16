# 05 · Known limitations & performance risks

_What is not done, not verified, or risky. Updated at Milestone 2._

## Not verified (be sceptical until checked)

| Item | Why it's unverified | How to check |
| --- | --- | --- |
| **Real frame rate** | The build container has no GPU. Headless Chromium used SwiftShader (CPU), which ran at about 1 fps for every tier, so no performance claim is made. | Run `npm run preview`, open the pause menu (Esc), enable **Show frame rate**, and try Low / Balanced / High on your target machines. |
| **How the audio sounds** | Sounds were triggered without errors in automated tests, but nobody has listened to them yet. | Play with headphones: footsteps, jump, wind-up at the Workshop, the A/S/J/K bench at the Copycat gate. |
| **Pointer lock** | Headless browsers refuse pointer lock, so only the drag-to-look fallback was exercised. | Click the scene on desktop Chrome, Firefox and Safari, then press Esc (it should pause). |
| **Safari / iOS / touch** | Not tested. There are no touch controls yet. | M5 device pass. |
| **Concept art licensing** | The two generated images came from Higgsfield under your account. Usage rights follow that service's terms. | Confirm before public or competition use. |

## Functional limitations

- **The existing app isn't here.** Copycat Conductor's real rules, records and the existing mascot
  and customisation screens could not be inspected (see audit). The gate opens an entrance panel and
  instrument bench only.
- **No touch or gamepad input.** Keyboard and mouse only.
- **No main menu, router or results screen.** The title card is a minimal start screen. The full menu is M3.
- **Customisation is minimal.** The Workshop cycles 5 paint jobs. There are no hats or accessories yet.
- **Climbing is jump-based only.** No ledge grabbing. A missed jump from the eraser just drops you
  back onto the book.
- **The camera can still clip small props** (trees, blocks, train). Only large props block the camera.
  This is a deliberate trade-off against jitter.
- **The marble is the only pushable object.** Its physics is simple (friction and reflection), and it
  can't roll onto raised surfaces.
- **No loading screen.** Start-up generates textures and compiles shaders on the main thread. Expect a
  short hitch on first frame (larger on low-end devices).

## Performance risks (ranked)

1. **Draw calls about 270, plus a shadow pass on Balanced/High.** The character alone is about 60
   meshes, and the buildings are many small primitives. *Mitigation:* merge static geometry per
   material (`BufferGeometryUtils.mergeGeometries`), instance repeated props (dominoes and tiles already are),
   and restrict `castShadow` to the toy and large props.
2. **Post-processing at high DPR.** Depth of field (High) and tilt-shift (Balanced) run full-screen
   passes. On 4K or Retina screens with integrated GPUs this can dominate. *Mitigation:* DPR is capped at 1.5 on
   Balanced, `AdaptiveDpr` is enabled, and Low disables all post-processing.
3. **Soft shadow maps (PCFSoft) at 2048 on High.** *Mitigation:* the shadow frustum follows the player
   (±55 cm). Drop to 1024 or bake a static shadow texture for the village.
4. **Transparent overdraw** (fountain droplets, marble, glass). Small today. Watch it as VFX are added.
5. **Canvas texture regeneration** (scoreboard face) happens on secret count changes only. This is fine now,
   but avoid per-frame text textures.
6. **Bundle size:** about 400 kB of gzipped JS, mostly three.js and postprocessing. Minigames must be
   lazy-loaded to keep the hub start fast.
7. **Memory on mobile:** about 22–50 textures and 380 geometries depending on tier. Not yet profiled on phones.

## Design and process risks

- **Mascot drift:** concepts 01 and 02 show an earlier cream mascot, while the 3D model follows your blue
  robot reference. Regenerate them before external use (prompts in `04-concept-art-prompts.md`).
- **Scope:** 11 minigames is a large roadmap. Keep to one at a time, each with a pure rules core and tests.
- **Multiplayer expectations:** database sync is not real-time networking (see technical plan).
- **Base44 / GitHub sync and competition eligibility have not been confirmed.** Nothing here assumes them.
