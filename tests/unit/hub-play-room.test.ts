/* The shared marble and basketball in an online Hub room (server/hubRoom.ts) and their wire messages (src/net/protocol.ts). */
import { describe, expect, it } from 'vitest';
import { HubRoom, KICK_COOLDOWN_MS, type Outgoing } from '../../server/hubRoom';
import { seededRng } from '../../src/minigames/rng';
import { BALL, HOOP, MARBLE, NETS, PITCH_CENTRE } from '../../src/game/hubPlay';
import { solveShot, yawToHoop } from '../../src/game/hubPlaySim';
import { PROTOCOL_VERSION, parseClientMessage, parseServerMessage, type ClientMsg, type HelloMsg, type PlayEventWire, type ServerMsg, type SnapMsg } from '../../src/net/protocol';

const look = { paint: 1, hat: 'thimble', keySkin: 'heart', back: 'none', face: 'none', neck: 'none' };
const hello = (name: string): HelloMsg => ({ t: 'hello', v: PROTOCOL_VERSION, name, look, join: { kind: 'public' } });
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.flatMap((o) => (o.kind === 'send' && o.to.includes(conn) ? [o.msg] : []));

function setup(matchDebug = false) {
  const room = new HubRoom({ id: 'public-1', random: seededRng(7), matchDebug });
  let now = 1_000_000;
  const log: Outgoing[] = [];
  const send = (conn: string, msg: ClientMsg) => {
    const out = room.handle(conn, msg, now);
    log.push(...out);
    return out;
  };
  const advance = (ms: number) => {
    let out: Outgoing[] = [];
    // the real server ticks at 15 Hz
    for (let t = 0; t < ms; t += 66) {
      now += Math.min(66, ms - t);
      out = out.concat(room.tick(now));
    }
    log.push(...out);
    return out;
  };
  const snap = (conn: string): SnapMsg => {
    const s = to(advance(66), conn).filter((m): m is SnapMsg => m.t === 'snap');
    return s[s.length - 1];
  };
  const eventsFor = (conn: string): PlayEventWire[] => to(log, conn).flatMap((m) => (m.t === 'play' ? m.e : []));
  /** Walk a player along waypoints within the server's speed limit (moves every 66 ms). */
  const walk = (conn: string, pts: [number, number][], yaw = 0) => {
    let p = room.playerOf(conn)!;
    for (const [x, z] of pts) {
      for (let i = 0; i < 2000; i++) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < 1e-3) break;
        const k = Math.min(1, 1.2 / d);
        send(conn, { t: 'move', x: p.x + (x - p.x) * k, y: 0, z: p.z + (z - p.z) * k, yaw, grounded: true, speed: 14 });
        advance(66);
        p = room.playerOf(conn)!;
      }
    }
    send(conn, { t: 'move', x: p.x, y: 0, z: p.z, yaw, grounded: true, speed: 0 });
    return room.playerOf(conn)!;
  };
  return { room, send, advance, snap, eventsFor, walk, log };
}

/** From spawn over the bridge to the trials table. */
const TO_TRIALS: [number, number][] = [
  [20, 10],
  [24, -40],
  [24, -110],
];

describe('the shared marble in a Hub room', () => {
  it('every snapshot carries the marble, the ball, the score and the baskets', () => {
    const { send, snap } = setup();
    send('a', hello('Alpha'));
    const s = snap('a');
    expect(s.hp).toEqual({ m: [MARBLE.home.x, MARBLE.home.z, 0, 0], n: 0, b: [BALL.spot.x, BALL.r, BALL.spot.z, 0, 0, 0], h: null, s: [0, 0], k: 0 });
  });

  it('a kick from within reach moves it for everyone; one from afar, too soon, or from inside a trial does not', () => {
    const { room, send, advance, snap, eventsFor, walk } = setup();
    send('a', hello('Alpha'));
    send('b', hello('Bravo'));
    // too far (at spawn)
    send('a', { t: 'kick', dx: 0, dz: -1, p: 1 });
    advance(200);
    expect(room.hubPlay.marble.vx).toBe(0);
    expect(eventsFor('b').some((e) => e.k === 'kick')).toBe(false);
    // walk up behind it (east of it) and kick it west
    const p = walk('a', [[MARBLE.home.x + 2.2, MARBLE.home.z]], -Math.PI / 2);
    expect(Math.hypot(p.x - MARBLE.home.x - 2.2, p.z - MARBLE.home.z)).toBeLessThan(0.01);
    send('a', { t: 'kick', dx: -1, dz: 0, p: 1 });
    send('a', { t: 'kick', dx: -1, dz: 0, p: 1 }); // within KICK_COOLDOWN_MS: dropped
    const s = snap('b');
    expect(s.hp!.m[2]).toBeLessThan(-20);
    expect(eventsFor('b').filter((e) => e.k === 'kick')).toEqual([{ k: 'kick', by: p.id, p: 1 }]);
    advance(KICK_COOLDOWN_MS);
    advance(3000);
    expect(snap('b').hp!.m[0]).toBeLessThan(MARBLE.home.x - 5);
    // in a trial: no kicking
    const q = walk('a', [[room.hubPlay.marble.x + 2.2, room.hubPlay.marble.z]], -Math.PI / 2);
    send('a', { t: 'activity', a: 'copycat-conductor' });
    const before = eventsFor('b').length;
    send('a', { t: 'kick', dx: -1, dz: 0, p: 1 });
    advance(200);
    expect(eventsFor('b').length).toBe(before);
    expect(q.a).toBeNull();
  });

  it('bounces off the toys standing where the server has them', () => {
    const { room, send, advance, walk } = setup();
    send('a', hello('Alpha'));
    send('b', hello('Bravo'));
    walk('b', [[MARBLE.home.x - 8, MARBLE.home.z]]);
    walk('a', [[MARBLE.home.x + 2.2, MARBLE.home.z]], -Math.PI / 2);
    send('a', { t: 'kick', dx: -1, dz: 0, p: 1 });
    advance(1500);
    const m = room.hubPlay.marble;
    expect(m.x).toBeGreaterThan(MARBLE.home.x - 8);
    expect(Math.hypot(m.x - (MARBLE.home.x - 8), m.z - MARBLE.home.z)).toBeGreaterThanOrEqual(MARBLE.r + 0.85 - 1e-6);
  });

  it('a goal (on a test server the marble can be placed) scores for that end and goes back to the centre', () => {
    const { room, send, advance, snap, eventsFor, walk } = setup(true);
    send('a', hello('Alpha'));
    const east = NETS.find((n) => n.id === 'e')!;
    walk('a', [...TO_TRIALS, [east.mouthX - 14, east.z]], Math.PI / 2);
    send('a', { t: 'hpdebug', x: east.mouthX - 11.8, z: east.z });
    advance(100);
    const id = room.playerOf('a')!.id;
    send('a', { t: 'kick', dx: 1, dz: 0, p: 1 });
    advance(1500);
    expect(eventsFor('a').find((e) => e.k === 'goal')).toEqual({ k: 'goal', net: 'e', by: id, score: [1, 0] });
    expect(snap('a').hp!.s).toEqual([1, 0]);
    advance(2000);
    expect(snap('a').hp!.m.slice(0, 2)).toEqual([PITCH_CENTRE.x, PITCH_CENTRE.z]);
  });

  it('hpdebug is ignored on a real server', () => {
    const { room, send, advance } = setup(false);
    send('a', hello('Alpha'));
    send('a', { t: 'hpdebug', x: 0, z: 20 });
    advance(100);
    expect([room.hubPlay.marble.x, room.hubPlay.marble.z]).toEqual([MARBLE.home.x, MARBLE.home.z]);
  });
});

describe('the shared basketball in a Hub room', () => {
  it('is picked up by one toy in reach; others see who holds it; only the holder throws; a basket counts for everyone', () => {
    const { room, send, advance, snap, eventsFor, walk } = setup();
    send('a', hello('Alpha'));
    send('b', hello('Bravo'));
    // out of reach
    send('a', { t: 'ball', a: 'grab' });
    advance(200);
    expect(room.hubPlay.ball.holder).toBeNull();
    const shotAt = { x: HOOP.rim.x - 4, z: HOOP.rim.z + 13 };
    walk('a', [...TO_TRIALS, [BALL.spot.x, BALL.spot.z + 2]], Math.PI);
    walk('b', [...TO_TRIALS, [BALL.spot.x + 2, BALL.spot.z + 1]], -Math.PI / 2);
    const aId = room.playerOf('a')!.id;
    send('a', { t: 'ball', a: 'grab' });
    send('b', { t: 'ball', a: 'grab' });
    expect(snap('b').hp!.h).toBe(aId);
    send('b', { t: 'ball', a: 'throw', yaw: 0, p: 1 }); // not the holder
    advance(200);
    expect(room.hubPlay.ball.holder).toBe(aId);
    // to the shooting spot, facing the hoop: the ball follows
    const yaw = yawToHoop(shotAt.x, shotAt.z);
    const p = walk('a', [[shotAt.x, shotAt.z]], yaw);
    const power = solveShot({ id: aId, x: p.x, y: 0, z: p.z, yaw }, yaw)!;
    expect(power).not.toBeNull();
    send('a', { t: 'ball', a: 'throw', yaw, p: power });
    expect(room.hubPlay.ball.holder).toBeNull();
    advance(2500);
    expect(eventsFor('b').find((e) => e.k === 'hoop')).toEqual({ k: 'hoop', by: aId, total: 1 });
    expect(snap('b').hp!.k).toBe(1);
    expect(eventsFor('b').map((e) => e.k)).toEqual(expect.arrayContaining(['grab', 'throw', 'hoop']));
  });

  it('drops from the hands of a holder who disconnects, leaves, or goes into a trial', () => {
    for (const how of ['disconnect', 'leave', 'activity'] as const) {
      const { room, send, advance, snap, eventsFor, walk } = setup();
      send('a', hello('Alpha'));
      send('b', hello('Bravo'));
      walk('a', [...TO_TRIALS, [BALL.spot.x, BALL.spot.z + 2]], Math.PI);
      send('a', { t: 'ball', a: 'grab' });
      advance(100);
      const id = room.playerOf('a')!.id;
      expect(room.hubPlay.ball.holder).toBe(id);
      if (how === 'disconnect') room.disconnect('a', 1_000_000 + 1e9);
      if (how === 'leave') send('a', { t: 'leave' });
      if (how === 'activity') send('a', { t: 'activity', a: 'toy-squad' });
      expect(room.hubPlay.ball.holder, how).toBeNull();
      advance(1500);
      expect(snap('b').hp!.h).toBeNull();
      expect(eventsFor('b').some((e) => e.k === 'drop' && e.by === id), how).toBe(true);
      expect(room.hubPlay.ball.y).toBeCloseTo(BALL.r, 3);
    }
  });
});

describe('hub play wire messages', () => {
  const J = JSON.stringify;
  it('client → server: kick, ball and the test-only hpdebug are checked', () => {
    expect(parseClientMessage(J({ t: 'kick', dx: 0.6, dz: -0.8, p: 0.45 }))).toEqual({ t: 'kick', dx: 0.6, dz: -0.8, p: 0.45 });
    for (const bad of [{ t: 'kick', dx: 'a', dz: 0, p: 1 }, { t: 'kick', dx: 0, dz: 0, p: 2 }, { t: 'kick', dx: 1e9, dz: 0, p: 1 }, { t: 'kick', dx: 0, dz: 1 }]) expect(parseClientMessage(J(bad))).toBeNull();
    expect(parseClientMessage(J({ t: 'ball', a: 'grab', extra: 1 }))).toEqual({ t: 'ball', a: 'grab' });
    expect(parseClientMessage(J({ t: 'ball', a: 'throw', yaw: 1.2, p: 0.5 }))).toEqual({ t: 'ball', a: 'throw', yaw: 1.2, p: 0.5 });
    for (const bad of [{ t: 'ball', a: 'throw', yaw: 1.2 }, { t: 'ball', a: 'throw', yaw: 99, p: 0.5 }, { t: 'ball', a: 'steal' }, { t: 'ball', a: 'throw', yaw: 0, p: -0.1 }]) expect(parseClientMessage(J(bad))).toBeNull();
    expect(parseClientMessage(J({ t: 'hpdebug', x: 1, z: 2 }))).toEqual({ t: 'hpdebug', x: 1, z: 2 });
    expect(parseClientMessage('{"t":"hpdebug","x":1e999,"z":2}')).toBeNull();
  });

  it('server → client: snapshots keep a well-formed hp and drop a bad one; play events keep known kinds only', () => {
    const hp = { m: [1, 2, 3, 4], n: 1, b: [1, 2, 3, 4, 5, 6], h: 'p1', s: [2, 3], k: 4 };
    expect(parseServerMessage(J({ t: 'snap', now: 5, p: [], hp }))).toEqual({ t: 'snap', now: 5, p: [], hp });
    expect(parseServerMessage(J({ t: 'snap', now: 5, p: [], hp: { ...hp, b: [1, 2] } }))).toEqual({ t: 'snap', now: 5, p: [] });
    expect(parseServerMessage(J({ t: 'snap', now: 5, p: [], hp: { ...hp, h: '<script>' } }))).toEqual({ t: 'snap', now: 5, p: [], hp: { ...hp, h: null } });
    const e = [{ k: 'goal', net: 'w', by: 'p2', score: [0, 1] }, { k: 'nope' }, { k: 'hoop', by: null, total: 3 }, { k: 'bounce', v: 12 }, 'x'];
    expect(parseServerMessage(J({ t: 'play', e }))).toEqual({ t: 'play', e: [{ k: 'goal', net: 'w', by: 'p2', score: [0, 1] }, { k: 'hoop', by: null, total: 3 }, { k: 'bounce', v: 12 }] });
  });
});
