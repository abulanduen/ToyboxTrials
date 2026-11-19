/**
 * Account sync rules for the player profile, shared by the client (src/net/account.ts) and the
 * accounts server (server/accounts/api.ts). Pure: no DOM, no Node, no clock (callers pass times).
 *
 *   - `canonicalProfile` / `profilesEqual`: compare two profiles regardless of key order.
 *   - `mergeGuestIntoAccount`: the first sign-in on a device that already has a guest toy.
 *   - `rebaseProfile`: three-way merge after a save conflict (another device saved first).
 *   - `capProfileSave`: the server's soft cap on how fast a saved wallet may grow.
 *
 * The clean-up itself (unknown ids dropped, numbers made whole and non-negative, nothing equipped
 * that isn't owned) is `normalizeProfile` in profile.ts, which every function here runs.
 * docs/ECONOMY.md explains the rules and their limits.
 */
import { EARN } from './economy';
import { defaultProfile, normalizeProfile, type OwnedItem, type Profile } from './profile';

/** The profile as JSON with `owned` sorted by id, so equal profiles give equal strings. */
export function canonicalProfile(p: Profile): string {
  const n = normalizeProfile(p);
  const owned: Record<string, OwnedItem> = {};
  for (const id of Object.keys(n.owned).sort()) owned[id] = n.owned[id];
  return JSON.stringify({ ...n, owned, secretsPaid: [...n.secretsPaid].sort(), achievements: [...n.achievements].sort() });
}

export function profilesEqual(a: Profile | null | undefined, b: Profile | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return canonicalProfile(a) === canonicalProfile(b);
}

/** A toy that has done nothing yet: the default profile. */
export const isBlankProfile = (p: Profile) => profilesEqual(p, defaultProfile());

function unionOwned(a: Record<string, OwnedItem>, b: Record<string, OwnedItem>): Record<string, OwnedItem> {
  const out: Record<string, OwnedItem> = { ...b };
  // Where both own an item, keep `a`'s record (its source and date).
  for (const [id, v] of Object.entries(a)) out[id] = v;
  return out;
}
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];
const laterDay = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b));

export interface GuestMerge {
  profile: Profile;
  /** Items the guest toy brought that the account didn't have. */
  added: number;
  /** Where the balance came from: the account had more, the guest had more, or they were equal. */
  cogsFrom: 'account' | 'guest' | 'same';
  /** One line for the player. */
  summary: string;
}

const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
const cogs = (n: number) => `${n} ${n === 1 ? 'cog' : 'cogs'}`;

/**
 * Signing in on a device that has a guest toy. The rule (docs/ECONOMY.md):
 *   - a brand-new account (never saved, `account` null) simply takes the guest toy;
 *   - otherwise owned items, achievements and paid secrets are a union;
 *   - cogs take the LARGER of the two balances (never the sum), so signing in again, or several
 *     accounts on one shared device, can never mint cogs; the lifetime totals take the larger too;
 *   - the loadout is the account's (the guest's items are added, not worn).
 * The server's soft cap (capProfileSave) still applies when the result is saved.
 */
export function mergeGuestIntoAccount(account: Profile | null, guest: Profile): GuestMerge {
  const g = normalizeProfile(guest);
  if (!account) {
    const n = Object.keys(g.owned).length;
    const summary = isBlankProfile(g)
      ? 'Account created. Your toy will be saved to it from now on.'
      : `Account created with this device's toy: ${cogs(g.wallet.cogs)}${n ? ` and ${items(n)}` : ''} are saved to it now.`;
    return { profile: g, added: n, cogsFrom: 'guest', summary };
  }
  const a = normalizeProfile(account);
  const added = Object.keys(g.owned).filter((id) => !a.owned[id]).length;
  const cogsFrom = g.wallet.cogs > a.wallet.cogs ? 'guest' : g.wallet.cogs < a.wallet.cogs ? 'account' : 'same';
  const merged = normalizeProfile({
    ...a,
    wallet: { cogs: Math.max(a.wallet.cogs, g.wallet.cogs), earned: Math.max(a.wallet.earned, g.wallet.earned), spent: Math.max(a.wallet.spent, g.wallet.spent) },
    owned: unionOwned(a.owned, g.owned),
    loadout: a.loadout,
    firstWinDay: laterDay(a.firstWinDay, g.firstWinDay),
    secretsPaid: union(a.secretsPaid, g.secretsPaid),
    achievements: union(a.achievements, g.achievements),
  });
  let summary: string;
  if (isBlankProfile(g) || (added === 0 && cogsFrom !== 'guest')) summary = `Signed in: loaded your account's toy (${cogs(merged.wallet.cogs)}).`;
  else {
    const parts: string[] = [];
    if (added) parts.push(`added ${items(added)} from this device`);
    parts.push(cogsFrom === 'guest' ? `kept this device's larger balance (${cogs(merged.wallet.cogs)})` : `kept your account's balance (${cogs(merged.wallet.cogs)})`);
    summary = `Signed in: ${parts.join(' and ')}. Your account's look is on.`;
  }
  return { profile: merged, added, cogsFrom, summary };
}

/**
 * Three-way merge after a save conflict. `base` is the copy this device last synced, `local` is
 * what it has now and `server` is what another device saved since. The wallet keeps the server's
 * value plus this device's own change since `base` (so a purchase here and a reward there both
 * count, once each). Items, achievements and secrets are a union. This device's loadout wins only
 * if it was changed here since `base`.
 */
export function rebaseProfile(base: Profile, local: Profile, server: Profile): Profile {
  const b = normalizeProfile(base);
  const l = normalizeProfile(local);
  const s = normalizeProfile(server);
  const loadoutChanged = JSON.stringify(l.loadout) !== JSON.stringify(b.loadout);
  return normalizeProfile({
    ...s,
    wallet: {
      cogs: Math.max(0, s.wallet.cogs + (l.wallet.cogs - b.wallet.cogs)),
      earned: s.wallet.earned + Math.max(0, l.wallet.earned - b.wallet.earned),
      spent: s.wallet.spent + Math.max(0, l.wallet.spent - b.wallet.spent),
    },
    owned: unionOwned(s.owned, l.owned),
    loadout: loadoutChanged ? l.loadout : s.loadout,
    firstWinDay: laterDay(s.firstWinDay, l.firstWinDay),
    secretsPaid: union(s.secretsPaid, l.secretsPaid),
    achievements: union(s.achievements, l.achievements),
  });
}

// ---------------------------------------------------------------- the server's soft cap
/**
 * How fast a saved wallet may grow. There is no server-side reward authority yet (trials run in
 * the browser), so this is a SOFT CAP against absurd values, not anti-cheat: a modified client can
 * still claim anything up to the cap. See docs/ECONOMY.md.
 */
export const SOFT_CAP = {
  /**
   * Most cogs a minute of play can plausibly earn. A trial pays at most 30 (finish 10 + 1st place
   * 15 + personal best 5) and the quickest take well over 30 s; tournaments and the daily win add
   * one-off bonuses, which BURST covers. 60 a minute is about double a fast player's real rate.
   */
  perMinute: 60,
  /** Always allowed on top: the first win of the day, a tournament finish and a secret or two. */
  burst: EARN.firstWinOfDay + 60 + 80 + 2 * EARN.secret,
  /** Elapsed time counts up to this much (a long gap between saves doesn't bank more). */
  maxBankMs: 12 * 60 * 60 * 1000,
  /** The first save of a brand-new account imports the guest toy: a one-off allowance. */
  importCogs: 50_000,
} as const;

export interface CapResult {
  profile: Profile;
  /** Which values were lowered ('cogs', 'earned'); empty when the save was within the cap. */
  adjusted: string[];
}

/** Most the wallet may grow in a save made `elapsedMs` after the previous one. */
export function walletAllowance(elapsedMs: number): number {
  const ms = Math.max(0, Math.min(SOFT_CAP.maxBankMs, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  return SOFT_CAP.burst + Math.floor((SOFT_CAP.perMinute * ms) / 60_000);
}

/**
 * Clean an incoming save and apply the soft cap. `stored` is the account's current profile (null
 * if it has never saved one: the first save imports the guest toy, up to SOFT_CAP.importCogs).
 * Balances may always go down (spending); they may only rise by `walletAllowance` since the last
 * save. Never throws; the result is always a valid profile.
 */
export function capProfileSave(o: { stored: Profile | null; storedAt: number; incoming: unknown; now: number }): CapResult {
  const p = normalizeProfile(o.incoming);
  const adjusted: string[] = [];
  const limit = (key: 'cogs' | 'earned', max: number) => {
    if (p.wallet[key] > max) {
      p.wallet[key] = Math.max(0, Math.floor(max));
      adjusted.push(key);
    }
  };
  if (!o.stored) limit('cogs', SOFT_CAP.importCogs);
  else {
    const s = normalizeProfile(o.stored);
    const allow = walletAllowance(o.now - o.storedAt);
    limit('cogs', s.wallet.cogs + allow);
    limit('earned', s.wallet.earned + allow);
  }
  return { profile: p, adjusted };
}
