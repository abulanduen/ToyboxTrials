# 03 · Visual design guide: "The Living Playroom"

> **Toybox Trials** · *Tiny contenders. Big chaos.*
> When the humans leave, the toys hold a tournament on the table top, in a town they built
> from whatever got left behind.

## 1. Pillars

1. **Two scales, one world.** The *toy scale* is chunky, painted, tactile, sharp and interactive. The
   *room scale* is huge, realistic-leaning, muted and softly out of focus. Never mix them up:
   room objects are never interactive, and toy objects are never photoreal.
2. **Readable first.** Characters and interactive objects must pop against the scenery through
   saturation, rim light and silhouette. Scenery is lower in contrast.
3. **Built, not bought.** Every toy structure is made from a recognisable household object (pencil
   case, matchbox, bottle cap, thread spool, dominoes, books). If you can't name the object it's built
   from, redesign it.
4. **Charming, slightly mischievous.** Jack-in-the-boxes that ambush you, dominoes waiting to topple.
   Playful, not babyish.

## 2. Scale rules (enforced in code: 1 unit = 1 cm)

| Object | Real size | Reads to a toy as |
| --- | --- | --- |
| Contender (mascot) | 3.5 cm tall | — |
| Wooden block | 3 cm cube | a house-sized crate |
| Domino (standing) | 4.8 × 2.4 × 0.75 cm | a garden wall |
| Pencil (lying) | 18 cm × 1.5 cm | a fallen tree trunk (must jump it) |
| Hardback book | 2 cm thick | a cliff ledge |
| Mug | 11 cm tall | a tower block |
| Desk lamp | ~45 cm reach | a lighthouse |
| Table edge | 75 cm drop | a precipice |

The camera boom is 14 cm and the eye height about 7 cm, so the world is always seen from *toy height*.
Never pull the camera up to human eye level in gameplay.

## 3. Palette

| Token | Hex | Role |
| --- | --- | --- |
| Warm cream | `#F4E8CE` | UI paper, toy highlights, teeth/eyes |
| Honey yellow | `#EFAE45` | Primary action, lamp light, rewards, Copycat accent |
| Coral | `#E76B62` | Danger/excitement, pavilion stripes, Inferno accent |
| Toy blue | `#6BA7C8` | Default contender paint, water, Dash accent |
| Sage green | `#89B78A` | Felt ground, trees, calm |
| Ink purple | `#574D69` | Shadows, outlines in UI, night |
| *Supporting* | wood `#C8925A`, cardboard `#C9A57A`, felt `#7FA878`, brass `#C8973A`, ink `#2B2433` | Materials |
| *Room* | wall `#B7A99A`, floor `#8A6A4E`, fabric `#9DAAB8` | Deliberately desaturated |

Rules: at most **two** palette accents per object. Characters use the most saturated values in
frame. The room stays below 60 % saturation.

## 4. Materials

| Material | Treatment |
| --- | --- |
| Painted wood (blocks, arches) | Light grain texture tinted by paint colour; bevelled edges (8 % radius) |
| Plastic/tin (characters) | Smooth, roughness 0.4, slight rounded bevels, no texture; brass parts metallic |
| Felt (ground, trees, banners) | Fibre-speckle texture, roughness 1.0, never shiny |
| Cardboard (signs, walls) | Corrugation stripes + specks, roughness 0.95 |
| Glass (marbles) | Clearcoat, ~80 % opacity, coloured swirl inside |
| Room surfaces | Matte, larger texture scale, softened by fog + blur |

## 5. Lighting & atmosphere

- **Key:** warm afternoon sun through the window (`#FFE3B8`), casting soft shadows.
- **Practical:** desk-lamp spotlight (honey) pooling over the square. It is the visual "heart" of the hub.
- **Fill:** warm hemisphere (cream sky / wood ground) plus a cool window bounce for silhouette separation.
- **Reflections:** a local, generated environment map (no downloaded HDRs).
- **Depth:** fog from 140 to 560 cm softens the room. Balanced quality uses a tilt-shift band
  focused on the toy's screen height. High quality uses true depth of field focused on the toy.
- **Contact:** shadow maps plus a soft blob shadow under the character. Blob shadows alone are
  acceptable on Low.

## 6. Camera language

- **Hub:** third-person, behind and slightly above, with the horizon in the upper third so the room is
  always visible. Pitching down past the default flips into a worm's-eye view looking up at the room.
- **Minigames:** fixed or gently elevated three-quarter views (e.g. Copycat: stage centred, all
  four instruments visible, no orbiting during sequence playback).
- **Menus:** a slow orbit of the diorama at about 50 cm radius (the title screen already does this).

## 7. Character system: "Contenders"

![blueprint](./assets/contender-blueprint.svg)

- **Body plan:** blocky, rounded tin-plastic robot. Belt skirt, chest plate with a **pressure gauge**
  (the needle shows how wound-up the toy is, i.e. speed), toothy grille grin, **single eye** on a turret, springy antenna,
  stubby arms with ball hands, block feet, and a **brass wind-up key** on the back (it always turns, and turns faster when running).
- **Silhouette test:** must read at 40 px tall in solid black (turret plus key plus block feet).
- **Paint jobs:** body, trim and accent colours from the palette (5 shipped: Toy Blue, Coral Clank,
  Sage Sprocket, Honey Hustle, Midnight Tin).
- **Accessories (next):** attach points on the turret top (hats: thimble helmet, bottle-cap crown,
  paper-boat hat), chest (button badges) and back (key skins).
- **Motion (procedural):**
  - Idle: breathing bob and glances.
  - Walk/run: hop-step bob, waddle roll and arm swing.
  - Turning: lean into the turn while the head leads.
  - Jump: stretch on the way up, a damped squash spring on landing.
  - Interact: a happy hop with a wave and squinting eye.
  - Elimination: spring compress, then sproing, spin and topple onto its back. The eye becomes an X and the key pops off.
  - Respawn: an overshoot pop-in.

## 8. Interface language

UI is made of physical things from the playroom:

| UI need | Physical metaphor |
| --- | --- |
| Logo / location sign | Nailed wooden sign |
| Primary buttons | Chunky two-layer toy buttons that depress |
| Panels / menus | Cardboard with masking tape |
| Toasts | Perforated paper tickets |
| Score displays | Felt-backed boards |
| Key prompts | Sticker keycaps |
| Achievements | Star stickers |

Typography: **Fredoka** (display, rounded) and **Nunito** (body). Both are open-font-licensed and self-hosted.
Contrast: all gameplay-critical text is ink `#2B2433` on cream or paper, which meets WCAG AA or better.
Reduced motion: every CSS animation is disabled under `prefers-reduced-motion`.

## 9. Audio identity

Tactile and mechanical. Everything is synthesised (`src/game/audio.ts`):

- Footsteps: a plastic tap with a clockwork tick.
- Jump: a rising spring. Land: a wooden thud.
- UI: wooden clicks and a soft tine on prompts.
- Workshop: a ratchet wind-up.
- Reward: a music-box arpeggio with a bell.
- Elimination: a wobbling spring, a downward slide and a tin clatter.
- **Copycat voices:** A = membrane drum, S = inharmonic bell, J = woody xylophone bar, K = music-box tine.

## 10. Do / Don't

| Do | Don't |
| --- | --- |
| Name the household object behind every structure | Use generic fantasy castles or trees |
| Keep toys saturated and the room muted | Light the room brighter than the toys |
| Chunky bevels, few big shapes | Thin details, greebles, noisy textures |
| Physical UI metaphors | Flat SaaS cards, gradients, emoji, icon packs |
| Toy-height camera | Human-eye-level camera in gameplay |
| Original characters and audio | Recreate characters, levels or sounds from reference games |

## 11. Reference material from the creative director

The following references were supplied and inform these rules. They are not reproduced in the repo.
- *Wooden train set on a bedroom floor*: tracks, felt islands, cardboard tunnels, depth through bed, desk and window.
- *Blue wind-up robot toy*: basis for the contender's body plan (single eye, gauge, side/rear key).
  Our model is an original design: different proportions, grille and turret details, and a rear key.
- *Toy soldier on a red book in a magenta-lit room*: camera height, book-as-stage scale, depth of
  field. We keep a warmer palette than that reference.
