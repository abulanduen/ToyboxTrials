/**
 * Tournament selection by format (owner decision, 20 Nov 2026): Blitz is party trials only; Normal
 * and Treasure draw their trials from the party games and always end with exactly one strategy
 * game (Toy Squad, Toybox Siege or Toy Tower Tumble), chosen from the seed. Checked on the
 * client's registry (local tournaments) and on the server's game facts (online lobbies), and
 * through the server's whole MatchFlow.
 */
import { describe, expect, it } from 'vitest';
import { MINIGAMES } from '../../src/minigames/registry';
import { GAME_FACTS, onlineGames } from '../../src/minigames/facts';
import { FORMATS, FORMAT_IDS, groupOf, isStrategy, isTeamGame, poolForFormat, selectGames, selectTournament, type TournamentFormat } from '../../src/minigames/tournament';
import { MatchFlow, type FlowMember } from '../../server/lobbyMatch';
import { SERVER_GAMES } from '../../server/games';
import { DEFAULT_LOBBY_SETTINGS, type LobbySettings } from '../../src/net/protocol';
import { DEFAULT_LOOK } from '../../server/sanitize';
import type { MinigameId } from '../../src/minigames/types';

const STRATEGY: MinigameId[] = ['toy-squad', 'toybox-siege', 'toy-tower-tumble'];
const TEAM: MinigameId[] = ['hoop-clash'];
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);
/** The client's games and the server's: both must follow the same rules. */
const CATALOGUES = { registry: MINIGAMES, server: onlineGames().filter((g) => SERVER_GAMES.has(g.id)) };
const groupById = (id: MinigameId) => groupOf(MINIGAMES.find((g) => g.id === id)!);

describe('trial groups: one source of truth', () => {
  it('exactly the three long, complex games are strategy trials, Hoop Clash the team trial; everything else is a party trial', () => {
    expect(MINIGAMES.filter(isStrategy).map((g) => g.id).sort()).toEqual([...STRATEGY].sort());
    expect(MINIGAMES.filter(isTeamGame).map((g) => g.id)).toEqual(TEAM);
    for (const g of MINIGAMES) expect(groupOf(g), g.id).toBe(STRATEGY.includes(g.id) ? 'strategy' : TEAM.includes(g.id) ? 'team' : 'party');
  });

  it("the server's facts carry the same groups", () => {
    for (const g of MINIGAMES) if (GAME_FACTS[g.id]) expect(groupOf(GAME_FACTS[g.id]!), g.id).toBe(groupOf(g));
  });

  it('every strategy trial is tournament-eligible, in Normal and Treasure only, and runs on the server', () => {
    for (const id of STRATEGY) {
      const def = MINIGAMES.find((g) => g.id === id)!;
      expect(def.status).toBe('playable');
      expect(def.bots).toBe('available');
      expect(def.eligibility.tournament).toBe(true);
      expect(def.eligibility.formats).toEqual(['normal', 'treasure']);
      expect(def.touch.buttons.length + (def.touch.movement === 'none' ? 0 : 1)).toBeGreaterThan(0);
      expect(SERVER_GAMES.has(id)).toBe(true);
    }
  });
});

describe.each(Object.entries(CATALOGUES))('selectTournament (%s)', (_name, games) => {
  it('Blitz: three party trials, the same draw as before the finale rule', () => {
    for (const seed of SEEDS) {
      for (let field = 1; field <= 8; field++) {
        const pool = poolForFormat('blitz', games, field);
        const picked = selectTournament(seed, 'blitz', pool);
        expect(picked).toHaveLength(3);
        expect(picked.every((id) => groupById(id) === 'party')).toBe(true);
        expect(picked).toEqual(selectGames(seed, 3, pool));
      }
    }
  });

  it.each(['normal', 'treasure'] as TournamentFormat[])('%s: party trials, then exactly one strategy finale', (format) => {
    const finales = new Set<MinigameId>();
    for (const seed of SEEDS) {
      for (const field of [1, 2, 4, 8]) {
        const pool = poolForFormat(format, games, field);
        const picked = selectTournament(seed, format, pool);
        expect(picked).toHaveLength(FORMATS[format].games);
        expect(groupById(picked[picked.length - 1])).toBe('strategy');
        expect(picked.slice(0, -1).every((id) => groupById(id) === 'party')).toBe(true);
        // No repeats before the finale while there are enough party trials (a solo field has four).
        const parties = pool.filter((g) => !isStrategy(g)).length;
        expect(new Set(picked.slice(0, -1)).size).toBe(Math.min(parties, picked.length - 1));
        finales.add(picked[picked.length - 1]);
      }
    }
    // The seed decides the finale: all three come up.
    expect([...finales].sort()).toEqual([...STRATEGY].sort());
  });

  it('is deterministic per seed and varies across seeds', () => {
    for (const format of FORMAT_IDS) {
      const pool = poolForFormat(format, games, 4);
      const runs = SEEDS.slice(0, 40).map((s) => selectTournament(s, format, pool).join());
      expect(SEEDS.slice(0, 40).map((s) => selectTournament(s, format, pool).join())).toEqual(runs);
      expect(new Set(runs).size).toBeGreaterThan(10);
    }
  });
});

describe('team trials are never tournament rounds (owner decision, 21 Nov 2026)', () => {
  // Even marked tournament-eligible, in every format and field size, the group alone keeps them out.
  const eligible = <G extends { eligibility: object }>(games: readonly G[]) => games.map((g) => ({ ...g, eligibility: { ...g.eligibility, tournament: true } }));
  it.each(Object.entries(CATALOGUES))('poolForFormat leaves them out (%s)', (_name, games) => {
    for (const format of FORMAT_IDS) {
      for (let field = 1; field <= 8; field++) {
        for (const pool of [poolForFormat(format, games, field), poolForFormat(format, eligible(games), field)]) {
          expect(pool.some(isTeamGame), `${format} ${field}`).toBe(false);
          for (const id of TEAM) expect(pool.map((g) => g.id)).not.toContain(id);
        }
      }
    }
  });
  it('selectTournament never deals one, even from a pool that holds one', () => {
    const withTeam = eligible(MINIGAMES).filter((g) => g.status === 'playable');
    expect(withTeam.some(isTeamGame)).toBe(true);
    for (const seed of SEEDS.slice(0, 100)) {
      for (const format of FORMAT_IDS) {
        const picked = selectTournament(seed, format, withTeam);
        expect(picked).toHaveLength(FORMATS[format].games);
        expect(picked.some((id) => TEAM.includes(id))).toBe(false);
      }
    }
    expect(selectTournament(3, 'blitz', withTeam.filter(isTeamGame))).toEqual([]);
  });
  it('the server agrees: online lobby tournaments never deal Hoop Clash', () => {
    const member = (id: string): FlowMember => ({ id, name: id, look: DEFAULT_LOOK, account: null, connected: true, ready: false, watch: null });
    for (let seed = 1; seed <= 40; seed++) {
      for (const format of FORMAT_IDS) {
        const games = new MatchFlow({ ...DEFAULT_LOBBY_SETTINGS, mode: 'tournament', format, cap: 4, botFill: true }, [member('p1'), member('p2')], seed, 0, 1).tournament!.games;
        expect(games.some((id) => TEAM.includes(id))).toBe(false);
      }
    }
    // ...while a one-trial lobby still plays it.
    expect(GAME_FACTS['hoop-clash']?.group).toBe('team');
    expect(SERVER_GAMES.has('hoop-clash')).toBe(true);
  });
});

describe('selectTournament edge cases', () => {
  it('does not depend on durations: retuned lengths keep the same draw', () => {
    const stretched = MINIGAMES.map((g) => ({ ...g, durationSec: (isStrategy(g) ? [60, 90] : [600, 900]) as [number, number] }));
    for (const seed of SEEDS.slice(0, 50)) {
      for (const format of FORMAT_IDS) {
        expect(selectTournament(seed, format, poolForFormat(format, stretched, 4))).toEqual(selectTournament(seed, format, poolForFormat(format, MINIGAMES, 4)));
      }
    }
  });

  it("counts the finale's category against the category cap (Siege is a survival game)", () => {
    const pool = poolForFormat('treasure', MINIGAMES, 4);
    let checked = 0;
    for (const seed of SEEDS) {
      const picked = selectTournament(seed, 'treasure', pool);
      if (picked[picked.length - 1] !== 'toybox-siege') continue;
      checked++;
      const survival = picked.slice(0, -1).filter((id) => MINIGAMES.find((g) => g.id === id)!.category === 'survival');
      expect(survival.length).toBeLessThanOrEqual(1);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('falls back to what there is when a pool has no strategy or no party trial', () => {
    const party = MINIGAMES.filter((g) => !isStrategy(g));
    const strategy = MINIGAMES.filter(isStrategy);
    expect(selectTournament(5, 'normal', party).every((id) => groupById(id) === 'party')).toBe(true);
    expect(selectTournament(5, 'normal', party)).toHaveLength(5);
    expect(selectTournament(5, 'normal', strategy)).toHaveLength(5);
    expect(selectTournament(5, 'blitz', strategy)).toEqual([]);
    expect(selectTournament(5, 'treasure', [])).toEqual([]);
  });
});

describe('online: the server picks with the same rule', () => {
  const member = (id: string): FlowMember => ({ id, name: id, look: DEFAULT_LOOK, account: null, connected: true, ready: false, watch: null });
  const settings = (format: TournamentFormat): LobbySettings => ({ ...DEFAULT_LOBBY_SETTINGS, mode: 'tournament', format, cap: 4, botFill: true });

  it('Normal and Treasure lobbies end with a strategy trial; Blitz never has one', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const format of FORMAT_IDS) {
        const games = new MatchFlow(settings(format), [member('p1'), member('p2')], seed, 0, 1).tournament!.games;
        expect(games).toHaveLength(FORMATS[format].games);
        const strategic = games.filter((id) => groupById(id) === 'strategy');
        if (format === 'blitz') expect(strategic).toEqual([]);
        else expect(strategic).toEqual([games[games.length - 1]]);
      }
    }
  });

  it('plays a whole Normal lobby tournament with bots, strategy finale included, to the final table', () => {
    const members = [member('p1'), member('p2')];
    const flow = new MatchFlow(settings('normal'), members, 2026, 0, 1, 40);
    const games = flow.tournament!.games;
    expect(groupById(games[4])).toBe('strategy');
    let now = 0;
    const played: MinigameId[] = [];
    for (let i = 0; i < 400_000; i++) {
      const prev = flow.phase;
      const r = flow.tick((now += 50), members);
      if (prev !== 'countdown' && flow.phase === 'countdown') played.push(flow.game);
      // Humans sit idle in every trial (the server's timeouts carry them through Siege's class pick).
      if (r.done) break;
    }
    expect(played).toEqual(games);
    expect(flow.phase).toBe('final');
    for (const s of flow.tournament!.standings) expect(s.rounds).toHaveLength(5);
  });
});
