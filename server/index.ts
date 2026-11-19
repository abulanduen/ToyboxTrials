/**
 * Toybox Trials online Hub server: HTTP (`GET /health`) plus plain WebSockets (`ws`) on `/`.
 * Deployed on Railway; also what `npm run server:dev` and the e2e test run locally.
 *
 * This file is only the socket layer: origin checks, message size and rate limits, ping/pong
 * heartbeats, the snapshot timer and logging. Rooms and rules live in the pure HubDirectory and
 * HubRoom modules (hubDirectory.ts, hubRoom.ts).
 *
 * Environment:
 *   PORT              port to listen on (default 2567; Railway sets it)
 *   ALLOWED_ORIGINS   comma-separated browser origins allowed to connect (see limits.ts)
 *
 * Logs carry counts and room codes only: never nicknames, IP addresses or other personal data.
 */
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, SNAPSHOT_HZ, parseClientMessage } from '../src/net/protocol';
import { CLOSE, type Outgoing } from './hubRoom';
import { HubDirectory } from './hubDirectory';
import { RateLimiter, isOriginAllowed, parseAllowedOrigins } from './limits';

const PORT = Number(process.env.PORT) || 2567;
const ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const HEARTBEAT_MS = 10_000;
/** A socket that has not joined a room by now is closed. */
const HELLO_TIMEOUT_MS = 10_000;
/** Refused messages before a connection is closed for flooding. */
const MAX_DROPPED = 200;
const MAX_SOCKETS = 1200;

/** CSPRNG-backed [0, 1): room codes and resume tokens must not be guessable. */
const secureRandom = () => randomInt(0, 2 ** 47) / 2 ** 47;
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

const hub = new HubDirectory({ random: secureRandom });

interface Conn {
  ws: WebSocket;
  limiter: RateLimiter;
  alive: boolean;
  helloTimer: NodeJS.Timeout;
}
const conns = new Map<string, Conn>();
let connSeq = 0;

function deliver(out: Outgoing[]) {
  for (const o of out) {
    if (o.kind === 'send') {
      const data = JSON.stringify(o.msg);
      for (const id of o.to) {
        const c = conns.get(id);
        if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(data);
      }
    } else conns.get(o.conn)?.ws.close(o.code, o.reason);
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
  if (req.method === 'GET' && path === '/health') {
    const s = hub.stats();
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: s.rooms, players: s.players, connected: s.connected }));
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
    limiter: new RateLimiter(40, 30, Date.now()),
    alive: true,
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
  if (s.players) log(`players ${s.players} (connected ${s.connected}) in ${s.rooms} room(s): ${s.publicRooms} public, ${s.privateRooms} private`);
}, 60_000);

http.listen(PORT, () => log(`Toybox Trials online Hub listening on port ${PORT} (protocol v${PROTOCOL_VERSION})`));

function shutdown(signal: string) {
  log(`${signal}: shutting down`);
  clearInterval(snapshotTimer);
  clearInterval(heartbeatTimer);
  clearInterval(statsTimer);
  deliver(hub.shutdown());
  wss.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
