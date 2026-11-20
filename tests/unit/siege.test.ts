import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';
import { seededRng, subSeed } from '../../src/minigames/rng';
import {
  ARENA_HALF, BOILER, BOSS_AT, DEFAULT_CONFIG, ELITE_SCHEDULE, FINALE, FLAME, HASH, MAX_LEVEL, PASSIVE_IDS, WEAPONS, WEAPON_IDS, boardCounts, evolutionHint, evolutionReady, laserHits, len, levelOptions,
  ranking, reviveCost, sendBlock, siegeRules, spawnBig, spawnMob, spawnRate, standings, steerTowards, treasureOptions, viewedPlayer, xpToNext,
  type SiegeConfig, type SiegeInput, type SiegePlayer, type SiegeState,
} from '../../src/minigames/siege/rules';
import { createSiegeBot, rateOption } from '../../src/minigames/siege/bot';
import { CUE_GAP, CueLimiter, MAX_VOICES, WEAPON_GAIN } from '../../src/minigames/siege/sounds';

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
  while (!siegeRules.isOver(s) && steps < 30000) {
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

  it('never loses the boss (or a scheduled elite) to a full elite pool', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    immortal(me);
    // Two sent elites already on the board, then the scheduled ones pile up.
    me.incoming.push({ from: 'b1', at: 0 }, { from: 'b1', at: 0 });
    run(s, 2 * STEP);
    s.runT = 185000;
    run(s, 2 * STEP);
    const live = () => me.board.bigs.filter((g) => g.on);
    expect(live().length).toBe(s.config.bigCap - 1); // one slot kept back for the boss
    expect(me.board.nextElite).toBeLessThan(ELITE_SCHEDULE.length); // a later elite waits its turn
    s.runT = BOSS_AT;
    run(s, 2 * STEP);
    expect(live().some((g) => g.type === 'baron')).toBe(true);
    expect(me.board.bossUp).toBe(true);
    // Once the boss is beaten, the queued elite arrives.
    const queued = me.board.nextElite;
    const baron = live().find((g) => g.type === 'baron')!;
    baron.on = false; me.board.bossDown = true;
    run(s, 2 * STEP);
    expect(me.board.nextElite).toBe(queued + 1);
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

  it('a ghost stays on its own board until its player chooses to watch the others', () => {
    const s = started(['you', 'b1', 'b2', 'b3']);
    const me = P(s, 'you'), b1 = P(s, 'b1'), b2 = P(s, 'b2'), b3 = P(s, 'b3');
    b2.points = 900; b1.points = 10; b3.points = 0; me.points = 0;
    knockOut(s, me);
    expect(me.status).toBe('ghost');
    expect(me.watching).toBeNull();
    expect(viewedPlayer(s, 'you')).toBe(me); // no automatic spectating
    run(s, 3000);
    expect(viewedPlayer(s, 'you')).toBe(me);
    // The popup's "Watch other players": the leader first.
    siegeRules.step(s, { you: [{ type: 'spectate', on: true }] }, STEP);
    expect(me.watching).toBe('b2');
    expect(viewedPlayer(s, 'you')).toBe(b2);
    siegeRules.step(s, { you: [{ type: 'watch', dir: 1 }] }, STEP);
    expect(me.watching).toBe('b3');
    siegeRules.step(s, { you: [{ type: 'watch', dir: -1 }] }, STEP);
    siegeRules.step(s, { you: [{ type: 'watch', dir: -1 }] }, STEP);
    expect(me.watching).toBe('b1');
    siegeRules.step(s, { you: [{ type: 'watch', dir: 1, id: 'b3' }] }, STEP);
    expect(me.watching).toBe('b3');
    // Back to your own board, and the keyboard path: the first Next press starts watching.
    siegeRules.step(s, { you: [{ type: 'spectate', on: false }] }, STEP);
    expect(me.watching).toBeNull();
    siegeRules.step(s, { you: [{ type: 'watch', dir: 1 }] }, STEP);
    expect(me.watching).toBe('b2');
    siegeRules.step(s, { you: [{ type: 'watch', dir: 1, id: 'b1' }] }, STEP);
    siegeRules.step(s, { you: [{ type: 'move', x: 1, y: 0 }] }, STEP);
    run(s, 2000);
    expect(me.gx).toBeGreaterThan(5);
    b3.points = 0; knockOut(s, b3);
    expect(b3.status).toBe('ghost');
    // Both ghosts can be on the same board; the renderer draws every ghost watching it.
    b3.watching = 'b1';
    expect(s.players.filter((p) => p.status === 'ghost' && p.watching === 'b1').map((p) => p.id).sort()).toEqual(['b3', 'you']);
    // A ghost does not move its old board and is never sent elites; toys still in cannot spectate.
    expect(sendBlock(s, b1, me)).toBe('out');
    siegeRules.step(s, { b1: [{ type: 'spectate', on: true }] }, STEP);
    expect(b1.watching).toBeNull();
  });
});

/** Slay the boss on `p`'s board (it arrives at 4:00 unless `at` says otherwise). */
function slayBoss(s: SiegeState, p: SiegePlayer) {
  if (s.runT < BOSS_AT) s.runT = BOSS_AT - STEP;
  for (let i = 0; i < 10 && !p.board.bigs.some((g) => g.on && g.type === 'baron'); i++) siegeRules.step(s, {}, STEP);
  const boss = p.board.bigs.find((g) => g.on && g.type === 'baron')!;
  expect(boss).toBeTruthy();
  boss.hp = 1; boss.x = p.x + 3; boss.z = p.z; boss.mode = 0;
  for (let i = 0; i < 600 && p.status === 'alive'; i++) siegeRules.step(s, p.choice ? { [p.id]: [{ type: 'choose', index: 0 }] } : {}, STEP);
  siegeRules.drainEvents(s);
}
/** Take every card on offer (first option) until the toy has none left. */
function takeCards(s: SiegeState, p: SiegePlayer) {
  for (let i = 0; i < 200 && (p.choice || p.pendingLevels || p.pendingChests); i++) siegeRules.step(s, p.choice ? { [p.id]: [{ type: 'choose', index: 0 }] } : {}, STEP);
}

describe('Toybox Siege: the finale', () => {
  it('slaying the boss drops three chests, pulls every gem and chest to the toy and clears the board', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    immortal(me); immortal(P(s, 'b1'));
    s.runT = BOSS_AT - 5000;
    run(s, 4000);
    // Gems scattered over the board, far from the toy.
    me.board.gems.slice(0, 20).forEach((g, i) => Object.assign(g, { on: true, kind: 0, v: 3, x: -40 + i * 4, z: 40, pull: false }));
    slayBoss(s, me);
    expect(me.status).toBe('prep');
    expect(me.victoryAt).toBeGreaterThanOrEqual(BOSS_AT);
    expect(me.prepUntil).toBe(me.victoryAt + s.config.prepMs);
    const c = boardCounts(me.board);
    expect(c.mobs).toBe(0); expect(c.bigs).toBe(0); expect(c.shots).toBe(0);
    expect(c.chests + me.pendingChests).toBe(FINALE.bossChests);
    expect(me.board.gems.filter((g) => g.on).every((g) => g.pull)).toBe(true);
    // The magnet: everything reaches the toy well inside the prep window (cards open as it does).
    const xp = me.level * 1000 + me.xp;
    for (let i = 0; i < 300; i++) siegeRules.step(s, me.choice ? { you: [{ type: 'choose', index: 0 }] } : {}, STEP);
    expect(boardCounts(me.board).gems).toBe(0);
    expect(boardCounts(me.board).chests).toBe(0);
    expect(me.level * 1000 + me.xp).toBeGreaterThan(xp);
    // Nothing on the board hurts any more, and the boss's chests never offer "send an elite".
    expect(me.board.bigs.some((g) => g.on)).toBe(false);
    me.pendingChests = 1; me.pendingLevels = 0;
    if (me.choice) me.choice = null;
    siegeRules.step(s, {}, STEP);
    expect(me.choice?.kind).toBe('treasure');
    expect(me.choice!.options.some((o) => o.kind === 'send')).toBe(false);
  });

  it('a boss chest evolves a ready weapon', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    immortal(me); immortal(P(s, 'b1'));
    me.weapons[0].level = MAX_LEVEL; // Bayonet Sweep
    me.passives.push({ id: 'plating', level: 1 });
    slayBoss(s, me);
    let evolved = false;
    for (let i = 0; i < 400 && !evolved; i++) {
      const o = me.choice?.options[0];
      siegeRules.step(s, me.choice ? { you: [{ type: 'choose', index: 0 }] } : {}, STEP);
      if (o?.kind === 'evolve') evolved = true;
    }
    expect(evolved).toBe(true);
    expect(me.weapons[0].evolved).toBe(true);
  });

  it('cards still open when the prep window ends are settled with their first option', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    immortal(me); immortal(P(s, 'b1'));
    slayBoss(s, me);
    me.pendingLevels += 3;
    run(s, 2000);
    expect(me.choice).not.toBeNull();
    run(s, s.config.prepMs);
    expect(me.choice).toBeNull();
    expect(me.pendingLevels).toBe(0);
    expect(me.pendingChests).toBe(0);
  });

  it('at 5:00 toys still fighting are pulled out too (no chests); the arena waits for every prep, and opens 15 s after 5:00 at the latest', () => {
    const s = started(['you', 'b1', 'b2', 'b3']);
    const [me, b1, b2, b3] = ['you', 'b1', 'b2', 'b3'].map((id) => P(s, id));
    for (const p of s.players) immortal(p);
    slayBoss(s, me); // the boss falls at about 4:00
    takeCards(s, me);
    run(s, s.config.prepMs + 1000);
    expect(me.status).toBe('prep'); // ready, but rivals are still fighting
    expect(s.phase).toBe('run');
    // b3 is down and undecided when the arena opens: it misses the arena.
    s.runT = s.config.durationMs - STEP;
    siegeRules.step(s, b1.choice ? { b1: [{ type: 'choose', index: 0 }] } : {}, STEP);
    expect(b1.status).toBe('prep');
    expect(b2.status).toBe('prep');
    expect(boardCounts(b1.board).chests + b1.pendingChests).toBe(0);
    expect(b1.victoryAt).toBe(-1);
    b3.status = 'downed'; b3.downedAt = s.runT; b3.hp = 0;
    run(s, s.config.prepMs - 2000);
    expect(s.phase).toBe('run');
    run(s, 2100);
    expect(s.phase).toBe('arena');
    expect(s.runT).toBeLessThanOrEqual(s.config.durationMs + s.config.prepMs + STEP);
    expect([me, b1, b2].map((p) => p.status)).toEqual(['arena', 'arena', 'arena']);
    expect(b3.status).toBe('ghost');
    expect(b3.inArena).toBe(false);
    // Everyone starts at full health on a ring, with no cards left over.
    for (const p of [me, b1, b2]) { expect(p.hp).toBe(p.stat.maxHp); expect(p.choice).toBeNull(); expect(len(p.x, p.z)).toBeCloseTo(FINALE.startRadius, 3); }
  });

  it('opens the arena early once every toy still in has finished its prep', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you'), b1 = P(s, 'b1');
    immortal(me); immortal(b1);
    slayBoss(s, me);
    slayBoss(s, b1);
    run(s, s.config.prepMs + 500);
    expect(s.phase).toBe('arena');
    expect(s.runT).toBeLessThan(s.config.durationMs);
  });

  it('with fewer than two toys left there is no arena: the match ends after the prep window', () => {
    const s = started(['you']);
    immortal(P(s, 'you'));
    P(s, 'you').board.bigs.forEach((g) => { g.dmg = 0; });
    s.runT = DEFAULT_CONFIG.durationMs - 1000;
    run(s, 1100);
    expect(P(s, 'you').status).toBe('prep');
    expect(siegeRules.isOver(s)).toBe(false);
    run(s, s.config.prepMs + 100);
    expect(siegeRules.isOver(s)).toBe(true);
    expect(s.arena).toBeNull();
    // ... and as soon as nobody is left in at all.
    const t = started(['you', 'b1']);
    P(t, 'you').points = 0; P(t, 'b1').points = 0;
    for (const p of t.players) { p.hp = 0.5; spawnMob(t, p, 0, p.x + 0.5, p.z); }
    siegeRules.step(t, {}, STEP);
    expect(siegeRules.isOver(t)).toBe(true);
  });

  /** Two toys straight into the arena. */
  function arena(ids = ['you', 'b1'], seed = 7) {
    const s = started(ids, seed);
    for (const p of s.players) immortal(p);
    s.runT = DEFAULT_CONFIG.durationMs - STEP;
    siegeRules.step(s, {}, STEP);
    for (const p of s.players) takeCards(s, p);
    s.runT = DEFAULT_CONFIG.durationMs + DEFAULT_CONFIG.prepMs;
    siegeRules.step(s, {}, STEP);
    siegeRules.drainEvents(s);
    expect(s.phase).toBe('arena');
    return s;
  }

  it('in the arena weapons hurt rival toys, not the shooter, and a duel of starting toys is not instant', () => {
    const s = arena(['you', 'b1', 'b2']);
    const [me, b1, b2] = ['you', 'b1', 'b2'].map((id) => P(s, id));
    me.weapons = [{ id: 'popgun', level: 3, evolved: false, cd: 0, aux: 0 }];
    b1.weapons = []; b2.weapons = [];
    b1.x = me.x + 8; b1.z = me.z; b2.x = -15; b2.z = 15;
    const before = b1.hp, mine = me.hp;
    run(s, 2000);
    expect(b1.hp).toBeLessThan(before);
    expect(me.hp).toBe(mine);
    // Two fresh level-1 toys standing still, face to face: the duel takes a while.
    const t = arena(['you', 'b1']);
    const [x, y] = [P(t, 'you'), P(t, 'b1')];
    x.x = -3; x.z = 0; y.x = 3; y.z = 0;
    let ms = 0;
    while (t.phase === 'arena' && ms < 120000) { siegeRules.step(t, {}, STEP); ms += STEP; }
    expect(ms).toBeGreaterThan(15000);
    expect(t.phase).toBe('over'); // overtime makes sure it ends
  });

  it('a knockout is credited, ends the arena for that toy (it can watch), and placement follows arena survival', () => {
    const s = arena(['you', 'b1', 'b2', 'b3']);
    const [me, b1, b2, b3] = ['you', 'b1', 'b2', 'b3'].map((id) => P(s, id));
    for (const p of s.players) p.weapons = [];
    me.weapons = [{ id: 'popgun', level: 5, evolved: true, cd: 0, aux: 0 }];
    // b3 slew the boss and has far more points, but falls first; then b2, then b1.
    b3.victoryAt = 250000; b3.points = 9999; b3.kills = 999;
    const ko = (p: SiegePlayer) => { p.hp = 0.01; p.x = me.x + 5; p.z = me.z; for (let i = 0; i < 300 && p.status === 'arena'; i++) siegeRules.step(s, {}, STEP); };
    for (const p of [b1, b2, b3]) { p.x = 20; p.z = -20; }
    const pts = me.points;
    ko(b3);
    expect(b3.status).toBe('ghost');
    expect(b3.inArena).toBe(true);
    expect(b3.arenaOutAt).toBeGreaterThan(0);
    expect(me.arenaKOs).toBe(1);
    expect(me.points).toBe(pts + FINALE.koPoints);
    expect(viewedPlayer(s, 'b3')).toBe(b3); // stays on its spot until it chooses to watch
    siegeRules.step(s, { b3: [{ type: 'spectate', on: true }] }, STEP);
    expect(['you', 'b1', 'b2']).toContain(b3.watching);
    ko(b2);
    ko(b1);
    expect(s.phase).toBe('over');
    expect(me.points).toBe(pts + 3 * FINALE.koPoints + FINALE.championPoints);
    expect(ranking(s).map((p) => p.id)).toEqual(['you', 'b1', 'b2', 'b3']);
    expect(siegeRules.result(s).placements[0]).toMatchObject({ contestantId: 'you', place: 1, eliminated: false });
  });

  it('the Rally Horn summons a Boiler Baron that fights for its owner: one at a time, then a cooldown', () => {
    const s = arena(['you', 'b1']);
    const me = P(s, 'you'), b1 = P(s, 'b1');
    me.weapons = []; b1.weapons = [];
    me.horn = { level: 2, readyAt: FINALE.ally.firstReadyMs };
    siegeRules.step(s, { you: [{ type: 'skill' }] }, STEP);
    expect(s.arena!.bigs.some((g) => g.on)).toBe(false); // not ready yet
    run(s, FINALE.ally.firstReadyMs);
    siegeRules.step(s, { you: [{ type: 'skill' }], b1: [{ type: 'skill' }] }, STEP); // b1 has no horn
    const allies = s.arena!.bigs.filter((g) => g.on);
    expect(allies.length).toBe(1);
    expect(allies[0]).toMatchObject({ type: 'baron', from: 'you', hp: FINALE.ally.hp[1] });
    siegeRules.step(s, { you: [{ type: 'skill' }] }, STEP);
    expect(s.arena!.bigs.filter((g) => g.on).length).toBe(1); // one at a time
    expect(me.horn.readyAt).toBeGreaterThan(s.arenaT);
    // It goes for the rival and hurts only the rival.
    b1.stat.maxHp = b1.hp = 2000; // so the duel outlasts the test
    const mine = me.hp, theirs = b1.hp;
    me.x = -18; me.z = -18; b1.x = 10; b1.z = 10;
    run(s, 8000);
    expect(me.hp).toBe(mine);
    expect(b1.hp).toBeLessThan(theirs);
    // The rival's weapons can bring it down.
    b1.weapons = [{ id: 'popgun', level: 5, evolved: true, cd: 0, aux: 0 }];
    for (const g of s.arena!.bigs) if (g.on) { g.hp = 0.5; g.x = b1.x + 4; g.z = b1.z; }
    run(s, 1500);
    expect(s.arena!.bigs.some((g) => g.on)).toBe(false);
  });

  it('keeps the arena state plain JSON', () => {
    const s = arena(['you', 'b1', 'b2']);
    P(s, 'you').horn = { level: 1, readyAt: 0 };
    siegeRules.step(s, { you: [{ type: 'skill' }] }, STEP);
    run(s, 3000);
    const copy = JSON.parse(JSON.stringify(s)) as SiegeState;
    expect(copy).toEqual(s);
    run(s, 3000); run(copy, 3000);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(s));
  });
});

describe('Toybox Siege: card badges', () => {
  it('marks the cards that make, pair or need a secret upgrade (evolution)', () => {
    const s = started(['you']);
    const me = P(s, 'you'); // Tin Soldier: Bayonet Sweep, partner Tin Plating
    me.weapons[0].level = 3;
    // A new partner passive for a weapon you hold: a pair, two levels to go.
    expect(evolutionHint(me, { kind: 'passive', id: 'plating', level: 1 })).toEqual({ kind: 'pair', weapon: 'sweep', levelsLeft: 2 });
    expect(evolutionHint(me, { kind: 'passive', id: 'crayon', level: 1 })).toBeNull();
    expect(evolutionHint(me, { kind: 'weapon', id: 'sweep', level: 4 })).toBeNull();
    me.weapons[0].level = 4;
    expect(evolutionHint(me, { kind: 'weapon', id: 'sweep', level: 5 })).toEqual({ kind: 'needs', weapon: 'sweep' });
    me.passives.push({ id: 'plating', level: 1 });
    expect(evolutionHint(me, { kind: 'weapon', id: 'sweep', level: 5 })).toEqual({ kind: 'ready', weapon: 'sweep' });
    expect(evolutionHint(me, { kind: 'passive', id: 'plating', level: 2 })).toBeNull(); // already paired
    // A new weapon whose partner you already have.
    me.passives.push({ id: 'gears', level: 2 });
    expect(evolutionHint(me, { kind: 'weapon', id: 'popgun', level: 1 })).toEqual({ kind: 'pair', weapon: 'popgun', levelsLeft: 4 });
    // The partner of a maxed weapon completes the pair.
    me.weapons.push({ id: 'marbles', level: 5, evolved: false, cd: 0, aux: 0 });
    expect(evolutionHint(me, { kind: 'passive', id: 'crayon', level: 1 })).toEqual({ kind: 'ready', weapon: 'marbles' });
    expect(evolutionHint(me, { kind: 'evolve', id: 'marbles' })).toEqual({ kind: 'evolve', weapon: 'marbles' });
    me.weapons[0].evolved = true;
    expect(evolutionHint(me, { kind: 'weapon', id: 'sweep', level: 5 })).toBeNull();
  });
});

describe('Toybox Siege: placement', () => {
  it('orders arena toys by arena survival, then victory (earlier first), survival, knockouts and points; equal rows share a place', () => {
    const s = started(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    s.runT = 300000;
    const set = (id: string, v: Partial<SiegePlayer>) => Object.assign(P(s, id), v);
    set('a', { status: 'ghost', outAt: 100000, kills: 900, points: 9000 });
    set('b', { status: 'ghost', inArena: true, arenaOutAt: 20000, victoryAt: 290000, kills: 10, points: 10 });
    set('c', { status: 'ghost', inArena: true, arenaOutAt: 20000, victoryAt: 260000, kills: 5, points: 5 });
    set('d', { status: 'ghost', inArena: true, arenaOutAt: 9000, kills: 50, points: 50 });
    set('e', { status: 'arena', inArena: true, arenaOutAt: -1, kills: 80, points: 20 });
    set('f', { status: 'ghost', outAt: 200000, kills: 1, points: 1 });
    set('g', { status: 'ghost', outAt: 200000, kills: 1, points: 1 });
    set('h', { status: 'ghost', inArena: true, arenaOutAt: 9000, kills: 50, points: 50 });
    s.phase = 'over';
    expect(ranking(s).map((p) => p.id)).toEqual(['e', 'c', 'b', 'd', 'h', 'f', 'g', 'a']);
    const places = Object.fromEntries(siegeRules.result(s).placements.map((p) => [p.contestantId, p.place]));
    expect(places).toEqual({ e: 1, c: 2, b: 3, d: 4, h: 4, f: 6, g: 6, a: 8 });
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

  it('a Grand Carillon (four bursts every 1.15 s) and a Cork Gatling play one sound per volley at most, mixed below the event cues', () => {
    const l = new CueLimiter();
    let chimes = 0, pops = 0;
    // Ten seconds: an evolved chime rings 4 bursts (40 ms apart) every 1150 ms; corks fly every 230 ms.
    for (let t = 0; t < 10000; t += 10) {
      if (t % 1150 < 160 && (t % 1150) % 40 === 0 && l.allow('chime', t)) chimes++;
      if (t % 230 === 0 && l.allow('pop', t)) pops++;
    }
    expect(chimes).toBeLessThanOrEqual(Math.ceil(10000 / 1150));
    expect(pops).toBeLessThanOrEqual(Math.ceil(10000 / CUE_GAP.pop));
    for (const g of Object.values(WEAPON_GAIN)) expect(g).toBeLessThanOrEqual(0.5);
  });

  it('runs a full match of eight bots (the run, the prep and the arena) headless in reasonable CPU time', () => {
    const t0 = performance.now();
    const { s, events, steps } = botMatch(8, 2026, 'normal');
    const ms = performance.now() - t0;
    console.log(`[siege] 8-bot headless match: ${steps} steps (${(s.t / 1000).toFixed(0)} s, arena ${(s.arenaT / 1000).toFixed(1)} s) in ${Math.round(ms)} ms CPU; ${s.players.filter((p) => p.victoryAt >= 0).length} boss kills, ${s.players.filter((p) => p.inArena).length} in the arena, ${events.filter((e) => e === 'siege-ally').length} summoned bosses, ${events.filter((e) => e === 'siege-sent').length} elites sent`);
    expect(siegeRules.isOver(s)).toBe(true);
    expect(s.runT).toBeLessThanOrEqual(DEFAULT_CONFIG.durationMs + DEFAULT_CONFIG.prepMs + STEP);
    expect(s.arenaT).toBeLessThanOrEqual(DEFAULT_CONFIG.arenaMs + STEP);
    // Bots reach the arena, fight it out with their builds and leave one toy standing.
    expect(events).toContain('siege-arena');
    expect(events).toContain('siege-ko');
    expect(s.players.filter((p) => p.status === 'arena').length).toBeLessThanOrEqual(1);
    expect(ranking(s)[0].inArena).toBe(true);
    expect(siegeRules.result(s).placements).toHaveLength(8);
    expect(events).toContain('siege-elite');
    expect(events).toContain('siege-boss');
    expect(events).toContain('siege-level');
    expect(Math.max(...s.players.map((p) => p.level))).toBeGreaterThan(15);
    expect(ms).toBeLessThan(90000);
  }, 180000);
});

// ---------------------------------------------------------------- the ranged upgrades (owner request, 20 Nov 2026)

describe('Toybox Siege: ranged upgrades and secret upgrades', () => {
  /** One toy on a quiet board: no swarm spawning, only what the test places. */
  function quiet(cls: 'warrior' | 'ranger' | 'mage' = 'ranger') {
    const s = siegeRules.init([person('you')], 5);
    siegeRules.step(s, { you: [{ type: 'class', cls }] }, STEP);
    siegeRules.drainEvents(s);
    const me = P(s, 'you');
    immortal(me);
    me.x = 0; me.z = 0; me.xpNext = 1e9;
    me.board.spawnAcc = -1e9; me.board.waveT = 1e12; // no swarm, no waves
    return { s, me };
  }
  /** A still mob with plenty of health at (x, z). */
  function dummy(s: SiegeState, p: SiegePlayer, x: number, z: number, hp = 1e4) {
    const m = spawnMob(s, p, 0, x, z)!;
    m.hp = m.maxHp = hp; m.speed = 0;
    return m;
  }
  /** Fire one cork by hand (the pop-gun's own aim is tested elsewhere). */
  function cork(p: SiegePlayer, x: number, z: number, vx: number, vz: number, pierce: number, homing = 0) {
    const q = p.board.projs.find((x) => !x.on)!;
    Object.assign(q, { on: true, kind: 0, x, z, vx, vz, r: 0.6, dmg: 1, pierce, life: 3000, ox: x, oz: z, range: 0, back: false, nh: 0, own: -1, homing, ti: -1, ts: 0 });
    return q;
  }

  it('the Pop-Gun gains piercing with its levels: a cork passes through exactly that many enemies', () => {
    expect(WEAPONS.popgun.levels.map((l) => l.pierce)).toEqual([0, 1, 1, 2, 3]);
    for (const pierce of [0, 1, 2, 3]) {
      const { s, me } = quiet();
      me.weapons = [];
      const line = [4, 7, 10, 13, 16, 19].map((x) => dummy(s, me, x, 0));
      cork(me, 1.5, 0, 42, 0, pierce);
      run(s, 800);
      expect(line.filter((m) => m.hp < m.maxHp).length).toBe(pierce + 1);
      expect(line.slice(0, pierce + 1).every((m) => m.hp === m.maxHp - 1)).toBe(true); // the nearest ones, once each
    }
  });

  it('homing corks curve gently: never more than the turn limit per step, and catch an enemy a straight cork misses', () => {
    expect(WEAPONS.popgun.levels.map((l) => l.homing)).toEqual([0, 0, 1.6, 1.6, 2.6]);
    // The turn itself is clamped and keeps the speed.
    const q = { x: 0, z: 0, vx: 0, vz: 30 };
    expect(steerTowards(q, 10, 0, 0.05)).toBeCloseTo(0.05);
    expect(Math.hypot(q.vx, q.vz)).toBeCloseTo(30);
    expect(steerTowards({ x: 0, z: 0, vx: 0, vz: 30 }, 0.01, 10, 0.05)).toBeCloseTo(0.001, 3); // nearly on course: turns only as far as needed
    for (const homing of [0, 2.6]) {
      const { s, me } = quiet();
      me.weapons = [];
      const m = dummy(s, me, 11, 2.2); // off the cork's straight line (it passes 2.2 cm away; contact needs 1.45)
      const c = cork(me, 1, 0, 42, 0, 0, homing);
      let heading = Math.atan2(c.vx, c.vz), maxTurn = 0;
      for (let t = 0; t < 600 && c.on; t += STEP) {
        siegeRules.step(s, {}, STEP);
        const h = Math.atan2(c.vx, c.vz);
        maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading))));
        heading = h;
      }
      if (homing) { expect(m.hp).toBeLessThan(m.maxHp); expect(maxTurn).toBeLessThanOrEqual(homing / 60 + 1e-9); expect(maxTurn).toBeGreaterThan(0); }
      else { expect(m.hp).toBe(m.maxHp); expect(maxTurn).toBe(0); }
    }
    // It only looks ahead: an enemy behind the cork is ignored.
    const { s, me } = quiet();
    me.weapons = [];
    dummy(s, me, -6, 1);
    const c = cork(me, 0, 0, 42, 0, 0, 2.6);
    siegeRules.step(s, {}, STEP);
    expect(c.vz).toBe(0);
  });

  it('Prism Ray (the evolved Pop-Gun) is a laser that hits every enemy in its line, and nothing beside or beyond it', () => {
    expect(laserHits({ x: 0, z: 0, r: 10, ang: Math.PI / 2, w: 1 }, 5, 1.5, 0.6)).toBe(true); // along +x, 1.5 off the line
    expect(laserHits({ x: 0, z: 0, r: 10, ang: Math.PI / 2, w: 1 }, 5, 1.7, 0.6)).toBe(false);
    expect(laserHits({ x: 0, z: 0, r: 10, ang: Math.PI / 2, w: 1 }, 11.8, 0, 0.6)).toBe(false); // past its end
    expect(laserHits({ x: 0, z: 0, r: 10, ang: Math.PI / 2, w: 1 }, -1.7, 0, 0.6)).toBe(false); // behind the toy
    const { s, me } = quiet();
    me.weapons = [{ id: 'popgun', level: 5, evolved: true, cd: 0, aux: 0 }];
    const st = WEAPONS.popgun.evolved;
    const inLine = [5, 9, 14, 20, 26, 32].map((x) => dummy(s, me, x, 0));
    const beside = dummy(s, me, 12, 4), beyond = dummy(s, me, st.range + 4, 0);
    siegeRules.step(s, {}, STEP);
    siegeRules.step(s, {}, STEP);
    expect(me.board.blasts.some((k) => k.on && k.kind === 4)).toBe(true);
    for (const m of inLine) expect(m.maxHp - m.hp).toBeCloseTo(st.dmg * me.stat.dmg);
    expect(beside.hp).toBe(beside.maxHp);
    expect(beyond.hp).toBe(beyond.maxHp);
    // One beam per cooldown.
    run(s, st.cd - 100);
    expect(inLine[0].maxHp - inLine[0].hp).toBeCloseTo(st.dmg * me.stat.dmg);
    run(s, 200);
    expect(inLine[0].maxHp - inLine[0].hp).toBeCloseTo(2 * st.dmg * me.stat.dmg);
    // Elites in the line take it too.
    const e = spawnBig(s, me, 'bear', false, null)!;
    e.x = 8; e.z = -0.5; e.speed = 0; e.dashT = 1e9;
    const hp = e.hp;
    run(s, st.cd + 50);
    expect(e.hp).toBeLessThan(hp);
  });

  it('Chime Meteors add a meteor every level; Firebell Meteors leave a pool of flame that burns over time, then goes out', () => {
    expect(WEAPONS.chime.levels.map((l) => l.count)).toEqual([1, 2, 3, 4, 5]);
    expect(WEAPONS.chime.evolved.count).toBe(6);
    const { s, me } = quiet('mage');
    me.weapons = [{ id: 'chime', level: 5, evolved: true, cd: 0, aux: 0 }];
    const m = dummy(s, me, 6, 0, 1e5);
    let t = 0;
    while (!me.board.fires.some((f) => f.on) && t < 2000) { siegeRules.step(s, {}, STEP); t += STEP; }
    const pool = me.board.fires.find((f) => f.on)!;
    expect(pool).toBeTruthy();
    expect(pool.r).toBeCloseTo(FLAME.radius * me.stat.area);
    expect(len(pool.x - m.x, pool.z - m.z)).toBeLessThan(1);
    me.weapons = []; // no more meteors: only the pools burn now
    const burning = me.board.fires.filter((f) => f.on).length, hp0 = m.hp;
    run(s, 1000); // two ticks per pool (every 400 ms after landing)
    const per = FLAME.dmg * me.stat.dmg;
    expect(hp0 - m.hp).toBeCloseTo(burning * 2 * per, 5);
    run(s, FLAME.lifeMs);
    expect(me.board.fires.some((f) => f.on)).toBe(false);
    const after = m.hp;
    run(s, 2000);
    expect(m.hp).toBe(after); // out: no more damage
    // The pools are pooled: a full pool replaces its oldest flame, never grows.
    const { s: t2, me: m2 } = quiet('mage');
    m2.weapons = [{ id: 'chime', level: 5, evolved: true, cd: 0, aux: 0 }];
    for (let i = 0; i < 12; i++) dummy(t2, m2, -10 + i * 2, 6, 1e6);
    m2.stat.cd = 0.05; // ring as fast as allowed
    run(t2, 4000);
    expect(m2.board.fires.length).toBe(DEFAULT_CONFIG.fireCap);
    expect(boardCounts(m2.board).fires).toBe(DEFAULT_CONFIG.fireCap);
  });

  it('the Rally Horn has a secret upgrade at level 3: the Boiler Heart fires a ring of rivets all around, like the boss', () => {
    const { s, me } = quiet('warrior');
    me.weapons = [];
    expect(evolutionHint(me, { kind: 'horn', level: 2 })).toEqual({ kind: 'pair', weapon: 'horn', levelsLeft: 1 });
    expect(evolutionHint(me, { kind: 'horn', level: 3 })).toEqual({ kind: 'ready', weapon: 'horn' });
    me.horn = { level: 2, readyAt: 0, evolved: false, cd: 0, aux: 0 };
    expect(evolutionReady(me)).toBeNull();
    me.horn.level = 3;
    expect(evolutionReady(me)).toBe('horn');
    // A weapon's evolution comes first; the horn waits for the next chest.
    me.weapons = [{ id: 'sweep', level: 5, evolved: false, cd: 1e9, aux: 0 }]; me.passives = [{ id: 'plating', level: 1 }];
    expect(evolutionReady(me)).toBe('sweep');
    me.weapons = []; me.passives = [];
    me.pendingChests = 1;
    siegeRules.step(s, {}, STEP);
    expect(me.choice?.options[0]).toEqual({ kind: 'evolve', id: 'horn' });
    siegeRules.step(s, { you: [{ type: 'choose', index: 0 }] }, STEP);
    expect(me.horn.evolved).toBe(true);
    expect(evolutionReady(me)).toBeNull();
    // Mobs all round the toy: one ring hits every one of them.
    const ring = Array.from({ length: BOILER.count }, (_, k) => { const a = (k / BOILER.count) * Math.PI * 2; return dummy(s, me, Math.sin(a) * 6, Math.cos(a) * 6); });
    me.horn.cd = 0; me.horn.aux = 0;
    siegeRules.step(s, {}, STEP);
    const rivets = me.board.projs.filter((q) => q.on && q.kind === 2);
    expect(rivets.length).toBe(BOILER.count);
    const angles = rivets.map((q) => Math.atan2(q.vx, q.vz)).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++) expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / BOILER.count, 5); // evenly spaced
    run(s, 600);
    expect(ring.every((m) => m.hp < m.maxHp)).toBe(true);
    // The next ring is turned half a gap, and comes BOILER.cd later.
    expect(me.horn.aux).toBeCloseTo(Math.PI / BOILER.count);
    run(s, BOILER.cd);
    expect(me.horn.aux).toBeCloseTo((2 * Math.PI) / BOILER.count); // a second ring, turned again
  });

  it('the Boiler Heart keeps the horn: it still sends elites, and in the arena its rings and the new weapons hurt rivals only', () => {
    const s = started(['you', 'b1']);
    const me = P(s, 'you');
    me.horn = { level: 3, readyAt: 0, evolved: true, cd: 1e9, aux: 0 };
    s.runT = 30000;
    siegeRules.step(s, { you: [{ type: 'skill' }] }, STEP);
    expect(P(s, 'b1').incoming.length).toBe(1);
    // The arena.
    const a = started(['you', 'b1'], 9);
    for (const p of a.players) immortal(p);
    a.runT = DEFAULT_CONFIG.durationMs - STEP;
    siegeRules.step(a, {}, STEP);
    for (const p of a.players) takeCards(a, p);
    a.runT = DEFAULT_CONFIG.durationMs + DEFAULT_CONFIG.prepMs;
    siegeRules.step(a, {}, STEP);
    expect(a.phase).toBe('arena');
    const [x, y] = [P(a, 'you'), P(a, 'b1')];
    for (const p of [x, y]) { p.stat.maxHp = p.hp = 5000; p.weapons = []; p.horn = null; }
    x.horn = { level: 3, readyAt: 1e9, evolved: true, cd: 0, aux: 0 };
    x.weapons = [{ id: 'popgun', level: 5, evolved: true, cd: 0, aux: 0 }, { id: 'chime', level: 5, evolved: true, cd: 0, aux: 0 }];
    x.x = 0; x.z = 0; y.x = 8; y.z = 0; x.ax = x.ay = y.ax = y.ay = 0;
    run(a, 3000);
    expect(y.hp).toBeLessThan(5000);
    expect(x.hp).toBe(5000);
    expect(a.arena!.fires.some((f) => f.on && f.own === 0)).toBe(true);
    expect(a.arena!.projs.some((q) => q.on && q.kind === 2)).toBe(true);
    const copy = JSON.parse(JSON.stringify(a)) as SiegeState;
    run(a, 2000); run(copy, 2000);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(a)); // still plain, deterministic JSON
  });

  it('bots raise the horn towards its secret upgrade and always take a secret upgrade from a chest', () => {
    const s = started(['you', 'b1']);
    const b = P(s, 'b1');
    b.horn = { level: 2, readyAt: 0, evolved: false, cd: 0, aux: 0 };
    expect(rateOption(b, { kind: 'horn', level: 3 }, 'normal')).toBeGreaterThan(rateOption(b, { kind: 'passive', id: 'magnet', level: 1 }, 'normal'));
    expect(rateOption(b, { kind: 'evolve', id: 'horn' }, 'normal')).toBe(100);
  });
});
