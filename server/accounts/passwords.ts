/**
 * Password hashing with Node's built-in scrypt (no native dependencies). Each password gets its
 * own random 16-byte salt; the parameters are stored with the hash so they can be raised later
 * without breaking older accounts. Verification compares with `timingSafeEqual`.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>`.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export interface ScryptParams {
  /** CPU/memory cost (a power of two). Memory used is about 128 · N · r bytes. */
  N: number;
  r: number;
  p: number;
  keyLength: number;
  saltBytes: number;
}

/** N = 2^15, r = 8: about 32 MB of memory per hash, tens of milliseconds of CPU. */
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 15, r: 8, p: 1, keyLength: 32, saltBytes: 16 };
/** Hard limits on parameters read back from storage, so a corrupted row can't exhaust memory. */
const MAX_N = 2 ** 17;
const MAX_R = 16;
const MAX_P = 4;

function derive(password: string, salt: Buffer, keyLength: number, o: { N: number; r: number; p: number }): Promise<Buffer> {
  const opts: ScryptOptions = { N: o.N, r: o.r, p: o.p, maxmem: 256 * o.N * o.r + 1024 * 1024 };
  return new Promise((resolve, reject) => scrypt(password.normalize('NFC'), salt, keyLength, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT): Promise<string> {
  const salt = randomBytes(params.saltBytes);
  const key = await derive(password, salt, params.keyLength, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** True if `password` matches the stored hash. A malformed hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const okInt = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
  if (!okInt(N, MAX_N) || N < 2 || (N & (N - 1)) !== 0 || !okInt(r, MAX_R) || !okInt(p, MAX_P)) return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (salt.length < 8 || expected.length < 16) return false;
  const actual = await derive(password, salt, expected.length, { N, r, p });
  return timingSafeEqual(actual, expected);
}
