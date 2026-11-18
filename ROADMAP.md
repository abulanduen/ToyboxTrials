# Toybox Trials: roadmap

Source audit: 18 November 2026, starting commit `59744b7`. Status means code exists, not production readiness or a fresh test pass. This is the current summary; `DEVELOPMENT_ROADMAP.md` retains detailed historical milestones and decisions.

## Handoff recovery: newer Claude work exists outside this clone

The owner's Claude Code session, **Toybox Trials visual polish**, contains a saved worktree audit
from 17 November 2026 at 10:51 UTC. Its output reports the following newer work, which is **not
present in this clone or the remote branches fetched during this handoff**:

| Cloud worktree | Saved audit evidence |
| --- | --- |
| `.claude/worktrees/agent-ad9c73b387fffedb1` | Find the Original uncommitted: `src/minigames/findoriginal/`, unit/e2e tests, plus shared integration edits |
| `.claude/worktrees/agent-a3954cb82b71d5499` | `63b697f`: shared movement core + Red Light, Green Light; Wind-Up Dash uncommitted under `src/minigames/winddash/` with tests/integration edits |
| `.claude/worktrees/agent-a2d06c057f2628a2c` | `d9800b1`: WIP sunlit room, baked lighting, furniture and light shafts; further uncommitted room/dog-brief edits |

These are historical tool-output reports, not recovered or validated source. Agents ran again after
that audit, so their final state may differ. At inspection the cloud environment showed **Not connected**,
the account showed a weekly usage limit, and the Files panel required starting the session.
Recover all three worktrees, including untracked files, before recreating these features or merging
them. The completed/next sections below describe only the older local clone.

## Completed first passes

**Spellbox Showdown branch update:** `astra/spellbox-showdown` adds the seventh local playable
game: three-slot drafts, eight distinct spells, projectiles/AoE/pull/mines/shield/repair,
damage-scaled knockback, ring-outs, bots and keyboard/mouse/touch. It uses existing records,
results and local tournaments. Values and tie rules remain provisional in its module README.
Owner revision adds much larger population-based rings, 10-second shrink warnings, a smooth
moving edge, camera scaling and three role-specific choices per spell button. Human playtesting
should check the larger travel distances, camera readability, transition speed and slot grouping.
Visual follow-up adds eight generated ability icons to Spellbox draft/loadout/cooldown buttons
and disables focus blur during all minigames at every graphics tier. Hub focus effects remain.
Audio follow-up replaces Spellbox's repeated bells/cranks with eight short material sounds,
limits overlapping cues and quiets distant opponents; UI clicks and footsteps are softer.
The owner declined the later parallax trial, preserved separately on local `astra/parallax-trial`.
The current direction is 3D town polish guided by `docs/assets/town-concept-v1/HANDOFF.md` and
four reference views. No town geometry was rebuilt as part of the concept pack.
Four games remain absent here: Claude's Find the Original, Red Light/Green Light, Wind-Up Dash
and Music Box Rhythm. Recover/review that work before integration; do not recreate it.

**Blink Duel branch update:** `astra/blink-duel` adds the sixth local playable game: no-cooldown
blinks, one-hit sword eliminations, striped wind-up cones, simultaneous hits, solid living bodies,
bots, keyboard/mouse/touch and local tournament/record integration. See its module README for
provisional range/timing, cancellation and tie rules. At that revision five catalogue games lacked local modules:
Claude's Find the Original, Red Light/Green Light, Wind-Up Dash and Music Box Rhythm work, plus
Spellbox Showdown. Recover/review Claude's work before integration; do not recreate it.

**Toy Squad branch update:** `astra/toy-squad` adds the fifth local playable game, casual-only.
It now has ten rounds, a 62-unit five-rarity shop using the owner’s exact level odds, paid rerolls,
two-copy merges up to three stars, eight reserves, level-based 3–10 board slots, and passive
choices on rounds 3/6/9. The 8×8 drag board retains turning/attack particles and adds hit numbers.
Pathfinding now routes around living toys and resolves contested moves; dead toys never block.
All 62 units now also have individually named passives and automatic mana spells, with AoE/line
damage, buffs/debuffs, healing, shields and 11 formation traits. Unit kits and run-wide passive
choices remain separate. Next: human playtesting of kit combinations, readability and balance;
online/ranked integration remains future work.
Owner UX revision: pairs merge automatically; reserves sit below the player board; hover shows
details; Q sells hovered/selected toys, R rerolls, E readies. Gold rings preview shop recipients.
See `src/minigames/toysquad/README.md` and `CATALOGUE.md` for mechanics and provisional balance.
At that Toy Squad revision, six other local catalogue entries lacked modules, including
work the owner reports Claude is handling separately.

**Midnight branch update:** `astra/midnight-hunger` adds the fourth local playable minigame:
night/day energy rules, N−1 battery targets, shelters, bots, keyboard/touch controls and tournament
integration. Balance/interpretations are in `src/minigames/midnight/README.md`. It is based on the
Inferno branch; merge that work first. At that revision seven catalogue entries remained planned;
Claude's separate work is still described in the handoff section above.

Owner revision: Midnight now has solid player/target collision, pushes with opposite-input
resistance, and three-hit battery claims via Spacebar/Hit. Inferno uses Spacebar to break and R
to build. Details and provisional cooldown/chain rules are in the respective module READMEs.

**Astra branch update:** `astra/inferno-escape` adds a local Inferno Escape module, Pavilion practice
entry via the registry, bots and tournament eligibility. See `src/minigames/inferno/README.md` for
provisional rules and integration notes. Claude retains the three worktrees listed above; recover
and review those separately. This branch has not been merged or deployed.

- **M1–M3:** art direction, procedural tabletop/room, wind-up character, third-person exploration, collision, interactions/secrets, synthesised sound, menu, Workshop, settings and local persistence; keyboard/mouse and touch controls.
- **M4:** modular minigame host, intro/countdown/pause/results, local records, bot opponents, seeded Blitz (3), Normal (5), Treasure (8) tournaments, standings/final results and local history.
- **Copycat Conductor:** seeded growing sequences, four ASJK/touch instruments, elimination, solo/bot play and rules tests. Preserve its working functionality.
- **Historical M5 baseline:** Jack-in-the-Box rules, category bank/matching, bots, scene/HUD and tournament inclusion. At that point nine catalogue entries remained unimplemented.

## Current milestone and priorities

**Current milestone: integrate and playtest the seven local games; recover Claude's separate work.**
All games previously assigned to Astra now have local modules. Online multiplayer remains future work.

1. Recover and review Claude's games and room pass, including uncommitted/untracked cloud work.
2. Integrate reviewed Astra/Claude branches into main with regression checks for the existing games,
   tournament flow, mobile controls and saved data.
3. Reconcile the separately supplied authoritative specification when available; do not invent it.
4. Human playtesting for Blink/Spellbox combat feel and Toy Squad balance, followed by measured fixes.
5. Real-device performance, mobile usability, audio mix and accessibility; then the online proof of concept.

## Future stages

| Stage | Planned scope / dependency |
| --- | --- |
| M8 | Select server/host and prove two-client authoritative hub + one minigame. No server currently exists |
| M9 | Friends rooms/codes, public casual, configurable Custom Party, guest nicknames and bot fill |
| M10 | Ranked ratings, history and leaderboards. Blitz/Normal/Treasure must have independent ratings; older plan stages launch one ladder first as population allows |
| M11 | Emotes, inspection, parties, lobby instancing and interest management; grow toward the unverified 500-player lobby-server goal |
| Remaining local games | Find the Original, Red Light/Green Light, Wind-Up Dash, Music Box Rhythm (Claude's separate work, unverified here) |
| Optional room polish | Room dog pending asset/delivery; denser village, evening lighting and other visual ideas remain proposals |

## Decisions and information still missing

- Separate authoritative conversation/specification, including any changes to the existing 11-game catalogue. Do not reconstruct missing conversation history from guesses.
- Confirm launch sequencing for the three independent ranked modes: older amendment A3 launches one ladder first; the current request specifies three independent modes without deciding release timing.
- Rating algorithm, first ranked format, ranked identity/guest policy, ranked bot policy and disconnect/reconnect rules. The older plan proposes no ranked bots; that is not implemented enforcement.
- Final balance, durations and tie/forfeit policies; Red Light penalty choice; Toy Squad scoring/eligibility (its ten rounds are owner-confirmed; it is currently excluded from tournaments/ranked).
- Server provider/cost, networking protocol and tested lobby capacity. Multiplayer proof game remains to be chosen between the existing Copycat scope and Jack's candidacy.
- Music source/licensing, room dog asset, hardware/device validation and any external competition requirements.

Guest-friendly casual access remains an established design requirement. Accounts, purchases, social systems, persistent online progression and all ranked/online features remain future work.
