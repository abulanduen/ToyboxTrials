# Toybox Trials: art direction

Status: established direction from `src/game/palette.ts`, current scenes and `docs/03-visual-design-guide.md`. Detailed material/camera guidance and the character blueprint remain in that guide. Visual quality on real devices has not been revalidated in this documentation pass.

## World and characters

- **Toy layer:** original miniature wind-up characters and a handcrafted tabletop village. Chunky silhouettes, rounded painted wood, plastic/tin, cardboard, felt and brass. Structures should visibly come from household objects: pencil cases, bottle caps, books, dominoes and thread spools.
- **Room layer:** oversized, realistic-leaning playroom scenery supplies scale. Keep it muted and softened by fog/depth effects so toys remain readable. The current room is procedural geometry, not a photoreal asset set.
- **Contender:** approximately 3.5 cm tall; single turret eye, pressure gauge, grille grin, antenna, stubby limbs, block feet and turning brass key. Procedural animation conveys clockwork energy. Paint, hats and key variants exist; expanded outfits, badges and effects are planned.
- **Exploration:** third-person at toy height, with the huge room visible beyond the tabletop. Never raise gameplay to human eye level. Minigames may use fixed, readable stage cameras.
- Scale: 1 world unit = 1 cm; tabletop y = 0. A pencil is an obstacle, a mug a tower, a book a ledge and the table edge a precipice.

## Established palette

Use `src/game/palette.ts` as the token source.

| Colour | Hex | Role |
| --- | --- | --- |
| Warm cream | `#F4E8CE` | Paper, highlights |
| Honey yellow | `#EFAE45` | Actions, rewards, Copycat |
| Coral | `#E76B62` | Excitement, danger |
| Toy blue | `#6BA7C8` | Default toy paint, racing |
| Sage green | `#89B78A` | Calm, foliage |
| Ink purple | `#574D69` | Shadows, outlines |

Supporting tokens: wood `#D9A86C` / `#B9824A` / `#7E5332`, cardboard `#C9A57A`, felt `#7FA878`, brass `#C8973A`, text ink `#2B2433`. Room wall `#B7A99A`, floor `#8A6A4E`, fabric `#9DAAB8`.

Keep scenery lower in contrast and saturation than characters. Prefer restrained accents and clear silhouettes; distinguish gameplay cues with shape/sound as well as colour.

## Presentation rules

- Warm afternoon sunlight, a honey desk-lamp pool and cool window fill. Low disables shadows/post-processing; Balanced uses tilt-shift; High uses depth of field.
- Physical UI metaphors: wooden signs/buttons, taped cardboard panels, paper tickets, felt scoreboards and sticker prompts. Fredoka display and Nunito body fonts are bundled. No generic icon packs or emoji for important visuals.
- Touch controls share the tactile language, with safe-area placement and targets at least 56 px. Respect reduced-motion preferences.
- Synthesised mechanical sound effects: taps, springs, ratchets and music-box tones. Copycat mapping stays A coral drum, S golden bell, J blue xylophone, K green music box.
- Blink Duel uses a felt practice mat, cardboard rails, oversized original toy swords and blue/brass
  spring-pop rings. Striped sector warnings and a filling charge bar communicate timing without
  relying on colour alone; reduced-motion suppresses the decorative sweep and ring expansion.
- Concepts in `public/assets/concepts/` are references and excluded from production output. Older cream-mascot concepts do not override the current contender design.
- Proposed generated room assets, including the dog, remain future work. Use compressed GLB, lazy loading, a Low-tier fallback and source/licence records. Keep the toy layer code-built; never copy reference-game characters, levels or audio.
