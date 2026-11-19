/**
 * Session tokens: 32 random bytes, sent to the client once and stored server-side only as a
 * SHA-256 hash, so a copy of the database can't be used to sign in. Sessions expire SESSION_DAYS
 * after sign-in. The client sends the token as `Authorization: Bearer <token>` (no cookies: the
 * game is served from a different origin than the server).
 */
import { createHash, randomBytes } from 'node:crypto';
import { SESSION_DAYS } from '../../src/net/accountProtocol';

export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** A user keeps at most this many sessions (devices); signing in again drops the oldest. */
export const MAX_SESSIONS_PER_USER = 10;
/** 32 bytes in base64url: 43 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/** The token from an `Authorization: Bearer …` header, or null if missing or malformed. */
export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer ([^\s]+)$/i.exec((header ?? '').trim());
  return m && TOKEN_PATTERN.test(m[1]) ? m[1] : null;
}

export const isExpired = (s: { expiresAt: number }, now: number) => now >= s.expiresAt;
