# 06 · Room creature brief: the family dog (brown pit bull)

_Status: requested, waiting for the generated model (Meshy or Tripo). Not implemented yet._
_The room now exists in code. The refined request (clip names, where the dog walks and sleeps, the table-height options) is in `07-asset-requests.md`; where the two differ, 07 wins._

## Why

The room layer is where the game gets its sense of scale. A lifelike dog that wanders the room and
now and then comes up to sniff the village gives the hub a living, slightly dangerous giant, the way
the sleeping cat does in the creative director's reference. It's background life, not gameplay. It
never interacts with the player and is never required to win anything.

## Look

- **Breed:** brown (red-nose or chocolate) American pit bull terrier. A friendly, broad head,
  short glossy coat, muscular but not menacing.
- **Style:** lifelike, matching the room layer (the toys stay stylised). It sits behind tilt-shift
  blur most of the time, so medium detail is plenty.
- **No collar text, logos or real-pet likeness.** If you base it on a real dog's photo, use your own
  photo or one you have rights to.

## Generation (Meshy or Tripo)

Try **image-to-3D** with a clean side-on photo of a standing brown pit bull (plain background). It
usually beats text-to-3D for animals. If you use text, paste:

> Brown American pit bull terrier, realistic proportions, short glossy chocolate coat, standing in
> a neutral pose with all four legs straight and clearly separated, head level and facing forward,
> mouth closed, tail relaxed, symmetrical. Game-ready, single mesh, PBR textures, no baked lighting
> or shadows, no ground plane.

Generate in both tools and keep the best. Reject results with fused or melted legs, an asymmetric
head, extra toes or tails, or shadows baked into the texture.

## Technical spec

| Item | Target |
| --- | --- |
| Format | **GLB** (binary glTF) |
| Triangles | 15k–40k (it's mostly blurred background) |
| Textures | PBR base colour + normal + roughness, **2048²** (I make 1024² copies for phones) |
| Scale and orientation | Any. I normalise to ~90 cm nose-to-tail, Y-up, facing +Z |
| Rig | **Quadruped skeleton** with named **neck** and **head** bones (I drive these procedurally to sniff and look at the toys) |
| Animations (ideal) | `idle` (standing, breathing), `walk`, `sniff` (head low), `lie_idle` (lying, breathing). Optional: `lie_down`, `get_up`, `tail_wag` |
| File size | Whatever comes out. I compress it (meshopt/Draco + KTX2/WebP), aiming for ≤ 4 MB |
| Licence | Confirm your Meshy/Tripo plan grants commercial use. I'll record it in the asset manifest |

**If neither tool can rig a quadruped:** send the best static model anyway, plus the same dog
generated in a **lying** pose. Without a rig, walking is limited to slow, heavily blurred
whole-body moves, and I'd use the lying model for the close-up moments. A rigged model is much better.

## Scale problem to solve

A pit bull's head is about 55 cm off the floor, but the table top is 75 cm up (world units are cm).
A dog standing in the room would barely show above the table edge. The plan is to make it a
**children's play table** (about 50 cm tall). That's believable for a playroom, and the dog's head then
rises just above the edge when it comes to sniff. The village and everything on the table stay as they are.

## Behaviour (planned)

1. **Most of the time:** asleep on the rug or bed in the background, breathing, an ear flicking.
2. **Every 2–4 minutes:** it wakes, walks over and rests its chin near the table edge, sniffs at the
   nearest building (nostrils puffing the bunting, and dust motes swirling), then wanders off.
3. **Toy-scale reaction:** a gentle camera rumble when its chin lands, a low synthesised sniff and
   snuffle (no recorded dog sounds), and the toys freeze briefly. It's the same instinct as
   Red Light, Green Light, so it could become a cameo hazard in a minigame later.
4. **Phones (Low tier):** loaded only after the hub is interactive, using the smaller texture set. It
   may be swapped for the lying pose only, depending on real-device frame rates.

## How to hand it over

Upload the `.glb` (and the lying-pose `.glb` if you made one) straight to GitHub:
open https://github.com/abulanduen/ToyboxTrials, choose **Add file → Upload files**, and put them in
`public/assets/environments/`. Name them `room-dog-pitbull.glb` and `room-dog-pitbull-lying.glb`.
Then tell me which tool and plan made them, so the manifest records the source and licence.
