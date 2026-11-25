/* Online protocol validation (src/net/protocol.ts) and the pure client helpers (interpolation, config). */
import { describe, expect, it } from 'vitest';
import {
  ACTIVITIES,
  MAX_MESSAGE_BYTES,
  MAX_PUBLIC_INSTANCES,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  encodedSize,
  generateRoomCode,
  normalizeRoomCode,
  parseClientMessage,
  parseServerMessage,
  parseRoomId,
  validateClientMessage,
  validateServerMessage,
} from '../../src/net/protocol';
import { ClockSync, SnapshotBuffer, lerpAngle, type NetSample } from '../../src/net/interp';
import { resolveServerUrl } from '../../src/net/config';
import { MINIGAME_IDS } from '../../src/minigames/ids';
import { MINIGAMES } from '../../src/minigames/registry';
import { seededRng } from '../../src/minigames/rng';

const look = { paint: 0, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };
const J = (v: unknown) => JSON.stringify(v);

describe('client message validation', () => {
  it('accepts every well-formed message type', () => {
    expect(parseClientMessage(J({ t: 'hello', v: PROTOCOL_VERSION, name: 'Ticker', look, join: { kind: 'public' } }))).toMatchObject({ t: 'hello', name: 'Ticker' });
    expect(parseClientMessage(J({ t: 'hello', v: 1, name: 'T', look, join: { kind: 'code', code: 'K7MQX' }, resume: 'abc' }))).toMatchObject({ resume: 'abc' });
    expect(parseClientMessage(J({ t: 'move', x: 1, y: 0, z: 2, yaw: 0.5, grounded: true, speed: 9 }))).toEqual({ t: 'move', x: 1, y: 0, z: 2, yaw: 0.5, grounded: true, speed: 9 });
    expect(parseClientMessage(J({ t: 'emote', id: 'bow' }))).toEqual({ t: 'emote', id: 'bow' });
    expect(parseClientMessage(J({ t: 'activity', a: 'copycat-conductor' }))).toEqual({ t: 'activity', a: 'copycat-conductor' });
    expect(parseClientMessage(J({ t: 'activity', a: null }))).toEqual({ t: 'activity', a: null });
    expect(parseClientMessage(J({ t: 'look', look }))).toEqual({ t: 'look', look });
    expect(parseClientMessage(J({ t: 'leave' }))).toEqual({ t: 'leave' });
  });

  it('parses looks with accessory slots (protocol v2); a missing slot reads as none', () => {
    const full = { paint: 3, hat: 'propeller', keySkin: 'moon', back: 'cape', face: 'monocle', neck: 'scarf' };
    expect(parseClientMessage(J({ t: 'look', look: full }))).toEqual({ t: 'look', look: full });
    expect(parseClientMessage(J({ t: 'look', look: { paint: 0, hat: 'none', keySkin: 'classic' } }))).toEqual({ t: 'look', look });
    expect(parseClientMessage(J({ t: 'look', look: { ...full, back: 7 } }))).toBeNull();
    expect(parseClientMessage(J({ t: 'look', look: { ...full, neck: 'x'.repeat(40) } }))).toBeNull();
    expect(PROTOCOL_VERSION).toBe(8); // v8: rides between the levels; v7: the shared dog; v6: voice chat; v5: chat and Who Am I?; v4: hub play (v3: lobbies and server-run matches)
    expect(ACTIVITIES).toContain('shop');
  });

  it('drops extra fields instead of passing them through', () => {
    expect(parseClientMessage(J({ t: 'emote', id: 'wave', admin: true }))).toEqual({ t: 'emote', id: 'wave' });
  });

  it('rejects malformed input', () => {
    const bad = [
      'not json',
      '[]',
      'null',
      J({}),
      J({ t: 'teleport', x: 0 }),
      J({ t: 'move', x: 1, y: 0, z: 2, yaw: 0, grounded: 'yes', speed: 1 }),
      J({ t: 'move', x: '1', y: 0, z: 2, yaw: 0, grounded: true, speed: 1 }),
      J({ t: 'move', x: 1, y: 0, z: 2, yaw: 0, grounded: true }),
      J({ t: 'emote', id: 'dab' }),
      J({ t: 'activity', a: 'poker' }),
      J({ t: 'hello', v: 1, name: 'x', look, join: { kind: 'vip' } }),
      J({ t: 'hello', v: 1, name: 'x', look: { paint: 'red', hat: 'none', keySkin: 'classic' }, join: { kind: 'public' } }),
      J({ t: 'hello', v: 1, name: 'x'.repeat(65), look, join: { kind: 'public' } }),
    ];
    for (const b of bad) expect(parseClientMessage(b), b).toBeNull();
  });

  it('rejects NaN and infinite numbers (JSON overflow and decoded objects alike)', () => {
    expect(parseClientMessage('{"t":"move","x":1e999,"y":0,"z":0,"yaw":0,"grounded":true,"speed":1}')).toBeNull();
    expect(validateClientMessage({ t: 'move', x: NaN, y: 0, z: 0, yaw: 0, grounded: true, speed: 1 })).toBeNull();
    expect(validateClientMessage({ t: 'move', x: 0, y: 0, z: 0, yaw: Infinity, grounded: true, speed: 1 })).toBeNull();
  });

  it('rejects messages over 2 KB', () => {
    const big = { t: 'hello', v: 1, name: 'Ticker', look, join: { kind: 'public' }, pad: 'x'.repeat(MAX_MESSAGE_BYTES) };
    expect(parseClientMessage(J(big))).toBeNull();
    expect(validateClientMessage(big)).toBeNull();
    expect(encodedSize({ a: 'é' })).toBe(J({ a: 'é' }).length + 1);
  });
});

describe('server message validation', () => {
  it('accepts snapshots and cleans unknown emote/activity values', () => {
    const snap = { t: 'snap', now: 5, p: [{ id: 'p1', x: 1, y: 0, z: 2, r: 0, s: 3, g: 1, e: 'wave', es: 2, a: 'workshop', off: 0 }, { id: 'p2', x: 1, y: 0, z: 2, r: 0, s: 3, g: 0, e: 'dab', es: 0, a: 'nope', off: 1 }] };
    const m = validateServerMessage(snap);
    expect(m?.t === 'snap' && m.p[0]).toMatchObject({ e: 'wave', a: 'workshop', g: 1 });
    expect(m?.t === 'snap' && m.p[1]).toMatchObject({ e: null, a: null, off: 1 });
    expect(parseServerMessage(J(snap))?.t).toBe('snap');
  });
  it('rejects junk and unknown error codes', () => {
    expect(validateServerMessage({ t: 'error', code: 'constructor', message: 'x', fatal: true })).toBeNull();
    expect(validateServerMessage({ t: 'welcome' })).toBeNull();
    expect(validateServerMessage({ type: '__pong' })).toBeNull();
    expect(validateServerMessage({ t: 'error', code: 'room_full', fatal: true })).toMatchObject({ code: 'room_full', message: 'That room is full.' });
  });
});

describe('room codes and room ids', () => {
  it('generates codes from the unambiguous alphabet only', () => {
    const rnd = seededRng(7);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
    for (let i = 0; i < 500; i++) {
      const c = generateRoomCode(rnd);
      expect(c).toMatch(/^[A-Z2-9]{5}$/);
      for (const ch of c) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
    expect(generateRoomCode(() => 0.99999)).toBe('99999');
  });
  it('normalises typed codes and rejects ambiguous characters', () => {
    expect(normalizeRoomCode(' k7-mqx ')).toBe('K7MQX');
    expect(normalizeRoomCode('K7MQ0')).toBeNull();
    expect(normalizeRoomCode('ABCD')).toBeNull();
    expect(normalizeRoomCode(12345)).toBeNull();
  });
  it('parses room ids', () => {
    expect(parseRoomId('public-1')).toEqual({ kind: 'public', instance: 1 });
    expect(parseRoomId(`public-${MAX_PUBLIC_INSTANCES}`)).toEqual({ kind: 'public', instance: MAX_PUBLIC_INSTANCES });
    expect(parseRoomId(`public-${MAX_PUBLIC_INSTANCES + 1}`)).toBeNull();
    expect(parseRoomId('public-01')).toBeNull();
    expect(parseRoomId('K7MQX')).toEqual({ kind: 'private', code: 'K7MQX' });
    expect(parseRoomId('k7mqx')).toBeNull();
  });
  it('lists every minigame as a valid activity', () => {
    expect([...MINIGAME_IDS].sort()).toEqual(MINIGAMES.map((g) => g.id).sort());
    expect(ACTIVITIES).toContain('workshop');
  });
});

describe('snapshot interpolation', () => {
  const s = (t: number, x: number, yaw = 0): NetSample => ({ t, x, y: 0, z: 0, yaw, speed: 5, grounded: true });
  it('blends between the snapshots around the render time', () => {
    const b = new SnapshotBuffer();
    b.push(s(1000, 0));
    b.push(s(1066, 6.6));
    b.push(s(1133, 13.3));
    const out = s(0, 0);
    expect(b.sample(1033, out)!.x).toBeCloseTo(3.3, 1);
    expect(b.sample(1100, out)!.x).toBeCloseTo(6.6 + 6.7 * (34 / 67), 3);
    expect(b.sample(900, out)!.x).toBe(0);
  });
  it('extrapolates briefly past the newest snapshot, then holds', () => {
    const b = new SnapshotBuffer();
    b.push(s(1000, 0));
    b.push(s(1100, 10));
    const out = s(0, 0);
    expect(b.sample(1150, out)!.x).toBeCloseTo(15);
    expect(b.sample(5000, out)!.x).toBeCloseTo(22); // capped at 120 ms ahead
  });
  it('ignores late or duplicate snapshots and turns the short way round', () => {
    const b = new SnapshotBuffer();
    b.push(s(1000, 0));
    b.push(s(900, 50));
    b.push(s(1000, 50));
    expect(b.size).toBe(1);
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 1);
  });
  it('estimates the server clock from the least-delayed snapshot', () => {
    const c = new ClockSync();
    expect(c.serverTime(0)).toBeNull();
    c.update(10_000, 100); // 30 ms late
    c.update(10_100, 170); // 0 ms late → offset grows
    expect(c.serverTime(200)).toBeCloseTo(10_130, 0);
  });
});

describe('online server address', () => {
  it('uses VITE_SERVER_URL when it is set', () => {
    expect(resolveServerUrl({ VITE_SERVER_URL: 'wss://toybox-hub.up.railway.app/' })).toBe('wss://toybox-hub.up.railway.app');
    expect(resolveServerUrl({ VITE_SERVER_URL: 'ws://localhost:2567', DEV: false })).toBe('ws://localhost:2567');
  });
  it('defaults to port 2567 on this machine in development', () => {
    expect(resolveServerUrl({ DEV: true })).toBe('ws://localhost:2567');
    expect(resolveServerUrl({ DEV: true }, '192.168.1.5')).toBe('ws://192.168.1.5:2567');
  });
  it('is switched off in a production build without a URL (or with a bad one)', () => {
    expect(resolveServerUrl({ DEV: false })).toBeNull();
    expect(resolveServerUrl({})).toBeNull();
    expect(resolveServerUrl({ VITE_SERVER_URL: 'https://toybox-hub.up.railway.app' })).toBeNull();
    expect(resolveServerUrl({ VITE_SERVER_URL: '   ' })).toBeNull();
  });
});
