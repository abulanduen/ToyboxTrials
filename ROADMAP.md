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

**Midnight branch update:** `astra/midnight-hunger` adds the fourth local playable minigame:
night/day energy rules, N−1 battery targets, shelters, bots, keyboard/touch controls and tournament
integration. Balance/interpretations are in `src/minigames/midnight/README.md`. It is based on the
Inferno branch; merge that work first. Seven catalogue entries remain planned in this clone;
Claude's separate work is still described in the handoff section above.

**Astra branch update:** `astra/inferno-escape` adds a local Inferno Escape module, Pavilion practice
entry via the registry, bots and tournament eligibility. See `src/minigames/inferno/README.md` for
provisional rules and integration notes. Claude retains the three worktrees listed above; recover
and review those separately. This branch has not been merged or deployed.

- **M1–M3:** art direction, procedural tabletop/room, wind-up character, third-person exploration, collision, interactions/secrets, synthesised sound, menu, Workshop, settings and local persistence; keyboard/mouse and touch controls.
- **M4:** modular minigame host, intro/countdown/pause/results, local records, bot opponents, seeded Blitz (3), Normal (5), Treasure (8) tournaments, standings/final results and local history.
- **Copycat Conductor:** seeded growing sequences, four ASJK/touch instruments, elimination, solo/bot play and rules tests. Preserve its working functionality.
- **M5 partial:** Jack-in-the-Box rules, category bank/matching, bots, scene/HUD and tournament inclusion. Nine catalogue entries remain unimplemented.

## Current milestone and priorities

**M5: broaden the local minigame foundation; Find the Original is next in the existing roadmap.** No new features are authorized by this documentation task.

1. Reconcile the owner's separately supplied authoritative specification with existing design amendments. It has not yet been provided in this chat.
2. Establish a fresh baseline for Copycat, Jack-in-the-Box, tournaments, menu/Workshop, persistence and mobile controls before future code changes.
3. Complete Find the Original as one independent module with rules, bots, readable touch interaction, results integration and meaningful tests.
4. Continue **M6:** Red Light, Green Light and Wind-Up Dash, one complete game at a time.
5. **M7:** real-device performance, mobile usability, audio mix and accessibility. Work from measurements, not historical headless FPS.

## Future stages

| Stage | Planned scope / dependency |
| --- | --- |
| M8 | Select server/host and prove two-client authoritative hub + one minigame. No server currently exists |
| M9 | Friends rooms/codes, public casual, configurable Custom Party, guest nicknames and bot fill |
| M10 | Ranked ratings, history and leaderboards. Blitz/Normal/Treasure must have independent ratings; older plan stages launch one ladder first as population allows |
| M11 | Emotes, inspection, parties, lobby instancing and interest management; grow toward the unverified 500-player lobby-server goal |
| Remaining games | Music Box Rhythm, Inferno Escape, Midnight Hunger, Toy Squad, Blink Duel, Spellbox Showdown; music rights and combat bots require additional work |
| Optional room polish | Room dog pending asset/delivery; denser village, evening lighting and other visual ideas remain proposals |

## Decisions and information still missing

- Separate authoritative conversation/specification, including any changes to the existing 11-game catalogue. Do not reconstruct missing conversation history from guesses.
- Confirm launch sequencing for the three independent ranked modes: older amendment A3 launches one ladder first; the current request specifies three independent modes without deciding release timing.
- Rating algorithm, first ranked format, ranked identity/guest policy, ranked bot policy and disconnect/reconnect rules. The older plan proposes no ranked bots; that is not implemented enforcement.
- Final balance, durations and tie/forfeit policies; Red Light penalty choice; Toy Squad victory condition/round count; final eligibility (Toy Squad is currently excluded from tournaments/ranked in metadata).
- Server provider/cost, networking protocol and tested lobby capacity. Multiplayer proof game remains to be chosen between the existing Copycat scope and Jack's candidacy.
- Music source/licensing, room dog asset, hardware/device validation and any external competition requirements.

Guest-friendly casual access remains an established design requirement. Accounts, purchases, social systems, persistent online progression and all ranked/online features remain future work.
