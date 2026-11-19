/**
 * Optional account: sign in / create account / sign out / delete, and syncing the profile to it.
 * Playing never needs an account; everything here only adds to the local game.
 *
 *   - The API lives on the online Hub server: VITE_SERVER_URL with wss:// → https:// (no new
 *     environment variable). No server, or a server without a database: the Account entries hide.
 *   - The session token is kept in localStorage under ACCOUNT_KEY, separate from the persisted
 *     game store, together with the account's last synced profile (`base`, for merging).
 *   - First sign-in on a device with a guest toy merges it into the account
 *     (mergeGuestIntoAccount) and tells the player in one line what happened.
 *   - Changes are saved about SAVE_DEBOUNCE_MS after the last one, at once when the page is
 *     hidden, and retried quietly with backoff while offline. A save conflict (another device
 *     saved first) is merged (rebaseProfile) and saved again.
 */
import { create } from 'zustand';
import { SERVER_URL } from './config';
import { ACCOUNT_ERROR_TEXT, apiBaseFrom, type AccountErrorCode, type AuthResponse, type ConflictResponse, type MeResponse, type SaveResponse } from './accountProtocol';
import { useGame } from '../game/store';
import { normalizeProfile, type Profile } from '../game/profile';
import { SECRET_IDS } from '../game/cosmetics';
import { mergeGuestIntoAccount, profilesEqual, rebaseProfile } from '../game/profileSync';
import { exposeDebug } from '../game/debug';

export const ACCOUNT_KEY = 'toybox-trials:account';
export const SAVE_DEBOUNCE_MS = 2000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;
const OFFLINE_TEXT = "Can't reach the server. Check your connection and try again.";

export const API_BASE = apiBaseFrom(SERVER_URL);

/** `checking`: asking the server; `on`: accounts work; `off`: no server or no database. */
export type Availability = 'checking' | 'on' | 'off';
/** Shown under "Signed in as …". */
export type SyncStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'error';

export interface AccountState {
  availability: Availability;
  username: string | null;
  sync: SyncStatus;
  /** One line about the last sign-in merge, sign-out or adjustment. */
  notice: string | null;
  sheetOpen: boolean;
  set: (patch: Partial<AccountState>) => void;
}

export const useAccount = create<AccountState>()((set) => ({
  availability: API_BASE ? 'checking' : 'off',
  username: null,
  sync: 'idle',
  notice: null,
  sheetOpen: false,
  set: (patch) => set(patch),
}));

export function openAccountSheet() {
  useAccount.getState().set({ sheetOpen: true });
}
export function closeAccountSheet() {
  useAccount.getState().set({ sheetOpen: false });
}

// ---------------------------------------------------------------- the stored session
interface Saved {
  v: 1;
  token: string;
  username: string;
  /** The account's profile revision this device last synced. */
  rev: number;
  /** The account's profile at `rev` (null before its first save). */
  base: Profile | null;
}

function readSaved(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null');
    if (!raw || raw.v !== 1 || typeof raw.token !== 'string' || typeof raw.username !== 'string') return null;
    return { v: 1, token: raw.token, username: raw.username, rev: Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0, base: raw.base ? normalizeProfile(raw.base) : null };
  } catch {
    return null;
  }
}
function writeSaved(s: Saved | null) {
  try {
    if (s) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* storage full or blocked: the session lasts for this page only */
  }
}

let saved: Saved | null = null;
let saveTimer: number | undefined;
let retryTimer: number | undefined;
let retryDelay = RETRY_MIN_MS;
let inFlight: Promise<void> | null = null;
/** A change arrived while a save was in flight: save again afterwards. */
let again = false;

/** The signed-in session token (the online Hub links it so the leaderboard shows the username), or null. */
export const accountToken = (): string | null => saved?.token ?? null;

// ---------------------------------------------------------------- HTTP
type Result<T> = { status: number; body: T | { error?: AccountErrorCode; message?: string } | null } | { status: 0; body: null };

async function call<T>(method: string, path: string, body?: unknown, opts: { token?: string; keepalive?: boolean } = {}): Promise<Result<T>> {
  if (!API_BASE) return { status: 0, body: null };
  const ctrl = opts.keepalive ? null : new AbortController();
  const timer = ctrl ? window.setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : undefined;
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive: opts.keepalive, signal: ctrl?.signal, credentials: 'omit', cache: 'no-store' });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed as T };
  } catch {
    return { status: 0, body: null };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Player-facing text for a failed request. */
function errorText(r: Result<unknown>): string {
  if (r.status === 0) return OFFLINE_TEXT;
  const b = r.body as { error?: AccountErrorCode; message?: string } | null;
  if (b?.message) return b.message;
  if (b?.error && ACCOUNT_ERROR_TEXT[b.error]) return ACCOUNT_ERROR_TEXT[b.error];
  return ACCOUNT_ERROR_TEXT.server_error;
}

// ---------------------------------------------------------------- local profile
/** Put an account profile on this device: the profile, plus the secrets it has paid out. */
function applyProfile(p: Profile) {
  const g = useGame.getState();
  const next = normalizeProfile(p);
  const secrets = [...new Set([...g.secretsFound, ...next.secretsPaid.filter((id) => (SECRET_IDS as readonly string[]).includes(id))])];
  const patch: Partial<Parameters<typeof g.set>[0]> = {};
  if (!profilesEqual(g.profile, next)) patch.profile = next;
  if (secrets.length !== g.secretsFound.length) patch.secretsFound = secrets;
  if (Object.keys(patch).length) g.set(patch);
}

function setSaved(s: Saved | null) {
  saved = s;
  writeSaved(s);
}

/** Forget the session on this device. The local toy stays as a guest copy. */
function dropSession(notice: string | null) {
  window.clearTimeout(saveTimer);
  window.clearTimeout(retryTimer);
  saveTimer = retryTimer = undefined;
  setSaved(null);
  useAccount.getState().set({ username: null, sync: 'idle', notice });
}

// ---------------------------------------------------------------- saving
function scheduleRetry() {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void saveNow(), retryDelay);
  retryDelay = Math.min(RETRY_MAX_MS, retryDelay * 2);
}

/** Save soon (debounced). Called on every profile change while signed in. */
function scheduleSave() {
  if (!saved) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
  if (useAccount.getState().sync !== 'saving') useAccount.getState().set({ sync: 'pending' });
}

/** Save the local profile to the account now, if it differs from the last synced copy. */
export function saveNow(opts: { keepalive?: boolean } = {}): Promise<void> {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = doSave(opts).finally(() => {
    inFlight = null;
    if (again && saved) {
      again = false;
      scheduleSave();
    }
  });
  return inFlight;
}

async function doSave(opts: { keepalive?: boolean }, attempt = 0): Promise<void> {
  if (!saved) return;
  const acct = useAccount.getState();
  const sent = useGame.getState().profile;
  if (saved.base && profilesEqual(sent, saved.base)) {
    acct.set({ sync: 'saved' });
    return;
  }
  acct.set({ sync: 'saving' });
  const token = saved.token;
  const r = await call<SaveResponse | ConflictResponse>('PUT', '/api/profile', { rev: saved.rev, profile: sent }, { token, keepalive: opts.keepalive });
  if (!saved || saved.token !== token) return; // signed out meanwhile
  if (r.status === 200) {
    const res = r.body as SaveResponse;
    retryDelay = RETRY_MIN_MS;
    window.clearTimeout(retryTimer);
    const stored = normalizeProfile(res.profile);
    setSaved({ ...saved, rev: res.rev, base: stored });
    const now = useGame.getState().profile;
    // Adopt what the server stored (it may have cleaned or capped it), keeping any change made
    // here while the request was out.
    applyProfile(profilesEqual(now, sent) ? stored : rebaseProfile(sent, now, stored));
    const patch: Partial<AccountState> = { sync: 'saved' };
    if (res.adjusted?.length) patch.notice = `The server limited a sudden jump in cogs: your account keeps ${stored.wallet.cogs}.`;
    useAccount.getState().set(patch);
    return;
  }
  if (r.status === 409 && attempt < 3) {
    const c = r.body as ConflictResponse;
    const server = c.profile ? normalizeProfile(c.profile) : null;
    const local = useGame.getState().profile;
    const merged = server ? (saved.base ? rebaseProfile(saved.base, local, server) : mergeGuestIntoAccount(server, local).profile) : local;
    setSaved({ ...saved, rev: c.rev, base: server });
    applyProfile(merged);
    return doSave(opts, attempt + 1);
  }
  if (r.status === 401) {
    dropSession('You were signed out (the sign-in expired). Sign in again to keep saving; your toy is still here.');
    return;
  }
  if (r.status === 400) {
    acct.set({ sync: 'error' });
    return;
  }
  // Offline, rate-limited, busy or the server is down: try again quietly.
  useAccount.getState().set({ sync: 'offline' });
  scheduleRetry();
}

// ---------------------------------------------------------------- signing in and out
/**
 * Sign in or create an account. Returns null on success or a player-facing error. On success the
 * guest toy on this device is merged into the account and the merge is described in `notice`.
 */
export async function signIn(mode: 'login' | 'register', username: string, password: string): Promise<string | null> {
  const r = await call<AuthResponse>('POST', mode === 'login' ? '/api/login' : '/api/register', { username: username.trim(), password });
  if (r.status !== 200 && r.status !== 201) {
    if (r.status === 503) useAccount.getState().set({ availability: 'off' });
    return errorText(r);
  }
  const auth = r.body as AuthResponse;
  const accountProfile = auth.profile ? normalizeProfile(auth.profile) : null;
  const merge = mergeGuestIntoAccount(auth.rev > 0 ? accountProfile : null, useGame.getState().profile);
  setSaved({ v: 1, token: auth.token, username: auth.username, rev: auth.rev, base: accountProfile });
  applyProfile(merge.profile);
  // The online nickname defaults to the username (the player can still change it).
  useGame.getState().set({ contenderName: auth.username.slice(0, 16) });
  // An account that exists but has never saved (rev 0) takes the guest toy too; say "signed in" then.
  const notice = mode === 'login' ? merge.summary.replace(/^Account created/, 'Signed in') : merge.summary;
  useAccount.getState().set({ username: auth.username, notice, availability: 'on' });
  await saveNow();
  return null;
}

/** Sign out: save what's pending, end the session on the server, keep a guest copy here. */
export async function signOut(): Promise<void> {
  if (!saved) return;
  const token = saved.token;
  if (saveTimer !== undefined || useAccount.getState().sync === 'offline') await Promise.race([saveNow(), new Promise((r) => window.setTimeout(r, 4000))]);
  dropSession('Signed out. This device keeps a guest copy of your toy.');
  await call('POST', '/api/logout', undefined, { token });
}

/** Delete the account and everything stored with it. Returns null on success or an error. */
export async function deleteAccount(password: string): Promise<string | null> {
  if (!saved) return ACCOUNT_ERROR_TEXT.unauthorized;
  const r = await call<{ ok: true }>('DELETE', '/api/account', { password }, { token: saved.token });
  if (r.status === 200) {
    dropSession('Your account and everything saved with it are deleted. This device keeps a guest copy of your toy.');
    return null;
  }
  if (r.status === 401 && (r.body as { error?: string } | null)?.error === 'unauthorized') {
    dropSession(null);
    return 'You were signed out. Sign in again to delete the account.';
  }
  return errorText(r);
}

/** On start with a stored session: fetch the account and reconcile with this device. */
async function refresh(): Promise<void> {
  if (!saved) return;
  const token = saved.token;
  const r = await call<MeResponse>('GET', '/api/me', undefined, { token });
  if (!saved || saved.token !== token) return;
  if (r.status === 401) return dropSession('You were signed out (the sign-in expired). Sign in again to keep saving; your toy is still here.');
  if (r.status !== 200) {
    useAccount.getState().set({ sync: 'offline' });
    scheduleRetry();
    return;
  }
  const me = r.body as MeResponse;
  const server = me.profile ? normalizeProfile(me.profile) : null;
  const local = useGame.getState().profile;
  useAccount.getState().set({ username: me.username });
  if (me.rev !== saved.rev) {
    // Another device saved since: merge this device's unsynced changes onto it.
    const merged = server ? (saved.base ? rebaseProfile(saved.base, local, server) : mergeGuestIntoAccount(server, local).profile) : local;
    setSaved({ ...saved, username: me.username, rev: me.rev, base: server });
    applyProfile(merged);
  } else setSaved({ ...saved, username: me.username });
  await saveNow();
}

async function checkAvailability(tries = 3): Promise<void> {
  const r = await call<{ accounts?: boolean }>('GET', '/api/status');
  if (r.status === 200) {
    const on = !!(r.body as { accounts?: boolean } | null)?.accounts;
    useAccount.getState().set({ availability: on ? 'on' : 'off' });
    if (on) void refresh();
    return;
  }
  if (r.status === 0 && tries > 1) {
    window.setTimeout(() => void checkAvailability(tries - 1), 20_000);
    return;
  }
  // Signed-in players keep the Account entry (to sign out) even if the server can't be reached.
  useAccount.getState().set({ availability: saved ? 'on' : 'off', sync: saved ? 'offline' : 'idle' });
  if (saved) scheduleRetry();
}

let installed = false;
/** Start the account layer once (App). Without a server it only marks accounts as off. */
export function installAccount() {
  if (installed) return;
  installed = true;
  if (!API_BASE) return;
  saved = readSaved();
  if (saved) useAccount.getState().set({ username: saved.username, availability: 'on' });
  void checkAvailability();
  useGame.subscribe((s, prev) => {
    if (s.profile !== prev.profile && saved) scheduleSave();
  });
  const flush = () => {
    if (saved && (saveTimer !== undefined || again)) void saveNow({ keepalive: true });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', () => {
    if (saved && useAccount.getState().sync === 'offline') {
      retryDelay = RETRY_MIN_MS;
      void saveNow();
    }
  });
  exposeDebug({
    account: {
      state: () => ({ ...useAccount.getState(), set: undefined, rev: saved?.rev ?? null, signedIn: !!saved }),
      saveNow: () => saveNow(),
    },
  });
}
