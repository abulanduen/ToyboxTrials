import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/minigames/toysquad/catalogue';
import { TOY_SPECS } from '../../src/minigames/toysquad/models';
import { EFFECT_SPECS, FX_SHAPES, spellLayout } from '../../src/minigames/toysquad/effects';
import { toyGeometry, toyTriangles } from '../../src/minigames/toysquad/toys';
import { PALETTE, ROOM } from '../../src/game/palette';

const ids = Object.keys(ROSTER);
const unique = (values: string[]) => new Set(values).size;

describe('Toy Squad toy models', () => {
  it('gives every roster unit its own model spec', () => {
    expect(Object.keys(TOY_SPECS).sort()).toEqual(ids.slice().sort());
    expect(unique(ids.map(id => JSON.stringify(TOY_SPECS[id].parts)))).toBe(ids.length);
    // Distinct silhouettes, not recolours: ignoring colour, the part layout is still unique per toy.
    expect(unique(ids.map(id => JSON.stringify(TOY_SPECS[id].parts.map(p => [p.g, p.p, p.s]))))).toBe(ids.length);
  });
  it('keeps every toy inside one board square, standing on its stand, within the phone triangle budget', () => {
    for (const id of ids) {
      const spec = TOY_SPECS[id];
      expect(spec.parts.length, id).toBeGreaterThanOrEqual(8);
      const geometry = toyGeometry(id); geometry.computeBoundingBox(); const box = geometry.boundingBox!;
      expect(box.min.y, id).toBeGreaterThan(-0.05); expect(box.max.y, id).toBeLessThan(3.75);
      expect(Math.max(-box.min.x, box.max.x), id).toBeLessThan(1.75); expect(Math.max(-box.min.z, box.max.z), id).toBeLessThan(1.95);
      expect(toyGeometry(id), id).toBe(geometry); // cached: one geometry per kind, shared by every instance
      expect(geometry.getAttribute('position').count / 3, id).toBe(toyTriangles(id));
      expect(toyTriangles(id), id).toBeLessThan(3600);
      expect((geometry.getAttribute('position').array as Float32Array).every(Number.isFinite), id).toBe(true);
    }
  });
  it('only uses palette tokens or blends of two of them', () => {
    const tokens = [...Object.values(PALETTE), ...Object.values(ROOM).flat()].map(c => c.toUpperCase());
    const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const blend = (hex: string) => tokens.some(a => tokens.some(b => {
      const [x, y, c] = [channels(a), channels(b), channels(hex)];
      // c = x + (y - x) * t for one t in [0, 1] on all three channels (to rounding)
      const ts = [0, 1, 2].filter(i => Math.abs(x[i] - y[i]) > 8).map(i => (c[i] - x[i]) / (y[i] - x[i]));
      return ts.length > 0 && ts.every(t => t >= -0.02 && t <= 1.02 && Math.abs(t - ts[0]) < 0.06)
        && [0, 1, 2].every(i => Math.abs(x[i] - y[i]) > 8 || Math.abs(c[i] - x[i]) <= 9);
    }));
    const used = new Set(ids.flatMap(id => TOY_SPECS[id].parts.map(p => p.c.toUpperCase())));
    for (const colour of used) expect(tokens.includes(colour) || blend(colour), colour).toBe(true);
  });
});

describe('Toy Squad effect specs', () => {
  it('gives every roster unit its own attack and spell look', () => {
    expect(Object.keys(EFFECT_SPECS).sort()).toEqual(ids.slice().sort());
    const look = (o: object) => JSON.stringify({ ...o, label: undefined });
    expect(unique(ids.map(id => look(EFFECT_SPECS[id].attack)))).toBe(ids.length);
    expect(unique(ids.map(id => look(EFFECT_SPECS[id].spell)))).toBe(ids.length);
    expect(unique(ids.map(id => EFFECT_SPECS[id].attack.label))).toBe(ids.length);
    expect(unique(ids.map(id => EFFECT_SPECS[id].spell.label))).toBe(ids.length);
    for (const id of ids) {
      const { attack, spell } = EFFECT_SPECS[id];
      expect(FX_SHAPES, id).toContain(attack.shape); expect(FX_SHAPES, id).toContain(spell.shape);
      expect(attack.count, id).toBeGreaterThanOrEqual(1); expect(attack.count, id).toBeLessThanOrEqual(3);
      // Melee toys strike at close quarters; they never use a long-range flight path.
      if (ROSTER[id].range === 1) expect(['arc', 'bounce', 'spiral', 'zigzag'], id).not.toContain(attack.path);
    }
  });
  it('lays every spell out from its kit, so each one shows where it lands', () => {
    for (const id of ids) {
      const layout = spellLayout(id), effects = ROSTER[id].spell.effects;
      expect(layout.line || layout.blast > 0 || layout.everyEnemy || layout.single || layout.marked || layout.allies, id).toBe(true);
      expect(layout.line, id).toBe(effects.some(f => f.target === 'line'));
      expect(layout.everyEnemy, id).toBe(effects.some(f => f.target === 'allEnemies'));
      expect(layout.blast, id).toBe(Math.max(0, ...effects.filter(f => f.target === 'nearEnemies').map(f => f.radius ?? 1)));
      expect(layout.aura, id).toBe(Math.max(0, ...effects.filter(f => f.target === 'nearAllies').map(f => f.radius ?? 1)));
    }
    expect(spellLayout('quill-quarreller')).toMatchObject({ line: true, blast: 0, single: false });
    expect(spellLayout('bead-bomber')).toMatchObject({ blast: 2, line: false });
    expect(spellLayout('porcelain-panda')).toMatchObject({ allies: true, blast: 0, single: false });
    expect(spellLayout('crownless-king')).toMatchObject({ single: true, marked: true, allies: true, aura: 2 });
  });
});
