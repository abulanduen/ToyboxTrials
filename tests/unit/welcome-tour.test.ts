import { describe, expect, it } from 'vitest';
import { STEP_HEIGHT, overlaps } from '../../src/game/collision';
import { GATES_WALK, LEVEL_WALK, isWalkable } from '../../src/game/hubBounds';
import { HUB_SPAWN } from '../../src/game/hubMotion';
import { INTERACTABLES } from '../../src/game/interactables';
import { TOUR_STOPS, arcPoint, cameraLift, ease, flightFrom, flyTime, mascotFlight, tourNext, tourSkip, tourStart, tourStep, type TourState } from '../../src/game/tour';
import { TOUR_LINES } from '../../src/game/voiceLines';
import { GREETER, JUKEBOX, MACHINES, PIPWICK_HOME, greeterSpot, hubColliders, machineStand } from '../../src/scene/layout';

const colliders = hubColliders();
const solid = colliders.filter((c) => c.top > STEP_HEIGHT);

describe('the welcome tour state machine', () => {
  it('starts flying to the first stop, lands, and talks until Next', () => {
    let s = tourStart();
    expect(s).toEqual({ stop: 0, phase: 'fly', t: 0 });
    s = tourStep(s, flyTime(0) / 2);
    expect(s.phase).toBe('fly');
    s = tourStep(s, flyTime(0));
    expect(s).toMatchObject({ stop: 0, phase: 'talk' });
    // nothing advances on its own while Pipwick talks
    for (let i = 0; i < 600; i++) s = tourStep(s, 1 / 30);
    expect(s).toMatchObject({ stop: 0, phase: 'talk' });
  });

  it('Next visits every stop in order, cutting flights short, then ends', () => {
    let s: TourState = tourStart();
    const seen: string[] = [];
    for (let i = 0; i < 100 && s.phase !== 'done'; i++) {
      if (s.phase === 'talk') seen.push(TOUR_STOPS[s.stop].id);
      s = tourNext(s);
    }
    expect(s.phase).toBe('done');
    expect(seen).toEqual(TOUR_STOPS.map((t) => t.id));
    expect(tourNext(s)).toBe(s); // done is final
  });

  it('Skip ends it from anywhere', () => {
    for (const s of [tourStart(), { stop: 3, phase: 'talk' as const, t: 2 }, { stop: 8, phase: 'fly' as const, t: 0.1 }]) expect(tourSkip(s).phase).toBe('done');
    expect(tourStep(tourSkip(tourStart()), 5).phase).toBe('done');
  });

  it('flights take between 1.1 and 3.2 s and longer hops take longer', () => {
    for (let i = 0; i < TOUR_STOPS.length; i++) {
      expect(flyTime(i)).toBeGreaterThanOrEqual(1.1);
      expect(flyTime(i)).toBeLessThanOrEqual(3.2);
    }
    const trials = TOUR_STOPS.findIndex((s) => s.id === 'trials');
    expect(flyTime(trials)).toBeGreaterThan(flyTime(0));
  });

  it('arcs start and end where they should and rise in the middle', () => {
    const a = [0, 5, 0] as const;
    const b = [100, 5, -40] as const;
    expect(arcPoint(a, b, 0, 20)).toEqual([0, 5, 0]);
    const end = arcPoint(a, b, 1, 20);
    expect(end[0]).toBeCloseTo(100, 9);
    expect(end[1]).toBeCloseTo(5, 9);
    expect(end[2]).toBeCloseTo(-40, 9);
    expect(arcPoint(a, b, 0.5, 20)[1]).toBeCloseTo(25, 6);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    let prev = -1;
    for (let k = 0; k <= 1; k += 0.05) {
      expect(ease(k)).toBeGreaterThanOrEqual(prev);
      prev = ease(k);
    }
    expect(cameraLift(a, b)).toBeGreaterThan(20);
    expect(cameraLift(a, a)).toBe(0);
  });

  it('Pipwick flies from home to the first stop, and from each stop to the next', () => {
    expect(flightFrom(0)).toEqual({ x: PIPWICK_HOME.x, z: PIPWICK_HOME.z });
    for (let i = 0; i < TOUR_STOPS.length; i++) {
      const start = mascotFlight(i, 0);
      const from = flightFrom(i);
      expect(start[0]).toBeCloseTo(from.x, 6);
      expect(start[2]).toBeCloseTo(from.z, 6);
      const end = mascotFlight(i, 1);
      expect(end[0]).toBeCloseTo(TOUR_STOPS[i].mascot.x, 6);
      expect(end[2]).toBeCloseTo(TOUR_STOPS[i].mascot.z, 6);
      expect(mascotFlight(i, 0.5)[1]).toBeGreaterThan(2.9); // up in the air, over the props
    }
  });
});

describe('tour stops', () => {
  it('cover the Hub: the Pavilion, the trials, the Workshop and shop, the Scoreboard, the jukebox, the pitch; and end at home', () => {
    const ids = TOUR_STOPS.map((s) => s.id);
    expect(ids).toEqual(['hello', 'pavilion', 'trials', 'workshop', 'shop', 'scoreboard', 'jukebox', 'play', 'bye']);
    expect(ids[0]).toBe('hello');
    expect(ids[ids.length - 1]).toBe('bye');
    const bye = TOUR_STOPS[TOUR_STOPS.length - 1].mascot;
    expect([bye.x, bye.z]).toEqual([PIPWICK_HOME.x, PIPWICK_HOME.z]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STOPS) expect(TOUR_LINES[s.id].length).toBeGreaterThan(20);
  });

  it('Pipwick lands on walkable ground, clear of anything solid (his own home excepted)', () => {
    for (const s of TOUR_STOPS) {
      expect(isWalkable(s.mascot.x, s.mascot.z, 0.8), s.id).toBe(true);
      const hits = solid.filter((c) => c.id !== 'pipwick' && overlaps(c, s.mascot.x, s.mascot.z, 0.9)).map((c) => c.id);
      expect(hits, s.id).toEqual([]);
    }
  });

  it('cameras are up in the air, outside every solid thing, and look at what is being shown', () => {
    for (const s of TOUR_STOPS) {
      const [x, y, z] = s.cam;
      expect(y, s.id).toBeGreaterThan(4);
      for (const c of colliders) if (overlaps(c, x, z, 0.8)) expect(y, `${s.id} camera over ${c.id}`).toBeGreaterThan(c.top + 1);
      const d = Math.hypot(s.look[0] - x, s.look[1] - y, s.look[2] - z);
      expect(d, s.id).toBeGreaterThan(8);
      expect(d, s.id).toBeLessThan(70);
      // Pipwick is in front of the camera and not too far from where it looks
      const toBird = [s.mascot.x - x, 1.5 - y, s.mascot.z - z];
      const toLook = [s.look[0] - x, s.look[1] - y, s.look[2] - z];
      const cos = (toBird[0] * toLook[0] + toBird[1] * toLook[1] + toBird[2] * toLook[2]) / (Math.hypot(...toBird) * Math.hypot(...toLook));
      expect(cos, `${s.id}: Pipwick in view`).toBeGreaterThan(Math.cos((32 * Math.PI) / 180));
    }
  });
});

describe('greeters, Pipwick and the jukebox in the Hub layout', () => {
  it('every machine has a greeter in the arcade, solid, clear of where you stand to play and of the machines', () => {
    const floor = colliders.filter((k) => k.lv === 'floor');
    for (const g of MACHINES) {
      const c = colliders.find((k) => k.id === `${g.id}-greeter`);
      expect(c, g.id).toBeDefined();
      expect(c!.lv, g.id).toBe('floor');
      const p = greeterSpot(g);
      expect(isWalkable(p.x, p.z, GREETER.r, LEVEL_WALK.floor), g.id).toBe(true);
      // not where you stand to play (or on the way there), and touching no machine
      for (const k of [0, 0.5, 1]) {
        const q = machineStand(g, k);
        expect(Math.hypot(q.x - p.x, q.z - p.z), `${g.id} stand`).toBeGreaterThan(GREETER.r + 0.85 + 1);
      }
      expect(floor.filter((k) => k.id !== c!.id && overlaps(k, p.x, p.z, GREETER.r + 0.2)).map((k) => k.id), g.id).toEqual([]);
      // close enough to its machine to read as its greeter
      expect(Math.hypot(p.x - g.x, p.z - g.z), g.id).toBeLessThan(7);
    }
  });

  it('Pipwick waits near spawn but off the approach; his prompt and the jukebox prompt are reachable', () => {
    const d = Math.hypot(PIPWICK_HOME.x - HUB_SPAWN.x, PIPWICK_HOME.z - HUB_SPAWN.z);
    expect(d).toBeGreaterThan(6);
    expect(d).toBeLessThan(14);
    expect(Math.abs(PIPWICK_HOME.x)).toBeGreaterThan(3); // the approach path runs along x = 0
    const pip = INTERACTABLES.find((i) => i.id === 'pipwick')!;
    const juke = INTERACTABLES.find((i) => i.id === 'jukebox')!;
    for (const it of [pip, juke]) {
      expect(isWalkable(it.x, it.z, 0.85), it.id).toBe(true);
      expect(solid.filter((c) => overlaps(c, it.x, it.z, 0.85)).map((c) => c.id), it.id).toEqual([]);
    }
    // at spawn you are not already in Pipwick's range (no prompt the moment you arrive)
    expect(Math.hypot(pip.x - HUB_SPAWN.x, pip.z - HUB_SPAWN.z)).toBeGreaterThan(pip.radius);
    // the jukebox stands on the gates table by the window (the ball games' ground)
    expect(isWalkable(JUKEBOX.x, JUKEBOX.z, 0, [GATES_WALK])).toBe(true);
  });
});
