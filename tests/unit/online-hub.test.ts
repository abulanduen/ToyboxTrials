/* Online Hub room logic (server/hubRoom.ts, server/hubDirectory.ts), sanitising (server/sanitize.ts) and limits (server/limits.ts). */
import { describe, expect, it } from 'vitest';
import { CLOSE, HubRoom, MOVE_SPEED_TOLERANCE, type Outgoing } from '../../server/hubRoom';
import { HubDirectory } from '../../server/hubDirectory';
import { fallbackName, isBlockedName, sanitizeLook, sanitizeNickname, uniqueName } from '../../server/sanitize';
import { RateLimiter, isOriginAllowed, parseAllowedOrigins } from '../../server/limits';
import { seededRng } from '../../src/minigames/rng';
import { HUB_MAX_SPEED, HUB_MAX_Y, HUB_SPAWN } from '../../src/game/hubMotion';
import { PLAY_BOUNDS } from '../../src/game/collision';
import {
  PRIVATE_ROOM_CAP,
  PRIVATE_ROOM_IDLE_MS,
  PROTOCOL_VERSION,
  PUBLIC_ROOM_CAP,
  RESUME_WINDOW_MS,
  ROOM_CODE_ALPHABET,
  type ClientMsg,
  type HelloMsg,
  type JoinRequest,
  type ServerMsg,
} from '../../src/net/protocol';

const look = { paint: 1, hat: 'thimble', keySkin: 'heart' };
const hello = (name: string, join: JoinRequest, extra: Partial<HelloMsg> = {}): HelloMsg => ({ t: 'hello', v: PROTOCOL_VERSION, name, look, join, ...extra });
const PUB: JoinRequest = { kind: 'public' };
const HOST: JoinRequest = { kind: 'host' };
const byCode = (code: string): JoinRequest => ({ kind: 'code', code });

/** Messages delivered to one connection. */
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.flatMap((o) => (o.kind === 'send' && o.to.includes(conn) ? [o.msg] : []));
const first = <T extends ServerMsg['t']>(out: Outgoing[], conn: string, t: T) => to(out, conn).find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;

function setup(id = 'public-1', seed = 1, opts: { publicCap?: number; privateCap?: number } = {}) {
  const room = new HubRoom({ id, random: seededRng(seed), ...opts });
  let now = 1_000_000;
  const send = (conn: string, msg: ClientMsg) => room.handle(conn, msg, now);
  const advance = (ms: number) => {
    now += ms;
    return room.tick(now);
  };
  return { room, send, advance, at: () => now };
}

describe('room ids', () => {
  it('accepts public-<n> and valid room codes only', () => {
    expect(new HubRoom({ id: 'public-3', random: Math.random }).info()).toMatchObject({ kind: 'public', instance: 3, cap: PUBLIC_ROOM_CAP });
    expect(new HubRoom({ id: 'K7MQX', random: Math.random }).info()).toMatchObject({ kind: 'private', code: 'K7MQX', cap: PRIVATE_ROOM_CAP });
    for (const bad of ['public-0', 'public-99', 'k7mqx', 'K7MQ0', 'ABCDEF', '', '../x']) expect(() => new HubRoom({ id: bad, random: Math.random })).toThrow();
  });
});

describe('public Hub instances', () => {
  it('welcomes a player with a resume token and a spawn on the spawn tile', () => {
    const { room, send } = setup();
    const w = first(send('a', hello('Alpha', PUB)), 'a', 'welcome')!;
    expect(w.room).toMatchObject({ kind: 'public', instance: 1, cap: PUBLIC_ROOM_CAP, code: null });
    expect(w.players.map((p) => p.name)).toEqual(['Alpha']);
    expect(w.resume.length).toBeGreaterThanOrEqual(20);
    expect(Math.hypot(w.spawn.x - HUB_SPAWN.x, w.spawn.z - HUB_SPAWN.z)).toBeLessThan(5);
    expect(room.connectedCount).toBe(1);
  });

  it('tells existing players about a newcomer; the newcomer gets the whole roster', () => {
    const { send } = setup();
    send('a', hello('Alpha', PUB));
    const out = send('b', hello('Bravo', PUB));
    expect(first(out, 'a', 'joined')?.player.name).toBe('Bravo');
    expect(first(out, 'b', 'welcome')?.players.map((p) => p.name)).toEqual(['Alpha', 'Bravo']);
    expect(to(out, 'b').some((m) => m.t === 'joined')).toBe(false);
  });

  it('caps an instance at 24 and refuses the 25th with room_full', () => {
    const { room, send } = setup('public-1', 2);
    for (let i = 0; i < PUBLIC_ROOM_CAP; i++) expect(first(send(`c${i}`, hello(`Player ${i}`, PUB)), `c${i}`, 'welcome')).toBeDefined();
    const out = send('extra', hello('Late', PUB));
    expect(first(out, 'extra', 'error')).toMatchObject({ code: 'room_full', fatal: true });
    expect(out).toContainEqual({ kind: 'close', conn: 'extra', code: CLOSE.joinRefused, reason: 'room_full' });
    expect(room.playerCount).toBe(PUBLIC_ROOM_CAP);
    send('c3', { t: 'leave' });
    expect(first(send('next', hello('Next', PUB)), 'next', 'welcome')).toBeDefined();
  });

  it('a held (dropped) slot still counts toward the cap', () => {
    const { send, room } = setup('public-1', 3, { publicCap: 2 });
    send('a', hello('Alpha', PUB));
    send('b', hello('Bravo', PUB));
    room.disconnect('b', 1_000_001);
    expect(first(send('c', hello('Charlie', PUB)), 'c', 'error')?.code).toBe('room_full');
  });

  it('refuses host/code joins on a public session', () => {
    const { send } = setup();
    expect(first(send('a', hello('Alpha', HOST)), 'a', 'error')?.code).toBe('bad_request');
    expect(first(send('b', hello('Bravo', byCode('K7MQX'))), 'b', 'error')?.code).toBe('bad_request');
  });
});

describe('private rooms', () => {
  it('hosting opens the room; the creator hosts; others join by code', () => {
    const { room, send } = setup('K7MQX');
    expect(room.isOpen).toBe(false);
    const w = first(send('host', hello('Host', HOST)), 'host', 'welcome')!;
    expect(room.isOpen).toBe(true);
    expect(w.room).toMatchObject({ kind: 'private', code: 'K7MQX', cap: PRIVATE_ROOM_CAP, host: w.you });
    const g = first(send('guest', hello('Guest', byCode('K7MQX'))), 'guest', 'welcome')!;
    expect(g.room.host).toBe(w.you);
  });

  it('refuses a code nobody has hosted, a second host, a public join and a full room', () => {
    const { send } = setup('K7MQX', 4, { privateCap: 3 });
    const nope = send('x', hello('X', byCode('K7MQX')));
    expect(first(nope, 'x', 'error')).toMatchObject({ code: 'no_such_room', fatal: true });
    expect(nope).toContainEqual({ kind: 'close', conn: 'x', code: CLOSE.joinRefused, reason: 'no_such_room' });
    send('h', hello('Host', HOST));
    expect(first(send('h2', hello('Host2', HOST)), 'h2', 'error')?.code).toBe('bad_request');
    expect(first(send('p', hello('Pub', PUB)), 'p', 'error')?.code).toBe('bad_request');
    send('g1', hello('G1', byCode('K7MQX')));
    send('g2', hello('G2', byCode('K7MQX')));
    expect(first(send('g3', hello('G3', byCode('K7MQX'))), 'g3', 'error')).toMatchObject({ code: 'room_full', fatal: true });
  });

  it('passes the host role on when the host leaves', () => {
    const { room, send } = setup('K7MQX');
    send('h', hello('Host', HOST));
    const gw = first(send('g', hello('Guest', byCode('K7MQX'))), 'g', 'welcome')!;
    const out = send('h', { t: 'leave' });
    expect(first(out, 'g', 'room')?.room.host).toBe(gw.you);
    expect(room.info().host).toBe(gw.you);
  });

  it('closes once it has had nobody connected for 60 s, not before', () => {
    const { room, send, advance } = setup('K7MQX');
    send('h', hello('Host', HOST));
    send('h', { t: 'leave' });
    expect(room.nextWakeAt()).not.toBeNull();
    advance(PRIVATE_ROOM_IDLE_MS - 1000);
    expect(room.isOpen).toBe(true);
    // Someone joining during the grace period keeps it open.
    send('g', hello('Guest', byCode('K7MQX')));
    expect(room.nextWakeAt()).toBeNull();
    advance(5000);
    send('g', { t: 'leave' });
    advance(PRIVATE_ROOM_IDLE_MS - 1);
    expect(room.isOpen).toBe(true);
    advance(1);
    expect(room.isOpen).toBe(false);
    expect(room.isEmpty).toBe(true);
    expect(first(send('late', hello('Late', byCode('K7MQX'))), 'late', 'error')?.code).toBe('no_such_room');
  });

  it('a dropped (not left) host keeps the room open through the resume window, then it closes 60 s after the drop', () => {
    const { room, send, advance, at } = setup('K7MQX');
    send('h', hello('Host', HOST));
    room.disconnect('h', at());
    advance(RESUME_WINDOW_MS);
    expect(room.playerCount).toBe(0);
    expect(room.isOpen).toBe(true);
    advance(PRIVATE_ROOM_IDLE_MS - RESUME_WINDOW_MS);
    expect(room.isOpen).toBe(false);
  });
});

describe('protocol version', () => {
  it('rejects a mismatched version and closes the socket', () => {
    const { room, send } = setup();
    const out = send('old', hello('Old', PUB, { v: PROTOCOL_VERSION + 1 }));
    expect(first(out, 'old', 'error')).toMatchObject({ code: 'version_mismatch', fatal: true });
    expect(out).toContainEqual(expect.objectContaining({ kind: 'close', conn: 'old', code: CLOSE.versionMismatch }));
    expect(room.playerCount).toBe(0);
  });

  it('answers in-room messages before hello with not_joined, and a second hello with bad_request', () => {
    const { send } = setup();
    expect(first(send('z', { t: 'emote', id: 'wave' }), 'z', 'error')?.code).toBe('not_joined');
    send('a', hello('Alpha', PUB));
    expect(first(send('a', hello('Again', PUB)), 'a', 'error')?.code).toBe('bad_request');
  });
});

describe('leave, disconnect and resume', () => {
  it('leave removes the player at once and tells the room', () => {
    const { room, send } = setup();
    send('a', hello('Alpha', PUB));
    const bw = first(send('b', hello('Bravo', PUB)), 'b', 'welcome')!;
    expect(first(send('b', { t: 'leave' }), 'a', 'left')?.id).toBe(bw.you);
    expect(room.playerCount).toBe(1);
  });

  it('a dropped player keeps their slot and rejoins as the same player with the resume token within 30 s', () => {
    const { room, send, advance, at } = setup('K7MQX');
    const w = first(send('h', hello('Host', HOST)), 'h', 'welcome')!;
    send('g', hello('Guest', byCode('K7MQX')));
    room.disconnect('h', at());
    const snap = advance(1000).find((o) => o.kind === 'send' && o.msg.t === 'snap');
    const held = snap?.kind === 'send' && snap.msg.t === 'snap' ? snap.msg.p.find((p) => p.id === w.you) : undefined;
    expect(held?.off).toBe(1);
    advance(RESUME_WINDOW_MS - 5000);
    const w2 = first(send('h2', hello('Host', byCode('K7MQX'), { resume: w.resume })), 'h2', 'welcome')!;
    expect(w2).toMatchObject({ resumed: true, you: w.you });
    expect(w2.room.host).toBe(w.you);
    expect(room.playerOf('h2')?.off).toBe(0);
    expect(room.playerCount).toBe(2);
  });

  it('after the 30 s window the slot is gone and the old token joins as a new player', () => {
    const { room, send, advance, at } = setup();
    const w = first(send('a', hello('Alpha', PUB)), 'a', 'welcome')!;
    send('b', hello('Bravo', PUB));
    room.disconnect('a', at());
    expect(first(advance(RESUME_WINDOW_MS), 'b', 'left')?.id).toBe(w.you);
    const w2 = first(send('a2', hello('Alpha', PUB, { resume: w.resume })), 'a2', 'welcome')!;
    expect(w2.resumed).toBe(false);
    expect(w2.you).not.toBe(w.you);
  });

  it('a resume while the old socket is still open replaces the old connection', () => {
    const { send } = setup();
    const w = first(send('a', hello('Alpha', PUB)), 'a', 'welcome')!;
    const out = send('a2', hello('Alpha', PUB, { resume: w.resume }));
    expect(first(out, 'a', 'error')?.code).toBe('replaced');
    expect(out).toContainEqual(expect.objectContaining({ kind: 'close', conn: 'a', code: CLOSE.replaced }));
    expect(first(out, 'a2', 'welcome')?.you).toBe(w.you);
  });

  it('tokens are unique per player and unknown tokens are ignored', () => {
    const { send } = setup();
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) tokens.add(first(send(`c${i}`, hello(`P${i}`, PUB)), `c${i}`, 'welcome')!.resume);
    expect(tokens.size).toBe(20);
    expect(first(send('x', hello('X', PUB, { resume: 'not-a-real-token' })), 'x', 'welcome')?.resumed).toBe(false);
  });
});

describe('room directory (server-wide)', () => {
  function dir(seed = 1, opts: { publicCap?: number; privateCap?: number; maxPlayers?: number } = {}) {
    const d = new HubDirectory({ random: seededRng(seed), ...opts });
    let now = 5_000_000;
    return { d, send: (c: string, m: ClientMsg) => d.handle(c, m, now), advance: (ms: number) => d.tick((now += ms)), at: () => now };
  }

  it('fills public instance 1, opens instance 2 when it is full, and reuses freed space', () => {
    const { d, send } = dir(2);
    for (let i = 0; i < PUBLIC_ROOM_CAP; i++) send(`c${i}`, hello(`Player ${i}`, PUB));
    expect(d.roomOf('c0')?.instance).toBe(1);
    expect(first(send('extra', hello('Late', PUB)), 'extra', 'welcome')?.room.instance).toBe(2);
    expect(d.stats()).toMatchObject({ publicRooms: 2, connected: PUBLIC_ROOM_CAP + 1 });
    send('c3', { t: 'leave' });
    expect(first(send('next', hello('Next', PUB)), 'next', 'welcome')?.room.instance).toBe(1);
  });

  it('forgets an empty public instance and reuses its number', () => {
    const { d, send } = dir();
    send('a', hello('Alpha', PUB));
    send('a', { t: 'leave' });
    expect(d.stats().rooms).toBe(0);
    expect(first(send('b', hello('Bravo', PUB)), 'b', 'welcome')?.room.instance).toBe(1);
  });

  it('hosting creates a private room under a fresh unique code; others join by code', () => {
    const { d, send } = dir(3);
    const w = first(send('h', hello('Host', HOST)), 'h', 'welcome')!;
    expect(w.room).toMatchObject({ kind: 'private', host: w.you, cap: PRIVATE_ROOM_CAP });
    expect(w.room.code).toMatch(/^[A-Z2-9]{5}$/);
    for (const ch of w.room.code!) expect(ROOM_CODE_ALPHABET).toContain(ch);
    const code = w.room.code!;
    expect(first(send('g', hello('Guest', byCode(` ${code.slice(0, 2).toLowerCase()}-${code.slice(2)} `))), 'g', 'welcome')?.room.code).toBe(code);
    expect(d.roomOf('g')?.host).toBe(w.you);
    // A public join never lands in a private room.
    expect(first(send('p', hello('Pub', PUB)), 'p', 'welcome')?.room.kind).toBe('public');
  });

  it('never hands out a code that is in use, even when the generator repeats itself', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const d = new HubDirectory({ random: () => seq[i++ % seq.length] });
    const a = first(d.handle('a', hello('Alpha', HOST), 0), 'a', 'welcome')!.room.code;
    const b = first(d.handle('b', hello('Bravo', HOST), 0), 'b', 'welcome')!.room.code;
    expect(a && b && a !== b).toBe(true);
  });

  it('gives many hosted rooms distinct codes', () => {
    const { d, send } = dir(11);
    const codes = new Set<string>();
    for (let i = 0; i < 300; i++) codes.add(first(send(`h${i}`, hello(`Host ${i}`, HOST)), `h${i}`, 'welcome')!.room.code!);
    expect(codes.size).toBe(300);
    expect(d.stats().privateRooms).toBe(300);
  });

  it('refuses unknown codes, full rooms and closed rooms with clear errors', () => {
    const { send, advance } = dir(4, { privateCap: 2 });
    const bad = send('x', hello('X', byCode('ZZZZZ')));
    expect(first(bad, 'x', 'error')).toMatchObject({ code: 'no_such_room', fatal: true });
    expect(bad).toContainEqual({ kind: 'close', conn: 'x', code: CLOSE.joinRefused, reason: 'no_such_room' });
    expect(first(send('y', hello('Y', byCode('O0I1L'))), 'y', 'error')?.code).toBe('no_such_room');
    const code = first(send('h', hello('Host', HOST)), 'h', 'welcome')!.room.code!;
    send('g', hello('Guest', byCode(code)));
    expect(first(send('g2', hello('G2', byCode(code))), 'g2', 'error')?.code).toBe('room_full');
    send('h', { t: 'leave' });
    send('g', { t: 'leave' });
    advance(PRIVATE_ROOM_IDLE_MS);
    expect(first(send('late', hello('Late', byCode(code))), 'late', 'error')?.code).toBe('no_such_room');
  });

  it('routes a resume token back to its room and slot, from any join kind', () => {
    const { d, send, at } = dir(5);
    const w = first(send('h', hello('Host', HOST)), 'h', 'welcome')!;
    d.disconnect('h', at());
    const back = first(send('h2', hello('Host', PUB, { resume: w.resume })), 'h2', 'welcome')!;
    expect(back).toMatchObject({ resumed: true, you: w.you });
    expect(back.room.code).toBe(w.room.code);
  });

  it('a replaced connection is dropped from the directory', () => {
    const { d, send } = dir(6);
    const w = first(send('a', hello('Alpha', PUB)), 'a', 'welcome')!;
    send('a2', hello('Alpha', PUB, { resume: w.resume }));
    expect(d.roomOf('a')).toBeNull();
    expect(first(send('a', { t: 'emote', id: 'wave' }), 'a', 'error')?.code).toBe('not_joined');
    expect(d.roomOf('a2')?.instance).toBe(1);
  });

  it('rejects a mismatched protocol version before any room is touched', () => {
    const { d, send } = dir();
    const out = send('old', hello('Old', PUB, { v: PROTOCOL_VERSION + 1 }));
    expect(first(out, 'old', 'error')?.code).toBe('version_mismatch');
    expect(d.stats().rooms).toBe(0);
  });

  it('turns players away when the server is at capacity', () => {
    const { send } = dir(9, { maxPlayers: 2 });
    send('a', hello('A1', PUB));
    send('b', hello('B1', PUB));
    expect(first(send('c', hello('C1', PUB)), 'c', 'error')?.code).toBe('server_full');
  });

  it('expires held slots with nobody connected, and snapshots each room separately', () => {
    const { d, send, advance, at } = dir(7);
    send('a', hello('Alpha', PUB));
    send('h', hello('Host', HOST));
    const snaps = advance(67).filter((o) => o.kind === 'send' && o.msg.t === 'snap');
    expect(snaps).toHaveLength(2);
    d.disconnect('a', at());
    advance(RESUME_WINDOW_MS);
    expect(d.stats()).toMatchObject({ publicRooms: 0, privateRooms: 1 });
  });
});

describe('snapshots', () => {
  it('sends every player in the room to its connected players on each tick', () => {
    const { send, advance, room } = setup();
    send('a', hello('Alpha', PUB));
    send('b', hello('Bravo', PUB));
    const snaps = advance(67).filter((o) => o.kind === 'send' && o.msg.t === 'snap');
    expect(snaps).toHaveLength(1);
    const s = snaps[0];
    expect(s.kind === 'send' && [...s.to].sort()).toEqual(['a', 'b']);
    expect(s.kind === 'send' && s.msg.t === 'snap' && s.msg.p).toHaveLength(2);
    room.disconnect('a', 0);
    room.disconnect('b', 0);
    expect(advance(67).filter((o) => o.kind === 'send')).toHaveLength(0);
  });
});

describe('movement validation', () => {
  function joined() {
    const s = setup();
    const w = first(s.send('a', hello('Alpha', PUB)), 'a', 'welcome')!;
    return { ...s, start: w.spawn };
  }
  const move = (x: number, z: number, extra: Partial<{ y: number; yaw: number; speed: number; grounded: boolean }> = {}): ClientMsg => ({
    t: 'move',
    x,
    y: extra.y ?? 0,
    z,
    yaw: extra.yaw ?? 0,
    grounded: extra.grounded ?? true,
    speed: extra.speed ?? 9,
  });

  it('accepts normal walking', () => {
    const { room, send, advance, start } = joined();
    let x = start.x;
    for (let i = 0; i < 15; i++) {
      advance(66);
      x += 9 * 0.066;
      send('a', move(x, start.z));
    }
    expect(room.playerOf('a')!.x).toBeCloseTo(x, 1);
    expect(room.playerOf('a')!.clamped).toBe(0);
  });

  it('clamps moves faster than the max speed (boost included) plus tolerance', () => {
    const { room, send, advance, start } = joined();
    advance(100);
    send('a', move(start.x + 30, start.z)); // 300 cm/s
    const p = room.playerOf('a')!;
    const allowed = HUB_MAX_SPEED * MOVE_SPEED_TOLERANCE * 0.1;
    expect(p.x - start.x).toBeLessThanOrEqual(allowed + 0.01);
    expect(p.x - start.x).toBeGreaterThan(allowed * 0.9);
    expect(p.clamped).toBe(1);
  });

  it('lets a boosted sprint through; a teleport only crawls toward its target', () => {
    const { room, send, advance, start } = joined();
    let x = start.x;
    for (let i = 0; i < 10; i++) {
      advance(66);
      x -= HUB_MAX_SPEED * 0.066;
      send('a', move(x, start.z, { speed: HUB_MAX_SPEED }));
    }
    expect(room.playerOf('a')!.clamped).toBe(0);
    for (let i = 0; i < 10; i++) {
      advance(66);
      send('a', move(-40, -30));
    }
    const p = room.playerOf('a')!;
    expect(Math.hypot(p.x - -40, p.z - -30)).toBeGreaterThan(20);
  });

  it('keeps players inside the hub bounds and the height limit', () => {
    const { room, send, advance } = joined();
    for (let i = 0; i < 400; i++) {
      advance(66);
      send('a', move(500, 500, { y: 900 }));
    }
    const p = room.playerOf('a')!;
    expect(p.x).toBeLessThanOrEqual(PLAY_BOUNDS.maxX);
    expect(p.z).toBeLessThanOrEqual(PLAY_BOUNDS.maxZ);
    expect(p.y).toBeLessThanOrEqual(HUB_MAX_Y);
    send('a', move(0, 0, { y: -50 }));
    expect(room.playerOf('a')!.y).toBe(0);
  });

  it('allows the respawn jump back to the spawn point', () => {
    const { room, send, advance, start } = joined();
    for (let i = 0; i < 60; i++) {
      advance(66);
      send('a', move(start.x + (i + 1) * 0.6, start.z - (i + 1) * 0.6));
    }
    advance(66);
    send('a', move(HUB_SPAWN.x, HUB_SPAWN.z));
    expect(room.playerOf('a')!.x).toBeCloseTo(HUB_SPAWN.x);
    expect(room.playerOf('a')!.z).toBeCloseTo(HUB_SPAWN.z);
  });

  it('clamps the reported speed and wraps the facing angle', () => {
    const { room, send, advance, start } = joined();
    advance(66);
    send('a', move(start.x, start.z, { speed: 9999, yaw: 7 }));
    const p = room.playerOf('a')!;
    expect(p.s).toBeLessThanOrEqual(HUB_MAX_SPEED);
    expect(p.r).toBeCloseTo(7 - Math.PI * 2, 2);
  });

  it('reports no walking speed while a player is in a minigame', () => {
    const { room, send, advance, start } = joined();
    advance(66);
    send('a', move(start.x + 0.5, start.z, { speed: 9 }));
    send('a', { t: 'activity', a: 'copycat-conductor' });
    expect(room.playerOf('a')).toMatchObject({ a: 'copycat-conductor', s: 0 });
    send('a', { t: 'activity', a: null });
    expect(room.playerOf('a')!.a).toBeNull();
  });
});

describe('emotes', () => {
  it('broadcasts an emote to the others and shows it in snapshots for about 2 s', () => {
    const { room, send, advance } = setup();
    const aw = first(send('a', hello('Alpha', PUB)), 'a', 'welcome')!;
    send('b', hello('Bravo', PUB));
    const out = send('a', { t: 'emote', id: 'wave' });
    expect(first(out, 'b', 'emote')).toEqual({ t: 'emote', id: aw.you, emote: 'wave' });
    expect(to(out, 'a')).toHaveLength(0);
    advance(1000);
    expect(room.playerOf('a')).toMatchObject({ e: 'wave', es: 1 });
    advance(1000);
    expect(room.playerOf('a')!.e).toBeNull();
  });

  it('rate-limits emotes to one per 1.5 s', () => {
    const { room, send, advance } = setup();
    send('a', hello('Alpha', PUB));
    send('b', hello('Bravo', PUB));
    expect(send('a', { t: 'emote', id: 'cheer' })).toHaveLength(1);
    advance(700);
    expect(send('a', { t: 'emote', id: 'spin' })).toHaveLength(0);
    advance(799);
    expect(send('a', { t: 'emote', id: 'spin' })).toHaveLength(0);
    advance(1);
    expect(send('a', { t: 'emote', id: 'bow' })).toHaveLength(1);
    expect(room.playerOf('a')).toMatchObject({ e: 'bow', es: 2 });
  });
});

describe('cosmetics updates', () => {
  it('validates and broadcasts look changes, at most twice a second', () => {
    const { room, send, advance } = setup();
    send('a', hello('Alpha', PUB));
    send('b', hello('Bravo', PUB));
    const out = send('a', { t: 'look', look: { paint: 3, hat: 'crown-of-lies', keySkin: 'star' } });
    expect(first(out, 'b', 'look')?.look).toEqual({ paint: 3, hat: 'none', keySkin: 'star' });
    expect(send('a', { t: 'look', look: { paint: 2, hat: 'acorn', keySkin: 'golden' } })).toHaveLength(0);
    advance(500);
    expect(send('a', { t: 'look', look: { paint: 2, hat: 'acorn', keySkin: 'golden' } })).toHaveLength(1);
    expect(room.playerOf('a')!.look).toEqual({ paint: 2, hat: 'acorn', keySkin: 'golden' });
  });
});

describe('nickname and cosmetic sanitising', () => {
  const rnd = () => 0.5;
  it('trims, collapses spaces and caps at 16 characters', () => {
    expect(sanitizeNickname('   Ticker   the   Bold  ', rnd)).toBe('Ticker the Bold');
    expect(sanitizeNickname('Abcdefghijklmnopqrstuvwxyz', rnd)).toBe('Abcdefghijklmnop');
    expect(sanitizeNickname('Zoë Ñandú', rnd)).toBe('Zoë Ñandú');
    expect(sanitizeNickname("O'Brien-Smith", rnd)).toBe("O'Brien-Smith");
  });
  it('keeps printable name characters only (no emoji, control or invisible characters)', () => {
    expect(sanitizeNickname('Robo\u0000\u200Bt\u202E\u{1F916}', rnd)).toBe('Robot');
    expect(sanitizeNickname('<b>Hi</b>', rnd)).toBe('bHib');
    // Stacked combining marks ("zalgo") are cut to one mark per letter.
    const zalgo = sanitizeNickname('Ze\u0301\u0302\u0303\u0304\u0305o', rnd);
    expect(zalgo.normalize('NFD').match(/\p{M}/gu)?.length ?? 0).toBeLessThanOrEqual(2);
  });
  it('falls back to "Toy NNN" for short, missing or blocked names', () => {
    expect(sanitizeNickname('A', rnd)).toBe('Toy 550');
    expect(sanitizeNickname('   ', rnd)).toBe('Toy 550');
    expect(sanitizeNickname('\u{1F916}\u{1F916}\u{1F916}', rnd)).toBe('Toy 550');
    expect(sanitizeNickname(42, rnd)).toBe('Toy 550');
    expect(sanitizeNickname('sh1t head', rnd)).toBe('Toy 550');
    expect(sanitizeNickname('F.u_c k', rnd)).toBe('Toy 550');
    expect(isBlockedName('Ticker')).toBe(false);
    expect(fallbackName(() => 0)).toBe('Toy 100');
    expect(fallbackName(() => 0.9999)).toBe('Toy 999');
  });
  it('makes duplicate names in a room unique', () => {
    expect(uniqueName('Ticker', ['ticker'])).toBe('Ticker 2');
    expect(uniqueName('Ticker', ['Ticker', 'Ticker 2'])).toBe('Ticker 3');
    expect(uniqueName('Abcdefghijklmnop', ['abcdefghijklmnop'])).toBe('Abcdefghijklmn 2');
    const { send } = setup();
    send('a', hello('Ticker', PUB));
    expect(first(send('b', hello('Ticker', PUB)), 'b', 'welcome')?.players.map((p) => p.name)).toEqual(['Ticker', 'Ticker 2']);
  });
  it('replaces unknown cosmetic ids with the defaults', () => {
    expect(sanitizeLook({ paint: 2, hat: 'acorn', keySkin: 'golden' })).toEqual({ paint: 2, hat: 'acorn', keySkin: 'golden' });
    expect(sanitizeLook({ paint: 99, hat: 'tophat', keySkin: '__proto__' })).toEqual({ paint: 0, hat: 'none', keySkin: 'classic' });
    expect(sanitizeLook({ paint: 1.5, hat: 'thimble', keySkin: 'heart' })).toEqual({ paint: 0, hat: 'thimble', keySkin: 'heart' });
    expect(sanitizeLook(null)).toEqual({ paint: 0, hat: 'none', keySkin: 'classic' });
  });
});

describe('socket-layer limits', () => {
  it('rate limiter allows a burst, then refills over time', () => {
    const rl = new RateLimiter(5, 10, 0);
    for (let i = 0; i < 5; i++) expect(rl.take(0)).toBe(true);
    expect(rl.take(0)).toBe(false);
    expect(rl.take(100)).toBe(true);
    expect(rl.take(100)).toBe(false);
    expect(rl.dropped).toBe(2);
  });
  it('allows only listed origins (defaults: localhost and the live client)', () => {
    const def = parseAllowedOrigins(undefined);
    expect(isOriginAllowed('http://localhost:5173', def)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:4190', def)).toBe(true);
    expect(isOriginAllowed('https://toybox-trials.vercel.app', def)).toBe(true);
    expect(isOriginAllowed('https://toybox-trials.vercel.app.evil.com', def)).toBe(false);
    expect(isOriginAllowed('https://evil.example', def)).toBe(false);
    expect(isOriginAllowed(undefined, def)).toBe(false);
    const custom = parseAllowedOrigins(' https://play.example.com/ , https://toybox-trials-*.vercel.app ');
    expect(isOriginAllowed('https://play.example.com', custom)).toBe(true);
    expect(isOriginAllowed('https://toybox-trials-git-main.vercel.app', custom)).toBe(true);
    expect(isOriginAllowed('https://toybox-trials-a.b.vercel.app', custom)).toBe(false);
    expect(isOriginAllowed('http://localhost:5173', custom)).toBe(false);
  });
});
