/**
 * The player profile: wallet, owned items (with how each was unlocked), the equipped loadout and
 * a little economy bookkeeping. One plain, JSON-serialisable object, persisted inside the game
 * store (`profile`) and, once optional login exists, synced to an account (docs/ECONOMY.md).
 *
 * Pure: no DOM, no store, no clock (callers pass `now`). Rules that change the profile (earning,
 * buying, equipping, migration) live in economy.ts.
 */
import {
  ACCESSORY_SLOTS,
  ACHIEVEMENT_IDS,
  SECRET_IDS,
  STARTER_IDS,
  cleanAccessories,
  isHatId,
  isKeySkinId,
  isPaintId,
  itemById,
  type AccessorySlot,
  type BackId,
  type FaceId,
  type HatId,
  type KeySkinId,
  type NeckId,
  type PaintId,
} from './cosmetics';
import { FREE_EMOTES, GESTURE_SLOTS, isEmoteId, type EmoteId } from './emotes';

/** Bump when the profile shape changes, and add a step to `migrateProfile` in economy.ts. */
export const PROFILE_SCHEMA = 1;

/** How an owned item was unlocked. Starter items are owned implicitly and never listed. */
export type UnlockSource = 'shop' | 'secret' | 'achievement' | 'gift';

export interface OwnedItem {
  source: UnlockSource;
  /** When it was unlocked (ms since epoch; 0 if unknown, e.g. migrated). */
  at: number;
}

export interface Loadout {
  paint: PaintId;
  hat: HatId;
  keySkin: KeySkinId;
  back: BackId;
  face: FaceId;
  neck: NeckId;
  /** The gestures on keys 1–4 / the touch Emote menu, in order. Always GESTURE_SLOTS distinct ids. */
  gestures: EmoteId[];
}

export interface Profile {
  schema: number;
  wallet: {
    /** Spendable balance. Never negative. */
    cogs: number;
    /** Lifetime totals, for the profile card and for sanity checks when syncing. */
    earned: number;
    spent: number;
  };
  /** Non-starter items this toy owns, keyed by catalogue id. */
  owned: Record<string, OwnedItem>;
  loadout: Loadout;
  /** Local date (YYYY-MM-DD) of the last first-win-of-the-day bonus. */
  firstWinDay: string | null;
  /** Secrets whose one-off cog reward has been paid. */
  secretsPaid: string[];
  /** Achievement ids already granted. */
  achievements: string[];
}

export const DEFAULT_LOADOUT: Loadout = {
  paint: 'toy-blue',
  hat: 'none',
  keySkin: 'classic',
  back: 'none',
  face: 'none',
  neck: 'none',
  gestures: [...FREE_EMOTES],
};

export function defaultProfile(): Profile {
  return {
    schema: PROFILE_SCHEMA,
    wallet: { cogs: 0, earned: 0, spent: 0 },
    owned: {},
    loadout: { ...DEFAULT_LOADOUT, gestures: [...DEFAULT_LOADOUT.gestures] },
    firstWinDay: null,
    secretsPaid: [],
    achievements: [],
  };
}

/** Does this profile own the item? Starter items always; others once unlocked. Unknown ids: no. */
export function owns(profile: Profile, id: string): boolean {
  if (!itemById(id)) return false;
  return STARTER_IDS.includes(id) || Object.prototype.hasOwnProperty.call(profile.owned, id);
}

/** The loadout value an item occupies, e.g. a hat's slot is `hat`, a scarf's is `neck`. Gestures have none. */
export type LoadoutSlot = 'paint' | 'hat' | 'keySkin' | AccessorySlot;
export function slotOf(id: string): LoadoutSlot | null {
  const item = itemById(id);
  if (!item) return null;
  switch (item.category) {
    case 'paint':
      return 'paint';
    case 'hat':
      return 'hat';
    case 'key':
      return 'keySkin';
    case 'accessory':
      return item.slot ?? null;
    default:
      return null;
  }
}

/** Is `id` equipped (in its slot, or as one of the four gestures)? */
export function isEquipped(loadout: Loadout, id: string): boolean {
  if (isEmoteId(id)) return loadout.gestures.includes(id);
  const slot = slotOf(id);
  return slot !== null && loadout[slot] === id;
}

/** Four distinct, known gesture ids: unknown and repeated ids are dropped, gaps filled with the free ones. */
export function normalizeGestures(raw: unknown, canUse: (id: EmoteId) => boolean = () => true): EmoteId[] {
  const out: EmoteId[] = [];
  if (Array.isArray(raw)) for (const g of raw) if (isEmoteId(g) && canUse(g) && !out.includes(g) && out.length < GESTURE_SLOTS) out.push(g);
  for (const g of FREE_EMOTES) if (out.length < GESTURE_SLOTS && !out.includes(g)) out.push(g);
  return out;
}

/** Whole, non-negative and below 2^53 (JSON numbers beyond that lose precision). */
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(v)) : 0);
/** Distinct strings from `v` that are in `known` (unknown ids are dropped). */
const idList = (v: unknown, known: readonly string[]) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && known.includes(x)))] : []);
const SOURCES: readonly UnlockSource[] = ['shop', 'secret', 'achievement', 'gift'];

/**
 * Make any stored value a valid profile: unknown items, secrets and achievements are dropped,
 * negative or missing numbers become 0, and anything equipped that isn't owned goes back to the
 * default. Never throws.
 *
 * Shared by the client (every load of the saved store) and the accounts server (every profile an
 * account saves, server/accounts/api.ts), so both sides clean a profile by exactly the same rules.
 */
export function normalizeProfile(raw: unknown): Profile {
  const p = defaultProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Partial<Record<keyof Profile, unknown>>;
  const w = (r.wallet && typeof r.wallet === 'object' ? r.wallet : {}) as Record<string, unknown>;
  p.wallet = { cogs: num(w.cogs), earned: num(w.earned), spent: num(w.spent) };
  if (r.owned && typeof r.owned === 'object') {
    for (const [id, v] of Object.entries(r.owned as Record<string, unknown>)) {
      const item = itemById(id);
      if (!item || item.unlock === 'starter') continue;
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      const source = SOURCES.includes(o.source as UnlockSource) ? (o.source as UnlockSource) : 'gift';
      p.owned[id] = { source, at: num(o.at) };
    }
  }
  p.firstWinDay = typeof r.firstWinDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.firstWinDay) ? r.firstWinDay : null;
  p.secretsPaid = idList(r.secretsPaid, SECRET_IDS);
  p.achievements = idList(r.achievements, ACHIEVEMENT_IDS);
  const l = (r.loadout && typeof r.loadout === 'object' ? r.loadout : {}) as Record<string, unknown>;
  const ok = (id: unknown) => typeof id === 'string' && owns(p, id);
  const acc = cleanAccessories(l as Partial<Record<AccessorySlot, unknown>>);
  p.loadout = {
    paint: isPaintId(l.paint) && ok(l.paint) ? l.paint : DEFAULT_LOADOUT.paint,
    hat: isHatId(l.hat) && (l.hat === 'none' || ok(l.hat)) ? l.hat : DEFAULT_LOADOUT.hat,
    keySkin: isKeySkinId(l.keySkin) && ok(l.keySkin) ? l.keySkin : DEFAULT_LOADOUT.keySkin,
    back: acc.back === 'none' || ok(acc.back) ? acc.back : 'none',
    face: acc.face === 'none' || ok(acc.face) ? acc.face : 'none',
    neck: acc.neck === 'none' || ok(acc.neck) ? acc.neck : 'none',
    gestures: normalizeGestures(l.gestures, (g) => owns(p, g)),
  };
  return p;
}

/** The accessories part of a loadout. */
export function accessoriesOf(l: Pick<Loadout, AccessorySlot>) {
  return { back: l.back, face: l.face, neck: l.neck };
}
export { ACCESSORY_SLOTS };
