/* The PostgreSQL account store (server/accounts/pgStore.ts) against a real database. Skipped unless
   TEST_DATABASE_URL points at a throwaway database (its account tables are dropped first):
     TEST_DATABASE_URL=postgres://user:pass@localhost:5432/toybox npx vitest run tests/unit/accounts-pg.test.ts */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgStore } from '../../server/accounts/pgStore';
import { AccountsApi } from '../../server/accounts/api';
import type { AuthResponse, ConflictResponse, MeResponse, SaveResponse } from '../../src/net/accountProtocol';
import { defaultProfile } from '../../src/game/profile';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)('PostgreSQL account store', () => {
  let store: PgStore;
  beforeAll(async () => {
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    await c.query('DROP TABLE IF EXISTS leaderboard_results, sessions, profiles, users, schema_migrations');
    await c.end();
    store = new PgStore(URL!);
    await store.init();
    await store.init(); // idempotent: a restart doesn't re-run migrations
  });
  afterAll(async () => {
    await store?.close();
  });

  it('creates the tables and records the migration once', async () => {
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    const tables = (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")).rows.map((r) => r.table_name);
    const versions = (await c.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version);
    await c.end();
    expect(tables).toEqual(expect.arrayContaining(['leaderboard_results', 'profiles', 'schema_migrations', 'sessions', 'users']));
    expect(versions).toEqual([1, 2]);
  });

  it('users, sessions, profiles with rev checks, and delete cascading', async () => {
    const u = (await store.createUser({ username: 'Pg_User', usernameKey: 'pg_user', passwordHash: 'scrypt$x', now: 1_700_000_000_000 }))!;
    expect(u.username).toBe('Pg_User');
    expect(u.createdAt).toBe(1_700_000_000_000);
    expect(await store.createUser({ username: 'PG_USER', usernameKey: 'pg_user', passwordHash: 'h', now: 1 })).toBeNull();
    expect((await store.userByName('pg_user'))?.id).toBe(u.id);
    expect(await store.profileOf(u.id)).toMatchObject({ rev: 0, data: null });

    for (let i = 0; i < 4; i++) await store.createSession({ tokenHash: `pg-h${i}`, userId: u.id, createdAt: 1_700_000_000_000 + i, expiresAt: 1_700_000_100_000 + i }, 3);
    expect(await store.sessionByHash('pg-h0')).toBeNull();
    expect((await store.sessionByHash('pg-h3'))?.expiresAt).toBe(1_700_000_100_003);
    expect(await store.deleteExpiredSessions(1_700_000_100_002)).toBe(2);

    const p = { ...defaultProfile(), wallet: { cogs: 42, earned: 42, spent: 0 } };
    expect(await store.saveProfile(u.id, 0, p, 1_700_000_000_500)).toBe(1);
    expect(await store.saveProfile(u.id, 0, p, 1_700_000_000_600)).toBeNull();
    const rec = (await store.profileOf(u.id))!;
    expect(rec.rev).toBe(1);
    expect(rec.data).toEqual(p);
    expect(rec.updatedAt).toBe(1_700_000_000_500);

    expect(await store.deleteUser(u.id)).toBe(true);
    expect(await store.userByName('pg_user')).toBeNull();
    expect(await store.profileOf(u.id)).toBeNull();
    expect(await store.sessionByHash('pg-h3')).toBeNull();
  });

  it('the whole API flow on Postgres: register, save, conflict, login, delete', async () => {
    let now = Date.UTC(2026, 10, 19, 12);
    const api = new AccountsApi({ store, now: () => now, scrypt: { N: 2 ** 10, r: 8, p: 1, keyLength: 32, saltBytes: 16 } });
    await api.start();
    const call = (method: string, path: string, body?: unknown, token?: string) => api.handle({ method, path, body, ip: '127.0.0.1', authorization: token ? `Bearer ${token}` : undefined });
    const reg = (await call('POST', '/api/register', { username: 'Pg_Flow', password: 'long enough' })).body as AuthResponse;
    expect(reg.rev).toBe(0);
    const saved = (await call('PUT', '/api/profile', { rev: 0, profile: { ...defaultProfile(), wallet: { cogs: 60, earned: 60, spent: 0 } } }, reg.token)).body as SaveResponse;
    expect(saved.rev).toBe(1);
    const conflict = await call('PUT', '/api/profile', { rev: 0, profile: defaultProfile() }, reg.token);
    expect(conflict.status).toBe(409);
    expect((conflict.body as ConflictResponse).profile?.wallet.cogs).toBe(60);
    now += 1000;
    const login = (await call('POST', '/api/login', { username: 'pg_flow', password: 'long enough' })).body as AuthResponse;
    expect(login.rev).toBe(1);
    expect(((await call('GET', '/api/me', undefined, login.token)).body as MeResponse).profile?.wallet.cogs).toBe(60);
    expect((await call('DELETE', '/api/account', { password: 'long enough' }, login.token)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, reg.token)).status).toBe(401);
  });
  it('stores leaderboard results (migration 2) and aggregates them in SQL', async () => {
    await store.addResults([
      { name: 'Ticker', account: false, board: 'blitz', place: 1, of: 4, points: 26, at: 1_700_000_000_000 },
      { name: 'ticker', account: false, board: 'blitz', place: 2, of: 4, points: 20, at: 1_700_000_001_000 },
      { name: 'Bobbin', account: true, board: 'blitz', place: 1, of: 4, points: 28, at: 1_700_000_002_000 },
      { name: 'Pip', account: false, board: 'normal', place: 1, of: 4, points: 40, at: 1_700_000_003_000 },
    ]);
    const b = await store.leaderboard('blitz', 20);
    expect(b.entries.map((e) => [e.played, e.wins, e.points, e.account])).toEqual([
      [2, 1, 46, false],
      [1, 1, 28, true],
    ]);
    expect(b.recent[0].name).toBe('Bobbin');
    expect((await store.leaderboard('normal', 20)).entries.map((e) => e.name)).toEqual(['Pip']);
  });
});
