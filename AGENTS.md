# Toybox Trials: development instructions

Applies to Codex, Claude Code and other contributors. Read this file before edits.

## Project context and authority

- Original browser party game: miniature wind-up toys in a handcrafted tabletop village inside a huge playroom.
- Read `GAME_DESIGN.md`, `ART_DIRECTION.md`, `TECHNICAL_PLAN.md` and `ROADMAP.md` for mechanics, visuals, implementation and priorities.
- The owner's current instructions and separately supplied design specification take precedence over older documents. That separate specification has not yet been supplied in this chat; preserve existing mechanics until reconciled.
- Distinguish **implemented**, **planned**, **proposal** and **long-term goal**. Source code establishes implementation; catalogue entries and eligibility flags do not prove a feature exists. Historical milestone documents may be stale.

## Preserve working functionality

- Make focused, reversible changes. Do not rewrite working systems, remove content or change dependencies incidentally.
- Preserve Copycat Conductor: growing seeded sequence, A/S/J/K instrument mapping, touch input, timing, elimination, bots, scoring, restart and saved records. Historical permission to redesign an earlier Base44 version is not permission to replace this working implementation.
- Also preserve Jack-in-the-Box, local tournaments, hub movement/collision/camera, menu, Workshop, settings, secrets and cosmetic unlocks.
- Preserve localStorage key `toybox-trials:prototype:v1` and saved data. Schema changes need a compatible migration.
- Do not implement planned features merely because they appear in documentation. This documentation task authorizes no gameplay changes.
- Subsequent owner authorization: Astra may implement Inferno Escape on `astra/inferno-escape`.
  Midnight Hunger is also authorized on `astra/midnight-hunger`, based on the Inferno branch.
  Toy Squad is authorized on `astra/toy-squad`, based on Midnight. Keep its unresolved format and
  balance choices configurable and labelled provisional. The owner reports Claude is handling Music Box Rhythm.
  Claude owns Find the Original, Red Light/Green Light, Wind-Up Dash and the room pass in separate
  cloud worktrees. Do not recreate or overwrite that work; recover and review it before integration.
  Toy Squad now has 62 individual passive/spell pairs and 11 formation traits. Preserve kit
  coverage, deterministic mana/status resolution and the separate run-wide passive choices.
  Blink Duel is authorized on `astra/blink-duel`, based on Toy Squad. Preserve no-cooldown
  blinking, one-hit eliminations and clear wind-up cues. Balance/cancel/tie choices are provisional
  in its module README. Claude's assigned games remain separate.

## Coding conventions

- React + strict TypeScript + Vite; follow nearby code style. No per-frame React state updates: scene loops read plain objects or store snapshots.
- Use shared systems: `src/game/input.ts`, `audio.ts`, `store.ts`, `cosmetics.ts` and `palette.ts`. Device adapters may collect input; gameplay consumes shared actions or the module's input adapter.
- World scale: 1 unit = 1 cm, tabletop y = 0, contender approximately 3.5 cm tall. Positions/colliders belong in `src/scene/layout.ts`; rotations follow three.js conventions.
- Screens are `menu`, `playing`, `workshop`, `minigame`. Camera transitions orbit or cut without passing through the character.
- Each minigame uses `src/minigames/types.ts` and the lazy-loaded registry. Keep deterministic, seeded rules independent of DOM, rendering, wall-clock timers and unseeded randomness. Reuse the host for lifecycle, bots, results and tournaments.
- Use `MiniContender` for opponents/crowds and the full `WindupBot` for the local character. Debug hooks are test aids, never gameplay dependencies.
- Every feature must support keyboard/mouse and touch, portrait and landscape where practical. Declare a real minigame touch layout; `TOUCH_TBD` blocks shipping. Use safe-area-aware controls with targets at least 56 px; touch defaults to Low quality.
- Follow `ART_DIRECTION.md`. Keep content original. Synthesise sound effects; original/licensed music is allowed for Music Box Rhythm. Record external/generated assets and licences in `public/assets/asset-manifest.json`.
- Keep the browser client statically deployable. Future multiplayer requires a separate authoritative server; local bots or database polling are not online multiplayer.

## Validation and reporting

- Documentation-only edits: check links, claims against source, and the diff; do not claim a fresh gameplay test.
- Code changes: run `npm test` and `npm run build`, plus relevant existing browser checks against a running preview server. Rules changes need meaningful deterministic unit coverage.
- Browser checks: `node tests/e2e/functional.cjs`, `secrets.cjs`, `mobile.cjs`, `menu.cjs`, `minigame.cjs` (each filename after the first is also under `tests/e2e/`). Run the minigame check explicitly: `npm run test:e2e` currently omits it.
- Browser checks require Playwright and Chromium, which are not declared in package.json. Do not change dependencies just to edit docs.
- Report what changed, checks actually run, and limitations. Never infer real-device performance, audio quality, touch reliability or 500-player capacity from source/headless checks.
