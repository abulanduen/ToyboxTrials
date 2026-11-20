/** Trial length classes and labels (src/minigames/length.ts), derived from `durationSec`. */
import { describe, expect, it } from 'vitest';
import { GROUP_ORDER, byLength, durationChip, durationLabel, groupDurationLabel, inGroup, lengthClassOf } from '../../src/minigames/length';
import { MINIGAMES } from '../../src/minigames/registry';

const d = (lo: number, hi: number) => ({ durationSec: [lo, hi] as [number, number] });

describe('length classes', () => {
  it('short up to 4 min, medium up to 6 min, long beyond', () => {
    expect(lengthClassOf(d(20, 75))).toBe('short');
    expect(lengthClassOf(d(60, 240))).toBe('short');
    expect(lengthClassOf(d(60, 241))).toBe('medium');
    expect(lengthClassOf(d(240, 300))).toBe('medium'); // a 5-minute survivor game
    expect(lengthClassOf(d(300, 360))).toBe('medium');
    expect(lengthClassOf(d(300, 361))).toBe('long');
    expect(lengthClassOf(d(300, 600))).toBe('long'); // a 5–10 minute tower defence
  });

  it('today Toy Squad, Toy Tower Tumble and Toybox Siege (with its final arena) are long; Hoop Clash is medium; every other trial is short', () => {
    const long = ['toy-squad', 'toy-tower-tumble', 'toybox-siege'];
    const medium: string[] = ['hoop-clash'];
    for (const g of MINIGAMES) expect(lengthClassOf(g), g.id).toBe(long.includes(g.id) ? 'long' : medium.includes(g.id) ? 'medium' : 'short');
  });

  it('labels: a range in whole minutes, and a compact chip', () => {
    expect(durationLabel(d(60, 180))).toBe('about 1–3 min');
    expect(durationLabel(d(20, 75))).toBe('about 1–2 min');
    expect(durationLabel(d(60, 80))).toBe('about 1–2 min');
    expect(durationLabel(d(300, 300))).toBe('about 5 min');
    expect(durationLabel(d(300, 630))).toBe('about 5–11 min');
    expect(durationChip(d(60, 180))).toBe('~2 min');
    expect(durationChip(d(20, 30))).toBe('~1 min');
    expect(durationChip(d(300, 630))).toBe('~8 min');
  });

  it('sorts short to long, keeping registry order within a class', () => {
    const games = [{ id: 'a', ...d(300, 600) }, { id: 'b', ...d(60, 120) }, { id: 'c', ...d(240, 300) }, { id: 'd', ...d(10, 60) }];
    expect(byLength(games).map((g) => g.id)).toEqual(['b', 'd', 'c', 'a']);
    const sorted = byLength(MINIGAMES).map((g) => g.id);
    const long = MINIGAMES.filter((g) => lengthClassOf(g) === 'long').map((g) => g.id);
    expect(long).toEqual(['toy-squad', 'toy-tower-tumble', 'toybox-siege']);
    expect(sorted).toEqual([...MINIGAMES.filter((g) => lengthClassOf(g) !== 'long').map((g) => g.id), ...long]);
  });
});

describe('trial groups for the pickers', () => {
  it('splits the catalogue into party and strategy sections, each game in exactly one', () => {
    const sections = GROUP_ORDER.map((g) => inGroup(MINIGAMES, g).map((x) => x.id));
    expect(sections.flat().sort()).toEqual(MINIGAMES.map((g) => g.id).sort());
    expect(sections[1].sort()).toEqual(['toy-squad', 'toy-tower-tumble', 'toybox-siege']);
  });
  it('labels a section with the span of its lengths', () => {
    expect(groupDurationLabel([d(20, 75), d(60, 240)])).toBe('about 1–4 min each');
    expect(groupDurationLabel([])).toBe('');
  });
});
