# 07 · Asset requests for the room layer (Meshy / Tripo wish-list)

_Status: requests. Nothing here exists yet; the room currently ships with code-built placeholders._

The room around the table is now built and lit in code (`src/scene/room/`). It reads as a warm,
sunlit playroom, but the organic things (animals, plants, soft toys) are the weak spot of
code-built geometry. Those are what generated models are good at. Per `CLAUDE.md`, generated models
are allowed for the **room layer only**; toys and the village stay code-built.

Priorities: **P1** changes how the room feels, **P2** is a clear upgrade over a placeholder,
**P3** is a nice extra.

## Rules for every asset

| Item | Requirement |
| --- | --- |
| Format | **GLB** (binary glTF 2.0), one file per asset, Y-up |
| Topology | Single mesh where possible, no ground plane, no baked shadows or lighting in the textures |
| Textures | PBR: base colour + normal + roughness (metalness only if needed). Send 2048²; I make 1024² / 512² copies for phones |
| Compression | Send it uncompressed. I run meshopt + WebP/KTX2 and aim for the size budget in each entry |
| Scale | Any. I normalise to the size in each entry (world units are centimetres) |
| Style | Lifelike proportions, slightly soft and warm ("an animated film's idea of real"), no logos, no text, no brand or character likenesses |
| Licence | Tell me which tool and plan made it, so `public/assets/asset-manifest.json` records source and commercial-use rights |
| Hand-over | Upload to `public/assets/environments/` with the file name in the entry |

How they get used: loaded after the hub is interactive, never on the critical path. The Low tier
(phones) gets the smaller texture set, or keeps the code-built placeholder if a model is too heavy.
A model that hasn't arrived simply leaves the placeholder in place.

Tips that apply to all of them: image-to-3D from a clean, evenly lit, plain-background reference
usually beats text-to-3D. Generate in both tools and keep the better one. Reject fused limbs,
melted faces, asymmetric heads, text-like smudges and textures with baked highlights or shadows.

---

## P1 · The family dog (brown pit bull): `room-dog-pitbull.glb`

The full brief is `docs/06-room-dog-asset-brief.md`. Refinements now that the room exists:

- **Purpose:** background life and the strongest scale cue in the game. Sleeps on the rug, and every
  few minutes walks to the table and sniffs at the village.
- **Prompt (text-to-3D, if you don't use a photo):**
  > Brown American pit bull terrier, adult, realistic proportions, short glossy chocolate-brown
  > coat with a small white chest patch, friendly relaxed expression, standing in a neutral pose
  > with all four legs straight and clearly separated, head level and facing forward, mouth closed,
  > ears natural, tail relaxed and hanging. Symmetrical. Game-ready single mesh, clean quad-like
  > topology, PBR textures, flat neutral lighting, no baked shadows, no ground plane, no collar.
- **Style notes:** lifelike, not cartoon. A calm, gentle face: it is a friendly giant, not a threat.
- **Budget:** 15k–40k triangles, 2048² textures, ≤ 4 MB after compression.
- **Rig: yes.** Quadruped skeleton with separate **neck**, **head**, **jaw** (optional), **tail**
  (2+ bones) and **ear** bones if the tool offers them. Meshy's and Tripo's auto-riggers both have a
  quadruped mode; a Mixamo-style biped rigger will not work for a dog.
- **Animations (clips named exactly like this):**
  `idle` (standing, breathing, small weight shifts) · `walk` (in place, loopable) · `sniff` (head
  low, nose working, loopable) · `sit` (stand → sit, then a held seated loop `sit_idle`) ·
  `lie_down` (stand → lying) · `lie_idle` (lying, breathing, loopable) · `get_up` ·
  `tail_wag` (additive or upper-body only if possible; otherwise a standing loop with the tail wagging).
  Minimum useful set: `idle`, `walk`, `sniff`, `lie_idle`.
- **Scale:** ~90 cm nose to tail tip, ~50 cm at the shoulder, head carried at ~55 cm.
- **Where it goes:** the floor strip in front of the table is kept clear for it: x −180…140,
  z 60…200 (the rug at x 36, z 134 is its bed spot). Its walk goes from the rug round the
  right-hand chair to the table's front edge (z ≈ 50), where the head comes up over the edge.
- **Open problem (unchanged from doc 06):** the table top is 75 cm up and a pit bull's head is at
  ~55 cm, so standing it barely clears the edge. Options, in order of preference: (a) it puts its
  **front paws on the table edge** to sniff (needs one more clip, `paws_up`, and looks great),
  (b) lower the table to a ~50 cm children's play table (a layout change: table legs, chairs and
  the baked room light all key off `TABLE.legHeight`, so it is a one-constant change plus a
  re-check of the screenshots), (c) accept that only the top of the head and the nose show.
- **Fallback if rigging fails:** a second static model in a **lying, sleeping** pose
  (`room-dog-pitbull-lying.glb`, same prompt with "lying on its side asleep, legs relaxed, eyes
  closed"). I animate breathing by scaling the chest. No walking in that case.

## P1 · Sleeping cat on the sofa: `room-cat-sleeping.glb`

- **Purpose:** a second living thing, on the wall behind the usual camera, so turning around is
  rewarded. It needs **no rig**: a curled-up cat only breathes (I scale the body) and flicks an
  ear or tail tip if the model has those as separate bones.
- **Prompt:**
  > Domestic short-hair cat curled up asleep in a tight loaf-and-curl pose, tail wrapped around
  > its body, eyes closed, ginger tabby coat with soft stripes, realistic proportions. Sitting on
  > nothing: no cushion, no ground plane. Game-ready single mesh, PBR textures, flat neutral
  > lighting, no baked shadows.
- **Style notes:** soft and round, readable as "cat" from 2–3 m away through blur. Ginger is chosen
  to pop against the blue-grey sofa.
- **Budget:** 6k–12k triangles, 1024² textures, ≤ 1 MB.
- **Rig:** none needed. Optional: 2 tail bones + ear bones for an occasional twitch.
- **Scale:** ~45 cm across the curl, ~18 cm high.
- **Where it goes:** the free seat cushion on the sofa (left seat as you face it, x ≈ 82, z ≈ 206,
  seat height 47 cm above the floor). The code leaves that cushion empty on purpose.

## P2 · Tall houseplant: `room-plant-fiddle-leaf.glb`

- **Purpose:** replaces the `PLANT` placeholder (stacked ellipsoid leaves) right of the window.
  It stands in the brightest part of the room next to the hero window, so it is seen a lot.
- **Prompt:**
  > Fiddle-leaf fig houseplant, about 1.5 metres tall, slender brown trunk, large glossy
  > violin-shaped green leaves, in a plain round terracotta pot with a saucer. Realistic, healthy,
  > slightly asymmetrical. Game-ready, PBR textures, flat neutral lighting, no baked shadows, no
  > ground plane.
- **Style notes:** broad, simple leaf shapes read better than fine foliage once blurred. Avoid
  alpha-card leaves if possible (real geometry sorts and shades better); if the tool insists on
  alpha cards, keep them few and large.
- **Budget:** 8k–20k triangles, 1024² textures, ≤ 1.5 MB.
- **Rig:** none. I sway it with a vertex shader.
- **Scale:** 150 cm tall including a 36 cm pot.
- **Where it goes:** x 226, z −138 on the floor (back-right corner by the window).

## P2 · Teddy bear: `room-teddy.glb`

- **Purpose:** replaces the `TEDDY` placeholder (spheres) sitting on top of the cube shelves,
  "watching" the table. A toy at human scale next to toys at toy scale is a nice joke about size.
- **Prompt:**
  > Classic well-loved teddy bear, sitting upright with legs forward and arms relaxed at its sides,
  > honey-brown plush fur, lighter muzzle and paw pads, black bead eyes, stitched nose, slightly
  > floppy and worn, generic design with no clothing, no ribbon text, no brand tags. Game-ready
  > single mesh, PBR textures, flat neutral lighting, no baked shadows.
- **Style notes:** generic and original: no resemblance to any named or branded bear.
- **Budget:** 5k–10k triangles, 1024² textures, ≤ 1 MB.
- **Rig:** none.
- **Scale:** 40 cm tall seated.
- **Where it goes:** on top of the cube shelving on the wall behind the camera (x ≈ −176, z ≈ 240,
  132 cm above the floor), facing the table.

## P2 · Pair of slippers: `room-slippers.glb`

- **Purpose:** human-scale clutter right beside the table, at the foot of the right-hand chair:
  the kind of thing that says "a person was just here". Also a likely toy for the dog later.
- **Prompt:**
  > A pair of cosy adult house slippers, grey felted wool with a cream fleece lining, soft rubber
  > soles, lying casually on the floor with one slightly rotated and overlapping the other. Realistic,
  > game-ready, PBR textures, flat neutral lighting, no baked shadows, no ground plane, no logos.
- **Budget:** 3k–6k triangles for the pair, 1024² textures, ≤ 0.6 MB.
- **Rig:** none.
- **Scale:** each ~28 cm long.
- **Where it goes:** on the floor by the right-hand chair (x ≈ 128, z ≈ 44). Only visible from the
  higher minigame cameras and when the camera pitches up, so this is deliberately low-budget.

## P3 · Desk globe: `room-globe.glb`

- **Purpose:** replaces the `GLOBE` placeholder (a ball with blobs) on top of the bookshelf, in the
  hero view left of the window.
- **Prompt:**
  > Vintage desk globe on a turned dark-wood stand with a brass meridian arc, muted blue oceans and
  > soft green and tan land masses with **invented, non-real continents**, no text or labels.
  > Game-ready, PBR textures, flat neutral lighting, no baked shadows.
- **Budget:** 3k–6k triangles, 1024² textures, ≤ 0.6 MB. **Rig:** none (I can spin it).
- **Scale:** 23 cm sphere, ~36 cm tall with the stand.
- **Where it goes:** top of the bookshelf, x −146, z −168, 204 cm above the floor.

## P3 · Bird at the window: `room-bird-robin.glb`

- **Purpose:** a moment of life in the hero view: a small bird lands on the outside sill now and
  then, looks in, and flies off. Silhouetted against the bright garden, so texture detail hardly matters.
- **Prompt:**
  > Small garden songbird perched upright, round body, short beak, orange-red breast, brown back,
  > realistic proportions, wings folded, feet gripping a perch. Game-ready single mesh, PBR
  > textures, flat neutral lighting, no baked shadows, no perch, no ground plane.
- **Budget:** 2k–4k triangles, 512² textures, ≤ 0.3 MB.
- **Rig:** optional. Two wing bones + head + tail allow `idle` (head turns), `hop` and `take_off`.
  Without a rig I hop it procedurally and hide the take-off behind a fast move.
- **Scale:** 13 cm long.
- **Where it goes:** the outside sill of the window (x 0…60, y 12 cm above the table top, z −196).

## P3 · Knitted throw / beanbag / backpack (pick any)

Soft, lumpy shapes that code does badly and generators do well. Any one of these helps the corner
by the door, which is currently bare: a child's **backpack** hanging on the door handle side
(`room-backpack.glb`, 35 cm tall, 4k–8k triangles), a **beanbag chair** (`room-beanbag.glb`,
80 cm across, 3k–6k triangles) or a folded **knitted throw** for the sofa arm
(`room-throw.glb`, 4k triangles). Prompts: describe the object plainly, add "realistic, generic,
no logos or text, game-ready, PBR textures, flat neutral lighting, no baked shadows, no ground plane".

---

## Code-built placeholders in the current room

| Placeholder | Where in code | Replaced by |
| --- | --- | --- |
| Tall plant (ellipsoid leaves) | `plant()` in `src/scene/room/Furniture.tsx` | `room-plant-fiddle-leaf.glb` |
| Teddy (spheres) | `cubeStorage()` in `Furniture.tsx` | `room-teddy.glb` |
| Empty sofa cushion | `sofa()` in `Furniture.tsx` | `room-cat-sleeping.glb` |
| Globe (ball + blobs) | `bookshelf()` in `Furniture.tsx` | `room-globe.glb` |
| Sill plant (cone leaves) | sill block in `buildFurniture()` | optional: a small potted herb, same rules, 3k triangles |
| Garden outside the window (painted texture) | `gardenTexture()` in `src/scene/textures.ts` | optional: a blurred photo or generated image of a garden, 1024×768, your own or licensed |

Everything else in the room (walls, window, drapes, bookshelf, wardrobe, bed, sofa, chairs, lamps,
shelves, pictures, rug) is meant to stay code-built: hard-surface furniture is cheap, crisp and
bakes well.

## What I don't need

- Furniture, walls, the table, lamps, books: code-built on purpose.
- Anything for the toy layer (contenders, village, minigame sets): must stay stylised and code-built.
- HDRI environment maps: the environment map is generated locally.
- Recorded animal sounds: every sound effect is synthesised.
