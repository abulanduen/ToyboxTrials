/**
 * The shared hub play physics (src/game/hubPlaySim.ts): the marble (football) and the basketball.
 * The online server runs the same code as the authority, so these also pin down online behaviour.
 */
import { describe, expect, it } from 'vitest';
import { isWalkable } from '../../src/game/hubBounds';
import { BALL, BRIDGE_DECK, HOOP, MARBLE, NET, NETS, PITCH_CENTRE, rollFloorAt } from '../../src/game/hubPlay';
import {
  BALL_IDLE_RESET,
  GOAL_PAUSE,
  KICK_REACH,
  STEP,
  createHubPlay,
  dropBall,
  grabBall,
  kickMarble,
  predictThrow,
  solveShot,
  stepHubPlay,
  throwBall,
  yawToHoop,
  type HubPlayState,
  type PlayBody,
  type PlayEvent,
} from '../../src/game/hubPlaySim';

const body = (id: string, x: number, z: number, yaw = 0, y = 0): PlayBody => ({ id, x, y, z, yaw });
function run(s: HubPlayState, seconds: number, bodies: PlayBody[] = [], ev: PlayEvent[] = []) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) stepHubPlay(s, bodies, ev);
  return ev;
}
/** Put the marble somewhere and kick it from just behind, along (dx, dz). */
function kickFrom(s: HubPlayState, x: number, z: number, dx: number, dz: number, p = 1, ev?: PlayEvent[]) {
  s.marble.x = x;
  s.marble.z = z;
  const l = Math.hypot(dx, dz);
  const b = body('p1', x - (dx / l) * 2.2, z - (dz / l) * 2.2, Math.atan2(dx, dz));
  return kickMarble(s, b, dx, dz, p, 0, ev);
}

describe('the shared marble', () => {
  it('starts where the secret always was, rolls about a third of a metre from a full kick and stops', () => {
    const s = createHubPlay();
    expect([s.marble.x, s.marble.z]).toEqual([MARBLE.home.x, MARBLE.home.z]);
    // kick it east along the open green inside the trials table's loop road
    expect(kickFrom(s, -20, -120, 1, 0)).toBe(true);
    run(s, 8);
    expect(s.marble.vx).toBe(0);
    expect(s.marble.vz).toBe(0);
    const d = Math.hypot(s.marble.x + 20, s.marble.z + 120);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(40);
  });

  it('only kicks from within reach, and not backwards through the kicker', () => {
    const s = createHubPlay();
    const m = s.marble;
    expect(kickMarble(s, body('p1', m.x + KICK_REACH + 0.5, m.z), -1, 0, 1)).toBe(false);
    expect(kickMarble(s, body('p1', m.x + KICK_REACH + 0.5, m.z), -1, 0, 1, 1.5)).toBe(true); // the server's slack
    const t = createHubPlay();
    expect(kickMarble(t, body('p1', t.marble.x + 2, t.marble.z), 1, 0, 1)).toBe(false); // marble is behind
    expect(kickMarble(t, body('p1', t.marble.x + 2, t.marble.z), 0, 0, 1)).toBe(false); // no direction
    expect(kickMarble(t, body('p1', t.marble.x + 2, t.marble.z, 0, 6), -1, 0, 1)).toBe(false); // mid-jump, over it
    expect(kickMarble(t, body('p1', t.marble.x + 2, t.marble.z), -1, 0, 1)).toBe(true);
    expect(t.marble.lastTouch).toBe('p1');
  });

  it('bounces off solid props and never leaves walkable ground', () => {
    const s = createHubPlay();
    // straight at the Workshop (west of the marble) at full power, then at the table edge
    kickFrom(s, -20, -6, -1, 0);
    const ev = run(s, 3);
    expect(ev.some((e) => e.k === 'wall')).toBe(true);
    expect(s.marble.x).toBeGreaterThan(-30); // came back off the Workshop
    for (let i = 0; i < 6; i++) {
      kickFrom(s, s.marble.x, s.marble.z, 0.3, 1);
      for (let k = 0; k < 120; k++) {
        stepHubPlay(s, [], []);
        expect(isWalkable(s.marble.x, s.marble.z, MARBLE.r - 1e-6), `${s.marble.x}, ${s.marble.z}`).toBe(true);
      }
    }
  });

  it('bounces off toys standing in its way', () => {
    const s = createHubPlay();
    kickFrom(s, 8, 4, 0, 1);
    const wall = body('p2', 8, 9);
    run(s, 1.5, [wall]);
    expect(s.marble.z).toBeLessThan(9);
    expect(Math.hypot(s.marble.x - wall.x, s.marble.z - wall.z)).toBeGreaterThanOrEqual(MARBLE.r + 0.85 - 1e-6);
  });

  it('rolls up the domino bridge onto the trials table when kicked along it, and the bridge mouth gathers it', () => {
    const s = createHubPlay();
    // a little off the bridge's centre line: the mouth funnels it in
    s.marble.x = BRIDGE_DECK.x + 3.5;
    s.marble.z = -36;
    s.marble.vz = -42;
    let onDeck = false;
    for (let i = 0; i < 60 * 6; i++) {
      stepHubPlay(s, [], []);
      if (rollFloorAt(s.marble.x, s.marble.z) === BRIDGE_DECK.top) onDeck = true;
      if (s.marble.vz > -20 && s.marble.z < -60 && s.marble.z > -100) s.marble.vz = -30; // keep it going (toys walking with it)
    }
    expect(onDeck).toBe(true);
    expect(s.marble.z).toBeLessThan(BRIDGE_DECK.deckB - BRIDGE_DECK.ramp);
    expect(isWalkable(s.marble.x, s.marble.z, MARBLE.r, [{ id: 'gates', minX: -68, maxX: 122, minZ: -164, maxZ: -94, corner: 8 }])).toBe(true);
  });

  it('scores in either net, sits in it, then goes back to the centre spot', () => {
    for (const n of NETS) {
      const s = createHubPlay();
      const ev: PlayEvent[] = [];
      expect(kickFrom(s, n.mouthX + n.dir * 12, n.z + 1, -n.dir, 0, 1, ev)).toBe(true);
      run(s, 1.5, [], ev);
      const goal = ev.find((e) => e.k === 'goal');
      expect(goal, n.id).toMatchObject({ k: 'goal', net: n.id, by: 'p1' });
      const score: [number, number] = [0, 0];
      score[n.scorer] = 1;
      expect(s.score).toEqual(score);
      expect(s.marble.inNet).toBe(n.id);
      // it stays in the net (the back and sides hold it), and can't be kicked meanwhile
      expect((s.marble.x - n.mouthX) * n.dir).toBeLessThan(0);
      expect(kickMarble(s, body('p1', s.marble.x + n.dir * 2, s.marble.z), -n.dir, 0, 1)).toBe(false);
      run(s, GOAL_PAUSE + 0.1);
      expect([s.marble.x, s.marble.z]).toEqual([PITCH_CENTRE.x, PITCH_CENTRE.z]);
      expect(s.marble.inNet).toBeNull();
      expect(ev.filter((e) => e.k === 'goal').length).toBe(1);
    }
  });

  it('a shot wide of the posts is no goal', () => {
    const n = NETS[0];
    const s = createHubPlay();
    kickFrom(s, n.mouthX + 12, n.z + NET.width, -1, 0);
    const ev = run(s, 3);
    expect(ev.some((e) => e.k === 'goal')).toBe(false);
    expect(s.score).toEqual([0, 0]);
  });

  it('is deterministic: the same kicks give the same marble, step for step', () => {
    const a = createHubPlay();
    const b = createHubPlay();
    for (const s of [a, b]) {
      kickFrom(s, 0, 20, 0.7, -1);
      run(s, 2, [body('x', 5, 10)]);
      kickFrom(s, s.marble.x, s.marble.z, -1, -0.2, 0.6);
      run(s, 3);
    }
    expect(a).toEqual(b);
  });
});

describe('the basketball', () => {
  const shooter = (x: number, z: number) => body('p1', x, z, yawToHoop(x, z));

  it('waits on its spot by the hoop, on walkable ground clear of the hoop pole', () => {
    const s = createHubPlay();
    expect([s.ball.x, s.ball.z]).toEqual([BALL.spot.x, BALL.spot.z]);
    expect(isWalkable(BALL.spot.x, BALL.spot.z, 1)).toBe(true);
    run(s, 5);
    expect(s.ball.y).toBeCloseTo(BALL.r, 6);
    expect([s.ball.x, s.ball.z]).toEqual([BALL.spot.x, BALL.spot.z]);
  });

  it('is picked up only in reach and by one toy at a time, and follows its holder', () => {
    const s = createHubPlay();
    expect(grabBall(s, body('p1', BALL.spot.x + 5, BALL.spot.z))).toBe(false);
    expect(grabBall(s, body('p1', BALL.spot.x + 2, BALL.spot.z, -Math.PI / 2))).toBe(true);
    expect(grabBall(s, body('p2', BALL.spot.x, BALL.spot.z))).toBe(false);
    expect(throwBall(s, body('p2', BALL.spot.x, BALL.spot.z), 0, 0.5)).toBe(false); // not the holder
    run(s, 0.5, [body('p1', 60, -120, Math.PI)]);
    expect(Math.hypot(s.ball.x - 60, s.ball.z - (-120 - 0.95))).toBeLessThan(1e-6);
    expect(s.ball.y).toBeGreaterThan(2);
  });

  it('drops from the hands when the holder leaves', () => {
    const s = createHubPlay();
    grabBall(s, body('p1', BALL.spot.x, BALL.spot.z + 2, Math.PI));
    const ev: PlayEvent[] = [];
    run(s, 0.2, [], ev); // p1 is no longer among the toys
    expect(s.ball.holder).toBeNull();
    expect(ev.some((e) => e.k === 'drop')).toBe(true);
    run(s, 2);
    expect(s.ball.y).toBeCloseTo(BALL.r, 3);
    const t = createHubPlay();
    grabBall(t, body('p1', BALL.spot.x, BALL.spot.z + 2, Math.PI));
    dropBall(t, 'p2', null);
    expect(t.ball.holder).toBe('p1'); // only the holder can let go
  });

  it('sinks from close, middle and long range with the right power, and the preview agrees', () => {
    for (const [x, z] of [
      [HOOP.rim.x, HOOP.rim.z + 6],
      [HOOP.rim.x - 6, HOOP.rim.z + 12],
      [HOOP.rim.x + 4, HOOP.rim.z + 22],
    ]) {
      const b = shooter(x, z);
      const p = solveShot(b, b.yaw);
      expect(p, `${x}, ${z}`).not.toBeNull();
      const out = new Float32Array(300);
      expect(predictThrow(b, b.yaw, p!, out, 100).scores).toBe(true);
      const s = createHubPlay();
      grabBall(s, { ...b, x: s.ball.x, z: s.ball.z });
      s.ball.holder = 'p1';
      const ev: PlayEvent[] = [];
      expect(throwBall(s, b, b.yaw, p!, ev)).toBe(true);
      run(s, 3, [], ev);
      expect(ev.find((e) => e.k === 'hoop'), `${x}, ${z}`).toMatchObject({ k: 'hoop', by: 'p1', total: 1 });
      expect(s.hoops).toBe(1);
      // and lands on the floor under the hoop, not stuck in the air
      expect(s.ball.y).toBeLessThan(BALL.r + 0.5);
    }
  });

  it('a throw too weak or too strong misses, bouncing off the floor, the board or the rim', () => {
    const b = shooter(HOOP.rim.x, HOOP.rim.z + 12);
    for (const p of [0, 1]) {
      const s = createHubPlay();
      s.ball.holder = 'p1';
      const ev: PlayEvent[] = [];
      throwBall(s, b, b.yaw, p, ev);
      run(s, 3, [], ev);
      expect(ev.some((e) => e.k === 'hoop'), `power ${p}`).toBe(false);
      expect(ev.some((e) => e.k === 'bounce' || e.k === 'board' || e.k === 'rim'), `power ${p}`).toBe(true);
      expect(isWalkable(s.ball.x, s.ball.z, BALL.r - 1e-6)).toBe(true);
    }
  });

  it('goes back to its spot when left alone', () => {
    const s = createHubPlay();
    const b = shooter(HOOP.rim.x - 10, HOOP.rim.z + 20);
    s.ball.holder = 'p1';
    throwBall(s, { ...b, yaw: Math.PI / 2 }, Math.PI / 2, 0.4); // away from the hoop
    run(s, 4);
    expect(Math.hypot(s.ball.x - BALL.spot.x, s.ball.z - BALL.spot.z)).toBeGreaterThan(2);
    const ev = run(s, BALL_IDLE_RESET + 4);
    expect(ev.some((e) => e.k === 'reset')).toBe(true);
    expect([s.ball.x, s.ball.z]).toEqual([BALL.spot.x, BALL.spot.z]);
  });

  it('is deterministic', () => {
    const go = () => {
      const s = createHubPlay();
      s.ball.holder = 'p1';
      const b = shooter(HOOP.rim.x + 3, HOOP.rim.z + 15);
      throwBall(s, b, b.yaw + 0.1, 0.55);
      run(s, 3);
      return s;
    };
    expect(go()).toEqual(go());
  });
});
