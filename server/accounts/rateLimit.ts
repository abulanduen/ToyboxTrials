/**
 * Per-key token buckets for the accounts API (per IP address, per username, per account), built
 * on the socket layer's RateLimiter. Pure: time is passed in. Keys live in memory only and are
 * never logged.
 */
import { RateLimiter } from '../limits';

export interface BucketSpec {
  /** Attempts allowed in a burst. */
  burst: number;
  /** Attempts regained per minute. */
  perMinute: number;
}

/** The limits the accounts API uses (docs/ONLINE.md lists them). */
export const ACCOUNT_LIMITS = {
  /** Every /api request from one IP address. */
  ipAny: { burst: 120, perMinute: 120 },
  /** Login attempts from one IP address. */
  ipLogin: { burst: 20, perMinute: 10 },
  /** Failed logins (or failed delete-account passwords) for one username. */
  userFail: { burst: 10, perMinute: 1 },
  /** Accounts created from one IP address (generous: a class on one school network). */
  ipRegister: { burst: 20, perMinute: 20 / 60 },
  /** Profile saves for one account (the client saves at most every couple of seconds). */
  userSave: { burst: 30, perMinute: 30 },
} as const satisfies Record<string, BucketSpec>;

export class KeyedLimiter {
  private buckets = new Map<string, RateLimiter>();

  constructor(
    private readonly spec: BucketSpec,
    /** Forget the oldest keys beyond this many (memory bound under a flood of addresses). */
    private readonly maxKeys = 50_000,
  ) {}

  private bucket(key: string, now: number): RateLimiter {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      b = new RateLimiter(this.spec.burst, this.spec.perMinute / 60, now);
      this.buckets.set(key, b);
    }
    return b;
  }

  /** Use one attempt; false if the key is out of attempts. */
  take(key: string, now: number): boolean {
    return this.bucket(key, now).take(now);
  }

  /** Would `take` succeed? Doesn't use an attempt (for "count failures only" limits). */
  allows(key: string, now: number): boolean {
    const b = this.buckets.get(key);
    return !b || b.canTake(now);
  }

  /** Drop keys whose buckets have refilled (nothing to remember). */
  prune(now: number): void {
    for (const [k, b] of this.buckets) if (b.isFull(now)) this.buckets.delete(k);
  }

  get size(): number {
    return this.buckets.size;
  }
}
