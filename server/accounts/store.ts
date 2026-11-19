/**
 * Account storage behind one small interface, with two implementations:
 *   - PgStore (pgStore.ts): Railway PostgreSQL, used when DATABASE_URL is set;
 *   - MemoryStore (here): unit tests, and local development with ACCOUNTS_STORE=memory.
 * Times are milliseconds since the epoch. Ids are strings (Postgres BIGSERIAL comes back as text).
 */

export interface UserRecord {
  id: string;
  /** As the player typed it (shown back to them). */
  username: string;
  passwordHash: string;
  createdAt: number;
}

export interface SessionRecord {
  /** SHA-256 of the token (hex). The token itself is never stored. */
  tokenHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface ProfileRecord {
  /** Bumped by every save; 0 until the first one. */
  rev: number;
  /** The saved profile (already cleaned), or null before the first save. */
  data: unknown | null;
  updatedAt: number;
}

export interface AccountStore {
  readonly kind: 'postgres' | 'memory';
  /** Connect and create the tables if needed. Safe to call again after a failure. */
  init(): Promise<void>;
  /** Create a user (and an empty profile at rev 0). Null if the lower-cased name is taken. */
  createUser(u: { username: string; usernameKey: string; passwordHash: string; now: number }): Promise<UserRecord | null>;
  userByName(usernameKey: string): Promise<UserRecord | null>;
  userById(id: string): Promise<UserRecord | null>;
  /** Add a session and drop that user's oldest beyond `keep`. */
  createSession(s: SessionRecord, keep: number): Promise<void>;
  sessionByHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Remove expired sessions; returns how many. */
  deleteExpiredSessions(now: number): Promise<number>;
  profileOf(userId: string): Promise<ProfileRecord | null>;
  /** Save if the stored rev is still `expectRev`: returns the new rev, or null on a conflict. */
  saveProfile(userId: string, expectRev: number, data: unknown, now: number): Promise<number | null>;
  /** Delete the user, their sessions and their profile. False if there was no such user. */
  deleteUser(userId: string): Promise<boolean>;
  close(): Promise<void>;
}

const copy = <T>(v: T): T => (v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** Everything in Maps, copied in and out like a database would. */
export class MemoryStore implements AccountStore {
  readonly kind = 'memory' as const;
  private users = new Map<string, UserRecord>();
  private byName = new Map<string, string>();
  private sessions = new Map<string, SessionRecord>();
  private profiles = new Map<string, ProfileRecord>();
  private seq = 0;

  async init() {}

  async createUser(u: { username: string; usernameKey: string; passwordHash: string; now: number }) {
    if (this.byName.has(u.usernameKey)) return null;
    const rec: UserRecord = { id: String(++this.seq), username: u.username, passwordHash: u.passwordHash, createdAt: u.now };
    this.users.set(rec.id, rec);
    this.byName.set(u.usernameKey, rec.id);
    this.profiles.set(rec.id, { rev: 0, data: null, updatedAt: u.now });
    return { ...rec };
  }
  async userByName(usernameKey: string) {
    const id = this.byName.get(usernameKey);
    return id ? this.userById(id) : null;
  }
  async userById(id: string) {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }
  async createSession(s: SessionRecord, keep: number) {
    this.sessions.set(s.tokenHash, { ...s });
    const mine = [...this.sessions.values()].filter((x) => x.userId === s.userId).sort((a, b) => b.createdAt - a.createdAt);
    for (const old of mine.slice(Math.max(1, keep))) this.sessions.delete(old.tokenHash);
  }
  async sessionByHash(tokenHash: string) {
    const s = this.sessions.get(tokenHash);
    return s ? { ...s } : null;
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async deleteExpiredSessions(now: number) {
    let n = 0;
    for (const [h, s] of this.sessions)
      if (s.expiresAt <= now) {
        this.sessions.delete(h);
        n++;
      }
    return n;
  }
  async profileOf(userId: string) {
    const p = this.profiles.get(userId);
    return p ? { rev: p.rev, data: copy(p.data), updatedAt: p.updatedAt } : null;
  }
  async saveProfile(userId: string, expectRev: number, data: unknown, now: number) {
    const p = this.profiles.get(userId);
    if (!p || p.rev !== expectRev) return null;
    const rev = p.rev + 1;
    this.profiles.set(userId, { rev, data: copy(data), updatedAt: now });
    return rev;
  }
  async deleteUser(userId: string) {
    const u = this.users.get(userId);
    if (!u) return false;
    this.users.delete(userId);
    for (const [k, id] of this.byName) if (id === userId) this.byName.delete(k);
    for (const [h, s] of this.sessions) if (s.userId === userId) this.sessions.delete(h);
    this.profiles.delete(userId);
    return true;
  }
  async close() {}

  /** Test helper: how many rows each table holds. */
  counts() {
    return { users: this.users.size, sessions: this.sessions.size, profiles: this.profiles.size };
  }
}
