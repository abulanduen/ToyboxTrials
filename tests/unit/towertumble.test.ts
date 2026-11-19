import { describe, expect, it } from 'vitest';
import { seededRng, subSeed } from '../../src/minigames/rng';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';
import { BUILD_ORDER, BUILDABLE, GLIDE, PATH_CELLS, WALK, isBuildable } from '../../src/minigames/towertumble/board';
import {
  BOSSES, BUILD_COST, BUILDER, ENEMIES, LUCKY_CAP, MAX_TIER, QUESTS, START_GOLD, START_LIVES, TIER_POOLS, TOWERS, WAVES,
  bossBounty, sellValue, waveBonus, waveBounty, waveHp,
} from '../../src/minigames/towertumble/catalogue';
import { createTumbleBot } from '../../src/minigames/towertumble/bot';
import {
  allHumansOut, cycleWatch, questProgress, rollBuild, rollMerge, tumbleRules, viewedBoard, watchable,
  type TdInput, type TdPlayer, type TdState, type Tower,
} from '../../src/minigames/towertumble/rules';
import { eventCue } from '../../src/minigames/towertumble/sounds';

const STEP = 1000 / 60;
const who = (id: string, bot?: BotDifficulty): Contestant => ({ id, name: id, paint: {} as never, hat: 'none' as never, keySkin: 'classic' as never, isLocal: id === 'you', bot });
const field = (n: number) => [who('you'), ...Array.from({ length: n - 1 }, (_, i) => who(`bot-${i + 1}`, 'normal'))];
const step = (s: TdState, inputs: Record<string, TdInput[]> = {}, ms = STEP) => tumbleRules.step(s, inputs, ms);
const p = (s: TdState, id = 'you') => s.players.find((x) => x.id === id)!;
let nextTowerId = 10000;
/** Put a tower straight onto a board (test setup only). */
function put(s: TdState, pl: TdPlayer, def: string, cell: number): Tower {
  const t: Tower = { id: nextTowerId++, def, cell, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 };
  pl.towers.push(t); pl.auraDirty = true; pl.boardDirty = true; pl.maxTier = Math.max(pl.maxTier, TOWERS[def].tier);
  return t;
}
const tier = (def: string) => TOWERS[def].tier;
/** End the build phase now. */
const startWave = (s: TdState) => { s.phaseEnds = s.t; step(s); step(s); };
/** Play a whole match with bots on every seat; returns the state. */
function playBots(seed: number, skills: BotDifficulty[], limitMs = 40 * 60000) {
  const cs = skills.map((b, i) => who(`b${i}`, b));
  const s = tumbleRules.init(cs, seed), bot = createTumbleBot();
  const rngs = new Map(cs.map((c) => [c.id, seededRng(subSeed(seed, c.id))]));
  const events: string[] = [];
  while (!tumbleRules.isOver(s) && s.t < limitMs) {
    const inputs: Record<string, TdInput[]> = {};
    for (const c of cs) { const out = bot.decide(s, c, STEP, rngs.get(c.id)!); if (out.length) inputs[c.id] = out; }
    step(s, inputs);
    for (const e of tumbleRules.drainEvents(s)) events.push(e.type);
  }
  return { s, events };
}

describe('Toy Tower Tumble board', () => {
  it('is an 8×8 grid with one fixed winding path and 41 buildable squares', () => {
    expect(PATH_CELLS.length).toBe(23);
    expect(BUILDABLE.length).toBe(41);
    expect(new Set([...PATH_CELLS, ...BUILDABLE]).size).toBe(64);
    for (const c of PATH_CELLS) expect(isBuildable(c)).toBe(false);
    // Consecutive path squares touch (no diagonal jumps), and the walk is longer than the flight.
    for (let i = 1; i < PATH_CELLS.length; i++) {
      const a = PATH_CELLS[i - 1], b = PATH_CELLS[i];
      expect(Math.abs((a % 8) - (b % 8)) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8))).toBe(1);
    }
    expect(WALK.length).toBeCloseTo(24, 6);
    expect(GLIDE.length).toBeLessThan(WALK.length / 2);
    expect(new Set(BUILD_ORDER).size).toBe(41);
  });
});

describe('Toy Tower Tumble catalogue', () => {
  it('has 5 tier-1 families, several towers per tier, tier 7 at the top, and original names on Toy Squad models', () => {
    expect(TIER_POOLS.length).toBe(MAX_TIER);
    expect(new Set(TIER_POOLS[0].map((id) => TOWERS[id].family)).size).toBe(5);
    for (const pool of TIER_POOLS) expect(pool.length).toBeGreaterThanOrEqual(3);
    for (const [id, t] of Object.entries(TOWERS)) {
      expect(t.id).toBe(id);
      expect(TIER_POOLS[t.tier - 1]).toContain(id);
      expect(t.damage).toBeGreaterThan(0);
    }
    // Stronger every tier, for every family present in both.
    for (let k = 1; k < MAX_TIER; k++) for (const id of TIER_POOLS[k]) {
      const lower = TIER_POOLS[k - 1].find((o) => TOWERS[o].family === TOWERS[id].family);
      if (lower) expect(TOWERS[id].damage).toBeGreaterThan(TOWERS[lower].damage);
    }
  });

  it('wave health and gold curves rise, bosses sit on waves 5, 10, 15 and 20', () => {
    expect(WAVES.length).toBe(20);
    for (let w = 2; w <= 20; w++) {
      expect(waveHp(w)).toBeGreaterThan(waveHp(w - 1));
      expect(waveBonus(w)).toBeGreaterThan(waveBonus(w - 1));
      expect(waveBounty(w)).toBeGreaterThanOrEqual(waveBounty(w - 1));
    }
    expect(waveHp(1)).toBe(15);
    expect(waveHp(20) / waveHp(10)).toBeGreaterThan(10);
    expect(Object.keys(BOSSES).map(Number)).toEqual([5, 10, 15, 20]);
    for (const w of [5, 10, 15, 20]) expect(WAVES[w - 1].some((g) => g.kind === 'boss')).toBe(true);
    for (let w = 1; w <= 20; w++) if (!(w in BOSSES)) expect(WAVES[w - 1].some((g) => g.kind === 'boss')).toBe(false);
    expect(bossBounty(20)).toBeGreaterThan(bossBounty(5));
    // Armoured, fast, swarm and flying variants all appear.
    const kinds = new Set(WAVES.flat().map((g) => g.kind));
    for (const k of ['walker', 'beetle', 'racer', 'marble', 'glider', 'boss'] as const) expect(kinds.has(k)).toBe(true);
    expect(ENEMIES.glider.flying).toBe(true);
    expect(sellValue(3)).toBe(30);
  });
});

describe('Toy Tower Tumble rules', () => {
  it('is deterministic for a seed, and serialisable mid-match', () => {
    const run = (seed: number) => playBots(seed, ['normal', 'hard', 'easy'], 3 * 60000).s;
    const a = run(42), b = run(42), c = run(43);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    // A JSON round trip of the state steps on exactly like the original.
    const s1 = tumbleRules.init(field(2), 7);
    for (let i = 0; i < 200; i++) step(s1, { you: i === 3 ? [{ type: 'build' }, { type: 'build' }] : [] });
    startWave(s1);
    for (let i = 0; i < 400; i++) step(s1);
    const s2 = JSON.parse(JSON.stringify(s1)) as TdState;
    for (let i = 0; i < 600; i++) { step(s1); step(s2); }
    expect(JSON.stringify(s2)).toBe(JSON.stringify(s1));
  });

  it('builds a random tier-1 tower at builder level 1, for gold, only on a free felt square', () => {
    const s = tumbleRules.init(field(1), 1), me = p(s);
    expect(me.gold).toBe(START_GOLD); expect(me.lives).toBe(START_LIVES); expect(me.builder).toBe(1);
    step(s, { you: [{ type: 'build', cell: PATH_CELLS[0] }] });
    expect(me.towers.length).toBe(0);
    step(s, { you: [{ type: 'build', cell: BUILDABLE[0] }] });
    expect(me.towers.length).toBe(1);
    expect(me.towers[0].cell).toBe(BUILDABLE[0]);
    expect(tier(me.towers[0].def)).toBe(1);
    expect(me.gold).toBe(START_GOLD - BUILD_COST);
    step(s, { you: [{ type: 'build', cell: BUILDABLE[0] }] }); // occupied
    expect(me.towers.length).toBe(1);
    step(s, { you: [{ type: 'build' }] }); // auto: the best free square
    expect(me.towers[1].cell).toBe(BUILD_ORDER.find((c) => c !== BUILDABLE[0]));
    me.gold = BUILD_COST - 1;
    step(s, { you: [{ type: 'build' }] });
    expect(me.towers.length).toBe(2);
    // Over many builds every tier-1 family turns up, and nothing but tier 1.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) { const d = rollBuild(me); seen.add(d); expect(tier(d)).toBe(1); }
    expect([...seen].sort()).toEqual([...TIER_POOLS[0]].sort());
  });

  it('merges two identical towers into a random next-tier tower on the target square; tier 7 is the cap', () => {
    const s = tumbleRules.init(field(1), 2), me = p(s), [a, b, c] = BUILDABLE;
    put(s, me, 'tin-sentry', a); put(s, me, 'tin-sentry', b); put(s, me, 'spark-bot', c);
    step(s, { you: [{ type: 'merge', from: a, to: c }] }); // not identical
    expect(me.towers.length).toBe(3);
    step(s, { you: [{ type: 'merge', from: a, to: b }] });
    expect(me.towers.length).toBe(2);
    const merged = me.towers.find((t) => t.cell === b)!;
    expect(tier(merged.def)).toBe(2);
    expect(me.towers.some((t) => t.cell === a)).toBe(false);
    expect(me.merges).toBe(1);
    // Results vary across the next tier.
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) results.add(rollMerge(me, 2).def);
    expect([...results].every((d) => tier(d) === 3)).toBe(true);
    expect(results.size).toBe(TIER_POOLS[2].length);
    // Two tier 6s make a tier 7; tier 7s never merge.
    const s2 = tumbleRules.init(field(1), 3), m2 = p(s2);
    put(s2, m2, 'rocking-regent', BUILDABLE[0]); put(s2, m2, 'rocking-regent', BUILDABLE[1]);
    step(s2, { you: [{ type: 'merge', from: BUILDABLE[0], to: BUILDABLE[1] }] });
    const top = m2.towers.find((t) => t.cell === BUILDABLE[1])!;
    expect(tier(top.def)).toBe(MAX_TIER);
    put(s2, m2, top.def, BUILDABLE[2]);
    step(s2, { you: [{ type: 'merge', from: BUILDABLE[2], to: BUILDABLE[1] }] });
    expect(m2.towers.length).toBe(2);
    expect(m2.towers.every((t) => tier(t.def) === MAX_TIER)).toBe(true);
  });

  it('moves, swaps and sells towers', () => {
    const s = tumbleRules.init(field(1), 4), me = p(s), [a, b, c] = BUILDABLE;
    put(s, me, 'tin-sentry', a); put(s, me, 'felt-cub', b);
    step(s, { you: [{ type: 'move', from: a, to: c }] });
    expect(me.towers.find((t) => t.def === 'tin-sentry')!.cell).toBe(c);
    step(s, { you: [{ type: 'move', from: c, to: b }] });
    expect(me.towers.find((t) => t.def === 'tin-sentry')!.cell).toBe(b);
    expect(me.towers.find((t) => t.def === 'felt-cub')!.cell).toBe(c);
    step(s, { you: [{ type: 'move', from: b, to: PATH_CELLS[2] }] });
    expect(me.towers.find((t) => t.def === 'tin-sentry')!.cell).toBe(b);
    const gold = me.gold;
    step(s, { you: [{ type: 'sell', cell: b }] });
    expect(me.gold).toBe(gold + sellValue(1));
    expect(me.towers.length).toBe(1);
  });

  it('builder levels cost gold, cap at 6 and shift the odds', () => {
    const s = tumbleRules.init(field(1), 5), me = p(s);
    me.gold = 10000;
    for (let i = 0; i < 8; i++) step(s, { you: [{ type: 'builder' }] });
    expect(me.builder).toBe(BUILDER.length);
    expect(me.gold).toBe(10000 - BUILDER.reduce((n, l) => n + l.cost, 0));
    for (const l of BUILDER) expect(l.build[0] + l.build[1] + l.build[2]).toBe(100);
    for (let i = 1; i < BUILDER.length; i++) { expect(BUILDER[i].build[0]).toBeLessThan(BUILDER[i - 1].build[0]); expect(BUILDER[i].lucky).toBeGreaterThan(BUILDER[i - 1].lucky); }
    // Sampled odds at the top level match the table.
    const counts = [0, 0, 0], n = 20000;
    for (let i = 0; i < n; i++) counts[tier(rollBuild(me)) - 1]++;
    BUILDER[5].build.forEach((pct, k) => expect(Math.abs(counts[k] / n * 100 - pct)).toBeLessThan(1.5));
    let lucky = 0;
    for (let i = 0; i < n; i++) { const r = rollMerge(me, 1); if (r.lucky) { lucky++; expect(tier(r.def)).toBe(3); } }
    expect(Math.abs(lucky / n * 100 - BUILDER[5].lucky)).toBeLessThan(1.5);
    // Lucky merges never pass LUCKY_CAP.
    for (let i = 0; i < 2000; i++) { expect(rollMerge(me, 4).lucky).toBe(false); expect(tier(rollMerge(me, 3).def)).toBeLessThanOrEqual(LUCKY_CAP); }
    // Not enough gold: nothing happens.
    const s2 = tumbleRules.init(field(1), 6), m2 = p(s2); m2.gold = BUILDER[1].cost - 1;
    step(s2, { you: [{ type: 'builder' }] });
    expect(m2.builder).toBe(1);
  });

  it('pays every quest once', () => {
    const s = tumbleRules.init(field(2), 8), me = p(s), cells = [...BUILDABLE];
    const take = () => cells.shift()!;
    const gold = () => me.gold;
    // 1. Five different tier 1s.
    let g = gold();
    for (const id of TIER_POOLS[0]) put(s, me, id, take());
    step(s);
    expect(me.quests.collect5).toBe(true);
    expect(gold()).toBe(g + QUESTS.collect5.gold + (TIER_POOLS[0].filter((id) => id === s.orders.t1).length >= 3 ? QUESTS.order1.gold : 0));
    // 2. Three of the same tier 2 (not the ordered one, so only this quest pays).
    const two = TIER_POOLS[1].find((id) => id !== s.orders.t2)!;
    g = gold();
    for (let i = 0; i < 3; i++) put(s, me, two, take());
    step(s);
    expect(me.quests.triple2).toBe(true);
    expect(gold()).toBe(g + QUESTS.triple2.gold);
    // 3. The ordered tier 1, 2 and 3 (tier 3 also gives a free builder level).
    g = gold();
    for (let i = 0; i < 2; i++) put(s, me, s.orders.t1, take()); // one is already on the board
    step(s);
    expect(me.quests.order1).toBe(true);
    expect(gold()).toBe(g + QUESTS.order1.gold);
    for (let i = 0; i < 3; i++) put(s, me, s.orders.t2, take());
    step(s);
    expect(me.quests.order2).toBe(true);
    const level = me.builder;
    for (let i = 0; i < 3; i++) put(s, me, s.orders.t3, take());
    step(s);
    expect(me.quests.order3).toBe(true);
    expect(me.builder).toBe(level + 1);
    // 4. A tier-3+ tower of every family.
    g = gold();
    for (const fam of ['tin', 'paper', 'clockwork', 'rubber', 'plush'] as const) put(s, me, TIER_POOLS[2].find((id) => TOWERS[id].family === fam)!, take());
    step(s);
    expect(me.quests.album).toBe(true);
    expect(questProgress(s, me).album).toEqual([5, 5]);
    // Paid once only.
    g = gold();
    put(s, me, two, take()); step(s);
    expect(gold()).toBe(g);
    // 5. Five clean waves in a row.
    const s2 = tumbleRules.init(field(1), 9), m2 = p(s2);
    put(s2, m2, 'last-monarch', 0); put(s2, m2, 'last-monarch', 2); put(s2, m2, 'endless-jack', 16); put(s2, m2, 'patchwork-wyrm', 34);
    for (let w = 0; w < 5 && !m2.quests.clean5; w++) {
      startWave(s2);
      while (s2.phase === 'wave') step(s2);
    }
    expect(m2.leaks).toBe(0);
    expect(m2.cleared).toBe(5);
    expect(m2.quests.clean5).toBe(true);
  });

  it('"first tier 6 in the lobby" goes to the first board only (or every board that gets there in the same step)', () => {
    const s = tumbleRules.init(field(3), 10), a = p(s, 'you'), b = p(s, 'bot-1'), c = p(s, 'bot-2');
    put(s, b, 'rocking-regent', BUILDABLE[0]);
    step(s);
    expect(b.quests.first6).toBe(true);
    expect(s.firstSix).toEqual(['bot-1']);
    const lives = a.lives;
    put(s, a, 'thread-viper', BUILDABLE[0]);
    step(s);
    expect(a.quests.first6).toBe(false);
    expect(a.lives).toBe(lives);
    expect(c.quests.first6).toBe(false);
    // A tie in one step is shared.
    const t = tumbleRules.init(field(2), 11);
    put(t, p(t, 'you'), 'pinwheel-phoenix', BUILDABLE[0]); put(t, p(t, 'bot-1'), 'aurora-dynamo', BUILDABLE[0]);
    step(t);
    expect(t.firstSix).toEqual(['you', 'bot-1']);
    expect(p(t, 'you').lives).toBe(START_LIVES + QUESTS.first6.lives!);
  });

  it('bosses on waves 5, 10 and 15 drop free tier-4, tier-5 and tier-5 towers; wave 15 also levels the builder; wave 20 pays 500', () => {
    const reward = (wave: number) => {
      const s = tumbleRules.init(field(1), 20 + wave), me = p(s);
      s.wave = wave;
      startWave(s);
      put(s, me, 'last-monarch', 0); put(s, me, 'last-monarch', 2);
      const boss = me.enemies.find((e) => e.boss)!;
      expect(boss).toBeDefined();
      expect(boss.maxHp).toBe(Math.round(waveHp(wave) * BOSSES[wave].hp));
      boss.hp = 1;
      const builder = me.builder;
      for (let i = 0; i < 20 && me.enemies.some((e) => e.boss); i++) step(s);
      return { me, builder, s };
    };
    const five = reward(5);
    expect(five.me.towers.filter((t) => t.how === 'gift').map((t) => tier(t.def))).toEqual([4]);
    const ten = reward(10);
    expect(ten.me.towers.filter((t) => t.how === 'gift').map((t) => tier(t.def))).toEqual([5]);
    const fifteen = reward(15);
    expect(fifteen.me.towers.filter((t) => t.how === 'gift').map((t) => tier(t.def))).toEqual([5]);
    expect(fifteen.me.builder).toBe(fifteen.builder + 1);
    const twenty = reward(20);
    expect(twenty.me.bonus).toBe(500);
    expect(twenty.me.towers.some((t) => t.how === 'gift')).toBe(false);
    // On a full board the gift waits for a free square.
    const s = tumbleRules.init(field(1), 99), me = p(s);
    s.wave = 5;
    BUILDABLE.forEach((c, i) => put(s, me, TIER_POOLS[0][i % 5], c));
    startWave(s);
    me.enemies.find((e) => e.boss)!.hp = 1;
    for (let i = 0; i < 20 && me.gifts.length === 0; i++) step(s);
    expect(me.gifts.length).toBe(1);
    step(s, { you: [{ type: 'sell', cell: BUILDABLE[40] }] });
    expect(me.gifts.length).toBe(0);
    expect(me.towers.find((t) => t.cell === BUILDABLE[40])?.how).toBe('gift');
  });

  it('pays the wave bonus and kill bounties; leaks cost lives; zero lives knocks a board out', () => {
    const s = tumbleRules.init(field(2), 30), me = p(s), other = p(s, 'bot-1');
    // Tier-5 towers: strong enough for wave 1 without claiming the first-tier-6 quest's gold.
    put(s, other, 'quill-marshal', 0); put(s, other, 'quill-marshal', 2); put(s, other, 'prism-conductor', 16);
    startWave(s);
    while (s.phase === 'wave') step(s);
    // You had no towers: every walker leaked. The other board killed them all and earned bounties.
    expect(me.leaks).toBe(10);
    expect(me.lives).toBe(START_LIVES - 10);
    expect(me.cleared).toBe(1);
    expect(me.gold).toBe(START_GOLD + waveBonus(1));
    expect(other.kills).toBe(10);
    expect(other.gold).toBe(START_GOLD + 10 * waveBounty(1) + waveBonus(1));
    // Two more leaky waves knock you out; your enemies vanish and you stop earning.
    me.lives = 3;
    startWave(s);
    while (s.phase === 'wave' && !me.out) step(s);
    expect(me.out).toBe(true);
    expect(me.outWave).toBe(2);
    expect(me.enemies.length).toBe(0);
    expect(me.lives).toBe(0);
    step(s, { you: [{ type: 'build' }] });
    expect(me.towers.length).toBe(0);
    while (s.phase === 'wave') step(s);
    expect(me.cleared).toBe(1);
    expect(other.cleared).toBe(2);
    // Everyone out: the match is over.
    other.lives = 1; startWave(s);
    while (!tumbleRules.isOver(s)) { other.towers.length = 0; step(s); }
    expect(s.players.every((x) => x.out)).toBe(true);
    expect(s.victory).toBe(false);
  });

  it('spectators cycle through the boards still in, and fast-forward only once every human is out', () => {
    const s = tumbleRules.init(field(4), 40);
    expect(watchable(s)).toEqual(['you', 'bot-1', 'bot-2', 'bot-3']);
    expect(viewedBoard(s, 'you', 'bot-2')).toBe('you'); // still in: you see your own board
    p(s, 'you').out = true; p(s, 'bot-2').out = true;
    expect(watchable(s)).toEqual(['bot-1', 'bot-3']);
    expect(viewedBoard(s, 'you', null)).toBe('bot-1');
    expect(viewedBoard(s, 'you', 'bot-3')).toBe('bot-3');
    expect(viewedBoard(s, 'you', 'bot-2')).toBe('bot-1'); // a board that went out is skipped
    expect(cycleWatch(s, 'bot-1', 1)).toBe('bot-3');
    expect(cycleWatch(s, 'bot-3', 1)).toBe('bot-1');
    expect(cycleWatch(s, 'bot-1', -1)).toBe('bot-3');
    expect(cycleWatch(s, 'you', 1)).toBe('bot-1');
    expect(allHumansOut(s)).toBe(true);
    step(s, { you: [{ type: 'speed', speed: 4 }] });
    expect(s.speed).toBe(4);
    const t0 = s.t; step(s);
    expect(s.t - t0).toBeCloseTo(STEP * 4, 6);
    step(s, { 'bot-1': [{ type: 'speed', speed: 1 }] }); // bots cannot change it
    expect(s.speed).toBe(4);
    step(s, { you: [{ type: 'speed', speed: 3 }] }); // only 1, 2 or 4
    expect(s.speed).toBe(4);
    // While a human is still in, no fast-forward.
    const live = tumbleRules.init(field(2), 41);
    step(live, { you: [{ type: 'speed', speed: 4 }] });
    expect(live.speed).toBe(1);
    // Everyone out: every board can be watched again.
    s.players.forEach((x) => { x.out = true; });
    expect(watchable(s).length).toBe(4);
    // Only your own actions and the watched board's leaks make a sound.
    expect(eventCue({ type: 'td-build', id: 'bot-1' }, 'you', 'bot-1')).toBeNull();
    expect(eventCue({ type: 'td-leak', id: 'bot-1' }, 'you', 'bot-1')).toBe('leak');
    expect(eventCue({ type: 'td-merge', id: 'you', lucky: true }, 'you', 'you')).toBe('lucky');
  });

  it('places by waves survived, then lives, then damage score; ties share a place', () => {
    const s = tumbleRules.init(field(4), 50);
    const set = (id: string, cleared: number, lives: number, damage: number, out: boolean) => Object.assign(p(s, id), { cleared, lives, damage, out });
    set('you', 12, 0, 9000, true);
    set('bot-1', 20, 3, 100, false);
    set('bot-2', 20, 9, 50, false);
    set('bot-3', 12, 0, 9000, true);
    const r = tumbleRules.result(s);
    expect(r.placements.map((x) => [x.contestantId, x.place, x.score])).toEqual([['bot-2', 1, 20], ['bot-1', 2, 20], ['you', 3, 12], ['bot-3', 3, 12]]);
    expect(r.placements.find((x) => x.contestantId === 'you')!.eliminated).toBe(true);
  });

  it('ignores malformed inputs', () => {
    const s = tumbleRules.init(field(1), 60), me = p(s), before = JSON.stringify(me);
    step(s, { you: [{ type: 'build', cell: -1 }, { type: 'build', cell: 64 }, { type: 'build', cell: 1.5 }, { type: 'merge', from: 3, to: 3 }, { type: 'sell', cell: 99 },
      { type: 'move', from: 0, to: 0 }, { type: 'nonsense' } as unknown as TdInput] });
    expect(JSON.stringify(me)).toBe(before);
    expect(() => tumbleRules.init([], 1)).toThrow();
    expect(() => tumbleRules.init(field(1), 1, { waves: 0 })).toThrow();
  });

  it('a full 20-wave lobby of eight bots finishes in reasonable CPU time', () => {
    const t0 = performance.now();
    const { s, events } = playBots(1000, ['easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'normal', 'easy']);
    const ms = performance.now() - t0;
    const r = tumbleRules.result(s);
    // Reported for the README: simulated length, CPU time, the furthest wave.
    console.info(`[towertumble] 8-bot lobby: ${(s.t / 60000).toFixed(1)} simulated min, ${ms.toFixed(0)} ms CPU, wave ${s.wave}, victory ${s.victory}, best ${r.placements[0].score} waves, ${events.filter((e) => e === 'td-merge').length} merges`);
    expect(tumbleRules.isOver(s)).toBe(true);
    expect(ms).toBeLessThan(20000);
    expect(s.t).toBeGreaterThan(4 * 60000);
    expect(s.t).toBeLessThan(12 * 60000);
    expect(Math.max(...s.players.map((x) => x.cleared))).toBeGreaterThanOrEqual(10);
    expect(events).toContain('td-wave');
    expect(events).toContain('td-quest');
  });
});
