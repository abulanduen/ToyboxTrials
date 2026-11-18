import { describe, expect, it } from 'vitest';
import {
  NO_INPUT,
  TOY_TUNING,
  createMover,
  groundAt,
  latchInput,
  moverSpeed,
  sanitizeInput,
  stepMover,
  type MoveInput,
  type MoveWorld,
  type Solid,
} from '../../src/minigames/shared/movement';

const DT = 1000 / 60;
const open: MoveWorld = { solids: [] };
const fwd: MoveInput = { ax: 0, ay: 1, run: true, jump: false };
const run = (m: ReturnType<typeof createMover>, input: MoveInput, steps: number, world = open) => {
  for (let i = 0; i < steps; i++) stepMover(m, input, DT, world);
};

describe('shared movement core', () => {
  it('forward is −z; reaches run speed and never exceeds it', () => {
    const m = createMover(0, 0);
    run(m, fwd, 60);
    expect(m.z).toBeLessThan(-10);
    expect(m.x).toBe(0);
    expect(moverSpeed(m)).toBeCloseTo(TOY_TUNING.run, 5);
    run(m, { ...fwd, run: false }, 60);
    expect(moverSpeed(m)).toBeCloseTo(TOY_TUNING.walk, 5);
  });

  it('brakes to an exact stop in about a quarter of a second', () => {
    const m = createMover(0, 0);
    run(m, fwd, 60);
    let steps = 0;
    while (moverSpeed(m) > 0 && steps < 200) {
      stepMover(m, NO_INPUT, DT, open);
      steps++;
    }
    expect(moverSpeed(m)).toBe(0);
    expect(steps * DT).toBeGreaterThan(200);
    expect(steps * DT).toBeLessThan(320);
    const z = m.z;
    run(m, NO_INPUT, 30);
    expect(m.z).toBe(z);
  });

  it('is deterministic: same inputs → identical state', () => {
    const script = (i: number): MoveInput => ({ ax: Math.sin(i * 0.1), ay: Math.cos(i * 0.07), run: i % 50 < 30, jump: i % 45 === 0 });
    const world: MoveWorld = { solids: [{ kind: 'box', x: 2, z: -6, hx: 2, hz: 1, rot: 0.4, top: 3 }], bounds: { minX: -10, maxX: 10, minZ: -20, maxZ: 5 } };
    const a = createMover(0, 0);
    const b = createMover(0, 0);
    for (let i = 0; i < 600; i++) {
      stepMover(a, sanitizeInput(script(i)), DT, world);
      stepMover(b, sanitizeInput(script(i)), DT, world);
    }
    expect(a).toEqual(b);
  });

  it('walls block, bounds clamp, and the toy slides along a wall', () => {
    const wall: Solid = { kind: 'box', id: 'wall', x: 0, z: -5, hx: 40, hz: 0.5, rot: 0, top: 4 };
    const m = createMover(0, 0);
    let hit: string | null = null;
    for (let i = 0; i < 120; i++) hit = stepMover(m, { ax: 0.6, ay: 0.8, run: true, jump: false }, DT, { solids: [wall] }).hit ?? hit;
    expect(hit).toBe('wall');
    expect(m.z).toBeGreaterThanOrEqual(-4.5 + TOY_TUNING.radius - 1e-6);
    expect(m.x).toBeGreaterThan(5); // slid sideways
    const c = createMover(0, 0);
    run(c, fwd, 300, { solids: [], bounds: { minX: -3, maxX: 3, minZ: -8, maxZ: 3 } });
    expect(c.z).toBeCloseTo(-8 + TOY_TUNING.radius, 6);
    const post: Solid = { kind: 'circle', x: 0, z: -4, r: 1, top: 5 };
    const p = createMover(0.2, 0);
    run(p, fwd, 200, { solids: [post] });
    expect(Math.hypot(p.x, p.z + 4)).toBeGreaterThanOrEqual(1 + TOY_TUNING.radius - 1e-6);
    expect(p.z).toBeLessThan(-6); // went round it
  });

  it('jumps about 2.4 cm high, lands, and can hop onto a low block', () => {
    const m = createMover(0, 0);
    const first = stepMover(m, { ...NO_INPUT, jump: true }, DT, open);
    expect(first.jumped).toBe(true);
    let peak = 0;
    let landed = 0;
    for (let i = 0; i < 120 && !landed; i++) {
      landed = stepMover(m, NO_INPUT, DT, open).landed;
      peak = Math.max(peak, m.y);
    }
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThan(2.8);
    expect(landed).toBeGreaterThan(0);
    expect(m.grounded).toBe(true);
    // A 1.5 cm block: a wall on foot, a platform from a jump.
    const block: Solid = { kind: 'box', id: 'block', x: 0, z: -9, hx: 2, hz: 6, rot: 0, top: 1.5 };
    const w = createMover(0, 0);
    run(w, fwd, 120, { solids: [block] });
    expect(w.z).toBeGreaterThan(-2.2);
    const j = createMover(0, 0);
    run(j, fwd, 6, { solids: [block] });
    stepMover(j, { ...fwd, jump: true }, DT, { solids: [block] });
    run(j, fwd, 40, { solids: [block] });
    expect(j.y).toBeCloseTo(1.5, 5);
    expect(groundAt([block], j.x, j.z, TOY_TUNING.radius, j.y)).toBe(1.5);
    run(j, fwd, 60, { solids: [block] }); // walks off the far edge and drops
    expect(j.y).toBe(0);
  });

  it('sanitises wire input and latches it between samples', () => {
    expect(sanitizeInput({ ax: 3, ay: 4 })).toEqual({ ax: 0.6, ay: 0.8, run: false, jump: false });
    expect(sanitizeInput({ ax: NaN, ay: Infinity, run: true })).toEqual({ ax: 0, ay: 0, run: true, jump: false });
    expect(sanitizeInput(undefined)).toEqual(NO_INPUT);
    const held = latchInput(NO_INPUT, [{ ax: 1, ay: 0, run: true, jump: true }, { ax: 0, ay: 1, run: true, jump: false }]);
    expect(held).toEqual({ ax: 0, ay: 1, run: true, jump: true }); // newest axis, jump not lost
    const next = latchInput(held, undefined);
    expect(next).toEqual({ ax: 0, ay: 1, run: true, jump: false }); // axis held, jump fires once
    expect(latchInput(next, [])).toBe(next);
  });
});
