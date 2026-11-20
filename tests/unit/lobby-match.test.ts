/**
 * Server-run matches: every trial's rules core and bots running headless on the server path
 * (server/matchRunner.ts), a whole lobby tournament (server/lobbyMatch.ts), hidden-information
 * filtering, snapshot patches (src/net/delta.ts), and the tournament format pool.
 */
import { describe, expect, it } from 'vitest';
import { GameRun, applyForfeits, STEP_MS } from '../../server/matchRunner';
import { MatchFlow, PHASE_MS, startProblem, type FlowMember } from '../../server/lobbyMatch';
import { HIDDEN_FUSE_MS, SERVER_GAMES } from '../../server/games';
import type { TdState } from '../../src/minigames/towertumble/rules';
import { makeBots } from '../../src/minigames/bots';
import { MINIGAME_IDS, type MinigameId } from '../../src/minigames/ids';
import { GAME_FACTS, onlineGames } from '../../src/minigames/facts';
import { MINIGAMES } from '../../src/minigames/registry';
import { FORMAT_IDS, poolForFormat } from '../../src/minigames/tournament';
import { applyPatch, diff, wireCopy } from '../../src/net/delta';
import { DEFAULT_LOBBY_SETTINGS, type LobbySettings, type MatchStateMsg } from '../../src/net/protocol';
import { DEFAULT_LOOK } from '../../server/sanitize';
import type { Contestant } from '../../src/minigames/types';

type Obj = Record<string, unknown>;

const human = (id: string, name = id): Contestant => ({ ...makeBots(1, 1, 'normal')[0], id, name, bot: undefined });
const field = (bots: number, humans: string[] = []): Contestant[] => [...humans.map((h) => human(h)), ...makeBots(99, bots, 'normal')];

/** Run a trial with the server's runner until it ends (or `limitMs` of match time). */
function runToEnd(run: GameRun, limitMs = 15 * 60_000, tick = 1000 / 30) {
  let t = 0;
  while (!run.over && t < limitMs) {
    run.advance(tick);
    run.takeEvents();
    t += tick;
  }
  return t;
}

describe('server match runner: every trial runs headless with bots', () => {
  for (const id of MINIGAME_IDS) {
    it(`${id} plays to a result with a full field of bots`, () => {
      const run = new GameRun(id, field(4), 1234);
      const ms = runToEnd(run);
      expect(run.over, `${id} ended`).toBe(true);
      const r = run.result();
      expect(r.minigame).toBe(id);
      expect(r.placements.map((p) => p.contestantId).sort()).toEqual(run.seats.map((c) => c.id).sort());
      expect(Math.min(...r.placements.map((p) => p.place))).toBe(1);
      expect(ms).toBeGreaterThan(0);
    });
  }

  it('is deterministic: the same seed and inputs give the same result', () => {
    const a = new GameRun('wind-up-dash', field(5), 77);
    const b = new GameRun('wind-up-dash', field(5), 77);
    runToEnd(a);
    runToEnd(b);
    expect(a.result().placements).toEqual(b.result().placements);
  });

  it('a human seat takes validated inputs only, and an idle human still gets placed', () => {
    const run = new GameRun('copycat-conductor', field(2, ['p1']), 5);
    expect(run.input('p1', [{ slot: 2 }, { slot: 9 }, { slot: '1' }, { evil: true }])).toBe(1);
    expect(run.rejected).toBe(3);
    expect(run.input('bot-1', [{ slot: 1 }])).toBe(0); // nobody plays for a bot
    expect(run.input('nobody', [{ slot: 1 }])).toBe(0);
    runToEnd(run);
    expect(run.result().placements.find((p) => p.contestantId === 'p1')).toBeDefined();
  });

  it.each([undefined, 17])('Tower quick merge crosses server validation (preferred cell %s)', (preferredCell) => {
    const run = new GameRun('toy-tower-tumble', field(0, ['p1']), 1978);
    const s = run.state as unknown as TdState;
    expect(run.input('p1', [{ type: 'build', cell: 17 }, { type: 'build', cell: 20 }])).toBe(2);
    run.advance(STEP_MS);
    const me = s.players[0];
    expect(me.towers).toHaveLength(2);
    me.towers[0].def = 'tin-sentry'; me.towers[1].def = 'spark-bot';
    expect(run.input('p1', [-1, 1.5, '17', NaN, Infinity].map(preferredCell => ({ type: 'auto-merge', preferredCell })))).toBe(0);
    expect(run.input('p1', [{ type: 'auto-merge', preferredCell }])).toBe(1);
    run.advance(STEP_MS);
    expect(me.merges).toBe(1);
    expect(me.towers).toHaveLength(1);
    expect(me.towers[0].cell).toBe(17);
  });

  it('a forfeit puts the player last, below everyone who finished', () => {
    const run = new GameRun('wind-up-dash', field(3, ['p1']), 9);
    run.advance(2000);
    run.forfeit('p1');
    runToEnd(run);
    const placements = run.result().placements;
    expect(placements[placements.length - 1]).toMatchObject({ contestantId: 'p1', forfeit: true, place: 4 });
    expect(applyForfeits([{ contestantId: 'a', place: 1, score: 0 }, { contestantId: 'b', place: 1, score: 0 }, { contestantId: 'c', place: 3, score: 0 }], new Set(['a']))).toEqual([
      { contestantId: 'b', place: 1, score: 0 },
      { contestantId: 'c', place: 2, score: 0 },
      { contestantId: 'a', place: 3, score: 0, forfeit: true },
    ]);
  });

  it('held-input games keep the last batch for a moment, and an empty batch lets go', () => {
    const run = new GameRun('inferno-escape', field(1, ['p1']), 3);
    const me = () => (run.state.players as { id: string; x: number; z: number }[]).find((p) => p.id === 'p1')!;
    const start = { ...me() };
    run.input('p1', [{ direction: 1 }]);
    run.advance(200); // one batch, held across steps: the toy moves although no new input came
    expect(me().x !== start.x || me().z !== start.z).toBe(true);
    run.input('p1', []);
    const stopped = { ...me() };
    run.advance(1000);
    expect({ x: me().x, z: me().z }).toEqual({ x: stopped.x, z: stopped.z });
  });

  it('steps in fixed 60 Hz sub-steps whatever the server tick', () => {
    const run = new GameRun('music-box-rhythm', field(2), 4);
    run.advance(1000);
    expect((run.state as { t: number }).t).toBeCloseTo(60 * STEP_MS, 5);
  });
});

describe('hidden information never leaves the server', () => {
  it("Jack-in-the-Box: the fuse (left, total and the pre-rolled list) is not in any view", () => {
    const run = new GameRun('jack-in-the-box', field(3, ['p1']), 42);
    while ((run.state as { phase: string }).phase !== 'live') run.advance(100);
    run.advance(1500);
    const real = run.state as { fuseMs: number; fuseTotalMs: number; fuses: number[] };
    const view = run.viewFor(run.publicView(), 'p1');
    const json = JSON.stringify(view);
    expect(view.fuseTotalMs).toBe(HIDDEN_FUSE_MS);
    expect(view.fuses).toEqual([]);
    expect(view.order).toEqual([]);
    // Only the time held so far can be worked out from the view (the Scene's wobble uses it).
    const held = (view.fuseTotalMs as number) - (view.fuseMs as number);
    expect(held).toBeCloseTo(real.fuseTotalMs - real.fuseMs, 2);
    expect(json).not.toContain(String(Math.round(real.fuseMs * 1000) / 1000));
    expect(json).not.toContain(String(Math.round(real.fuseTotalMs * 1000) / 1000));
  });

  it('Copycat: notes not yet demonstrated are masked, and the seed is not sent', () => {
    const run = new GameRun('copycat-conductor', field(2), 8);
    const intro = run.publicView();
    expect((intro.sequence as number[]).every((n) => n === 0)).toBe(true);
    expect(intro.seed).toBe(0);
    while ((run.state as { phase: string }).phase !== 'demo' || (run.state as { demoIndex: number }).demoIndex < 1) run.advance(STEP_MS);
    const s = run.state as { sequence: number[]; demoIndex: number };
    const v = run.publicView().sequence as number[];
    expect(v.slice(0, s.demoIndex)).toEqual(s.sequence.slice(0, s.demoIndex));
    expect(v.slice(s.demoIndex).every((n) => n === 0)).toBe(true);
  });

  it('Red Light: the pre-rolled light timings are not sent', () => {
    const run = new GameRun('red-light-green-light', field(3), 8);
    expect((run.state as { cycles: unknown[] }).cycles.length).toBeGreaterThan(0);
    expect(run.publicView().cycles).toEqual([]);
  });

  it('seeds and other players’ queued inputs are not sent', () => {
    for (const id of ['midnight-hunger', 'find-the-original', 'blink-duel', 'spellbox-showdown'] as MinigameId[]) {
      const run = new GameRun(id, field(3), 12345);
      run.advance(500);
      const v = run.publicView();
      expect(v.seed, id).toBe(0);
      if ('pending' in v) expect(v.pending).toEqual({});
      expect(v.events).toEqual([]);
    }
  });

  it("Toy Tower Tumble: no board's random-draw state; Odd Page Out: no seed", () => {
    const run = new GameRun('toy-tower-tumble', field(3, ['p1']), 4);
    run.advance(500);
    expect((run.state.players as { rng: number }[]).some((p) => p.rng !== 0)).toBe(true);
    const v = run.publicView();
    expect((v.players as { rng: number }[]).every((p) => p.rng === 0)).toBe(true);
    expect(v.seed).toBe(0);
    expect(new GameRun('odd-page-out', field(3), 99).publicView().seed).toBe(0);
  });

  it("Toy Squad: you see your own shop, passive offers and battle, nobody else's", () => {
    const run = new GameRun('toy-squad', field(3, ['p1']), 31);
    const base = run.publicView();
    expect(base.seed).toBe(1);
    const mine = run.viewFor(base, 'p1');
    const players = mine.players as { id: string; shop: unknown[] }[];
    expect(players.find((p) => p.id === 'p1')!.shop.length).toBeGreaterThan(0);
    for (const p of players.filter((p) => p.id !== 'p1')) expect(p.shop).toEqual([]);
    // Into a battle: only p1's own.
    while ((run.state as { phase: string }).phase !== 'battle') run.advance(500);
    const fight = run.viewFor(run.publicView(), 'p1').battles as { owner: string }[];
    expect((run.state as { battles: unknown[] }).battles.length).toBeGreaterThan(1);
    expect(fight.map((b) => b.owner)).toEqual(['p1']);
    // Viewing another board from the player rail adds that board's battle, still nobody else's shop.
    const other = (run.state as { battles: { owner: string }[] }).battles.find((b) => b.owner !== 'p1')!.owner;
    const viewing = run.viewFor(run.publicView(), 'p1', other);
    expect((viewing.battles as { owner: string }[]).map((b) => b.owner).sort()).toEqual(['p1', other].sort());
    for (const p of (viewing.players as { id: string; shop: unknown[]; passiveOffers: unknown[]; units: unknown[] }[]).filter((p) => p.id !== 'p1')) {
      expect(p.shop).toEqual([]); expect(p.passiveOffers).toEqual([]); expect(Array.isArray(p.units)).toBe(true);
    }
  });
});

describe('snapshot patches', () => {
  it('diff + applyPatch rebuild every snapshot of a real match exactly', () => {
    for (const id of ['blink-duel', 'toy-squad', 'jack-in-the-box', 'wind-up-dash'] as MinigameId[]) {
      const run = new GameRun(id, field(3, ['p1']), 2024);
      let client: unknown = JSON.parse(JSON.stringify(run.viewFor(run.publicView(), 'p1')));
      let last = run.viewFor(run.publicView(), 'p1');
      for (let i = 0; i < 120 && !run.over; i++) {
        run.advance(1000 / 30 * 3);
        const next = run.viewFor(run.publicView(), 'p1');
        const patch = diff(last, next);
        if (patch) client = applyPatch(client, JSON.parse(JSON.stringify(patch)));
        expect(client, `${id} step ${i}`).toEqual(next);
        last = next;
      }
    }
  });

  it('patches keep untouched objects in place, delete keys, and refuse unsafe keys', () => {
    const a = wireCopy({ x: 1.23456, keep: { deep: [1, 2] }, gone: true, list: [{ v: 1 }, { v: 2 }] }) as Obj;
    expect(a.x).toBe(1.235);
    const b = { x: 2, keep: { deep: [1, 2] }, list: [{ v: 1 }] };
    const client = JSON.parse(JSON.stringify(a));
    const keep = client.keep;
    const out = applyPatch(client, diff(a, b)) as Obj;
    expect(out).toEqual(b);
    expect(out.keep).toBe(keep);
    const evil = applyPatch({}, JSON.parse('{"o":{"__proto__":{"$":{"polluted":true}}}}')) as Obj;
    expect(({} as Obj).polluted).toBeUndefined();
    expect(Object.keys(evil)).toEqual([]);
    expect(() => applyPatch({}, { nope: 1 })).toThrow();
    expect(wireCopy({ n: NaN, i: Infinity, u: undefined })).toEqual({ n: null, i: null });
  });
});

const member = (id: string, name = id): FlowMember => ({ id, name, look: { ...DEFAULT_LOOK }, account: null, connected: true, ready: false, watch: null });

/** Drive a MatchFlow at the server's tick rate until it finishes. */
function playFlow(flow: MatchFlow, members: FlowMember[], start = 1000) {
  let now = start;
  const records = [];
  const phases: string[] = [];
  const snapshots: MatchStateMsg[] = [];
  for (let i = 0; i < 400_000; i++) {
    now += 1000 / 30;
    const r = flow.tick(now, members);
    records.push(...r.records);
    for (const s of r.snapshots) if (s.to === members[0].id) snapshots.push(s.msg);
    if (phases[phases.length - 1] !== flow.phase) phases.push(flow.phase);
    if (r.done) return { records, phases, snapshots, now };
  }
  throw new Error('flow never finished');
}

describe('lobby tournaments on the server', () => {
  it('runs a whole Blitz tournament with bots to the final table and the leaderboard', () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'tournament', format: 'blitz', cap: 4, botFill: true };
    const members = [member('p1', 'Ticker'), member('p2', 'Bobbin')];
    const flow = new MatchFlow(settings, members, 2026, 0, 1, 25);
    const games = flow.tournament!.games;
    expect(games).toHaveLength(3);
    expect(games).not.toContain('toy-squad');
    const { records, phases, snapshots } = playFlow(flow, members);
    expect(phases.filter((p) => p === 'countdown')).toHaveLength(3);
    expect(phases.slice(-1)).toEqual(['final']);
    // Standings: every trial scored for every toy in the field.
    for (const s of flow.tournament!.standings) expect(s.rounds).toHaveLength(3);
    // Only humans reach the leaderboard, with the format and the final table's places.
    expect(records.map((r) => r.name).sort()).toEqual(['Bobbin', 'Ticker']);
    expect(records.every((r) => r.board === 'blitz' && r.of === 4 && r.place >= 1)).toBe(true);
    // Each trial starts with a keyframe for the player, then patches.
    expect(snapshots.filter((m) => m.k === 1).length).toBe(3);
    expect(snapshots.some((m) => m.k === 0)).toBe(true);
  });

  it("a seated player viewing another seat's board gets that board's battle in their own snapshots", () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'single', game: 'toy-squad', cap: 3, botFill: true };
    const members = [member('p1'), member('p2')];
    const flow = new MatchFlow(settings, members, 8, 0, 1, 20);
    let now = 0;
    const owners = () => {
      const r = flow.tick((now += 33), members);
      const key = r.snapshots.find((s) => s.to === 'p1' && s.msg.k === 1);
      return key ? ((key.msg.d as { battles: { owner: string }[] }).battles.map((b) => b.owner).sort()) : null;
    };
    while (!(flow.phase === 'playing' && (flow as unknown as { run: { state: { phase: string } } }).run.state.phase === 'battle')) flow.tick((now += 33), members);
    members[0].watch = 'p2'; flow.resync('p1');
    let seen = owners(); for (let i = 0; i < 4 && !seen; i++) seen = owners();
    expect(seen).toEqual(['p1', 'p2']);
    // Back to their own board: only their own battle again.
    members[0].watch = 'p1'; flow.resync('p1');
    seen = owners(); for (let i = 0; i < 4 && !seen; i++) seen = owners();
    expect(seen).toEqual(['p1']);
  });

  it('bots never share a name with a human in the field', () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'tournament', format: 'blitz', cap: 8, botFill: true };
    for (let seed = 0; seed < 40; seed++) {
      const members = [member('p1', 'Ticker'), member('p2', 'Bobbin'), member('p3', 'pip')];
      const names = new MatchFlow(settings, members, seed, 0, 1).info(0).seats.map((s) => s.name.toLowerCase());
      expect(new Set(names).size, `seed ${seed}: ${names}`).toBe(names.length);
    }
  });

  it('a single trial records each human finish under that trial', () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'single', game: 'red-light-green-light', cap: 3, botFill: true };
    const members = [member('p1')];
    const flow = new MatchFlow(settings, members, 5, 0, 1, 20);
    const { records } = playFlow(flow, members);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'p1', board: 'red-light-green-light', of: 3 });
  });

  it('everyone pressing Continue skips the results timer', () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'single', game: 'wind-up-dash', cap: 2, botFill: true };
    const members = [member('p1')];
    const flow = new MatchFlow(settings, members, 6, 0, 1, 20);
    let now = 0;
    while (flow.phase !== 'results') flow.tick((now += 33), members);
    members[0].ready = true;
    expect(flow.tick((now += 33), members).done).toBe(true);
    expect(PHASE_MS.results).toBeGreaterThan(1000);
  });

  it('a player who leaves mid-tournament forfeits, and is left off the leaderboard', () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'tournament', format: 'blitz', cap: 3, botFill: true };
    const members = [member('p1'), member('p2')];
    const flow = new MatchFlow(settings, members, 77, 0, 1, 25);
    let now = 0;
    while (flow.phase !== 'playing') flow.tick((now += 33), members);
    flow.forfeit('p2');
    members.splice(1, 1);
    while (flow.phase !== 'results') flow.tick((now += 33), members);
    const info = flow.info(now);
    expect(info.result!.placements.find((p) => p.contestantId === 'p2')).toMatchObject({ forfeit: true, place: 3 });
    expect(info.forfeits).toEqual(['p2']);
    const { records } = playFlow(flow, members, now);
    expect(records.map((r) => r.name)).toEqual(['p1']);
  });

  it('fills a trial below its minimum with bots, even with bot fill off', () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'single', game: 'copycat-conductor', cap: 2, botFill: false };
    expect(startProblem(settings, 1)).toBeNull(); // Copycat works solo
    expect(startProblem({ ...settings, game: 'jack-in-the-box' }, 1)).toBe('need_players');
    const members = [member('p1'), member('p2')];
    const flow = new MatchFlow({ ...settings, game: 'jack-in-the-box' }, members, 3, 0, 1, 20);
    flow.forfeit('p2');
    members.splice(1, 1);
    let now = 0;
    while (flow.phase !== 'countdown') flow.tick((now += 33), members);
    expect(flow.info(now).seats.length).toBe(2);
    expect(flow.info(now).seats.filter((s) => s.bot)).toHaveLength(1);
  });
});

describe('tournament format pool (owner decision: Toy Squad only in Normal and Treasure)', () => {
  it('Blitz never draws Toy Squad; Normal and Treasure can', () => {
    for (const games of [MINIGAMES, onlineGames()]) {
      expect(poolForFormat('blitz', games).map((g) => g.id)).not.toContain('toy-squad');
      expect(poolForFormat('normal', games).map((g) => g.id)).toContain('toy-squad');
      expect(poolForFormat('treasure', games).map((g) => g.id)).toContain('toy-squad');
    }
  });

  it('respects the field size', () => {
    const solo = poolForFormat('normal', MINIGAMES, 1).map((g) => g.id);
    expect(solo).not.toContain('jack-in-the-box');
    expect(solo).toContain('copycat-conductor');
  });

  it("the server's game facts agree with the client registry", () => {
    for (const g of MINIGAMES) {
      const f = GAME_FACTS[g.id];
      if (!f) continue; // a newer trial that isn't online yet
      expect(f.category, g.id).toBe(g.category);
      expect(f.players, g.id).toEqual(g.players);
      expect(f.durationSec, g.id).toEqual(g.durationSec);
      expect(f.eligibility.tournament, g.id).toBe(g.eligibility.tournament);
      expect(f.eligibility.formats ?? null, g.id).toEqual(g.eligibility.formats ?? null);
      expect(!!f.skipStartCountdown, g.id).toBe(!!g.skipStartCountdown);
    }
    expect([...SERVER_GAMES.keys()].sort()).toEqual(onlineGames().map((g) => g.id).sort());
    // Every trial that exists today runs online.
    expect(onlineGames().map((g) => g.id).sort()).toEqual([...MINIGAME_IDS].sort());
    expect(FORMAT_IDS).toEqual(['blitz', 'normal', 'treasure']);
  });
});
