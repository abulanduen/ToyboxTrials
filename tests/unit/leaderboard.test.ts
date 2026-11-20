/**
 * The online leaderboard (server/leaderboard.ts): the memory store, name cleaning, aggregation,
 * the read-only API with its rate limit, and the HTTP route with CORS (server/accounts/http.ts).
 * Results only reach it from the server's own match flow (see lobby-match.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { LeaderboardApi, LEADERBOARD_RATE, MemoryLeaderboard, aggregate, cleanResult } from '../../server/leaderboard';
import { AccountsApi } from '../../server/accounts/api';
import { accountsHttp } from '../../server/accounts/http';
import { parseAllowedOrigins } from '../../server/limits';
import type { LeaderboardResult } from '../../src/net/leaderboardProtocol';

const r = (name: string, place: number, points: number, extra: Partial<LeaderboardResult> = {}): LeaderboardResult => ({ name, account: false, board: 'blitz', place, of: 4, points, at: 1000 + points, ...extra });

describe('leaderboard store', () => {
  it('aggregates by name: wins, then points, then best', async () => {
    const s = new MemoryLeaderboard();
    await s.addResults([r('Ticker', 1, 26), r('Bobbin', 2, 22), r('Ticker', 3, 14), r('Bobbin', 1, 28), r('Clank', 1, 30), r('Pip', 4, 3, { board: 'normal' })]);
    const b = await s.leaderboard('blitz', 20);
    expect(b.entries.map((e) => [e.name, e.played, e.wins, e.points, e.best])).toEqual([
      ['Bobbin', 2, 1, 50, 28],
      ['Ticker', 2, 1, 40, 26],
      ['Clank', 1, 1, 30, 30],
    ]);
    expect(b.recent[0].name).toBe('Clank'); // newest first
    expect((await s.leaderboard('normal', 20)).entries.map((e) => e.name)).toEqual(['Pip']);
    expect((await s.leaderboard('treasure', 20)).entries).toEqual([]);
  });

  it('guests and signed-in accounts with the same name are separate lines', () => {
    const e = aggregate([r('Ticker', 1, 10), r('Ticker', 1, 10, { account: true }), r('ticker', 2, 8)]);
    expect(e.map((x) => [x.name, x.account, x.played])).toEqual([
      ['Ticker', false, 2],
      ['Ticker', true, 1],
    ]);
  });

  it('cleans names and numbers again on the way in', () => {
    expect(cleanResult(r('  Tick\u0000er  ', 1, 10))?.name).toBe('Ticker');
    expect(cleanResult(r('shithead', 1, 10))).toBeNull(); // a blocked word never reaches the board
    expect(cleanResult(r('Toy 456', 1, 10))?.name).toBe('Toy 456');
    expect(cleanResult(r('Ticker', 9, 10))).toBeNull();
    expect(cleanResult(r('Ticker', 1, -5))).toBeNull();
    expect(cleanResult(r('Ticker', 1, 10, { board: 'chess' as never }))).toBeNull();
    expect(cleanResult(r('a_long_account_name', 1, 10, { account: true }))?.name).toBe('a_long_account_name');
  });
});

describe('leaderboard API', () => {
  it('GET /api/leaderboard?board=… answers the board; bad boards and other methods are refused', async () => {
    const store = new MemoryLeaderboard();
    await store.addResults([r('Ticker', 1, 26)]);
    const api = new LeaderboardApi(store, () => 0);
    const q = (s: string) => new URLSearchParams(s);
    const ok = await api.handle({ method: 'GET', query: q('board=blitz'), ip: '1.1.1.1' });
    expect(ok.status).toBe(200);
    expect((ok.body as { entries: { name: string }[] }).entries[0].name).toBe('Ticker');
    expect((await api.handle({ method: 'GET', query: q('format=normal'), ip: '1.1.1.1' })).status).toBe(200); // ?format= works too
    expect((await api.handle({ method: 'GET', query: q('board=chess'), ip: '1.1.1.1' })).status).toBe(400);
    expect((await api.handle({ method: 'POST', query: q('board=blitz'), ip: '1.1.1.1' })).status).toBe(405);
    expect(api.matches('/api/leaderboard')).toBe(true);
    expect(api.matches('/api/leaderboard/')).toBe(true);
    expect(api.matches('/api/me')).toBe(false);
  });

  it('rate-limits each IP address', async () => {
    const api = new LeaderboardApi(new MemoryLeaderboard(), () => 0);
    let limited = 0;
    for (let i = 0; i < LEADERBOARD_RATE.burst + 5; i++) if ((await api.handle({ method: 'GET', query: new URLSearchParams(), ip: '2.2.2.2' })).status === 429) limited++;
    expect(limited).toBe(5);
    expect((await api.handle({ method: 'GET', query: new URLSearchParams(), ip: '3.3.3.3' })).status).toBe(200);
  });

  it('serves over HTTP with the accounts API’s CORS, even with accounts off', async () => {
    const store = new MemoryLeaderboard();
    await store.addResults([r('Ticker', 1, 26, { board: 'treasure' })]);
    const handle = accountsHttp(new AccountsApi({ store: null }), parseAllowedOrigins('https://toybox-trials.vercel.app'), [new LeaderboardApi(store)]);
    const server: Server = createServer((req, res) => void handle(req, res));
    await new Promise<void>((done) => server.listen(0, done));
    const port = (server.address() as { port: number }).port;
    try {
      const good = await fetch(`http://localhost:${port}/api/leaderboard?board=treasure`, { headers: { origin: 'https://toybox-trials.vercel.app' } });
      expect(good.status).toBe(200);
      expect(good.headers.get('access-control-allow-origin')).toBe('https://toybox-trials.vercel.app');
      expect(((await good.json()) as { entries: { name: string }[] }).entries[0].name).toBe('Ticker');
      const evil = await fetch(`http://localhost:${port}/api/leaderboard?board=treasure`, { headers: { origin: 'https://evil.example' } });
      expect(evil.status).toBe(403);
      // The accounts API is still off: the leaderboard doesn't switch it on.
      expect((await fetch(`http://localhost:${port}/api/me`)).status).toBe(503);
    } finally {
      server.close();
    }
  });
});
