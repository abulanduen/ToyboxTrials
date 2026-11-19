/**
 * Rate limiting and allowed-origin checks for the socket layer and the accounts API
 * (server/accounts/). Pure (time is passed in).
 */

/**
 * Token bucket: `capacity` messages in a burst, refilled at `perSecond`. A well-behaved client
 * sends ~15 moves a second plus the odd emote, far below the defaults.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;
  /** Messages refused since the limiter was created. */
  dropped = 0;

  constructor(
    private readonly capacity = 40,
    private readonly perSecond = 30,
    now = 0,
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  private refill(now: number) {
    const dt = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + dt * this.perSecond);
  }

  /** True if `take(now)` would succeed, without using a token. */
  canTake(now: number): boolean {
    this.refill(now);
    return this.tokens >= 1;
  }

  /** True when the bucket is full again (an idle key that can be forgotten). */
  isFull(now: number): boolean {
    this.refill(now);
    return this.tokens >= this.capacity;
  }

  /** True if a message arriving at `now` (ms) is allowed. */
  take(now: number): boolean {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    this.dropped++;
    return false;
  }
}

/** Origins allowed when ALLOWED_ORIGINS is not set: local development plus the live client. */
export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost', 'http://localhost:*', 'http://127.0.0.1', 'http://127.0.0.1:*', 'https://toybox-trials.vercel.app'];

/**
 * Parse ALLOWED_ORIGINS: a comma-separated list of exact origins such as
 * `https://toybox-trials.vercel.app`. A `*` matches one host label or a port number
 * (`https://toybox-trials-*.vercel.app`, `http://localhost:*`). Empty/unset → defaults.
 */
export function parseAllowedOrigins(env: string | undefined): RegExp[] {
  const list = (env ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
  return (list.length ? list : DEFAULT_ALLOWED_ORIGINS).map(
    (o) => new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+') + '$'),
  );
}

export function isOriginAllowed(origin: string | undefined, rules: RegExp[]): boolean {
  if (!origin) return false;
  const o = origin.toLowerCase();
  return rules.some((r) => r.test(o));
}
