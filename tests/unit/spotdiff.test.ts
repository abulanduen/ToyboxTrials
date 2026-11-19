import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/minigames/rng';
import type { Contestant } from '../../src/minigames/types';
import { gameById } from '../../src/minigames/registry';
import { drawSlot, drawSlots } from '../../src/minigames/spotdiff/art';
import { background } from '../../src/minigames/spotdiff/backgrounds';
import { createSpotBot } from '../../src/minigames/spotdiff/bot';
import { DEFAULT_CONFIG, buildRound, finishBonus, hitTest, pickSpread, spotRules, themeOrder, type SpotInput, type SpotState } from '../../src/minigames/spotdiff/rules';
import { PIC_H, PIC_W, toSvg } from '../../src/minigames/spotdiff/shapes';
import { MIN_HIT_R, SLOTS_PER_THEME, THEMES, themeById, type ThemeDef } from '../../src/minigames/spotdiff/themes';
import { bookLayout } from '../../src/minigames/spotdiff/layout';
import { keyPath } from '../../src/minigames/spotdiff/local';

const STEP = 1000 / 60;
const paint = { body: '#E76B62', trim: '#EFAE45', key: '#C8973A', face: '#FFF9EE' } as unknown as Contestant['paint'];
const who = (id: string, bot?: Contestant['bot']): Contestant => ({ id, name: id, paint, hat: 'none' as Contestant['hat'], keySkin: 'brass' as Contestant['keySkin'], isLocal: id === 'you', bot });

/** Step until `until(s)` or `maxMs`, feeding inputs from `feed` each step. */
function run(s: SpotState, maxMs: number, feed: (s: SpotState) => Record<string, SpotInput[]> = () => ({}), until: (s: SpotState) => boolean = () => false) {
  for (let t = 0; t < maxMs && !until(s); t += STEP) spotRules.step(s, feed(s), STEP);
  return s;
}
const toSearch = (s: SpotState) => run(s, 20000, undefined, (x) => x.phase === 'search');
/** A tap at a slot's centre, normalised. */
const at = (theme: ThemeDef, i: number): SpotInput => ({ x: theme.slots[i].x / PIC_W, y: theme.slots[i].y / PIC_H });
/** A point that is certainly a miss this round. */
function missPoint(s: SpotState): SpotInput {
  const theme = themeById(s.data.theme);
  const sl = theme.slots.find((x, i) => !s.data.diffs.includes(i) && s.data.diffs.every((d) => Math.hypot(theme.slots[d].x - x.x, theme.slots[d].y - x.y) > theme.slots[d].r + 1))!;
  return { x: sl.x / PIC_W, y: sl.y / PIC_H };
}

describe('Odd Page Out: the scenes', () => {
  it('has at least three scenes, each with exactly 60 slots of 2–4 variants inside the picture', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(3);
    for (const t of THEMES) {
      expect(t.slots.length, t.id).toBe(SLOTS_PER_THEME);
      expect(new Set(t.slots.map((s) => s.id)).size).toBe(SLOTS_PER_THEME);
      for (const s of t.slots) {
        expect(s.vary.length, s.id).toBeGreaterThanOrEqual(2);
        expect(s.vary.length, s.id).toBeLessThanOrEqual(4);
        expect(s.r, s.id).toBeGreaterThanOrEqual(MIN_HIT_R);
        expect(s.x, s.id).toBeGreaterThan(0);
        expect(s.x, s.id).toBeLessThan(PIC_W);
        expect(s.y, s.id).toBeGreaterThan(0);
        expect(s.y, s.id).toBeLessThan(PIC_H);
      }
    }
  });

  it('every variant of every slot draws differently from every other variant of that slot', () => {
    for (const t of THEMES)
      for (const s of t.slots) {
        const svgs = s.vary.map((_, v) => toSvg(drawSlot(s, v)));
        expect(new Set(svgs).size, s.id).toBe(s.vary.length);
      }
  });

  it('a slot draws only from its own parameters: nothing else in the picture changes with it', () => {
    // Every slot is drawn into its own group, so changing one slot's variant changes exactly one group.
    for (const t of THEMES) {
      const base = t.slots.map(() => 0);
      const ref = drawSlots(t.id, base).map(toSvg);
      t.slots.forEach((s, i) => {
        const alt = base.slice();
        alt[i] = s.vary.length - 1;
        const other = drawSlots(t.id, alt).map(toSvg);
        expect(other.filter((g, j) => g !== ref[j]).length, s.id).toBe(1);
      });
    }
  });

  it('scenes are spread out: slots are not piled on top of each other', () => {
    for (const t of THEMES) {
      let close = 0;
      for (let i = 0; i < t.slots.length; i++)
        for (let j = i + 1; j < t.slots.length; j++) if (Math.hypot(t.slots[i].x - t.slots[j].x, t.slots[i].y - t.slots[j].y) < 20) close++;
      expect(close, t.id).toBe(0);
    }
  });
});

describe('Odd Page Out: rounds from the seed', () => {
  it('is deterministic: the same seed builds the same match', () => {
    const a = spotRules.init([who('you'), who('b1', 'normal')], 1234);
    const b = spotRules.init([who('you'), who('b1', 'normal')], 1234);
    expect(a.themes).toEqual(b.themes);
    for (let r = 1; r <= 4; r++) expect(buildRound(1234, r, a.themes)).toEqual(buildRound(1234, r, b.themes));
    // and replays identically with bots
    const play = (seed: number) => {
      const s = spotRules.init([who('you'), who('b1', 'hard'), who('b2', 'easy')], seed);
      const bot = createSpotBot();
      const rngs = { b1: seededRng(1), b2: seededRng(2) };
      run(s, 200000, (st) => ({ b1: bot.decide(st, who('b1', 'hard'), STEP, rngs.b1), b2: bot.decide(st, who('b2', 'easy'), STEP, rngs.b2) }), (st) => spotRules.isOver(st));
      return JSON.stringify(spotRules.result(s));
    };
    expect(play(77)).toBe(play(77));
  });

  it('each round: exactly 15 slots differ between the pages, and the pictures are identical everywhere else', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const themes = themeOrder(seed);
      for (let r = 1; r <= 4; r++) {
        const d = buildRound(seed, r, themes);
        expect(d.diffs.length).toBe(15);
        const differing = d.ref.map((v, i) => (v !== d.alt[i] ? i : -1)).filter((i) => i >= 0);
        expect(differing).toEqual(d.diffs);
        // the drawn pictures: the backdrop is shared, and exactly the 15 slots' groups differ
        const A = drawSlots(d.theme, d.ref).map(toSvg);
        const B = drawSlots(d.theme, d.alt).map(toSvg);
        const changed = A.map((g, i) => (g !== B[i] ? i : -1)).filter((i) => i >= 0);
        expect(changed).toEqual(d.diffs);
        expect(toSvg(background(d.theme))).toBe(toSvg(background(d.theme)));
      }
    }
  });

  it('every match visits four different scenes, and the reference picture itself changes from round to round', () => {
    const refs = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 30; seed++) {
      const themes = themeOrder(seed);
      expect(new Set(themes).size).toBe(4);
      for (let r = 1; r <= 4; r++) {
        const d = buildRound(seed, r, themes);
        if (!refs.has(d.theme)) refs.set(d.theme, new Set());
        refs.get(d.theme)!.add(d.ref.join(','));
      }
    }
    // 30 matches, each scene once per match: 30 different reference pictures per scene
    for (const [id, set] of refs) expect(set.size, id).toBe(30);
    // the scene order itself varies
    expect(new Set(Array.from({ length: 20 }, (_, i) => themeOrder(i + 1).join())).size).toBeGreaterThan(5);
  });

  it('differences are spread over the page', () => {
    let minAll = Infinity;
    let atSpacing = 0;
    let rounds = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const themes = themeOrder(seed);
      for (let r = 1; r <= 4; r++) {
        const d = buildRound(seed, r, themes);
        const sl = themeById(d.theme).slots;
        let min = Infinity;
        for (const i of d.diffs) for (const j of d.diffs) if (i < j) min = Math.min(min, Math.hypot(sl[i].x - sl[j].x, sl[i].y - sl[j].y));
        minAll = Math.min(minAll, min);
        if (min >= DEFAULT_CONFIG.spacing) atSpacing++;
        rounds++;
      }
    }
    expect(minAll).toBeGreaterThanOrEqual(DEFAULT_CONFIG.spacing);
    expect(atSpacing).toBe(rounds);
  });

  it('pickSpread never repeats a slot and always picks k', () => {
    const t = THEMES[0];
    for (let i = 0; i < 30; i++) {
      const picks = pickSpread(seededRng(i), t.slots, 15, 500); // impossible spacing: must relax
      expect(new Set(picks).size).toBe(15);
    }
  });
});

describe('Odd Page Out: hit testing', () => {
  const t = THEMES[0];
  it('a tap inside a difference finds it; outside all of them is a miss; a found one taps "again"', () => {
    const diffs = [0, 30];
    const s0 = t.slots[0];
    expect(hitTest(t, diffs, [], s0.x, s0.y)).toEqual({ kind: 'find', slot: 0 });
    expect(hitTest(t, diffs, [], s0.x + s0.r * 0.95, s0.y)).toEqual({ kind: 'find', slot: 0 });
    expect(hitTest(t, diffs, [], s0.x + s0.r * 1.05, s0.y).kind).not.toBe('find');
    expect(hitTest(t, diffs, [0], s0.x, s0.y)).toEqual({ kind: 'again', slot: 0 });
    const far = t.slots[59];
    expect(hitTest(t, diffs, [], far.x, far.y)).toEqual({ kind: 'miss' });
  });

  it('overlapping hit circles: the nearest (relative to its size) unfound difference wins', () => {
    const a = t.slots[0]; // (24, 57)
    const b = t.slots[1]; // (68, 58): circles overlap between them
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(a.r + b.r);
    const mid = (k: number) => [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k] as const;
    expect(hitTest(t, [0, 1], [], ...mid(0.35))).toEqual({ kind: 'find', slot: 0 });
    expect(hitTest(t, [0, 1], [], ...mid(0.65))).toEqual({ kind: 'find', slot: 1 });
    // nearer one already found: the tap goes to the other if it is inside that one too
    expect(hitTest(t, [0, 1], [0], ...mid(0.35))).toEqual({ kind: 'find', slot: 1 });
    // a slot that is not a difference never counts, even right on its centre
    expect(hitTest(t, [1], [], a.x - 10, a.y).kind).toBe('miss');
  });
});

describe('Odd Page Out: play and scoring', () => {
  it('finding everything scores 10 each plus a finishing bonus, ends the solo round early, and rings the change', () => {
    const s = toSearch(spotRules.init([who('you')], 42));
    const theme = themeById(s.data.theme);
    expect(s.round).toBe(1);
    const taps = s.data.diffs.map((i) => at(theme, i));
    run(s, 2000);
    let k = 0;
    run(s, 10000, () => (k < taps.length ? { you: [taps[k++]] } : {}), (x) => x.phase !== 'search');
    const me = s.players[0];
    expect(me.found.length).toBe(15);
    expect(me.done).toBe(true);
    expect(me.doneOrder).toBe(0);
    expect(me.bonus).toBe(finishBonus(DEFAULT_CONFIG, 0, me.foundAt[14]));
    expect(me.bonus).toBeGreaterThan(60 + 30); // finished in ~2.3 s: nearly all the speed bonus
    expect(me.score).toBe(150 + me.bonus);
    expect(s.phase).toBe('reveal'); // everyone (just you) finished
  });

  it('the first to find everything gets the biggest bonus; finishing in the same step ties', () => {
    const s = toSearch(spotRules.init([who('you'), who('p2'), who('p3'), who('p4')], 9));
    const theme = themeById(s.data.theme);
    const taps = s.data.diffs.map((i) => at(theme, i));
    // p2 and p3 tap one per step; p4 starts later; you never finish
    let k = 0;
    run(s, 2000, () => {
      const out: Record<string, SpotInput[]> = {};
      if (k < 15) out.p2 = out.p3 = [taps[k]];
      if (k >= 20 && k < 35) out.p4 = [taps[k - 20]];
      if (k < 3) out.you = [taps[k]];
      k++;
      return out;
    });
    const [you, p2, p3, p4] = s.players;
    expect(p2.doneOrder).toBe(0);
    expect(p3.doneOrder).toBe(0);
    expect(p2.bonus).toBe(p3.bonus);
    expect(p4.doneOrder).toBe(2);
    expect(p2.bonus).toBeGreaterThan(p4.bonus);
    expect(p4.bonus).toBe(finishBonus(DEFAULT_CONFIG, 2, p4.foundAt[14]));
    expect(you.done).toBe(false);
    expect(you.score).toBe(30);
    expect(s.phase).toBe('search'); // you are still looking
  });

  it('finish bonus: 60 / 40 / 30 / 20 by order, plus up to 40 for time left', () => {
    expect(finishBonus(DEFAULT_CONFIG, 0, 0)).toBe(100);
    expect(finishBonus(DEFAULT_CONFIG, 1, 15000)).toBe(60);
    expect(finishBonus(DEFAULT_CONFIG, 2, 30000)).toBe(30);
    expect(finishBonus(DEFAULT_CONFIG, 6, 30000)).toBe(20);
  });

  it('a wrong tap locks you out for a second: taps meanwhile are ignored, then work again', () => {
    const s = toSearch(spotRules.init([who('you')], 5));
    const theme = themeById(s.data.theme);
    const good = at(theme, s.data.diffs[0]);
    const good2 = at(theme, s.data.diffs[1]);
    spotRules.step(s, { you: [missPoint(s), good] }, STEP); // the find after the miss is dropped
    const me = s.players[0];
    expect(me.wrong).toBe(1);
    expect(me.lockMs).toBe(1000);
    expect(me.found.length).toBe(0);
    const ev = spotRules.drainEvents(s);
    expect(ev.some((e) => e.type === 'wrong' && e.id === 'you')).toBe(true);
    run(s, 900, () => ({ you: [good] }));
    expect(me.found.length).toBe(0);
    expect(me.lockMs).toBeGreaterThan(0);
    run(s, 200);
    expect(me.lockMs).toBe(0);
    spotRules.step(s, { you: [good, good2] }, STEP);
    expect(me.found.length).toBe(2);
    // tapping a found one again costs nothing
    spotRules.step(s, { you: [good] }, STEP);
    expect(me.lockMs).toBe(0);
    expect(me.score).toBe(20);
    // junk input is ignored
    spotRules.step(s, { you: [{ x: NaN, y: 0.5 }, { x: 2, y: 0.5 }, null as unknown as SpotInput] }, STEP);
    expect(me.wrong).toBe(1);
  });

  it('taps outside the search phase do nothing; a round lasts 30 s; the match is four pages', () => {
    const s = spotRules.init([who('you')], 3);
    const theme = themeById(s.data.theme);
    run(s, 5000, (x) => ({ you: [at(theme, x.data.diffs[0])] }), (x) => x.phase === 'search');
    expect(s.phase).toBe('search');
    expect(s.players[0].found.length).toBe(0);
    expect(s.players[0].wrong).toBe(0);
    run(s, 29900);
    expect(s.phase).toBe('search');
    run(s, 200);
    expect(s.phase).toBe('reveal');
    run(s, 400000, undefined, (x) => spotRules.isOver(x));
    expect(spotRules.isOver(s)).toBe(true);
    expect(s.round).toBe(4);
    const def = gameById('odd-page-out');
    expect(s.t / 1000).toBeLessThanOrEqual(def.durationSec[1]);
    expect(s.t / 1000).toBeGreaterThan(def.durationSec[0]);
  });
});

describe('Odd Page Out: bots', () => {
  function botMatch(seed: number, diff: Contestant['bot']) {
    const bots = [who('b1', diff), who('b2', diff)];
    const s = spotRules.init([who('you'), ...bots], seed);
    const policy = createSpotBot();
    const rngs = new Map(bots.map((b, i) => [b.id, seededRng(seed * 10 + i)]));
    const wrongTaps: SpotInput[] = [];
    run(
      s,
      400000,
      (st) => {
        const out: Record<string, SpotInput[]> = {};
        for (const b of bots) {
          const got = policy.decide(st, b, STEP, rngs.get(b.id)!);
          if (got.length) out[b.id] = got;
        }
        return out;
      },
      (st) => spotRules.isOver(st),
    );
    for (const e of spotRules.drainEvents(s)) if (e.type === 'wrong') wrongTaps.push(e as unknown as SpotInput);
    return s;
  }

  it('find differences at a difficulty-scaled rate, with occasional wrong taps', () => {
    const avg = (d: Contestant['bot']) => {
      let finds = 0;
      let wrong = 0;
      let clears = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const s = botMatch(seed, d);
        for (const p of s.players.slice(1)) {
          finds += p.finds;
          wrong += p.wrongTotal;
          clears += p.clears;
        }
      }
      return { finds: finds / 12, wrong: wrong / 12, clears: clears / 12 };
    };
    const easy = avg('easy');
    const normal = avg('normal');
    const hard = avg('hard');
    // per match (4 rounds of 15)
    expect(easy.finds).toBeLessThan(normal.finds);
    expect(normal.finds).toBeLessThan(hard.finds);
    expect(easy.finds).toBeGreaterThan(20);
    expect(hard.finds).toBeGreaterThan(55);
    expect(hard.clears).toBeGreaterThan(3);
    expect(easy.clears).toBeLessThan(1);
    expect(easy.wrong).toBeGreaterThan(hard.wrong);
    expect(easy.wrong).toBeGreaterThan(0);
  });

  it('bot wrong taps are real misses and bots never tap outside the search', () => {
    const s = spotRules.init([who('b1', 'easy')], 11);
    const policy = createSpotBot();
    const rng = seededRng(4);
    let outside = 0;
    for (let t = 0; t < 140000 && !spotRules.isOver(s); t += STEP) {
      const out = policy.decide(s, who('b1', 'easy'), STEP, rng);
      if (out.length && s.phase !== 'search') outside++;
      spotRules.step(s, out.length ? { b1: out } : {}, STEP);
    }
    expect(outside).toBe(0);
    expect(s.players[0].wrongTotal).toBeGreaterThan(0);
    expect(s.players[0].finds).toBeGreaterThan(20);
  });
});

describe('Odd Page Out: results', () => {
  it('ranks by points, then differences found, then quicker finds; ties share a place', () => {
    const s = spotRules.init([who('you'), who('a'), who('b'), who('c')], 1);
    const [you, a, b, c] = s.players;
    you.score = 120;
    you.finds = 12;
    you.findMs = 100000;
    a.score = 120;
    a.finds = 12;
    a.findMs = 90000;
    b.score = 200;
    b.finds = 15;
    c.score = 120;
    c.finds = 12;
    c.findMs = 90000;
    const r = spotRules.result(s);
    expect(r.placements.map((p) => [p.contestantId, p.place])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['you', 4],
    ]);
    expect(r.placements[0].score).toBe(200);
  });
});

describe('Odd Page Out: layout', () => {
  it('pictures are 4 : 3, inside the screen, below the HUD, and big enough for finger-sized targets', () => {
    for (const [w, h] of [
      [390, 844],
      [844, 390],
      [1280, 800],
      [1024, 600],
      [768, 1024],
    ]) {
      const L = bookLayout(w, h);
      for (const p of L.pics) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(40);
        expect(p.x + p.w).toBeLessThanOrEqual(w);
        expect(p.y + p.h).toBeLessThanOrEqual(h);
        expect(Math.abs(p.h / p.w - 0.75)).toBeLessThan(0.01);
      }
      expect(L.portrait).toBe(h > w);
      // the smallest hit circle is at least 56 px across on phones
      expect(2 * MIN_HIT_R * L.scale, `${w}×${h}`).toBeGreaterThanOrEqual(56);
      // pages never overlap
      const [a, b] = L.pics;
      expect(a.x + a.w <= b.x || a.y + a.h <= b.y).toBe(true);
    }
  });
});

describe('Odd Page Out: keyboard', () => {
  it('the arrows can reach every slot from every slot in every scene', () => {
    // strongly connected: everything is reachable from slot 0, and slot 0 from everything
    for (const t of THEMES)
      for (let a = 0; a < t.slots.length; a++) {
        expect(keyPath(t.slots, 0, a), `${t.id}: 0 → ${a}`).not.toBeNull();
        expect(keyPath(t.slots, a, 0), `${t.id}: ${a} → 0`).not.toBeNull();
      }
  });
});
