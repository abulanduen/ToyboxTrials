/**
 * The optional accounts API: plain HTTP JSON on the online Hub server (server/accounts/), shared
 * by the client (src/net/account.ts) and the server. Pure TypeScript: no DOM, no Node.
 *
 *   GET    /api/status    → { accounts: boolean }
 *   POST   /api/register  { username, password }  → 201 AuthResponse
 *   POST   /api/login     { username, password }  → 200 AuthResponse
 *   POST   /api/logout    (Bearer)                → 200 { ok: true }
 *   GET    /api/me        (Bearer)                → 200 MeResponse
 *   PUT    /api/profile   (Bearer) { rev, profile } → 200 SaveResponse | 409 ConflictResponse
 *   DELETE /api/account   (Bearer) { password }   → 200 { ok: true }
 *
 * Errors are `{ error: AccountErrorCode, message }` with a player-facing message. docs/ONLINE.md
 * describes the security choices.
 */
import type { Profile } from '../game/profile';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Letters, digits and underscore only (ASCII), USERNAME_MIN–USERNAME_MAX long. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
/** Sessions last this long from sign-in; then the player signs in again. */
export const SESSION_DAYS = 30;

/** Format check for a username (the server also runs the nickname word filter). */
export function usernameProblem(u: unknown): string | null {
  if (typeof u !== 'string' || u.length < USERNAME_MIN || u.length > USERNAME_MAX) return `Usernames are ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
  if (!USERNAME_PATTERN.test(u)) return 'Usernames use letters, digits and _ only.';
  return null;
}

/** Length check for a password, counted in characters (not bytes). */
export function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string') return 'Enter a password.';
  const n = Array.from(p).length;
  if (n < PASSWORD_MIN) return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (n > PASSWORD_MAX) return `Passwords are at most ${PASSWORD_MAX} characters.`;
  return null;
}

export interface Credentials {
  username: string;
  password: string;
}

/** Register and login. `profile` is null until the account's first save (`rev` 0). */
export interface AuthResponse {
  token: string;
  username: string;
  rev: number;
  profile: Profile | null;
}

export interface MeResponse {
  username: string;
  rev: number;
  profile: Profile | null;
  /** When the profile was last saved (ms since epoch), or null. */
  savedAt: number | null;
}

export interface SaveRequest {
  /** The `rev` this save is based on (optimistic concurrency). */
  rev: number;
  profile: Profile;
}
export interface SaveResponse {
  rev: number;
  /** The profile as stored: cleaned and soft-capped, so it can differ from what was sent. */
  profile: Profile;
  /** Wallet values the soft cap lowered (empty when the save went through as sent). */
  adjusted: string[];
}
/** 409: another device saved first. The client merges into this copy and saves again. */
export interface ConflictResponse {
  error: 'conflict';
  message: string;
  rev: number;
  profile: Profile | null;
}

export type AccountErrorCode =
  | 'bad_request'
  | 'username_invalid'
  | 'username_taken'
  | 'password_invalid'
  | 'wrong_credentials'
  | 'unauthorized'
  | 'conflict'
  | 'rate_limited'
  | 'too_large'
  | 'forbidden'
  | 'not_found'
  | 'busy'
  | 'accounts_off'
  | 'server_error';

export interface ErrorResponse {
  error: AccountErrorCode;
  message: string;
}

/** Player-facing text for each error (the server sends these; the client falls back on them). */
export const ACCOUNT_ERROR_TEXT: Record<AccountErrorCode, string> = {
  bad_request: 'Something went wrong with that request. Try again.',
  username_invalid: `Usernames are ${USERNAME_MIN} to ${USERNAME_MAX} letters, digits or _.`,
  username_taken: 'That username is taken. Try another.',
  password_invalid: `Passwords are ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`,
  wrong_credentials: 'Wrong username or password.',
  unauthorized: 'You are signed out. Sign in again.',
  conflict: 'Your toy changed on another device.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
  too_large: 'That request is too large.',
  forbidden: 'This site is not allowed to use the accounts server.',
  not_found: 'Not found.',
  busy: 'The server is busy. Try again in a moment.',
  accounts_off: "Accounts aren't switched on yet. You can keep playing as a guest.",
  server_error: 'The server had a problem. Try again later.',
};

/** Largest JSON body the server reads, in bytes (a full profile is about 3 KB). */
export const MAX_BODY_BYTES = 32 * 1024;

/** The accounts API sits on the online Hub server: its ws:// or wss:// address as http(s)://. */
export function apiBaseFrom(serverUrl: string | null): string | null {
  if (!serverUrl) return null;
  const m = /^(wss?):\/\/([^\s/]+)/.exec(serverUrl);
  if (!m) return null;
  return `${m[1] === 'wss' ? 'https' : 'http'}://${m[2]}`;
}
