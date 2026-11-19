import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';
import { seededRng, subSeed } from '../../src/minigames/rng';
import {
  ARENA_HALF, BOSS_AT, DEFAULT_CONFIG, ELITE_SCHEDULE, HASH, MAX_LEVEL, PASSIVE_IDS, WEAPONS, WEAPON_IDS, boardCounts, evolutionReady, levelOptions,
  ranking, reviveCost, sendBlock, siegeRules, spawnMob, spawnRate, standings, treasureOptions, viewedPlayer, xpToNext,
  type SiegeConfig, type SiegeInput, type SiegePlayer, type SiegeState,
} from '../../src/minigames/siege/rules';
import { createSiegeBot } from '../../src/minigames/siege/bot';
import { CueLimiter, MAX_VOICES } from '../../src/minigames/siege/sounds';

const STEP = 1000 / 60;
const person = (id: string, bot?: BotDifficulty): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you', bot });

/** A match with everyone's class picked, so the run clock is ticking. */
function started(ids: string[], seed = 42, config: Partial<SiegeConfig> = {}): SiegeState {
  const s = siegeRules.init(ids.map((id) => person(id)), seed, config);
  const inputs: Record<string, SiegeInput[]> = {};
  ids.forEach((id, i) => { inputs[id] = [{ type: 'class', cls: (['warrior', 'ranger', 'mage'] as const)[i % 3] }]; });
  siegeRules.step(s, inputs, STEP);
  siegeRules.drainEvents(s);
  return s;
}
const P = (s: SiegeState, id: string) => s.players.find((p) => p.id === id)!;
function run(s: SiegeState, ms: number, inputs: Record<string, SiegeInput[]> = {}) {
  for (let t = 0; t < ms; t += STEP) { siegeRules.step(s, inputs, STEP); siegeRules.drainEvents(s); }
}
/** Keep a toy alive whatever happens (for schedule and cap tests). */
const immortal = (p: SiegePlayer) => { p.invuln = 1e12; };

/** The host loop, headless: bots decide, rules step, events drain. */
function botMatch(n: number, seed: number, skill: BotDifficulty = 'normal') {
  const people = Array.from({ length: n }, (_, i) => person(`b${i}`, skill));
  const s = siegeRules.init(people, seed);
  const bot = createSiegeBot();
  const rngs = new Map(people.map((p) => [p.id, seededRng(subSeed(seed, p.id))]));
  const events: string[] = [];
  let steps = 0;
  while (!siegeRules.isOver(s) && steps < 25000) {
    const inputs: Record<string, SiegeInput[]> = {};
    for (const c of people) { const out = bot.decide(s, c, STEP, rngs.get(c.id)!); if (out.length) inputs[c.id] = out; }
    siegeRules.step(s, inputs, STEP);
    for (const e of siegeRules.drainEvents(s)) events.push(e.type);
    steps++;
  }
  return { s, events, steps };
}

describe('Toybox Siege: setup and determinism', () => {
  it('waits, untimed, until every toy has picked a class', () => {
    const s = siegeRules.init([person('you'), person('b1')], 1);
    run(s, 60000);
    expect(s.phase).toBe('pick');
    expect(s.runT).toBe(0);
    siegeRules.step(s, { you: [{ type: 'class', cls: 'mage' }] }, STEP);
    expect(s.phase).toBe('pick');
    siegeRules.step(s, { b1: [{ type: 'class', cls: 'warrior' }] }, STEP);
    expect(s.phase).toBe('run');
    expect(P(s, 'you').weapons.map((w) => w.id)).toEqual(['chime']);
    expect(P(s, 'b1').weapons.map((w) => w.id)).toEqual(['sweep']);
    expect(P(s, 'b1').stat.armour).toBeGreaterThan(P(s, 'you').stat.armour);
  });

  it('replays exactly from the same seed, and differs with another', () => {
    const a = botMatch(4, 9, 'normal'), b = botMatch(4, 9, 'normal'), c = botMatch(4, 10, 'normal');
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
    expect(a.events).toEqual(b.events);
    expect(JSON.stringify(c.s)).not.toBe(JSON.stringify(a.s));
  }, 120000);

  it('keeps its state plain JSON (server-ready)', () => {
    const s = started(['you', 'b1']);
    run(s, 20000);
    const copy = JSON.parse(JSON.stringify(s)) as SiegeState;
    expect(copy).toEqual(s);
    // A copied state steps on identically.
    run(s, 3000); run(copy, 3000);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(s));
  });
});

describe('Toybox Siege: the swarm and the schedule', () => {
  it('spawns faster as the run goes on', () => {
    expect(spawnRate(0)).toBeLessThan(spawnRate(60000));
    expect(spawnRate(60000)).toBeLessThan(spawnRate(240000));
    const s = started(['you']);
    const me = P(s, 'you');
    immortal(me); me.weapons.length = 0; // nothing dies: count what arrives
    run(s, 20000);
    const early = boardCounts(me.board).mobs;
    for (const m of me.board.mobs) m.on = false;
    s.runT = 150000; me.board.waveT = 1e9;
    run(s, 20000);
    expect(boardCounts(me.board).mobs).toBeGreaterThan(early * 2);
  });

  it('sends an elite every minute (with a chest) and the boss at 4:00', () => {
    const s = started(['you']);
    const me = P(s, 'you');
    immortal(me);
    const seen: { type: string; at: number; elite?: unknown }[] = [];
    for (let t = 0; t < BOSS_AT + 2000; t += STEP) {
      siegeRules.step(s, {}, STEP);
      if (me.choice) siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP);
      for (const e of siegeRules.drainEvents(s)) if (e.type === 'siege-elite' || e.type === 'siege-boss') seen.push({ type: e.type, at: s.runT, elite: e.elite });
    }
    expect(seen.filter((e) => e.type === 'siege-elite').map((e) => e.elite)).toEqual(ELITE_SCHEDULE.map((e) => e.elite));
    seen.filter((e) => e.type === 'siege-elite').forEach((e, i) => expect(Math.abs(e.at - ELITE_SCHEDULE[i].at)).toBeLessThan(2500));
    const boss = seen.find((e) => e.type === 'siege-boss')!;
    expect(boss.at).toBeGreaterThanOrEqual(BOSS_AT);
    expect(boss.at).toBeLessThan(BOSS_AT + 2500);
  });

  it('a defeated elite drops a treasure chest; picking it up opens the treasure card', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    immortal(me); immortal(P(s, 'b1'));
    s.runT = 60000 - STEP;
    run(s, 2 * STEP);
    const elite = me.board.bigs.find((g) => g.on)!;
    expect(elite.type).toBe('bear');
    me.weapons = [{ id: 'popgun', level: 1, evolved: false, cd: 0, aux: 0 }];
    elite.hp = 1; elite.x = me.x + 14; elite.z = me.z; elite.mode = 0;
    for (let i = 0; i < 600 && elite.on; i++) { siegeRules.step(s, {}, STEP); if (me.choice) siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP); }
    expect(elite.on).toBe(false);
    const chest = me.board.chests.find((c) => c.on)!;
    expect(chest).toBeTruthy();
    me.x = chest.x; me.z = chest.z;
    siegeRules.step(s, {}, STEP);
    // The elite's gem may level you up first: level cards come before the treasure.
    for (let i = 0; i < 20 && me.choice?.kind === 'level'; i++) siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP);
    expect(me.choice?.kind).toBe('treasure');
  });
});

describe('Toybox Siege: levels, upgrades and evolutions', () => {
  it('needs more experience for every level', () => {
    for (let l = 1; l < 40; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(xpToNext(1)).toBe(5);
  });

  it('levels up from gems, opens a card and freezes the board until a choice is made', () => {
    const s = started(['you']);
    const me = P(s, 'you');
    const g = me.board.gems[0];
    g.on = true; g.kind = 0; g.v = xpToNext(1) + xpToNext(2); g.x = me.x; g.z = me.z;
    siegeRules.step(s, {}, STEP);
    expect(me.level).toBe(3);
    expect(me.pendingLevels).toBe(2);
    expect(me.choice?.kind).toBe('level');
    expect(me.choice!.options.length).toBeGreaterThanOrEqual(3);
    const frozen = me.board.bt;
    run(s, 1000);
    expect(me.board.bt).toBe(frozen); // the board waits
    expect(s.runT).toBeGreaterThan(1000); // the clock does not
    siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP);
    expect(me.pendingLevels).toBe(1);
    expect(me.choice?.kind).toBe('level'); // the next card follows
    siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP);
    expect(me.choice).toBeNull();
  });

  it('caps every weapon and passive at level 5 and never offers more', () => {
    const s = started(['you']);
    const me = P(s, 'you');
    for (let round = 0; round < 400; round++) {
      me.pendingLevels = 1;
      siegeRules.step(s, {}, STEP);
      if (!me.choice) continue;
      // Always take the first upgrade card (never the horn), to max things quickly.
      const i = Math.max(0, me.choice.options.findIndex((o) => o.kind === 'weapon' || o.kind === 'passive'));
      for (const o of me.choice.options) if (o.kind === 'weapon' || o.kind === 'passive') expect(o.level).toBeLessThanOrEqual(MAX_LEVEL);
      siegeRules.step(s, { you: [{ type: 'choose', index: i }] }, STEP);
      immortal(me);
    }
    expect(me.weapons.length).toBe(4);
    expect(me.passives.length).toBe(4);
    for (const w of me.weapons) expect(w.level).toBe(MAX_LEVEL);
    for (const p of me.passives) expect(p.level).toBe(MAX_LEVEL);
    const options = levelOptions(s, me);
    expect(options.filter((o) => o.kind === 'weapon' || o.kind === 'passive')).toEqual([]);
    expect(options[0].kind).toBe('heal'); // never an empty card
  });

  it('has six weapons and six passives, each weapon with a partner passive for its evolution', () => {
    expect(WEAPON_IDS.length).toBe(6);
    expect(PASSIVE_IDS.length).toBe(6);
    for (const id of WEAPON_IDS) {
      expect(WEAPONS[id].levels.length).toBe(MAX_LEVEL);
      expect(PASSIVE_IDS).toContain(WEAPONS[id].partner);
    }
    expect(new Set(WEAPON_IDS.map((id) => WEAPONS[id].partner)).size).toBe(6);
  });

  it('evolves a maxed weapon only with its partner passive and an elite chest', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    const weapon = me.weapons[0].id; // the Tin Soldier's Bayonet Sweep
    me.weapons[0].level = MAX_LEVEL;
    expect(evolutionReady(me)).toBeNull();
    expect(treasureOptions(s, me)[0].kind).toBe('heal'); // nothing left to raise
    me.weapons.push({ id: 'yoyo', level: 2, evolved: false, cd: 0, aux: 0 });
    expect(treasureOptions(s, me)[0]).toEqual({ kind: 'bundle', items: [{ kind: 'weapon', id: 'yoyo' }] });
    me.passives.push({ id: WEAPONS[weapon].partner, level: 1 });
    expect(evolutionReady(me)).toBe(weapon);
    me.pendingChests = 1;
    siegeRules.step(s, {}, STEP);
    expect(me.choice?.kind).toBe('treasure');
    expect(me.choice!.options[0]).toEqual({ kind: 'evolve', id: weapon });
    siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP);
    expect(me.weapons[0].evolved).toBe(true);
    expect(evolutionReady(me)).toBeNull();
    // A level-4 weapon is not enough.
    const t = started(['you', 'b1']);
    const other = P(t, 'you');
    other.weapons[0].level = MAX_LEVEL - 1;
    other.passives.push({ id: WEAPONS[other.weapons[0].id].partner, level: 5 });
    expect(evolutionReady(other)).toBeNull();
  });
});

describe('Toybox Siege: sending elites', () => {
  it('skipping a treasure sends a warned elite to the leader, which arrives on their board', () => {
    const s = started(['you', 'b1', 'b2']);
    const me = P(s, 'you'), b1 = P(s, 'b1'), b2 = P(s, 'b2');
    b1.points = 10; b2.points = 500;
    me.pendingChests = 1;
    siegeRules.step(s, {}, STEP);
    const send = me.choice!.options.findIndex((o) => o.kind === 'send');
    expect(send).toBe(1);
    siegeRules.step(s, { you: [{ type: 'choose', index: send }] }, STEP);
    expect(me.choice).toBeNull();
    expect(me.pendingChests).toBe(0);
    expect(b2.incoming).toEqual([{ from: 'you', at: expect.any(Number) }]); // the leader by default
    expect(b1.incoming).toEqual([]);
    expect(b2.board.bigs.some((g) => g.on)).toBe(false);
    run(s, s.config.sendWarnMs + 100);
    const sent = b2.board.bigs.find((g) => g.on)!;
    expect(sent.sent).toBe(true);
    expect(sent.from).toBe('you');
    expect(b2.incoming).toEqual([]);
  });

  it('can target a chosen rival, and rate-limits senders and receivers', () => {
    const s = started(['you', 'b1', 'b2', 'b3']);
    const me = P(s, 'you'), b1 = P(s, 'b1'), b2 = P(s, 'b2'), b3 = P(s, 'b3');
    me.horn = { level: 1, readyAt: 0 };
    siegeRules.step(s, { you: [{ type: 'skill', target: 'b1' }] }, STEP);
    expect(b1.incoming.length).toBe(1);
    // The sender waits out its cooldown, even with a ready chest.
    expect(sendBlock(s, me, b2)).toBe('cooldown');
    me.pendingChests = 1;
    siegeRules.step(s, {}, STEP);
    const send = me.choice!.options.findIndex((o) => o.kind === 'send');
    siegeRules.step(s, { you: [{ type: 'choose', index: send, target: 'b2' }] }, STEP);
    expect(me.choice?.kind).toBe('treasure'); // blocked: the card stays open
    expect(b2.incoming).toEqual([]);
    siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP);
    // The receiver is protected from everyone else for a while.
    b3.horn = { level: 1, readyAt: 0 };
    expect(sendBlock(s, b3, b1)).toBe('protected');
    siegeRules.step(s, { b3: [{ type: 'skill', target: 'b1' }] }, STEP);
    expect(b1.incoming.length).toBe(1);
    expect(b2.incoming.length + me.incoming.length).toBe(1); // b3 sent to someone else instead
    // ...and never holds more than maxSentAlive sent elites.
    s.runT += s.config.receiveCooldownMs + 1;
    b2.horn = { level: 1, readyAt: 0 };
    b1.incoming.push({ from: 'x', at: 1e12 });
    expect(sendBlock(s, b2, b1)).toBe('full');
  });

  it('never sends to a ghost or to yourself', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you'), b1 = P(s, 'b1');
    b1.status = 'ghost';
    expect(sendBlock(s, me, b1)).toBe('out');
    expect(sendBlock(s, me, me)).toBe('self');
    expect(standings(s, me)).toEqual([]);
  });
});

describe('Toybox Siege: down, revive once, ghosts', () => {
  const knockOut = (s: SiegeState, p: SiegePlayer) => { p.hp = 0.5; p.invuln = 0; spawnMob(s, p, 0, p.x + 0.5, p.z); siegeRules.step(s, {}, STEP); };

  it('a downed toy can pay to revive once; the second knockout makes it a ghost', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    s.runT = 100000;
    const cost = reviveCost(s.runT);
    expect(cost).toBe(200);
    me.points = cost + 30;
    knockOut(s, me);
    expect(me.status).toBe('downed');
    const frozen = me.board.bt;
    run(s, 500);
    expect(me.board.bt).toBe(frozen);
    siegeRules.step(s, { you: [{ type: 'revive' }] }, STEP);
    expect(me.status).toBe('alive');
    expect(me.revived).toBe(true);
    expect(me.points).toBeGreaterThanOrEqual(30); // (the shockwave may score a knockout)
    expect(me.points).toBeLessThan(cost);
    expect(me.hp).toBe(Math.round(me.stat.maxHp * 0.6));
    me.points = 99999;
    me.invuln = 0;
    knockOut(s, me);
    expect(me.status).toBe('ghost');
  });

  it('cannot revive without the points, and a missed revive window means a ghost', () => {
    const s = started(['you', 'b1', 'b2']);
    const me = P(s, 'you'), b1 = P(s, 'b1');
    me.points = 0;
    knockOut(s, me);
    expect(me.status).toBe('ghost');
    b1.points = 1000;
    knockOut(s, b1);
    expect(b1.status).toBe('downed');
    run(s, s.config.reviveWindowMs + 100);
    expect(b1.status).toBe('ghost');
  });

  it('ghosts watch the leader, cycle boards, drift around and see each other', () => {
    const s = started(['you', 'b1', 'b2', 'b3']);
    const me = P(s, 'you'), b1 = P(s, 'b1'), b2 = P(s, 'b2'), b3 = P(s, 'b3');
    b2.points = 900; b1.points = 10; b3.points = 0; me.points = 0;
    knockOut(s, me);
    expect(me.status).toBe('ghost');
    expect(me.watching).toBe('b2');
    expect(viewedPlayer(s, 'you')).toBe(b2);
    siegeRules.step(s, { you: [{ type: 'watch', dir: 1 }] }, STEP);
    expect(me.watching).toBe('b3');
    siegeRules.step(s, { you: [{ type: 'watch', dir: -1 }] }, STEP);
    siegeRules.step(s, { you: [{ type: 'watch', dir: -1 }] }, STEP);
    expect(me.watching).toBe('b1');
    siegeRules.step(s, { you: [{ type: 'watch', dir: 1, id: 'b3' }] }, STEP);
    expect(me.watching).toBe('b3');
    siegeRules.step(s, { you: [{ type: 'watch', dir: 1, id: 'b1' }] }, STEP);
    siegeRules.step(s, { you: [{ type: 'move', x: 1, y: 0 }] }, STEP);
    run(s, 2000);
    expect(me.gx).toBeGreaterThan(5);
    b3.points = 0; knockOut(s, b3);
    expect(b3.status).toBe('ghost');
    // Both ghosts can be on the same board; the renderer draws every ghost watching it.
    b3.watching = 'b1';
    expect(s.players.filter((p) => p.status === 'ghost' && p.watching === 'b1').map((p) => p.id).sort()).toEqual(['b3', 'you']);
    // A ghost does not move its old board and is never sent elites.
    expect(sendBlock(s, b1, me)).toBe('out');
  });
});

describe('Toybox Siege: victory and placement', () => {
  it('slaying the boss wins the run', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    immortal(me);
    s.runT = BOSS_AT - STEP;
    run(s, 2 * STEP);
    const boss = me.board.bigs.find((g) => g.on && g.type === 'baron')!;
    expect(boss).toBeTruthy();
    boss.hp = 1; boss.x = me.x + 3; boss.z = me.z;
    for (let i = 0; i < 600 && me.status === 'alive'; i++) siegeRules.step(s, me.choice ? { you: [{ type: 'choose', index: 0 }] } : {}, STEP);
    expect(me.status).toBe('victor');
    expect(me.victoryAt).toBeGreaterThanOrEqual(BOSS_AT);
    expect(siegeRules.result(s).placements[0]).toMatchObject({ contestantId: 'you', place: 1 });
  });

  it('orders by victory (earlier first), then survival, then knockouts, then points; equal rows share a place', () => {
    const s = started(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    s.runT = 300000;
    const set = (id: string, v: Partial<SiegePlayer>) => Object.assign(P(s, id), v);
    set('a', { status: 'ghost', outAt: 100000, kills: 900, points: 9000 });
    set('b', { status: 'victor', victoryAt: 290000, kills: 10, points: 10 });
    set('c', { status: 'victor', victoryAt: 260000, kills: 5, points: 5 });
    set('d', { status: 'alive', kills: 50, points: 50 });
    set('e', { status: 'alive', kills: 80, points: 20 });
    set('f', { status: 'ghost', outAt: 200000, kills: 1, points: 1 });
    set('g', { status: 'ghost', outAt: 200000, kills: 1, points: 1 });
    s.phase = 'over';
    expect(ranking(s).map((p) => p.id)).toEqual(['c', 'b', 'e', 'd', 'f', 'g', 'a']);
    const places = Object.fromEntries(siegeRules.result(s).placements.map((p) => [p.contestantId, p.place]));
    expect(places).toEqual({ c: 1, b: 2, e: 3, d: 4, f: 5, g: 5, a: 7 });
  });

  it('ends at 5:00, or as soon as nobody is left in', () => {
    const s = started(['you']);
    immortal(P(s, 'you'));
    P(s, 'you').board.bigs.forEach((g) => { g.dmg = 0; });
    s.runT = DEFAULT_CONFIG.durationMs - 1000;
    run(s, 1100);
    expect(siegeRules.isOver(s)).toBe(true);
    const t = started(['you', 'b1']);
    P(t, 'you').points = 0; P(t, 'b1').points = 0;
    for (const p of t.players) { p.hp = 0.5; spawnMob(t, p, 0, p.x + 0.5, p.z); }
    siegeRules.step(t, {}, STEP);
    expect(siegeRules.isOver(t)).toBe(true);
  });
});

describe('Toybox Siege: performance guards', () => {
  it('respects every per-board entity cap, including tighter ones from the config', () => {
    const s = started(['you'], 5, { mobCap: 40, gemCap: 30, projectileCap: 12, blastCap: 10, shotCap: 8 });
    const me = P(s, 'you');
    immortal(me);
    me.weapons = WEAPON_IDS.slice(0, 4).map((id) => ({ id, level: 5, evolved: true, cd: 0, aux: 0 }));
    let peak = { mobs: 0, gems: 0, projs: 0, blasts: 0, shots: 0 };
    for (let t = 0; t < 200000; t += STEP) {
      siegeRules.step(s, me.choice ? { you: [{ type: 'choose', index: 0 }] } : {}, STEP);
      siegeRules.drainEvents(s);
      const c = boardCounts(me.board);
      peak = { mobs: Math.max(peak.mobs, c.mobs), gems: Math.max(peak.gems, c.gems), projs: Math.max(peak.projs, c.projs), blasts: Math.max(peak.blasts, c.blasts), shots: Math.max(peak.shots, c.shots) };
    }
    expect(me.board.mobs.length).toBe(40);
    expect(peak.mobs).toBeLessThanOrEqual(40);
    expect(peak.gems).toBeLessThanOrEqual(30);
    expect(peak.projs).toBeLessThanOrEqual(12);
    expect(peak.blasts).toBeLessThanOrEqual(10);
    expect(peak.mobs).toBeGreaterThan(20); // the cap was actually reached for
    for (const m of me.board.mobs) if (m.on) { expect(Math.abs(m.x)).toBeLessThanOrEqual(ARENA_HALF); expect(Math.abs(m.z)).toBeLessThanOrEqual(ARENA_HALF); }
  }, 60000);

  it('the collision grid covers the whole board', () => {
    expect(HASH.GRID * HASH.CELL).toBeGreaterThanOrEqual(ARENA_HALF * 2);
  });

  it('limits busy sounds per window', () => {
    const l = new CueLimiter();
    let played = 0;
    for (let i = 0; i < 50; i++) if (l.allow(i % 2 ? 'kill' : 'sweep', i)) played++;
    expect(played).toBeLessThanOrEqual(2);
    let many = 0;
    for (let t = 1000; t < 1250; t += 1) for (const cue of ['kill', 'sweep', 'pop', 'chime', 'marble', 'plane'] as const) if (l.allow(cue, t)) many++;
    expect(many).toBeLessThanOrEqual(MAX_VOICES * 2);
  });

  it('runs a full five-minute match of eight bots headless in reasonable CPU time', () => {
    const t0 = performance.now();
    const { s, events, steps } = botMatch(8, 2026, 'normal');
    const ms = performance.now() - t0;
    console.log(`[siege] 8-bot 5:00 headless match: ${steps} steps in ${Math.round(ms)} ms CPU; ${s.players.filter((p) => p.status === 'victor').length} victories, ${s.players.filter((p) => p.status === 'ghost').length} ghosts, ${events.filter((e) => e === 'siege-sent').length} elites sent`);
    expect(siegeRules.isOver(s)).toBe(true);
    expect(s.runT).toBeLessThanOrEqual(DEFAULT_CONFIG.durationMs + STEP);
    expect(siegeRules.result(s).placements).toHaveLength(8);
    expect(events).toContain('siege-elite');
    expect(events).toContain('siege-boss');
    expect(events).toContain('siege-level');
    expect(Math.max(...s.players.map((p) => p.level))).toBeGreaterThan(15);
    expect(ms).toBeLessThan(90000);
  }, 180000);
});
