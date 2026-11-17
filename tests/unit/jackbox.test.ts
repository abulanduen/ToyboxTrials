import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../../src/minigames/jackbox/categories';
import { compact, editDistance, indexCategory, matchAnswer, pretty } from '../../src/minigames/jackbox/matching';
import { jackRules, nextAlive, type JackInput, type JackState } from '../../src/minigames/jackbox/rules';
import { createJackBot } from '../../src/minigames/jackbox/bot';
import { makeBots } from '../../src/minigames/bots';
import { seededRng, subSeed } from '../../src/minigames/rng';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';

const human = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });
const cat = (id: string) => indexCategory(CATEGORIES.find((c) => c.id === id)!);
const name = (idx: ReturnType<typeof cat>, raw: string) => {
  const id = matchAnswer(idx, raw);
  return id === null ? null : idx.answers[id].display;
};

describe('Jack-in-the-Box category bank', () => {
  it('has enough categories, each with plenty of answers in every tier', () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    for (const c of CATEGORIES) {
      const idx = indexCategory(c);
      const byTier = [0, 1, 2].map((t) => idx.answers.filter((a) => a.tier === t).length);
      expect(byTier[0], `${c.id} common`).toBeGreaterThanOrEqual(10);
      expect(idx.answers.length, `${c.id} total`).toBeGreaterThanOrEqual(30);
      expect(c.prompt.length).toBeLessThanOrEqual(32);
    }
  });

  it('every listed answer and alias matches itself', () => {
    for (const c of CATEGORIES) {
      const idx = indexCategory(c);
      for (const [key, id] of idx.keys) expect(matchAnswer(idx, key), `${c.id}: ${key}`).toBe(id);
      for (const a of idx.answers) expect(matchAnswer(idx, a.display), `${c.id}: ${a.display}`).toBe(a.id);
    }
  });
});

describe('Jack-in-the-Box answer matching', () => {
  it('normalises case, accents, punctuation, spaces and articles', () => {
    expect(compact('  The Jack-in-the-Box! ')).toBe('jackinthebox');
    expect(compact('Crème Brûlée')).toBe('cremebrulee');
    expect(compact("Rubik's cube")).toBe('rubikscube');
    expect(compact('an apple')).toBe('apple');
    expect(compact('the')).toBe('the');
  });

  it('accepts aliases, plurals and spacing variants', () => {
    const fruit = cat('fruit');
    expect(name(fruit, 'Strawberries')).toBe('strawberry');
    expect(name(fruit, 'peaches')).toBe('peach');
    expect(name(fruit, 'KIWIFRUIT')).toBe('kiwi');
    expect(name(fruit, 'passionfruit')).toBe('passion fruit');
    expect(name(cat('vegetable'), 'zucchini')).toBe('courgette');
    expect(name(cat('vegetable'), 'potatoes')).toBe('potato');
    expect(name(cat('toy'), 'jack in the box')).toBe('jack-in-the-box');
    expect(name(cat('dinosaur'), 'T-Rex')).toBe('tyrannosaurus');
    expect(name(cat('country'), 'USA')).toBe('united states');
    expect(name(cat('colour'), 'gray')).toBe('grey');
  });

  it('forgives small typos only when unambiguous and long enough', () => {
    const fruit = cat('fruit');
    expect(name(fruit, 'banan')).toBe('banana');
    expect(name(fruit, 'pinapple')).toBe('pineapple');
    expect(name(fruit, 'watermelonn')).toBe('watermelon');
    expect(name(fruit, 'strawbery')).toBe('strawberry');
    expect(name(fruit, 'lemon')).toBe('lemon'); // never fuzzed into "melon"
    expect(name(fruit, 'melon')).toBe('melon');
    expect(name(fruit, 'appl')).toBeNull(); // too short to guess
    expect(name(fruit, 'carrot')).toBeNull();
    expect(name(fruit, '')).toBeNull();
    expect(name(fruit, '!!!')).toBeNull();
  });

  it('displays answers in title case, keeping short words and acronyms tidy', () => {
    expect(pretty('united kingdom')).toBe('United Kingdom');
    expect(pretty('uk')).toBe('UK');
    expect(pretty('snakes and ladders')).toBe('Snakes and Ladders');
    expect(pretty('jack-in-the-box')).toBe('Jack-in-the-box');
  });

  it('edit distance bails out early past the allowance', () => {
    expect(editDistance('kitten', 'sitting', 3)).toBe(3);
    expect(editDistance('kitten', 'sitting', 1)).toBe(2);
    expect(editDistance('a', 'abcdef', 2)).toBe(3);
  });
});

/** Step the rules at 16 ms. `policy` returns what the holder types this step. */
function run(s: JackState, policy: (s: JackState) => Record<string, JackInput[]>, maxMs = 900_000) {
  const events: { type: string; [k: string]: unknown }[] = [];
  for (let t = 0; t < maxMs && !jackRules.isOver(s); t += 16) {
    jackRules.step(s, s.phase === 'live' ? policy(s) : {}, 16);
    events.push(...jackRules.drainEvents(s));
  }
  return events;
}

/** Answers the next unused answer of the category the moment the box arrives (but `slow` players never answer). */
const instant = (slow: string[] = []) => (s: JackState): Record<string, JackInput[]> => {
  if (slow.includes(s.holder)) return {};
  const idx = indexCategory(s.category);
  const said = new Set(s.said.map((x) => x.id));
  const next = idx.answers.find((a) => !said.has(a.id));
  return next ? { [s.holder]: [{ text: next.display }] } : {};
};

describe('Jack-in-the-Box rules', () => {
  it('same seed → same categories, fuses and first holder', () => {
    const field = ['you', 'b1', 'b2', 'b3'].map(human);
    const a = jackRules.init(field, 77);
    const b = jackRules.init(field, 77);
    expect(b.order).toEqual(a.order);
    expect(b.fuses).toEqual(a.fuses);
    expect(b.holder).toBe(a.holder);
    expect(jackRules.init(field, 78).order).not.toEqual(a.order);
    for (const f of a.fuses) expect(f >= 12000 && f <= 28000).toBe(true);
  });

  it('valid answers pass the box clockwise; bad or repeated answers keep it', () => {
    const s = jackRules.init(['you', 'b1', 'b2'].map(human), 5, { categories: ['fruit'] });
    s.holder = 'you';
    run(s, () => ({}), 1200 + 2600 + 16); // through intro + reveal
    expect(s.phase).toBe('live');
    expect(s.holder).toBe('you');

    jackRules.step(s, { you: [{ text: 'carrot' }] }, 16);
    expect(jackRules.drainEvents(s).map((e) => e.reason)).toEqual(['invalid']);
    expect(s.holder).toBe('you');

    jackRules.step(s, { b1: [{ text: 'apple' }] }, 16); // not their turn
    expect(s.holder).toBe('you');
    expect(s.said).toEqual([]);

    jackRules.step(s, { you: [{ text: 'Apples' }, { text: 'pear' }] }, 16); // only the first counts
    expect(s.holder).toBe('b1');
    expect(s.said.map((x) => x.display)).toEqual(['Apple']);

    jackRules.step(s, { b1: [{ text: 'APPLE' }] }, 16);
    const ev = jackRules.drainEvents(s);
    expect(ev.find((e) => e.type === 'reject')?.reason).toBe('repeat');
    expect(s.holder).toBe('b1');

    jackRules.step(s, { b1: [{ text: 'banana' }] }, 16);
    expect(s.holder).toBe('b2');
    jackRules.step(s, { b2: [{ text: 'cherry' }] }, 16);
    expect(s.holder).toBe('you');
    expect(s.players.find((p) => p.id === 'b1')!.answers).toBe(1);
  });

  it('the fuse pops on whoever is holding; the next round starts after them with a new category', () => {
    const s = jackRules.init(['you', 'b1', 'b2'].map(human), 11);
    s.holder = 'b1';
    const first = s.order[0];
    const ev: { type: string; [k: string]: unknown }[] = [];
    while (s.round === 1) {
      jackRules.step(s, s.phase === 'live' ? instant(['b1'])(s) : {}, 16);
      ev.push(...jackRules.drainEvents(s));
    }
    const pop = ev.find((e) => e.type === 'pop');
    expect(pop?.id).toBe('b1');
    expect(s.players.find((p) => p.id === 'b1')!.alive).toBe(false);
    expect(s.round).toBe(2);
    expect(s.category.id).not.toBe(first);
    expect(s.holder).toBe('b2'); // clockwise after the popped toy
  });

  it('elimination order decides placement; last toy in wins', () => {
    const s = jackRules.init(['you', 'b1', 'b2', 'b3'].map(human), 3);
    const ev = run(s, instant(['b2', 'b1', 'b3']));
    expect(jackRules.isOver(s)).toBe(true);
    const pops = ev.filter((e) => e.type === 'pop').map((e) => e.id);
    expect(pops).toHaveLength(3);
    const r = jackRules.result(s);
    expect(r.placements.map((p) => p.contestantId)).toEqual(['you', ...pops.slice().reverse()]);
    expect(r.placements.map((p) => p.place)).toEqual([1, 2, 3, 4]);
    expect(r.placements[0].score).toBeGreaterThan(0);
  });

  it('forfeit: last place, and the box moves on if they held it', () => {
    const s = jackRules.init(['you', 'b1', 'b2'].map(human), 8);
    s.holder = 'you';
    run(s, () => ({}), 4000);
    jackRules.forfeit(s, 'you');
    expect(s.holder).toBe('b1');
    expect(nextAlive(s, 'b2')).toBe('b1');
    run(s, instant(['b1']));
    const r = jackRules.result(s);
    expect(r.placements.map((p) => p.contestantId)).toEqual(['b2', 'b1', 'you']);
    expect(r.placements[2].forfeit).toBe(true);
  });

  it('forfeit in a two-toy match ends it at once', () => {
    const s = jackRules.init(['you', 'b1'].map(human), 2);
    jackRules.forfeit(s, 'b1');
    expect(jackRules.isOver(s)).toBe(true);
    expect(jackRules.result(s).placements[0].contestantId).toBe('you');
  });
});

describe('Jack-in-the-Box bots', () => {
  function botMatch(seed: number, difficulty: 'easy' | 'normal' | 'hard', n = 6) {
    const bots = makeBots(seed, n, difficulty, 'You');
    const s = jackRules.init(bots, seed);
    const policy = createJackBot();
    const rngs = new Map(bots.map((b) => [b.id, seededRng(subSeed(seed, b.id))]));
    const events: { type: string; [k: string]: unknown }[] = [];
    for (let t = 0; t < 2_000_000 && !jackRules.isOver(s); t += 16) {
      const inputs: Record<string, JackInput[]> = {};
      for (const b of bots) {
        const out = policy.decide(s, b, 16, rngs.get(b.id)!);
        if (out.length) inputs[b.id] = out;
      }
      jackRules.step(s, inputs, 16);
      events.push(...jackRules.drainEvents(s));
    }
    return { s, events };
  }

  it('a bot-only match finishes, deterministically', () => {
    const a = botMatch(42, 'normal');
    const b = botMatch(42, 'normal');
    expect(jackRules.isOver(a.s)).toBe(true);
    expect(a.events.filter((e) => e.type === 'pop')).toHaveLength(5);
    expect(jackRules.result(a.s)).toEqual(jackRules.result(b.s));
  });

  it('bots mostly give valid answers, and harder bots answer more per round', () => {
    const rate = (d: 'easy' | 'normal' | 'hard') => {
      let accepts = 0;
      let rejects = 0;
      let rounds = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const { s, events } = botMatch(seed * 101, d, 4);
        accepts += events.filter((e) => e.type === 'accept').length;
        rejects += events.filter((e) => e.type === 'reject').length;
        rounds += s.round;
      }
      return { perRound: accepts / rounds, validShare: accepts / (accepts + rejects) };
    };
    const easy = rate('easy');
    const hard = rate('hard');
    expect(hard.perRound).toBeGreaterThan(easy.perRound);
    expect(easy.validShare).toBeGreaterThan(0.75);
    expect(hard.validShare).toBeGreaterThan(0.9);
  });
});
