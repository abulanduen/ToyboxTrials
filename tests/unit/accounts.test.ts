/* Optional accounts (server/accounts/): password hashing, username and password rules, sessions
   and their expiry, rate limits, the in-memory store, the API handlers for every endpoint (called
   directly, no network), and the HTTP glue (CORS, body limit) with fake requests. */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRYPT, hashPassword, verifyPassword, type ScryptParams } from '../../server/accounts/passwords';
import { SESSION_MS, MAX_SESSIONS_PER_USER, bearerToken, hashToken, newToken } from '../../server/accounts/sessions';
import { ACCOUNT_LIMITS, KeyedLimiter } from '../../server/accounts/rateLimit';
import { MemoryStore } from '../../server/accounts/store';
import { AccountsApi, type ApiRequest } from '../../server/accounts/api';
import { accountsHttp, clientIp } from '../../server/accounts/http';
import { parseAllowedOrigins } from '../../server/limits';
import { MAX_BODY_BYTES, apiBaseFrom, passwordProblem, usernameProblem, type AuthResponse, type ConflictResponse, type MeResponse, type SaveResponse } from '../../src/net/accountProtocol';
import { defaultProfile, type Profile } from '../../src/game/profile';
import { walletAllowance } from '../../src/game/profileSync';

/** Cheap parameters so the API tests run quickly; the real ones are tested once below. */
const FAST: ScryptParams = { N: 2 ** 10, r: 8, p: 1, keyLength: 32, saltBytes: 16 };
const T0 = Date.UTC(2026, 10, 19, 12);

function setup() {
  const store = new MemoryStore();
  let now = T0;
  const logs: string[] = [];
  const api = new AccountsApi({ store, now: () => now, scrypt: FAST, log: (m) => logs.push(m) });
  const call = (method: string, path: string, body?: unknown, token?: string, ip = '203.0.113.7') =>
    api.handle({ method, path, body, ip, authorization: token ? `Bearer ${token}` : undefined } satisfies ApiRequest);
  const register = async (username = 'Wind_Up', password = 'correct horse') => (await call('POST', '/api/register', { username, password })).body as AuthResponse;
  return { store, api, call, register, logs, advance: (ms: number) => (now += ms), at: () => now };
}
const errorOf = (r: { body: unknown }) => (r.body as { error?: string }).error;
const withCogs = (cogs: number, extra: Partial<Profile> = {}): Profile => ({ ...defaultProfile(), wallet: { cogs, earned: cogs, spent: 0 }, ...extra });

describe('password hashing (scrypt)', () => {
  it('hashes with a per-user salt and verifies; the real cost parameters work', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b); // different salts
    expect(a.startsWith(`scrypt$${DEFAULT_SCRYPT.N}$${DEFAULT_SCRYPT.r}$${DEFAULT_SCRYPT.p}$`)).toBe(true);
    expect(a).not.toContain('correct');
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('correct horse batterY', a)).toBe(false);
  });
  it('stores its parameters, so cheaper or older hashes still verify', async () => {
    const h = await hashPassword('pässwörd-8', FAST);
    expect(h.split('$')[1]).toBe(String(FAST.N));
    expect(await verifyPassword('pässwörd-8', h)).toBe(true);
    // Unicode is normalised (NFC) before hashing: the decomposed spelling matches too.
    expect(await verifyPassword('pässwörd-8', h)).toBe(true);
  });
  it('a malformed or tampered hash never verifies (and never allocates silly memory)', async () => {
    const h = await hashPassword('password123', FAST);
    const parts = h.split('$');
    expect(await verifyPassword('password123', '')).toBe(false);
    expect(await verifyPassword('password123', 'bcrypt$x')).toBe(false);
    expect(await verifyPassword('password123', [parts[0], 2 ** 30, ...parts.slice(2)].join('$'))).toBe(false);
    expect(await verifyPassword('password123', [parts[0], 1000, ...parts.slice(2)].join('$'))).toBe(false); // not a power of two
    expect(await verifyPassword('password123', [...parts.slice(0, 5), 'AAAA'].join('$'))).toBe(false);
  });
});

describe('username and password rules', () => {
  it('usernames: 3–20 letters, digits or underscore', () => {
    for (const ok of ['abc', 'Wind_Up', 'a1_', 'x'.repeat(20)]) expect(usernameProblem(ok)).toBeNull();
    for (const bad of ['ab', 'x'.repeat(21), 'has space', 'dash-name', 'émile', '', 5, null]) expect(usernameProblem(bad)).not.toBeNull();
  });
  it('passwords: 8–128 characters (counted as characters, not bytes)', () => {
    expect(passwordProblem('1234567')).not.toBeNull();
    expect(passwordProblem('12345678')).toBeNull();
    expect(passwordProblem('ü'.repeat(128))).toBeNull();
    expect(passwordProblem('x'.repeat(129))).not.toBeNull();
    expect(passwordProblem(undefined)).not.toBeNull();
  });
  it('the API base follows the online server address', () => {
    expect(apiBaseFrom('wss://hub.example.app')).toBe('https://hub.example.app');
    expect(apiBaseFrom('ws://localhost:2570')).toBe('http://localhost:2570');
    expect(apiBaseFrom(null)).toBeNull();
    expect(apiBaseFrom('nonsense')).toBeNull();
  });
});

describe('session tokens', () => {
  it('are 32 random bytes, stored only as a SHA-256 hash', () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(newToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
  it('are read from a Bearer header only', () => {
    const t = newToken();
    expect(bearerToken(`Bearer ${t}`)).toBe(t);
    expect(bearerToken(`bearer ${t}`)).toBe(t);
    expect(bearerToken(t)).toBeNull();
    expect(bearerToken('Bearer short')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe('rate limiter', () => {
  it('allows a burst per key, then refills over time', () => {
    const l = new KeyedLimiter({ burst: 3, perMinute: 6 });
    expect([1, 2, 3].map(() => l.take('a', 0))).toEqual([true, true, true]);
    expect(l.take('a', 0)).toBe(false);
    expect(l.take('b', 0)).toBe(true); // keys are separate
    expect(l.take('a', 9_000)).toBe(false); // 0.9 of an attempt back
    expect(l.take('a', 10_000)).toBe(true);
  });
  it('allows() checks without using an attempt; prune forgets idle keys', () => {
    const l = new KeyedLimiter({ burst: 1, perMinute: 1 });
    expect(l.allows('x', 0)).toBe(true);
    expect(l.allows('x', 0)).toBe(true);
    l.take('x', 0);
    expect(l.allows('x', 1000)).toBe(false);
    expect(l.size).toBe(1);
    l.prune(120_000);
    expect(l.size).toBe(0);
  });
  it('memory stays bounded under a flood of keys', () => {
    const l = new KeyedLimiter({ burst: 1, perMinute: 1 }, 100);
    for (let i = 0; i < 1000; i++) l.take(`ip:${i}`, 0);
    expect(l.size).toBe(100);
  });
});

describe('in-memory store', () => {
  it('users are unique by lower-cased name and get an empty profile', async () => {
    const s = new MemoryStore();
    const u = await s.createUser({ username: 'Ann', usernameKey: 'ann', passwordHash: 'h', now: 1 });
    expect(u?.username).toBe('Ann');
    expect(await s.createUser({ username: 'ANN', usernameKey: 'ann', passwordHash: 'h', now: 2 })).toBeNull();
    expect((await s.userByName('ann'))?.id).toBe(u!.id);
    expect(await s.profileOf(u!.id)).toEqual({ rev: 0, data: null, updatedAt: 1 });
  });
  it('saves only on the expected rev, and copies data in and out', async () => {
    const s = new MemoryStore();
    const u = (await s.createUser({ username: 'Bo', usernameKey: 'bo', passwordHash: 'h', now: 1 }))!;
    const data = { wallet: { cogs: 5 } };
    expect(await s.saveProfile(u.id, 0, data, 10)).toBe(1);
    data.wallet.cogs = 999;
    expect(((await s.profileOf(u.id))!.data as typeof data).wallet.cogs).toBe(5);
    expect(await s.saveProfile(u.id, 0, data, 11)).toBeNull();
    expect(await s.saveProfile(u.id, 1, data, 12)).toBe(2);
  });
  it('keeps at most N sessions per user, removes expired ones, and deletes everything with the user', async () => {
    const s = new MemoryStore();
    const u = (await s.createUser({ username: 'Cy', usernameKey: 'cy', passwordHash: 'h', now: 1 }))!;
    for (let i = 0; i < 5; i++) await s.createSession({ tokenHash: `h${i}`, userId: u.id, createdAt: i, expiresAt: 100 + i }, 3);
    expect(s.counts().sessions).toBe(3);
    expect(await s.sessionByHash('h0')).toBeNull();
    expect(await s.sessionByHash('h4')).not.toBeNull();
    expect(await s.deleteExpiredSessions(103)).toBe(2);
    expect(await s.deleteUser(u.id)).toBe(true);
    expect(s.counts()).toEqual({ users: 0, sessions: 0, profiles: 0 });
    expect(await s.userByName('cy')).toBeNull();
    expect(await s.deleteUser(u.id)).toBe(false);
  });
});

describe('accounts API', () => {
  it('status says whether accounts are on; without a store everything else is 503', async () => {
    const off = new AccountsApi({ store: null });
    expect(off.state).toBe('off');
    expect((await off.handle({ method: 'GET', path: '/api/status', ip: '1' })).body).toEqual({ accounts: false });
    const r = await off.handle({ method: 'POST', path: '/api/login', body: { username: 'abc', password: 'abcdefgh' }, ip: '1' });
    expect(r.status).toBe(503);
    expect(errorOf(r)).toBe('accounts_off');
    const { api, call } = setup();
    expect((await call('GET', '/api/status')).body).toEqual({ accounts: false }); // not started yet
    expect((await call('GET', '/api/me')).status).toBe(503);
    await api.start();
    expect((await call('GET', '/api/status')).body).toEqual({ accounts: true });
    expect((await call('GET', '/api/nope')).status).toBe(404);
  });

  it('register: creates the account, a session and an empty profile', async () => {
    const { api, call, store, logs } = setup();
    await api.start();
    const r = await call('POST', '/api/register', { username: 'Wind_Up', password: 'correct horse' });
    expect(r.status).toBe(201);
    const body = r.body as AuthResponse;
    expect(body.username).toBe('Wind_Up');
    expect(body.rev).toBe(0);
    expect(body.profile).toBeNull();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.counts()).toEqual({ users: 1, sessions: 1, profiles: 1 });
    // The token is stored only as its hash; the password only as a scrypt hash.
    expect(await store.sessionByHash(hashToken(body.token))).not.toBeNull();
    const user = (await store.userByName('wind_up'))!;
    expect(user.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(user.passwordHash).not.toContain('correct horse');
    // Logs never carry the name, password or token.
    expect(logs.join('\n')).not.toMatch(/Wind_Up|correct horse|203\.0\.113/);
    expect(logs.join('\n')).not.toContain(body.token);
  });

  it('register: rejects bad names, filtered names, short passwords and taken names (case-insensitive)', async () => {
    const { api, call } = setup();
    await api.start();
    expect(errorOf(await call('POST', '/api/register', { username: 'a b', password: 'correct horse' }))).toBe('username_invalid');
    expect(errorOf(await call('POST', '/api/register', { username: 'xx', password: 'correct horse' }))).toBe('username_invalid');
    const filtered = await call('POST', '/api/register', { username: 'sh1t_head', password: 'correct horse' });
    expect(errorOf(filtered)).toBe('username_invalid');
    expect((filtered.body as { message: string }).message).toMatch(/isn't allowed/);
    expect(errorOf(await call('POST', '/api/register', { username: 'Fine_Name', password: 'short' }))).toBe('password_invalid');
    expect(errorOf(await call('POST', '/api/register', {}))).toBe('username_invalid');
    expect((await call('POST', '/api/register', { username: 'Fine_Name', password: 'long enough' })).status).toBe(201);
    const taken = await call('POST', '/api/register', { username: 'fine_name', password: 'long enough' });
    expect(taken.status).toBe(409);
    expect(errorOf(taken)).toBe('username_taken');
  });

  it('login: right password signs in (any letter case of the name); wrong ones get one generic message', async () => {
    const { api, call, register } = setup();
    await api.start();
    await register();
    const good = await call('POST', '/api/login', { username: 'wind_up', password: 'correct horse' });
    expect(good.status).toBe(200);
    expect((good.body as AuthResponse).username).toBe('Wind_Up');
    const wrongPw = await call('POST', '/api/login', { username: 'Wind_Up', password: 'wrong horse' });
    const noUser = await call('POST', '/api/login', { username: 'Nobody_Here', password: 'correct horse' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body); // no hint which part was wrong
    expect((wrongPw.body as { message: string }).message).toBe('Wrong username or password.');
    expect(errorOf(await call('POST', '/api/login', { username: 5 }))).toBe('bad_request');
  });

  it('me, logout: a session works until logout deletes it', async () => {
    const { api, call, register, store } = setup();
    await api.start();
    const { token } = await register();
    const me = await call('GET', '/api/me', undefined, token);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ username: 'Wind_Up', rev: 0, profile: null, savedAt: null } satisfies MeResponse);
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, newToken())).status).toBe(401);
    expect((await call('POST', '/api/logout', undefined, token)).status).toBe(200);
    expect(store.counts().sessions).toBe(0);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(401);
    expect((await call('POST', '/api/logout', undefined, token)).status).toBe(200); // idempotent
  });

  it('sessions expire after 30 days; sweep removes them; each user keeps at most 10', async () => {
    const { api, call, register, store, advance } = setup();
    await api.start();
    const { token } = await register();
    advance(SESSION_MS - 1000);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(200);
    advance(1000);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(401);
    expect(store.counts().sessions).toBe(0); // the expired one was deleted on sight
    for (let i = 0; i < MAX_SESSIONS_PER_USER + 3; i++) {
      advance(1000);
      await call('POST', '/api/login', { username: 'Wind_Up', password: 'correct horse' }, undefined, `198.51.100.${i}`);
    }
    expect(store.counts().sessions).toBe(MAX_SESSIONS_PER_USER);
    advance(SESSION_MS);
    expect(await api.sweep()).toBe(MAX_SESSIONS_PER_USER);
    expect(store.counts().sessions).toBe(0);
  });

  it('save profile: cleaned, revved, and returned by me and by login', async () => {
    const { api, call, register, advance } = setup();
    await api.start();
    const { token } = await register();
    const sent = withCogs(120, { owned: { scarf: { source: 'shop', at: 5 }, bogus: { source: 'shop', at: 1 } } as Profile['owned'] });
    const r = await call('PUT', '/api/profile', { rev: 0, profile: sent }, token);
    expect(r.status).toBe(200);
    const saved = r.body as SaveResponse;
    expect(saved.rev).toBe(1);
    expect(saved.adjusted).toEqual([]);
    expect(Object.keys(saved.profile.owned)).toEqual(['scarf']); // unknown id dropped
    advance(5000);
    const me = (await call('GET', '/api/me', undefined, token)).body as MeResponse;
    expect(me.rev).toBe(1);
    expect(me.profile?.wallet.cogs).toBe(120);
    expect(me.savedAt).toBe(T0);
    const login = (await call('POST', '/api/login', { username: 'Wind_Up', password: 'correct horse' })).body as AuthResponse;
    expect(login.rev).toBe(1);
    expect(login.profile?.owned.scarf).toBeTruthy();
    expect(errorOf(await call('PUT', '/api/profile', { rev: -1, profile: sent }, token))).toBe('bad_request');
    expect(errorOf(await call('PUT', '/api/profile', { rev: 1, profile: 'x' }, token))).toBe('bad_request');
    expect((await call('PUT', '/api/profile', { rev: 1, profile: sent })).status).toBe(401);
  });

  it('save profile: a stale rev is a 409 conflict carrying the server copy', async () => {
    const { api, call, register } = setup();
    await api.start();
    const { token } = await register();
    await call('PUT', '/api/profile', { rev: 0, profile: withCogs(100) }, token); // device A: rev 1
    const r = await call('PUT', '/api/profile', { rev: 0, profile: withCogs(50) }, token); // device B, still on rev 0
    expect(r.status).toBe(409);
    const c = r.body as ConflictResponse;
    expect(c.error).toBe('conflict');
    expect(c.rev).toBe(1);
    expect(c.profile?.wallet.cogs).toBe(100);
    // B merges and saves again on the server's rev.
    const again = await call('PUT', '/api/profile', { rev: c.rev, profile: withCogs(90) }, token);
    expect(again.status).toBe(200);
    expect((again.body as SaveResponse).rev).toBe(2);
  });

  it('save profile: the wallet soft cap lowers an implausible jump and says so', async () => {
    const { api, call, register, advance } = setup();
    await api.start();
    const { token } = await register();
    await call('PUT', '/api/profile', { rev: 0, profile: withCogs(100) }, token);
    advance(60_000);
    const r = (await call('PUT', '/api/profile', { rev: 1, profile: withCogs(1_000_000) }, token)).body as SaveResponse;
    expect(r.adjusted).toEqual(['cogs', 'earned']);
    expect(r.profile.wallet.cogs).toBe(100 + walletAllowance(60_000));
  });

  it('delete account: needs the right password, then removes the user, sessions and profile', async () => {
    const { api, call, register, store } = setup();
    await api.start();
    const { token } = await register();
    await call('PUT', '/api/profile', { rev: 0, profile: withCogs(10) }, token);
    await call('POST', '/api/login', { username: 'Wind_Up', password: 'correct horse' }); // a second device
    expect(store.counts()).toEqual({ users: 1, sessions: 2, profiles: 1 });
    expect((await call('DELETE', '/api/account', { password: 'correct horse' })).status).toBe(401);
    const wrong = await call('DELETE', '/api/account', { password: 'wrong horse' }, token);
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong)).toBe('wrong_credentials');
    expect(errorOf(await call('DELETE', '/api/account', {}, token))).toBe('bad_request');
    expect(store.counts().users).toBe(1);
    const r = await call('DELETE', '/api/account', { password: 'correct horse' }, token);
    expect(r.status).toBe(200);
    expect(store.counts()).toEqual({ users: 0, sessions: 0, profiles: 0 });
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(401);
    expect((await call('POST', '/api/login', { username: 'Wind_Up', password: 'correct horse' })).status).toBe(401);
    // The name is free again.
    expect((await call('POST', '/api/register', { username: 'wind_up', password: 'another one' })).status).toBe(201);
  });

  it('rate limits: repeated failed logins for one username, and logins from one IP', async () => {
    const { api, call, register, advance } = setup();
    await api.start();
    await register();
    // Failures for one username from many addresses: blocked after the burst.
    const codes: number[] = [];
    for (let i = 0; i < ACCOUNT_LIMITS.userFail.burst + 1; i++) codes.push((await call('POST', '/api/login', { username: 'Wind_Up', password: `guess ${i}xx` }, undefined, `192.0.2.${i}`)).status);
    expect(codes.slice(0, ACCOUNT_LIMITS.userFail.burst).every((c) => c === 401)).toBe(true);
    expect(codes[ACCOUNT_LIMITS.userFail.burst]).toBe(429);
    // Even the right password waits until attempts refill.
    expect((await call('POST', '/api/login', { username: 'Wind_Up', password: 'correct horse' }, undefined, '192.0.2.200')).status).toBe(429);
    advance(60_000 / ACCOUNT_LIMITS.userFail.perMinute);
    expect((await call('POST', '/api/login', { username: 'Wind_Up', password: 'correct horse' }, undefined, '192.0.2.200')).status).toBe(200);
    // One address trying many usernames.
    const ipCodes: number[] = [];
    for (let i = 0; i < ACCOUNT_LIMITS.ipLogin.burst + 1; i++) ipCodes.push((await call('POST', '/api/login', { username: `user_${i}`, password: 'whatever1' }, undefined, '198.51.100.99')).status);
    expect(ipCodes[ACCOUNT_LIMITS.ipLogin.burst]).toBe(429);
    expect((await call('POST', '/api/login', { username: 'user_x', password: 'whatever1' }, undefined, '198.51.100.98')).status).toBe(401);
  });

  it('rate limits: account creation per IP', async () => {
    const { api, call } = setup();
    await api.start();
    const codes: number[] = [];
    for (let i = 0; i < ACCOUNT_LIMITS.ipRegister.burst + 1; i++) codes.push((await call('POST', '/api/register', { username: `kid_${i}`, password: 'long enough' })).status);
    expect(codes.filter((c) => c === 201)).toHaveLength(ACCOUNT_LIMITS.ipRegister.burst);
    expect(codes[codes.length - 1]).toBe(429);
  });

  it('a store failure is a 500 with a generic message, logged without details', async () => {
    const { api, call, store, logs } = setup();
    await api.start();
    store.userByName = async () => {
      throw Object.assign(new Error('connection lost to 10.0.0.1 for Wind_Up'), { code: 'ECONNRESET' });
    };
    const r = await call('POST', '/api/login', { username: 'Wind_Up', password: 'correct horse' });
    expect(r.status).toBe(500);
    expect(errorOf(r)).toBe('server_error');
    expect(logs.at(-1)).toBe('accounts: POST /api/login failed (ECONNRESET)');
  });
});

// ---------------------------------------------------------------- HTTP glue with fake requests
function fakeReq(o: { method: string; url: string; headers?: Record<string, string>; body?: string }): IncomingMessage {
  const r = Readable.from(o.body ? [Buffer.from(o.body)] : []) as unknown as IncomingMessage;
  Object.assign(r, { method: o.method, url: o.url, headers: o.headers ?? {}, socket: { remoteAddress: '127.0.0.1' } });
  return r;
}
function fakeRes() {
  const out = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    headersSent: false,
    writeHead(status: number, headers: Record<string, string>) {
      out.status = status;
      out.headers = headers;
      return res;
    },
    end(chunk?: string) {
      out.body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  return { res, out };
}

describe('accounts HTTP layer', () => {
  const origins = parseAllowedOrigins('https://toybox-trials.vercel.app');
  async function run(o: Parameters<typeof fakeReq>[0]) {
    const api = new AccountsApi({ store: new MemoryStore(), scrypt: FAST });
    await api.start();
    const { res, out } = fakeRes();
    const handled = await accountsHttp(api, origins)(fakeReq(o), res);
    return { handled, ...out, json: out.body ? JSON.parse(out.body) : null };
  }

  it('ignores paths outside /api', async () => {
    expect((await run({ method: 'GET', url: '/health' })).handled).toBe(false);
  });
  it('answers CORS preflight for allowed origins only', async () => {
    const ok = await run({ method: 'OPTIONS', url: '/api/me', headers: { origin: 'https://toybox-trials.vercel.app' } });
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('https://toybox-trials.vercel.app');
    expect(ok.headers['access-control-allow-headers']).toContain('authorization');
    const bad = await run({ method: 'OPTIONS', url: '/api/me', headers: { origin: 'https://evil.example' } });
    expect(bad.status).toBe(403);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('parses JSON bodies, refuses bad JSON and oversized bodies', async () => {
    const reg = await run({ method: 'POST', url: '/api/register', headers: { origin: 'https://toybox-trials.vercel.app' }, body: JSON.stringify({ username: 'Http_Test', password: 'long enough' }) });
    expect(reg.status).toBe(201);
    expect(reg.headers['cache-control']).toBe('no-store');
    expect(reg.json.username).toBe('Http_Test');
    expect((await run({ method: 'POST', url: '/api/login', body: '{nope' })).status).toBe(400);
    const big = await run({ method: 'PUT', url: '/api/profile', body: 'x'.repeat(MAX_BODY_BYTES + 1) });
    expect(big.status).toBe(413);
    const declared = await run({ method: 'PUT', url: '/api/profile', headers: { 'content-length': String(10 * MAX_BODY_BYTES) }, body: '{}' });
    expect(declared.status).toBe(413);
  });
  it('rate-limits by the address the proxy appended, not one a client made up', () => {
    const socket = { remoteAddress: '10.0.0.5' } as IncomingMessage['socket'];
    expect(clientIp({ headers: {}, socket })).toBe('10.0.0.5');
    expect(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }, socket })).toBe('203.0.113.9');
  });
});
