/**
 * The rides between the Hub's levels (src/game/hubRides.ts): the toy car down to the arcade and the
 * lift back up. Their paths must be continuous and timed, keep out of the spawn table's slab, fit
 * through the arcade's way in, set a toy down on walkable ground of the other level, keep clear of
 * the dog's stroll, and the online room must time them (server/hubRoom.ts).
 */
import { describe, expect, it } from 'vitest';
import { CAR, LIFT, RIDES, RIDE_KINDS, RIDE_SEAT, TABLE_FRONT, TRACK_Y, rideAt, ridePose, riderAt } from '../../src/game/hubRides';
import { LEVEL_WALK, LEVEL_Y, clampToWalkable } from '../../src/game/hubBounds';
import { resolve } from '../../src/game/collision';
import { HUB_MOTION } from '../../src/game/hubMotion';
import { ARCADE, TABLE } from '../../src/scene/layout';
import { DOG_PATH, DOG_SPOTS } from '../../src/game/dogRoute';
import { HubRoom, type Outgoing } from '../../server/hubRoom';
import { seededRng } from '../../src/minigames/rng';
import { PROTOCOL_VERSION, type ClientMsg, type HelloMsg, type ServerMsg } from '../../src/net/protocol';

const R = HUB_MOTION.radius;

describe('ride paths', () => {
  it('the table front the rides use is the spawn table’s', () => {
    expect(TABLE_FRONT).toBe(TABLE.maxZ);
  });

  for (const k of RIDE_KINDS) {
    const r = RIDES[k];
    it(`${k}: continuous, with time running forward, a few seconds long`, () => {
      for (let i = 1; i < r.samples.length; i++) {
        const a = r.samples[i - 1];
        const b = r.samples[i];
        expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(1.2);
        expect(b.t).toBeGreaterThan(a.t);
      }
      expect(r.duration).toBeGreaterThan(3);
      expect(r.duration).toBeLessThan(14);
    });

    it(`${k}: boards on walkable, free ground of its level; lands on walkable, free ground of the other`, () => {
      for (const [lv, spot] of [
        [r.from, r.board],
        [r.to, r.land],
      ] as const) {
        const c = clampToWalkable({ x: spot.x, z: spot.z }, R, LEVEL_WALK[lv]);
        expect(Math.hypot(c.x - spot.x, c.z - spot.z)).toBeLessThan(1e-6);
        const p = { x: spot.x, z: spot.z };
        resolve(p, R, LEVEL_Y[lv], lv);
        expect(Math.hypot(p.x - spot.x, p.z - spot.z)).toBeLessThan(1e-6);
      }
      expect(r.from).not.toBe(r.to);
      const start = ridePose(k, 0);
      expect(Math.hypot(start.x - r.board.x, start.z - r.board.z)).toBeLessThan(0.01);
      const end = ridePose(k, r.duration + 5);
      expect(Math.hypot(end.x - r.land.x, end.z - r.land.z)).toBeLessThan(0.01);
      expect(Math.abs(end.y - LEVEL_Y[r.to])).toBeLessThan(2);
    });

    it(`${k}: never inside the spawn table (over its top or under its apron, never through its slab)`, () => {
      for (const s of r.samples) {
        const over = s.x > TABLE.minX && s.x < TABLE.maxX && s.z > TABLE.minZ && s.z < TABLE.maxZ;
        if (over) expect(s.y >= 0 || s.y <= -TABLE.thickness - 0.5).toBe(true);
      }
    });

    it(`${k}: goes through the arcade’s way in (not through its wall)`, () => {
      const { x, halfW } = ARCADE.entrance;
      for (let i = 1; i < r.samples.length; i++) {
        const a = r.samples[i - 1];
        const b = r.samples[i];
        if (a.y > ARCADE.y + 5 || (a.z - ARCADE.wall.maxZ) * (b.z - ARCADE.wall.maxZ) > 0) continue;
        // crossing the front wall's line at floor height: inside the gap, clear of the bricks (platform 5 cm, car 4 cm wide)
        expect(Math.abs(a.x - x)).toBeLessThan(halfW - 3);
      }
    });

    it(`${k}: the rider stands its seat height above the path, along the path's up`, () => {
      const t = r.duration / 2;
      const p = ridePose(k, t);
      const q = riderAt(k, t);
      expect(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)).toBeCloseTo(RIDE_SEAT[k], 5);
    });
  }

  it('the car loops the loop: upside down at its top, then down on the floor and into the arcade', () => {
    const r = RIDES.car;
    const top = r.samples.reduce((a, b) => (b.u[1] < a.u[1] ? b : a));
    expect(top.u[1]).toBeLessThan(-0.99);
    expect(top.y).toBeCloseTo(TRACK_Y + 2 * CAR.loopR, 0);
    expect(r.land.z).toBeLessThan(ARCADE.wall.maxZ);
  });

  it('the lift turns round on its way up: it boards facing out of the arcade and lands facing into the Hub', () => {
    expect(Math.cos(ridePose('lift', 0).yaw)).toBeCloseTo(1, 3);
    expect(Math.cos(RIDES.lift.land.yaw)).toBeCloseTo(-1, 3);
    // it climbs outside the table's edge
    const climb = RIDES.lift.samples.filter((s) => s.y > LEVEL_Y.floor + 2 && s.y < -1);
    expect(Math.min(...climb.map((s) => s.z))).toBeGreaterThan(TABLE_FRONT + 4);
    expect(LIFT.landZ).toBeLessThan(TABLE_FRONT);
  });

  it('the track and the lift keep clear of the dog’s stroll across the rug', () => {
    const route = DOG_PATH.map((id) => DOG_SPOTS[id]);
    const segDist = (px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const k = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(px - (a.x + dx * k), pz - (a.z + dz * k));
    };
    let near = Infinity;
    for (const k of RIDE_KINDS)
      for (const s of RIDES[k].samples) {
        if (s.z <= TABLE_FRONT) continue; // under or on the table: the dog never goes there
        for (let i = 1; i < route.length; i++) {
          // the dog's last steps up to its perch at the table's edge are allowed close to things
          if (DOG_PATH[i] === 'perch' || DOG_PATH[i - 1] === 'perch') continue;
          near = Math.min(near, segDist(s.x, s.z, route[i - 1], route[i]));
        }
      }
    expect(near).toBeGreaterThan(25);
  });

  it('boarding: only within reach of a ride’s spot, on its level', () => {
    expect(rideAt('table', CAR.x, CAR.boardZ + 1)).toBe('car');
    expect(rideAt('floor', CAR.x, CAR.boardZ + 1)).toBe(null);
    expect(rideAt('floor', LIFT.x + 1, LIFT.boardZ)).toBe('lift');
    expect(rideAt('table', 0, 0)).toBe(null);
  });
});

// ------------------------------------------------------------------ the online room

const look = { paint: 1, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };
const hello = (name: string): HelloMsg => ({ t: 'hello', v: PROTOCOL_VERSION, name, look, join: { kind: 'public' } });
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.flatMap((o) => (o.kind === 'send' && o.to.includes(conn) ? [o.msg] : []));
const move = (x: number, y: number, z: number): ClientMsg => ({ t: 'move', x, y, z, yaw: 0, grounded: true, speed: 9 });

function setup() {
  const room = new HubRoom({ id: 'public-1', random: seededRng(4), matchDebug: false });
  let now = 5_000_000;
  const send = (conn: string, msg: ClientMsg) => room.handle(conn, msg, now);
  const walkTo = (conn: string, x: number, y: number, z: number) => {
    for (let i = 0; i < 600; i++) {
      const p = room.playerOf(conn)!;
      if (Math.hypot(p.x - x, p.z - z) < 0.2) return;
      now += 250;
      send(conn, move(x, y, z));
    }
  };
  return { room, send, walkTo, skip: (ms: number) => (now += ms), at: () => now };
}

describe('rides on the server', () => {
  it('rides the car down to the arcade and the lift back up, the server moving the toy all the way', () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    s.send('b', hello('Bravo'));
    s.walkTo('a', CAR.x, 0, CAR.boardZ);
    const ok = to(s.send('a', { t: 'ride', k: 'car' }), 'a');
    expect(ok).toContainEqual({ t: 'ride', k: 'car', ok: true });
    // halfway: wherever the client says it is, the server has it on the ride, and tells the others
    s.skip((RIDES.car.duration / 2) * 1000);
    s.send('a', move(0, 0, 0));
    const mid = riderAt('car', RIDES.car.duration / 2);
    const p = s.room.playerOf('a')!;
    expect(Math.hypot(p.x - mid.x, p.y - mid.y, p.z - mid.z)).toBeLessThan(0.05);
    const snap = to(s.room.tick(s.at()), 'b').find((m) => m.t === 'snap');
    const st = snap && snap.t === 'snap' ? snap.p.find((x) => x.id === p.id) : undefined;
    expect(st?.rd).toBe('car');
    expect(st?.rt).toBeCloseTo(RIDES.car.duration / 2, 2);
    // the end: down on the arcade floor, where its moves now count (and kept there)
    s.skip((RIDES.car.duration / 2) * 1000 + 50);
    s.room.tick(s.at());
    const down = s.room.playerOf('a')!;
    expect(down.y).toBe(LEVEL_Y.floor);
    expect(Math.hypot(down.x - RIDES.car.land.x, down.z - RIDES.car.land.z)).toBeLessThan(0.01);
    expect(down.rd).toBeUndefined();
    s.walkTo('a', LIFT.x, LEVEL_Y.floor, LIFT.boardZ);
    expect(s.room.playerOf('a')!.y).toBe(LEVEL_Y.floor);
    // the lift back up
    expect(to(s.send('a', { t: 'ride', k: 'lift' }), 'a')).toContainEqual({ t: 'ride', k: 'lift', ok: true });
    s.skip(RIDES.lift.duration * 1000 + 50);
    s.send('a', move(RIDES.lift.land.x, 0, RIDES.lift.land.z));
    const up = s.room.playerOf('a')!;
    expect(up.y).toBe(LEVEL_Y.table);
    expect(Math.hypot(up.x - RIDES.lift.land.x, up.z - RIDES.lift.land.z)).toBeLessThan(0.01);
  });

  it('refuses a boarding from too far, from the wrong level, mid-ride, or from a trial', () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    // far from the car (at the spawn point)
    expect(to(s.send('a', { t: 'ride', k: 'car' }), 'a')).toContainEqual({ t: 'ride', k: 'car', ok: false });
    // the lift boards on the floor, not the table
    s.walkTo('a', LIFT.x, 0, LIFT.landZ);
    expect(to(s.send('a', { t: 'ride', k: 'lift' }), 'a')).toContainEqual({ t: 'ride', k: 'lift', ok: false });
    s.walkTo('a', CAR.x, 0, CAR.boardZ);
    s.send('a', { t: 'activity', a: 'minigame' } as ClientMsg);
    expect(to(s.send('a', { t: 'ride', k: 'car' }), 'a')).toContainEqual({ t: 'ride', k: 'car', ok: false });
    s.send('a', { t: 'activity', a: null } as ClientMsg);
    expect(to(s.send('a', { t: 'ride', k: 'car' }), 'a')).toContainEqual({ t: 'ride', k: 'car', ok: true });
    s.skip(500);
    expect(to(s.send('a', { t: 'ride', k: 'car' }), 'a')).toContainEqual({ t: 'ride', k: 'car', ok: false });
    // and it is still on the table level until the ride is over
    s.skip(200);
    s.room.tick(s.at());
    expect(s.room.playerOf('a')!.rd).toBe('car');
  });
});
