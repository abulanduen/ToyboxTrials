/**
 * The accounts API handlers: register, login, logout, me, save profile, delete account. Called
 * with a plain request object (method, path, Authorization header, parsed JSON body, client IP)
 * and returning a status and JSON body, so unit tests drive every endpoint without a network.
 * server/accounts/http.ts does the HTTP side (CORS, body limits, JSON).
 *
 * Never logs passwords, tokens, usernames or IP addresses.
 */
import { isBlockedName } from '../sanitize';
import {
  ACCOUNT_ERROR_TEXT,
  passwordProblem,
  usernameProblem,
  type AccountErrorCode,
  type AuthResponse,
  type ConflictResponse,
  type MeResponse,
  type SaveResponse,
} from '../../src/net/accountProtocol';
import { normalizeProfile, type Profile } from '../../src/game/profile';
import { capProfileSave } from '../../src/game/profileSync';
import { DEFAULT_SCRYPT, hashPassword, verifyPassword, type ScryptParams } from './passwords';
import { MAX_SESSIONS_PER_USER, SESSION_MS, bearerToken, hashToken, isExpired, newToken } from './sessions';
import { ACCOUNT_LIMITS, KeyedLimiter } from './rateLimit';
import type { AccountStore, UserRecord } from './store';

export interface ApiRequest {
  method: string;
  /** Path without the query string, e.g. `/api/login`. */
  path: string;
  /** The Authorization header, if any. */
  authorization?: string;
  /** Parsed JSON body (undefined when there was none). */
  body?: unknown;
  /** Client address, for rate limits only (never stored or logged). */
  ip: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export type AccountsState = 'off' | 'starting' | 'ready';

export interface AccountsApiOptions {
  /** Null: accounts are switched off (no DATABASE_URL); every endpoint but status answers 503. */
  store: AccountStore | null;
  now?: () => number;
  /** Cheaper parameters for unit tests; production uses DEFAULT_SCRYPT. */
  scrypt?: ScryptParams;
  /** Most password hashes computed at once (scrypt is CPU- and memory-heavy). */
  maxHashing?: number;
  /** Further hashing requests that may wait their turn; beyond that the answer is 503 busy. */
  maxHashQueue?: number;
  log?: (msg: string) => void;
}

const fail = (status: number, error: AccountErrorCode, message = ACCOUNT_ERROR_TEXT[error]): ApiResponse => ({ status, body: { error, message } });
const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });

class Busy extends Error {}

/** A tiny semaphore: at most `max` tasks at once, at most `queue` waiting. */
class Gate {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private readonly max: number,
    private readonly queue: number,
  ) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.waiting.length >= this.queue) throw new Busy();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.active++;
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const MAX_REV = 2 ** 31 - 2;

export class AccountsApi {
  private store: AccountStore | null;
  private stateValue: AccountsState;
  private readonly now: () => number;
  private readonly scrypt: ScryptParams;
  private readonly gate: Gate;
  private readonly log: (msg: string) => void;
  private dummyHash: Promise<string> | null = null;
  readonly limits = {
    ipAny: new KeyedLimiter(ACCOUNT_LIMITS.ipAny),
    ipLogin: new KeyedLimiter(ACCOUNT_LIMITS.ipLogin),
    userFail: new KeyedLimiter(ACCOUNT_LIMITS.userFail),
    ipRegister: new KeyedLimiter(ACCOUNT_LIMITS.ipRegister),
    userSave: new KeyedLimiter(ACCOUNT_LIMITS.userSave),
  };

  constructor(o: AccountsApiOptions) {
    this.store = o.store;
    this.stateValue = o.store ? 'starting' : 'off';
    this.now = o.now ?? Date.now;
    this.scrypt = o.scrypt ?? DEFAULT_SCRYPT;
    this.gate = new Gate(o.maxHashing ?? 4, o.maxHashQueue ?? 32);
    this.log = o.log ?? (() => {});
  }

  get state(): AccountsState {
    return this.stateValue;
  }
  get storeKind(): AccountStore['kind'] | null {
    return this.store?.kind ?? null;
  }

  /** Connect the store and create its tables. Throws if the database can't be reached. */
  async start(): Promise<void> {
    if (!this.store) return;
    await this.store.init();
    this.stateValue = 'ready';
  }

  /**
   * The username a session token belongs to, or null (accounts off, unknown or expired token).
   * The online Hub uses it to put signed-in players on the leaderboard by username.
   */
  async usernameFor(token: string, now = this.now()): Promise<string | null> {
    if (this.stateValue !== 'ready' || !this.store) return null;
    const a = await this.authed({ method: 'GET', path: '/api/me', authorization: `Bearer ${token}`, ip: 'hub' }, now);
    return a?.user.username ?? null;
  }

  /** Housekeeping, about hourly: expired sessions and idle rate-limit keys. */
  async sweep(): Promise<number> {
    const now = this.now();
    for (const l of Object.values(this.limits)) l.prune(now);
    if (this.stateValue !== 'ready' || !this.store) return 0;
    return this.store.deleteExpiredSessions(now);
  }

  async handle(req: ApiRequest): Promise<ApiResponse> {
    const now = this.now();
    const route = `${req.method.toUpperCase()} ${req.path.replace(/\/+$/, '')}`;
    if (route === 'GET /api/status') return ok({ accounts: this.stateValue === 'ready' });
    const known = ['POST /api/register', 'POST /api/login', 'POST /api/logout', 'GET /api/me', 'PUT /api/profile', 'DELETE /api/account'];
    if (!known.includes(route)) return fail(404, 'not_found');
    if (!this.limits.ipAny.take(`ip:${req.ip}`, now)) return fail(429, 'rate_limited');
    if (this.stateValue !== 'ready' || !this.store) return fail(503, 'accounts_off');
    try {
      switch (route) {
        case 'POST /api/register':
          return await this.register(req, now);
        case 'POST /api/login':
          return await this.login(req, now);
        case 'POST /api/logout':
          return await this.logout(req);
        case 'GET /api/me':
          return await this.me(req, now);
        case 'PUT /api/profile':
          return await this.saveProfile(req, now);
        default:
          return await this.deleteAccount(req, now);
      }
    } catch (e) {
      if (e instanceof Busy) return fail(503, 'busy');
      const code = (e as { code?: unknown })?.code;
      this.log(`accounts: ${route} failed${typeof code === 'string' ? ` (${code})` : ''}`);
      return fail(500, 'server_error');
    }
  }

  // ---------------------------------------------------------------- helpers
  private hash(password: string) {
    return this.gate.run(() => hashPassword(password, this.scrypt));
  }
  private verify(password: string, stored: string) {
    return this.gate.run(() => verifyPassword(password, stored));
  }
  /** A hash to check against when the username doesn't exist, so both cases take as long. */
  private dummy(): Promise<string> {
    this.dummyHash ??= hashPassword('not a real password', this.scrypt);
    return this.dummyHash;
  }

  private async newSession(user: UserRecord, now: number): Promise<string> {
    const token = newToken();
    await this.store!.createSession({ tokenHash: hashToken(token), userId: user.id, createdAt: now, expiresAt: now + SESSION_MS }, MAX_SESSIONS_PER_USER);
    return token;
  }

  /** The signed-in user, or null (missing, unknown or expired token). */
  private async authed(req: ApiRequest, now: number): Promise<{ user: UserRecord; tokenHash: string } | null> {
    const token = bearerToken(req.authorization);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const s = await this.store!.sessionByHash(tokenHash);
    if (!s) return null;
    if (isExpired(s, now)) {
      await this.store!.deleteSession(tokenHash);
      return null;
    }
    const user = await this.store!.userById(s.userId);
    return user ? { user, tokenHash } : null;
  }

  private async storedProfile(userId: string): Promise<{ rev: number; profile: Profile | null; updatedAt: number }> {
    const rec = await this.store!.profileOf(userId);
    if (!rec) return { rev: 0, profile: null, updatedAt: 0 };
    return { rev: rec.rev, profile: rec.data === null || rec.data === undefined ? null : normalizeProfile(rec.data), updatedAt: rec.updatedAt };
  }

  // ---------------------------------------------------------------- endpoints
  private async register(req: ApiRequest, now: number): Promise<ApiResponse> {
    const b = isObject(req.body) ? req.body : {};
    const nameProblem = usernameProblem(b.username);
    if (nameProblem) return fail(400, 'username_invalid', nameProblem);
    const username = b.username as string;
    if (isBlockedName(username)) return fail(400, 'username_invalid', "That username isn't allowed. Try another.");
    const pwProblem = passwordProblem(b.password);
    if (pwProblem) return fail(400, 'password_invalid', pwProblem);
    if (!this.limits.ipRegister.take(`ip:${req.ip}`, now)) return fail(429, 'rate_limited');
    const usernameKey = username.toLowerCase();
    if (await this.store!.userByName(usernameKey)) return fail(409, 'username_taken');
    const passwordHash = await this.hash(b.password as string);
    const user = await this.store!.createUser({ username, usernameKey, passwordHash, now });
    if (!user) return fail(409, 'username_taken');
    const token = await this.newSession(user, now);
    this.log('accounts: account created');
    return ok({ token, username: user.username, rev: 0, profile: null } satisfies AuthResponse, 201);
  }

  private async login(req: ApiRequest, now: number): Promise<ApiResponse> {
    const b = isObject(req.body) ? req.body : {};
    if (typeof b.username !== 'string' || typeof b.password !== 'string') return fail(400, 'bad_request');
    if (!this.limits.ipLogin.take(`ip:${req.ip}`, now)) return fail(429, 'rate_limited');
    const usernameKey = b.username.toLowerCase().slice(0, 64);
    const userKey = `user:${usernameKey}`;
    if (!this.limits.userFail.allows(userKey, now)) return fail(429, 'rate_limited');
    // Malformed names and impossible passwords can't match, but still cost a hash (same timing).
    const plausible = !usernameProblem(b.username) && !passwordProblem(b.password);
    const user = plausible ? await this.store!.userByName(usernameKey) : null;
    const good = user ? await this.verify(b.password, user.passwordHash) : (await this.verify(b.password.slice(0, 512), await this.dummy()), false);
    if (!user || !good) {
      this.limits.userFail.take(userKey, now);
      return fail(401, 'wrong_credentials');
    }
    const token = await this.newSession(user, now);
    const p = await this.storedProfile(user.id);
    return ok({ token, username: user.username, rev: p.rev, profile: p.profile } satisfies AuthResponse);
  }

  private async logout(req: ApiRequest): Promise<ApiResponse> {
    const token = bearerToken(req.authorization);
    if (token) await this.store!.deleteSession(hashToken(token));
    return ok({ ok: true });
  }

  private async me(req: ApiRequest, now: number): Promise<ApiResponse> {
    const a = await this.authed(req, now);
    if (!a) return fail(401, 'unauthorized');
    const p = await this.storedProfile(a.user.id);
    return ok({ username: a.user.username, rev: p.rev, profile: p.profile, savedAt: p.profile ? p.updatedAt : null } satisfies MeResponse);
  }

  private async saveProfile(req: ApiRequest, now: number): Promise<ApiResponse> {
    const a = await this.authed(req, now);
    if (!a) return fail(401, 'unauthorized');
    const b = isObject(req.body) ? req.body : {};
    const rev = b.rev;
    if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 0 || rev > MAX_REV || !isObject(b.profile)) return fail(400, 'bad_request');
    if (!this.limits.userSave.take(`save:${a.user.id}`, now)) return fail(429, 'rate_limited');
    const cur = await this.storedProfile(a.user.id);
    const conflict = (c: typeof cur): ApiResponse => ({ status: 409, body: { error: 'conflict', message: ACCOUNT_ERROR_TEXT.conflict, rev: c.rev, profile: c.profile } satisfies ConflictResponse });
    if (rev !== cur.rev) return conflict(cur);
    const capped = capProfileSave({ stored: cur.profile, storedAt: cur.updatedAt, incoming: b.profile, now });
    const newRev = await this.store!.saveProfile(a.user.id, rev, capped.profile, now);
    if (newRev === null) return conflict(await this.storedProfile(a.user.id));
    if (capped.adjusted.length) this.log(`accounts: a save was soft-capped (${capped.adjusted.join(', ')})`);
    return ok({ rev: newRev, profile: capped.profile, adjusted: capped.adjusted } satisfies SaveResponse);
  }

  private async deleteAccount(req: ApiRequest, now: number): Promise<ApiResponse> {
    const a = await this.authed(req, now);
    if (!a) return fail(401, 'unauthorized');
    const b = isObject(req.body) ? req.body : {};
    if (typeof b.password !== 'string') return fail(400, 'bad_request');
    const userKey = `user:${a.user.username.toLowerCase()}`;
    if (!this.limits.ipLogin.take(`ip:${req.ip}`, now) || !this.limits.userFail.allows(userKey, now)) return fail(429, 'rate_limited');
    if (!(await this.verify(b.password.slice(0, 512), a.user.passwordHash))) {
      this.limits.userFail.take(userKey, now);
      return fail(401, 'wrong_credentials', 'Wrong password.');
    }
    await this.store!.deleteUser(a.user.id);
    this.log('accounts: account deleted');
    return ok({ ok: true });
  }
}
