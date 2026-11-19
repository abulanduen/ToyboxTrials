/**
 * PostgreSQL account storage (Railway's PostgreSQL service, via DATABASE_URL). Parameterised SQL
 * only. The tables are created on start by numbered migrations recorded in `schema_migrations`,
 * run under an advisory lock so two server instances starting together don't race.
 */
import pg from 'pg';
import type { AccountStore, ProfileRecord, SessionRecord, UserRecord } from './store';

/** Append-only: never edit a shipped step, add a new one. */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id            BIGSERIAL PRIMARY KEY,
        username      TEXT NOT NULL,
        username_key  TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
      CREATE TABLE IF NOT EXISTS profiles (
        user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        rev        INTEGER NOT NULL DEFAULT 0,
        data       JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );`,
  },
];
/** Arbitrary constant for pg_advisory_lock: "toybox accounts". */
const MIGRATION_LOCK = 7_461_202_611;

const ms = (d: Date | string | null): number => (d === null ? 0 : new Date(d).getTime());

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: Date;
}
const toUser = (r: UserRow): UserRecord => ({ id: String(r.id), username: r.username, passwordHash: r.password_hash, createdAt: ms(r.created_at) });

export class PgStore implements AccountStore {
  readonly kind = 'postgres' as const;
  private pool: pg.Pool;

  constructor(connectionString: string, opts: { max?: number } = {}) {
    this.pool = new pg.Pool({ connectionString, max: opts.max ?? 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
    // An idle client losing its connection must not crash the server; the next query reconnects.
    this.pool.on('error', () => {});
  }

  async init() {
    const c = await this.pool.connect();
    try {
      await c.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
      try {
        await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
        const done = new Set((await c.query<{ version: number }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
        for (const m of MIGRATIONS) {
          if (done.has(m.version)) continue;
          await c.query('BEGIN');
          try {
            await c.query(m.sql);
            await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
            await c.query('COMMIT');
          } catch (e) {
            await c.query('ROLLBACK');
            throw e;
          }
        }
      } finally {
        await c.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
      }
    } finally {
      c.release();
    }
  }

  async createUser(u: { username: string; usernameKey: string; passwordHash: string; now: number }) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query<UserRow>(
        `INSERT INTO users (username, username_key, password_hash, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (username_key) DO NOTHING RETURNING id, username, password_hash, created_at`,
        [u.username, u.usernameKey, u.passwordHash, new Date(u.now)],
      );
      if (!r.rows.length) {
        await c.query('ROLLBACK');
        return null;
      }
      await c.query('INSERT INTO profiles (user_id, rev, data, updated_at) VALUES ($1, 0, NULL, $2)', [r.rows[0].id, new Date(u.now)]);
      await c.query('COMMIT');
      return toUser(r.rows[0]);
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async userByName(usernameKey: string) {
    const r = await this.pool.query<UserRow>('SELECT id, username, password_hash, created_at FROM users WHERE username_key = $1', [usernameKey]);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }

  async userById(id: string) {
    const r = await this.pool.query<UserRow>('SELECT id, username, password_hash, created_at FROM users WHERE id = $1', [id]);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }

  async createSession(s: SessionRecord, keep: number) {
    await this.pool.query('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [s.tokenHash, s.userId, new Date(s.createdAt), new Date(s.expiresAt)]);
    await this.pool.query(
      `DELETE FROM sessions WHERE user_id = $1 AND token_hash NOT IN (
         SELECT token_hash FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
      [s.userId, Math.max(1, keep)],
    );
  }

  async sessionByHash(tokenHash: string) {
    const r = await this.pool.query<{ token_hash: string; user_id: string; created_at: Date; expires_at: Date }>(
      'SELECT token_hash, user_id, created_at, expires_at FROM sessions WHERE token_hash = $1',
      [tokenHash],
    );
    const row = r.rows[0];
    return row ? { tokenHash: row.token_hash, userId: String(row.user_id), createdAt: ms(row.created_at), expiresAt: ms(row.expires_at) } : null;
  }

  async deleteSession(tokenHash: string) {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteExpiredSessions(now: number) {
    const r = await this.pool.query('DELETE FROM sessions WHERE expires_at <= $1', [new Date(now)]);
    return r.rowCount ?? 0;
  }

  async profileOf(userId: string): Promise<ProfileRecord | null> {
    const r = await this.pool.query<{ rev: number; data: unknown; updated_at: Date }>('SELECT rev, data, updated_at FROM profiles WHERE user_id = $1', [userId]);
    const row = r.rows[0];
    return row ? { rev: row.rev, data: row.data ?? null, updatedAt: ms(row.updated_at) } : null;
  }

  async saveProfile(userId: string, expectRev: number, data: unknown, now: number) {
    const r = await this.pool.query<{ rev: number }>(
      'UPDATE profiles SET data = $3::jsonb, rev = rev + 1, updated_at = $4 WHERE user_id = $1 AND rev = $2 RETURNING rev',
      [userId, expectRev, JSON.stringify(data), new Date(now)],
    );
    return r.rows[0] ? r.rows[0].rev : null;
  }

  async deleteUser(userId: string) {
    // Sessions and the profile go with it (ON DELETE CASCADE).
    const r = await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    return (r.rowCount ?? 0) > 0;
  }

  async close() {
    await this.pool.end();
  }
}
