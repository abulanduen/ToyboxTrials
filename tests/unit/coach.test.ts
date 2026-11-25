import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COACH_TOURS,
  COACH_TOUR_IDS,
  cleanCoachSeen,
  intersect,
  overlapArea,
  placeCard,
  roomScroll,
  shouldCoach,
  stepCount,
  stepFrom,
  stepText,
  withSeen,
  type CoachStep,
  type Rect,
} from '../../src/game/coach';
import { FORMATS } from '../../src/minigames/tournament';
import { POINTS_TABLE } from '../../src/minigames/scoring';
import { migratePersisted } from '../../src/game/economy';

const steps: CoachStep[] = ['a', 'b', 'c', 'd'].map((t) => ({ target: t, title: t, text: t }));
const only = (...on: string[]) => (t: string) => on.includes(t);

describe('the menu tours', () => {
  it('every tour has 2 to 7 steps with short words and distinct targets', () => {
    for (const id of COACH_TOUR_IDS) {
      const t = COACH_TOURS[id];
      expect(t.length, id).toBeGreaterThanOrEqual(2);
      expect(t.length, id).toBeLessThanOrEqual(7);
      expect(new Set(t.map((s) => s.target)).size, id).toBe(t.length);
      for (const s of t) {
        expect(s.title.length, s.target).toBeLessThanOrEqual(24);
        // one or two plain sentences
        for (const words of [s.text, s.touch ?? s.text]) {
          expect(words.length, s.target).toBeLessThanOrEqual(170);
          expect(words.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, s.target).toBeLessThanOrEqual(3);
        }
      }
    }
  });
  it('the Pavilion tour explains the formats and the points from the real tables', () => {
    const formats = COACH_TOURS.pavilion.find((s) => s.target === 'pavilion-formats')!.text;
    for (const f of Object.values(FORMATS)) {
      expect(formats).toContain(f.name);
      expect(formats).toContain(String(f.games));
    }
    const points = COACH_TOURS.pavilion.find((s) => s.target === 'pavilion-rule')!.text;
    expect(points).toContain(`${POINTS_TABLE[0]} for 1st`);
    expect(points).toContain(`${POINTS_TABLE[1]} for 2nd`);
    expect(COACH_TOURS.pavilion.find((s) => s.target === 'pavilion-practice')!.text).toMatch(/machine/);
  });
  it('touch words replace the default only on touch', () => {
    const s = { target: 'x', title: 'x', text: 'Pick it', touch: 'Tap it' };
    expect(stepText(s, false)).toBe('Pick it');
    expect(stepText(s, true)).toBe('Tap it');
    expect(stepText({ target: 'x', title: 'x', text: 'Same' }, true)).toBe('Same');
  });
});

describe('stepping past parts that are not on screen', () => {
  it('finds the first, next and previous present steps', () => {
    expect(stepFrom(steps, -1, 1, only('a', 'b', 'c', 'd'))).toBe(0);
    expect(stepFrom(steps, -1, 1, only('c', 'd'))).toBe(2);
    expect(stepFrom(steps, 0, 1, only('a', 'd'))).toBe(3);
    expect(stepFrom(steps, 3, -1, only('a', 'd'))).toBe(0);
    expect(stepFrom(steps, 3, 1, only('a', 'd'))).toBe(-1);
    expect(stepFrom(steps, 0, -1, only('a', 'd'))).toBe(-1);
    expect(stepFrom(steps, -1, 1, only())).toBe(-1);
  });
  it('counts "n / of" among the steps on screen (the current one always counts)', () => {
    expect(stepCount(steps, 0, only('a', 'b', 'c', 'd'))).toEqual({ n: 1, of: 4 });
    expect(stepCount(steps, 3, only('a', 'd'))).toEqual({ n: 2, of: 2 });
    expect(stepCount(steps, 1, only('a', 'c'))).toEqual({ n: 2, of: 3 });
  });
});

describe('seen state', () => {
  it('shows a tour only with tutorials on, not seen and not held', () => {
    expect(shouldCoach({ tutorials: true, coachSeen: [] }, 'pavilion')).toBe(true);
    expect(shouldCoach({ tutorials: false, coachSeen: [] }, 'pavilion')).toBe(false);
    expect(shouldCoach({ tutorials: true, coachSeen: ['pavilion'] }, 'pavilion')).toBe(false);
    expect(shouldCoach({ tutorials: true, coachSeen: ['shop'] }, 'pavilion')).toBe(true);
    expect(shouldCoach({ tutorials: true, coachSeen: [] }, 'pavilion', true)).toBe(false);
  });
  it('adds a tour once', () => {
    expect(withSeen([], 'menu')).toEqual(['menu']);
    expect(withSeen(['menu'], 'menu')).toEqual(['menu']);
    expect(withSeen(['menu'], 'shop')).toEqual(['menu', 'shop']);
  });
  it('cleans whatever was saved to known tour ids, once each', () => {
    expect(cleanCoachSeen(undefined)).toEqual([]);
    expect(cleanCoachSeen('pavilion')).toEqual([]);
    expect(cleanCoachSeen(['shop', 'bogus', 3, 'shop', 'pavilion'])).toEqual(['pavilion', 'shop']);
  });
  it('the save migration leaves the seen list alone (no version bump; older saves have none)', () => {
    expect(migratePersisted({ coachSeen: ['shop'] }, 0).coachSeen).toEqual(['shop']);
    expect(migratePersisted({ coachSeen: ['shop'], tourSeen: true }, 2).coachSeen).toEqual(['shop']);
    expect(migratePersisted({ tourSeen: true }, 1).coachSeen).toBeUndefined();
  });
});

describe('the store keeps the seen list', () => {
  const KEY = 'toybox-trials:prototype:v1';
  const memory = (seed: Record<string, string>) => {
    const m = new Map(Object.entries(seed));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it('an old save without it loads with none seen; a saved list is cleaned, kept and saved again', async () => {
    // zustand's persist reads window.localStorage; the store's modules only need these of window
    const stub = (ls: ReturnType<typeof memory>) => vi.stubGlobal('window', { localStorage: ls, location: { search: '' } });
    let ls = memory({ [KEY]: JSON.stringify({ state: { tourSeen: true, quality: 'low' }, version: 0 }) });
    stub(ls);
    vi.resetModules();
    let { useGame } = await import('../../src/game/store');
    expect(useGame.getState().coachSeen).toEqual([]);
    expect(useGame.getState().tourSeen).toBe(true);

    ls = memory({ [KEY]: JSON.stringify({ state: { tourSeen: true, coachSeen: ['shop', 'nonsense', 'shop'] }, version: 2 }) });
    stub(ls);
    vi.resetModules();
    ({ useGame } = await import('../../src/game/store'));
    expect(useGame.getState().coachSeen).toEqual(['shop']);
    useGame.getState().set({ coachSeen: withSeen(useGame.getState().coachSeen, 'pavilion') });
    expect(JSON.parse(ls.raw.get(KEY)!).state.coachSeen).toEqual(['shop', 'pavilion']);
  });
});

describe('placing the card', () => {
  const view: Rect = { x: 10, y: 10, w: 370, h: 824 }; // a 390×844 phone less margins
  const card = { w: 360, h: 170 };
  const inside = (p: { x: number; y: number }, c = card, v = view) => p.x >= v.x && p.y >= v.y && p.x + c.w <= v.x + v.w + 0.001 && p.y + c.h <= v.y + v.h + 0.001;
  const box = (p: { x: number; y: number }, c = card) => ({ x: p.x, y: p.y, w: c.w, h: c.h });

  it('goes below the target when there is room, then above', () => {
    const t = { x: 40, y: 200, w: 310, h: 300 };
    const p = placeCard(view, t, card);
    expect(p.side).toBe('below');
    expect(inside(p)).toBe(true);
    expect(overlapArea(box(p), t)).toBe(0);
    const low = { x: 40, y: 560, w: 310, h: 250 };
    const q = placeCard(view, low, card);
    expect(q.side).toBe('above');
    expect(overlapArea(box(q), low)).toBe(0);
    expect(inside(q)).toBe(true);
  });
  it('goes beside a tall target on a wide screen', () => {
    const wide: Rect = { x: 10, y: 10, w: 1260, h: 700 };
    const t = { x: 360, y: 20, w: 480, h: 680 };
    const p = placeCard(wide, t, card);
    expect(p.side).toBe('right');
    expect(overlapArea(box(p), t)).toBe(0);
    expect(inside(p, card, wide)).toBe(true);
  });
  it('with no room anywhere, hugs the edge that covers less of the target, still on screen', () => {
    const land: Rect = { x: 10, y: 10, w: 824, h: 370 };
    const c = { w: 460, h: 160 };
    const t = { x: 150, y: 40, w: 540, h: 330 };
    const p = placeCard(land, t, c);
    expect(p.side).toBe('overlap');
    expect(inside(p, c, land)).toBe(true);
    const other = { ...p, y: p.y === land.y ? land.y + land.h - c.h : land.y };
    expect(overlapArea(box(p, c), t)).toBeLessThanOrEqual(overlapArea(box(other, c), t));
  });
  it('centres without a target and never leaves the screen for a card wider than it', () => {
    expect(placeCard(view, null, card)).toMatchObject({ side: 'center', x: 15 });
    const p = placeCard({ x: 10, y: 10, w: 300, h: 500 }, { x: 0, y: 0, w: 20, h: 20 }, { w: 400, h: 100 });
    expect(p.x).toBeGreaterThanOrEqual(10);
  });
  it('roomScroll moves a target up so the card fits below it, or down for above', () => {
    const land: Rect = { x: 10, y: 10, w: 824, h: 370 };
    // formats row at y 197, 117 tall, card 160: scroll up so it sits at the top
    const d = roomScroll(land, 197, 117, 160, 12);
    expect(d).toBe(197 - 22);
    const p = placeCard(land, { x: 164, y: 197 - d, w: 516, h: 117 }, { w: 460, h: 160 });
    expect(p.side).toBe('below');
    expect(roomScroll(land, 197, 117, 160, 12, true)).toBe(197 - (10 + 12 + 160 + 12));
    // can't make room for a target taller than the screen allows
    expect(roomScroll(land, 50, 300, 160, 12)).toBe(0);
  });
  it('intersect and overlap', () => {
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBeNull();
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
  });
});
