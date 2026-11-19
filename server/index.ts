/**
 * Toybox Trials online Hub server: HTTP (`GET /health`, the optional accounts API on `/api/*`,
 * the leaderboard on `GET /api/leaderboard`)
 * plus plain WebSockets (`ws`) on `/`. Deployed on Railway; also what `npm run server:dev` and the
 * e2e tests run locally.
 *
 * This file is only the socket layer: origin checks, message size and rate limits, ping/pong
 * heartbeats, the snapshot timer and logging. Rooms and rules live in the pure HubDirectory and
 * HubRoom modules (hubDirectory.ts, hubRoom.ts); accounts in server/accounts/.
 *
 * Environment:
 *   PORT              port to listen on (default 2567; Railway sets it)
 *   ALLOWED_ORIGINS   comma-separated browser origins allowed to connect (see limits.ts)
 *   DATABASE_URL      PostgreSQL for accounts (Railway: a reference to the Postgres service's)
 *   ACCOUNTS_STORE    `memory` keeps accounts in memory when there's no DATABASE_URL (local
 *                     development and tests; everything is lost on restart). Unset and no
 *                     DATABASE_URL: accounts are off (the API answers 503) and online play works.
 *   MATCH_DEBUG       `1` lets lobby members speed their match up (e2e tests only; never in production).
 *
 * Logs carry counts and room codes only: never nicknames, usernames, passwords, tokens, IP
 * addresses or other personal data.
 */
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { MATCH_TICK_HZ, MAX_MESSAGE_BYTES, PROTOCOL_VERSION, SNAPSHOT_HZ, parseClientMessage } from '../src/net/protocol';
import type { LeaderboardResult } from '../src/net/leaderboardProtocol';
import { CLOSE, type Outgoing } from './hubRoom';
import { HubDirectory } from './hubDirectory';
import { RateLimiter, isOriginAllowed, parseAllowedOrigins } from './limits';
import { AccountsApi } from './accounts/api';
import { accountsHttp } from './accounts/http';
import { MemoryStore, type AccountStore } from './accounts/store';
import { PgStore } from './accounts/pgStore';
import { LeaderboardApi, MemoryLeaderboard, type LeaderboardStore } from './leaderboard';

const PORT = Number(process.env.PORT) || 2567;
const ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const HEARTBEAT_MS = 10_000;
/** A socket that has not joined a room by now is closed. */
const HELLO_TIMEOUT_MS = 10_000;
/** Refused messages before a connection is closed for flooding. */
const MAX_DROPPED = 200;
const MAX_SOCKETS = 1200;
/** Account links (`auth`) one connection may attempt. */
const MAX_AUTH_PER_CONN = 5;
const MATCH_DEBUG = process.env.MATCH_DEBUG === '1';

/** CSPRNG-backed [0, 1): room codes and resume tokens must not be guessable. */
const secureRandom = () => randomInt(0, 2 ** 47) / 2 ** 47;
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

const hub = new HubDirectory({ random: secureRandom, matchDebug: MATCH_DEBUG });

// ---------------------------------------------------------------- accounts (optional)
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const accountStore: AccountStore | null = DATABASE_URL ? new PgStore(DATABASE_URL) : process.env.ACCOUNTS_STORE === 'memory' ? new MemoryStore() : null;
const accounts = new AccountsApi({ store: accountStore, log });
// The leaderboard lives in the accounts database when there is one, else in memory.
const leaderboardStore: LeaderboardStore = accountStore instanceof PgStore ? accountStore : new MemoryLeaderboard();
const leaderboardApi = new LeaderboardApi(leaderboardStore);
const handleApi = accountsHttp(accounts, ORIGINS, [leaderboardApi]);
let accountsRetry: NodeJS.Timeout | undefined;
async function startAccounts(attempt = 1): Promise<void> {
  if (!accountStore) {
    log('accounts: off (no DATABASE_URL); the accounts API answers 503');
    return;
  }
  try {
    await accounts.start();
    log(`accounts: ${accountStore.kind} store ready${accountStore.kind === 'memory' ? ' (in memory: lost on restart)' : ''}`);
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    const wait = Math.min(60, 5 * attempt);
    log(`accounts: database not reachable${typeof code === 'string' ? ` (${code})` : ''}; retrying in ${wait} s`);
    accountsRetry = setTimeout(() => void startAccounts(attempt + 1), wait * 1000);
  }
}
/** What /health reports: the store in use, or `off` / `starting`. */
const accountsHealth = () => (accounts.state === 'ready' ? accounts.storeKind : accounts.state);

interface Conn {
  ws: WebSocket;
  limiter: RateLimiter;
  alive: boolean;
  helloTimer: NodeJS.Timeout;
  auths: number;
}
const conns = new Map<string, Conn>();
let connSeq = 0;

/** Finished lobby matches: results for the leaderboard (only ever from server-run matches). */
function record(rows: LeaderboardResult[]) {
  // The Postgres store is only usable once its migrations ran; until then results wait in memory.
  const store = leaderboardStore.kind === 'postgres' && accounts.state !== 'ready' ? null : leaderboardStore;
  if (!store) {
    pendingResults.push(...rows);
    if (pendingResults.length > 5000) pendingResults.splice(0, pendingResults.length - 5000);
    return;
  }
  const all = pendingResults.splice(0).concat(rows);
  store.addResults(all).then(
    () => log(`leaderboard: ${all.length} result(s) stored (${store.kind})`),
    () => log('leaderboard: storing results failed'),
  );
}
const pendingResults: LeaderboardResult[] = [];

function deliver(out: Outgoing[]) {
  for (const o of out) {
    if (o.kind === 'send') {
      const data = JSON.stringify(o.msg);
      for (const id of o.to) {
        const c = conns.get(id);
        if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(data);
      }
    } else if (o.kind === 'record') record(o.rows);
    else conns.get(o.conn)?.ws.close(o.code, o.reason);
  }
}

/** Log rooms opening and closing (codes and counts only). */
function logRooms(before: ReturnType<HubDirectory['stats']>, after = hub.stats()) {
  if (after.privateRooms > before.privateRooms) log(`private room opened (${after.privateRooms} private, ${after.publicRooms} public)`);
  if (after.publicRooms > before.publicRooms) log(`public Hub instance opened (${after.publicRooms} public)`);
  if (after.rooms < before.rooms) log(`${before.rooms - after.rooms} room(s) closed (${after.rooms} open)`);
}

// ---------------------------------------------------------------- HTTP: health check
const http = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/api' || path.startsWith('/api/')) {
    handleApi(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end();
    });
    return;
  }
  if (req.method === 'GET' && path === '/health') {
    const s = hub.stats();
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: s.rooms, players: s.players, connected: s.connected, lobbies: s.lobbies, matches: s.matches, accounts: accountsHealth() }));
    return;
  }
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Toybox Trials online Hub. Connect with a WebSocket.');
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

// ---------------------------------------------------------------- WebSocket upgrade
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });

http.on('upgrade', (req, socket, head) => {
  const refuse = (status: string) => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  if (!isOriginAllowed(req.headers.origin, ORIGINS)) {
    log('refused a connection from an origin that is not allowed');
    return refuse('403 Forbidden');
  }
  if ((req.url ?? '/').split('?')[0] !== '/') return refuse('404 Not Found');
  if (conns.size >= MAX_SOCKETS) return refuse('503 Service Unavailable');
  wss.handleUpgrade(req, socket, head, onConnection);
});

function onConnection(ws: WebSocket) {
  const id = `c${(++connSeq).toString(36)}`;
  const c: Conn = {
    ws,
    // Hub moves (~15/s) or match inputs (MATCH_TICK_HZ), plus lobby actions and the odd emote.
    limiter: new RateLimiter(60, 45, Date.now()),
    alive: true,
    auths: 0,
    helloTimer: setTimeout(() => {
      if (!hub.roomOf(id)) ws.close(CLOSE.badRequest, 'no hello');
    }, HELLO_TIMEOUT_MS),
  };
  conns.set(id, c);

  ws.on('pong', () => {
    c.alive = true;
  });
  ws.on('message', (data, isBinary) => {
    const now = Date.now();
    if (isBinary) return ws.close(CLOSE.badRequest, 'text frames only');
    if (!c.limiter.take(now)) {
      if (c.limiter.dropped > MAX_DROPPED) ws.close(CLOSE.rateLimited, 'too many messages');
      return;
    }
    const msg = parseClientMessage(data.toString());
    if (!msg) return deliver([{ kind: 'send', to: [id], msg: { t: 'error', code: 'bad_request', message: 'Malformed message.', fatal: false } }]);
    if (msg.t === 'auth') {
      // Link a signed-in account (leaderboard names): checked against the accounts store.
      if (++c.auths > MAX_AUTH_PER_CONN) return;
      accounts.usernameFor(msg.token, now).then(
        (username) => deliver(hub.setAccount(id, username, Date.now())),
        () => {},
      );
      return;
    }
    const before = hub.stats();
    deliver(hub.handle(id, msg, now));
    if (msg.t === 'hello' && hub.roomOf(id)) clearTimeout(c.helloTimer);
    logRooms(before);
  });
  ws.on('close', () => {
    clearTimeout(c.helloTimer);
    conns.delete(id);
    const before = hub.stats();
    deliver(hub.disconnect(id, Date.now()));
    logRooms(before);
  });
  ws.on('error', () => {
    /* 'close' follows; oversized frames (maxPayload) land here */
  });
}

// ---------------------------------------------------------------- timers
const snapshotTimer = setInterval(() => {
  const before = hub.stats();
  deliver(hub.tick(Date.now()));
  logRooms(before);
}, 1000 / SNAPSHOT_HZ);

// Lobby matches: every running match is stepped (fixed 60 Hz sub-steps) and snapshotted.
const matchTimer = setInterval(() => deliver(hub.tickMatches(Date.now())), 1000 / MATCH_TICK_HZ);

// Heartbeat: ping everyone; a socket that didn't answer the previous ping is dead.
const heartbeatTimer = setInterval(() => {
  for (const c of conns.values()) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, HEARTBEAT_MS);

const statsTimer = setInterval(() => {
  const s = hub.stats();
  if (s.players) log(`players ${s.players} (connected ${s.connected}) in ${s.rooms} room(s): ${s.publicRooms} public, ${s.privateRooms} private; ${s.lobbies} lobby(ies), ${s.matches} match(es) running`);
}, 60_000);

// Hourly: expired sessions and idle rate-limit keys.
const sweepTimer = setInterval(() => {
  accounts.sweep().then(
    (n) => n && log(`accounts: removed ${n} expired session(s)`),
    () => log('accounts: session clean-up failed'),
  );
}, 60 * 60_000);

http.listen(PORT, () => log(`Toybox Trials online Hub listening on port ${PORT} (protocol v${PROTOCOL_VERSION})${MATCH_DEBUG ? ' with MATCH_DEBUG on (test server)' : ''}`));
void startAccounts();

function shutdown(signal: string) {
  log(`${signal}: shutting down`);
  clearInterval(snapshotTimer);
  clearInterval(matchTimer);
  clearInterval(heartbeatTimer);
  clearInterval(statsTimer);
  clearInterval(sweepTimer);
  clearTimeout(accountsRetry);
  void accountStore?.close().catch(() => {});
  deliver(hub.shutdown());
  wss.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
