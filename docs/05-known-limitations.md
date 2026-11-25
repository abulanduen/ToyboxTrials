# 05 · Known limitations & performance risks

_What is not done, not verified, or risky. Updated at Milestone 2._

## Not verified (be sceptical until checked)

| Item | Why it's unverified | How to check |
| --- | --- | --- |
| **Real frame rate** | The build container has no GPU. Headless Chromium used SwiftShader (CPU), which ran at about 1 fps for every tier, so no performance claim is made. | Run `npm run preview`, open the pause menu (Esc), enable **Show frame rate**, and try Low / Balanced / High on your target machines. |
| **How the audio sounds** | Sounds were triggered without errors in automated tests, but nobody has listened to them yet. | Play with headphones: footsteps, jump, wind-up at the Workshop, the A/S/J/K bench at the Copycat gate. |
| **Pointer lock** | Headless browsers refuse pointer lock, so only the drag-to-look fallback was exercised. | Click the scene on desktop Chrome, Firefox and Safari, then press Esc (it should pause). |
| **Touch on real devices** | Touch controls are implemented and pass an emulated-phone test in Chromium (joystick, two-thumb move and look, buttons, portrait). They have not been tried on a real phone, and not at all in iOS Safari or WebKit. | Open the hosted build on an iPhone and an Android phone. Check thumb comfort, look sensitivity, the audio unlock and the frame rate on Low. |
| **Concept art licensing** | The two generated images came from Higgsfield under your account. Usage rights follow that service's terms. | Confirm before public or competition use. |

## Functional limitations

- **One playable trial.** Only Copycat Conductor is playable, so tournaments repeat it until more games
  land (M5–M6). Tournaments are local against bots and unranked. There's no online play yet (M8+).
- **Copycat balance isn't playtested.** Timings, speed-up, deadlines and bot error rates are first guesses
  (`src/minigames/copycat/rules.ts` `DEFAULT_CONFIG`, `bot.ts` `TUNING`).
- **No gamepad input yet.** Keyboard, mouse and touch are supported.
- **Panels scroll on short landscape phones.** On short landscape screens (about 400 px tall) the Copycat panel needs a short scroll to reach its button. Tapping outside a panel also closes it.
- **No results screen yet.** It arrives with the first playable minigame (M4). Screen routing is store-driven with `#play` and `#workshop` deep links, not a router library.
- **Customisation is a first pass.** Paint, hats and key skins only. There are no chest badges yet, and the shop doesn't sell anything.
- **Climbing is jump-based only.** No ledge grabbing. A missed jump from the eraser just drops you
  back onto the book.
- **The camera can still clip small props** (trees, blocks, train). Only large props block the camera.
  This is a deliberate trade-off against jitter.
- **The marble is the only pushable object.** Its physics is simple (friction and reflection), and it
  can't roll onto raised surfaces.
- **The loading card hides start-up, it doesn't shorten it.** Textures and shaders are still generated on the main thread. The card stays up until the first frames render, so low-end phones will wait longer behind it.

## Performance risks (ranked)

1. **Draw calls about 270, plus a shadow pass on Balanced/High.** The character alone is about 60
   meshes, and the buildings are many small primitives. *Mitigation:* merge static geometry per
   material (`BufferGeometryUtils.mergeGeometries`), instance repeated props (dominoes and tiles already are),
   and restrict `castShadow` to the toy and large props.
2. **Post-processing at high DPR.** Depth of field (High) and tilt-shift (Balanced) run full-screen
   passes. On 4K or Retina screens with integrated GPUs this can dominate. *Mitigation:* DPR is capped at 1.5 on
   Balanced, `AdaptiveDpr` is enabled, and Low disables all post-processing.
3. **Soft shadow maps (PCFSoft): 2048 × 1024 on Balanced, 4096 × 2048 on High.** The frustum is now
   fixed and covers the whole table (so shadows don't swim and the window wall can shape the sun
   patch), which doubled the texel count of each tier's map. Not measured on a real GPU.
   *Mitigation:* halve the sizes in `QUALITY` (`src/scene/PlayroomScene.tsx`), or bake a static
   shadow texture for the village.
4. **Transparent overdraw** (glass; the fountain's drips are opaque). Small today. Watch it as VFX are added.
5. **Canvas texture regeneration** (scoreboard face) happens on secret count changes only. This is fine now,
   but avoid per-frame text textures.
6. **Bundle size:** about 400 kB of gzipped JS, mostly three.js and postprocessing. Minigames must be
   lazy-loaded to keep the hub start fast.
7. **Memory on mobile:** about 22–50 textures and 380 geometries depending on tier. Not yet profiled on phones.

## Room visual pass (window light, baked room, props): what is and isn't verified

- **Measured (SwiftShader, `tests/e2e/visual.cjs`, 960 × 540, hub looking at the window):** Low went
  from 296 to 287 draw calls and from 48k to 64k triangles; Balanced from 488 to 512 draw calls and
  from 95k to 116k triangles (shadow and post passes included). The room itself is about 10 draw
  calls now; the extra triangles are furniture and the subdivided walls that carry the baked light.
- **Not measured: frame rate on any real device.** In particular, on phones: the additive light
  shafts and window halo are large transparent quads (fill-rate cost), and the furniture is built
  and baked on the main thread right after the hub becomes interactive (a possible one-off hitch).
- **Low has no sun shadows for the village** (only the toy's blob shadow), as before. The room's
  baked light does not react to anything: furniture does not shade other furniture.
- **Depth precision:** wall art and the rug sit about 1 cm off their surface with polygon offset.
  Fine with a 24-bit depth buffer; a 16-bit one could shimmer at room distance. Not seen in testing,
  not tested on real phones.
- **The sun now rakes in low from behind the village** (toward the usual camera), so toys are
  back-lit with long shadows. If faces read too dark on a real screen, raise the fill light in `Lights`.

## Design and process risks

- **Mascot drift:** concepts 01 and 02 show an earlier cream mascot, while the 3D model follows your blue
  robot reference. Regenerate them before external use (prompts in `04-concept-art-prompts.md`).
- **Scope:** 11 minigames is a large roadmap. Keep to one at a time, each with a pure rules core and tests.
- **Multiplayer expectations:** database sync is not real-time networking (see technical plan).
- **Base44 / GitHub sync and competition eligibility have not been confirmed.** Nothing here assumes them.
