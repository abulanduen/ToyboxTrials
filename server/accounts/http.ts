/**
 * The HTTP side of the accounts API: `/api/*` on the server's existing http server. CORS limited
 * to ALLOWED_ORIGINS (with preflight), a JSON body size limit, and security headers. The handlers
 * themselves are in api.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_BODY_BYTES } from '../../src/net/accountProtocol';
import { isOriginAllowed } from '../limits';
import type { AccountsApi } from './api';

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
} as const;

/**
 * The client's address for rate limiting. Behind Railway's proxy the socket address is the
 * proxy's, so the right-most `X-Forwarded-For` entry (the one the proxy appended, which a client
 * can't forge) is used when present.
 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  const xff = req.headers['x-forwarded-for'];
  const list = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
  return list[list.length - 1] ?? req.socket.remoteAddress ?? 'unknown';
}

class TooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return reject(new TooLarge());
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.removeAllListeners('data');
        reject(new TooLarge());
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Returns a request handler for `/api/*`; it answers and returns true, or returns false for other paths. */
export function accountsHttp(api: AccountsApi, origins: RegExp[]) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = (req.url ?? '/').split('?')[0];
    if (path !== '/api' && !path.startsWith('/api/')) return false;
    const origin = req.headers.origin;
    const headers: Record<string, string> = { ...BASE_HEADERS };
    const send = (status: number, body?: unknown) => {
      if (body === undefined) {
        delete headers['content-type'];
        res.writeHead(status, headers);
        res.end();
      } else {
        res.writeHead(status, headers);
        res.end(JSON.stringify(body));
      }
    };
    // Browsers always send Origin on these cross-origin requests. A request without one (curl, a
    // health probe) carries no cookies or ambient credentials, so it is allowed through: CORS is
    // a browser protection, and the bearer token is what authorises an account request.
    if (origin !== undefined) {
      if (!isOriginAllowed(origin, origins)) {
        send(403, { error: 'forbidden', message: 'This site is not allowed to use the accounts server.' });
        return true;
      }
      headers['access-control-allow-origin'] = origin;
      headers['vary'] = 'Origin';
      headers['access-control-max-age'] = '600';
    }
    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      headers['access-control-allow-headers'] = 'authorization, content-type';
      send(204);
      return true;
    }
    let body: unknown;
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      let text: string;
      try {
        text = await readBody(req);
      } catch (e) {
        headers['connection'] = 'close';
        if (e instanceof TooLarge) send(413, { error: 'too_large', message: 'That request is too large.' });
        else send(400, { error: 'bad_request', message: 'Could not read the request.' });
        return true;
      }
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          send(400, { error: 'bad_request', message: 'The request was not valid JSON.' });
          return true;
        }
      }
    }
    const auth = req.headers.authorization;
    const out = await api.handle({ method, path, authorization: typeof auth === 'string' ? auth : undefined, body, ip: clientIp(req) });
    send(out.status, out.body);
    return true;
  };
}
