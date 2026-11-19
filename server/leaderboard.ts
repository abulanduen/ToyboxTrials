/**
 * The online leaderboard: every finished lobby tournament (and single-trial lobby match) the
 * server ran, by player name. Two stores behind one interface:
 *   - the accounts PostgreSQL store (server/accounts/pgStore.ts, table `leaderboard_results`,
 *     migration 2) when DATABASE_URL is set;
 *   - MemoryLeaderboard (here) otherwise: lost on restart.
 * And the read-only API, `GET /api/leaderboard?board=<format or trial id>` (CORS as the accounts
 * API; rate-limited per IP). Results are only ever written by the server's own match flow
 * (server/lobbyMatch.ts): there is no endpoint that accepts a result.
 */
import { sanitizeNickname } from './sanitize';
import { KeyedLimiter } from './accounts/rateLimit';
import {
  LEADERBOARD_LIMIT,
  isLeaderboardBoard,
  rankEntries,
  type LeaderboardBoard,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type LeaderboardResult,
} from '../src/net/leaderboardProtocol';
import type { ApiResponse } from './accounts/api';

export interface LeaderboardStore {
  readonly kind: 'postgres' | 'memory';
  addResults(rows: LeaderboardResult[]): Promise<void>;
  leaderboard(board: LeaderboardBoard, limit: number): Promise<LeaderboardResponse>;
}

/** Most results kept in memory (oldest dropped first). */
export const MEMORY_LIMIT = 20_000;

/** Names are cleaned on the way in too (they were already cleaned when the player joined). */
export function cleanResult(r: LeaderboardResult): LeaderboardResult | null {
  if (!isLeaderboardBoard(r.board)) return null;
  // Account usernames were checked when the account was made; nicknames are cleaned again here.
  const name = r.account ? (typeof r.name === 'string' && r.name.length >= 2 && r.name.length <= 32 ? r.name : null) : sanitizeNickname(r.name, () => 0);
  if (!name || (!r.account && /^Toy \d+$/.test(name) && name !== r.name)) return null; // a name that didn't survive cleaning
  const int = (v: number, lo: number, hi: number) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  const place = int(r.place, 1, 8);
  const of = int(r.of, 1, 8);
  const points = int(r.points, 0, 1000);
  if (place === null || of === null || points === null || !Number.isFinite(r.at)) return null;
  return { name, account: !!r.account, board: r.board, place, of, points, at: r.at };
}

/** Aggregate results into ranked entries (memory store; the Postgres store does this in SQL). */
export function aggregate(results: LeaderboardResult[]): LeaderboardEntry[] {
  const by = new Map<string, LeaderboardEntry>();
  for (const r of results) {
    const key = `${r.account ? 'a' : 'g'}:${r.name.toLowerCase()}`;
    const e = by.get(key) ?? { name: r.name, account: r.account, played: 0, wins: 0, points: 0, best: 0, last: 0 };
    e.played++;
    if (r.place === 1) e.wins++;
    e.points += r.points;
    e.best = Math.max(e.best, r.points);
    e.last = Math.max(e.last, r.at);
    by.set(key, e);
  }
  return rankEntries([...by.values()]);
}

export class MemoryLeaderboard implements LeaderboardStore {
  readonly kind = 'memory' as const;
  private results: LeaderboardResult[] = [];

  async addResults(rows: LeaderboardResult[]) {
    for (const r of rows) {
      const c = cleanResult(r);
      if (c) this.results.push(c);
    }
    if (this.results.length > MEMORY_LIMIT) this.results.splice(0, this.results.length - MEMORY_LIMIT);
  }

  async leaderboard(board: LeaderboardBoard, limit: number): Promise<LeaderboardResponse> {
    const mine = this.results.filter((r) => r.board === board);
    return {
      board,
      entries: aggregate(mine).slice(0, limit),
      recent: mine.slice(-limit).reverse(),
    };
  }
}

/** Requests one IP address may make to the leaderboard API: a burst, then a steady rate. */
export const LEADERBOARD_RATE = { burst: 60, perMinute: 60 } as const;

/** The read-only leaderboard endpoint, as a pure handler (server/accounts/http.ts does the HTTP and CORS). */
export class LeaderboardApi {
  readonly limiter = new KeyedLimiter(LEADERBOARD_RATE);
  constructor(
    private readonly store: LeaderboardStore,
    private readonly now: () => number = Date.now,
  ) {}

  matches(path: string) {
    return path.replace(/\/+$/, '') === '/api/leaderboard';
  }

  async handle(req: { method: string; query: URLSearchParams; ip: string }): Promise<ApiResponse> {
    if (req.method.toUpperCase() !== 'GET') return { status: 405, body: { error: 'bad_request', message: 'Use GET.' } };
    if (!this.limiter.take(`ip:${req.ip}`, this.now())) return { status: 429, body: { error: 'rate_limited', message: 'Too many requests. Try again in a minute.' } };
    const board = req.query.get('board') ?? req.query.get('format') ?? 'blitz';
    if (!isLeaderboardBoard(board)) return { status: 400, body: { error: 'bad_request', message: 'Unknown leaderboard.' } };
    const limit = Math.min(LEADERBOARD_LIMIT, Math.max(1, Number(req.query.get('limit')) || LEADERBOARD_LIMIT));
    try {
      return { status: 200, body: await this.store.leaderboard(board, limit) };
    } catch {
      return { status: 503, body: { error: 'busy', message: 'The leaderboard is not available right now.' } };
    }
  }
}
