/**
 * The cog economy: what players earn, what things cost, the daily featured row, achievements,
 * buying and equipping, and migrating older saves into a profile.
 *
 * One soft currency, **cogs**, earned only by playing (no real money, nothing to buy with money).
 * Everything here is pure and deterministic: callers pass today's date key and `now`, and every
 * function returns a new profile instead of mutating its input. Unit-tested in
 * tests/unit/economy.test.ts; the numbers are explained in docs/ECONOMY.md.
 *
 * Earning is local and client-side for now. Once optional login exists, a server will have to
 * re-derive these rewards from match results before an account balance can be trusted.
 */
import { CATALOGUE, FREE_EMOTES, PAINT_IDS, isHatId, isKeySkinId, itemById, itemsForSecret, type AccessorySlot, type CatalogueItem } from './cosmetics';
import { GESTURE_SLOTS, isEmoteId, type EmoteId } from './emotes';
import { defaultProfile, normalizeProfile, owns, slotOf, type Profile, type UnlockSource } from './profile';

// ---------------------------------------------------------------- currency
export const CURRENCY = { one: 'cog', many: 'cogs' } as const;
export const cogText = (n: number) => `${n} ${n === 1 ? CURRENCY.one : CURRENCY.many}`;

/** Every earning amount in one place (docs/ECONOMY.md explains the pacing). */
export const EARN = {
  /** Any trial played to the end (not quit). */
  finish: 10,
  /** Extra for a solo run (no placings to rank). */
  solo: 5,
  /** First place in a field of 2+; falls linearly to 0 for last place. */
  winnerBonus: 15,
  /** A new personal best in that trial. */
  newBest: 5,
  /** The first win (1st of 2+, or a tournament win) each local calendar day. */
  firstWinOfDay: 50,
  /** Each Playroom secret, once. */
  secret: 40,
  /** Tournament finish: this much per trial in the format… */
  tournamentPerTrial: 10,
  /** …plus a bonus for 1st / 2nd / 3rd overall. */
  tournamentPlace: [60, 35, 20] as readonly number[],
  /** Guessing your Who Am I? card in the online Hub (at most WHOAMI_PAID_PER_HOUR an hour). */
  whoAmI: 5,
} as const;

/** Who Am I? guesses that pay, per rolling hour. */
export const WHOAMI_PAID_PER_HOUR = 3;
/** A card must have been worn this long before guessing it pays (ms): no instant re-deal farming. */
export const WHOAMI_MIN_WORN_MS = 8000;

/**
 * Cogs for guessing your Who Am I? card: EARN.whoAmI, at most WHOAMI_PAID_PER_HOUR times in any
 * hour, and only for a card worn at least WHOAMI_MIN_WORN_MS. `paid` holds the times (ms) of
 * earlier paid guesses; the result keeps only the last hour's.
 */
export function rewardWhoAmI(paid: readonly number[], now: number, wornMs: number): { reward: Reward; paid: number[] } {
  const recent = paid.filter((t) => Number.isFinite(t) && t <= now && now - t < 3_600_000);
  if (wornMs < WHOAMI_MIN_WORN_MS || recent.length >= WHOAMI_PAID_PER_HOUR) return { reward: NO_REWARD, paid: recent };
  const lines: RewardLine[] = [{ label: 'Who Am I? guessed', cogs: EARN.whoAmI }];
  return { reward: { lines, total: EARN.whoAmI, firstWin: false }, paid: [...recent, now] };
}

export interface RewardLine {
  label: string;
  cogs: number;
}
export interface Reward {
  lines: RewardLine[];
  total: number;
  /** This reward includes the first-win-of-the-day bonus (sets `firstWinDay`). */
  firstWin: boolean;
}
export const NO_REWARD: Reward = { lines: [], total: 0, firstWin: false };

/** Local calendar date as YYYY-MM-DD (the day boundary for the daily bonus and the featured row). */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const total = (lines: RewardLine[]) => lines.reduce((a, l) => a + l.cogs, 0);

/** The placements a reward needs (a subset of the minigame contract's Placement). */
export interface PlacementLike {
  contestantId: string;
  place: number;
  forfeit?: boolean;
}

/** Cogs for one finished trial (practice or a tournament round). Quitting earns nothing. */
export function rewardForGame(o: { placements: readonly PlacementLike[]; localId: string; newBest: boolean; today: string; firstWinDay: string | null }): Reward {
  const mine = o.placements.find((p) => p.contestantId === o.localId);
  if (!mine || mine.forfeit) return NO_REWARD;
  const n = o.placements.length;
  const lines: RewardLine[] = [{ label: 'Finished the trial', cogs: EARN.finish }];
  if (n <= 1) lines.push({ label: 'Solo run', cogs: EARN.solo });
  else {
    const place = Math.max(1, Math.min(n, mine.place));
    const bonus = Math.round((EARN.winnerBonus * (n - place)) / (n - 1));
    if (bonus > 0) lines.push({ label: `${ordinal(place)} place`, cogs: bonus });
  }
  if (o.newBest) lines.push({ label: 'Personal best', cogs: EARN.newBest });
  const firstWin = n > 1 && mine.place === 1 && o.firstWinDay !== o.today;
  if (firstWin) lines.push({ label: 'First win of the day', cogs: EARN.firstWinOfDay });
  return { lines, total: total(lines), firstWin };
}

/** Cogs for finishing a whole tournament (on top of each round's own reward). */
export function rewardForTournament(o: { trials: number; place: number; today: string; firstWinDay: string | null }): Reward {
  const lines: RewardLine[] = [{ label: `Tournament of ${o.trials} trials`, cogs: EARN.tournamentPerTrial * Math.max(0, o.trials) }];
  const bonus = EARN.tournamentPlace[o.place - 1] ?? 0;
  if (bonus > 0) lines.push({ label: o.place === 1 ? 'Tournament champion' : `${ordinal(o.place)} overall`, cogs: bonus });
  const firstWin = o.place === 1 && o.firstWinDay !== o.today;
  if (firstWin) lines.push({ label: 'First win of the day', cogs: EARN.firstWinOfDay });
  return { lines, total: total(lines), firstWin };
}

/** Pay a reward into the wallet. */
export function applyReward(profile: Profile, reward: Reward, today: string): Profile {
  if (reward.total <= 0 && !reward.firstWin) return profile;
  return {
    ...profile,
    wallet: { ...profile.wallet, cogs: profile.wallet.cogs + reward.total, earned: profile.wallet.earned + reward.total },
    firstWinDay: reward.firstWin ? today : profile.firstWinDay,
  };
}

function grant(profile: Profile, ids: string[], source: UnlockSource, now: number): Profile {
  const fresh = ids.filter((id) => !owns(profile, id));
  if (!fresh.length) return profile;
  const owned = { ...profile.owned };
  for (const id of fresh) owned[id] = { source, at: now };
  return { ...profile, owned };
}

/** A Playroom secret was found: its items unlock and it pays EARN.secret once. */
export function rewardSecret(profile: Profile, secretId: string, now: number): { profile: Profile; cogs: number; items: CatalogueItem[] } {
  const items = itemsForSecret(secretId).filter((i) => !owns(profile, i.id));
  let p = grant(profile, items.map((i) => i.id), 'secret', now);
  let cogs = 0;
  if (!p.secretsPaid.includes(secretId)) {
    cogs = EARN.secret;
    p = { ...p, secretsPaid: [...p.secretsPaid, secretId], wallet: { ...p.wallet, cogs: p.wallet.cogs + cogs, earned: p.wallet.earned + cogs } };
  }
  return { profile: p, cogs, items };
}

// ---------------------------------------------------------------- achievements
export interface PlayerStats {
  trialsPlayed: number;
  trialWins: number;
  tournamentWins: number;
}
export interface Achievement {
  id: string;
  label: string;
  itemId: string;
  met: (s: PlayerStats) => boolean;
}
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'champion', label: 'Win a tournament', itemId: 'laurel', met: (s) => s.tournamentWins >= 1 },
  { id: 'trial-winner', label: 'Win 10 trials against other toys', itemId: 'medal', met: (s) => s.trialWins >= 10 },
  { id: 'regular', label: 'Finish 25 trials', itemId: 'gear', met: (s) => s.trialsPlayed >= 25 },
];
export const achievementById = (id: string | undefined) => ACHIEVEMENTS.find((a) => a.id === id);

type RecordsLike = Partial<Record<string, { plays?: number; wins?: number } | undefined>>;
/** Stats for achievements, from the persisted records. */
export function statsFrom(records: RecordsLike | undefined, tournamentWins: Partial<Record<string, number | undefined>> | undefined): PlayerStats {
  const recs = Object.values(records ?? {});
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return {
    trialsPlayed: recs.reduce((a, r) => a + n(r?.plays), 0),
    trialWins: recs.reduce((a, r) => a + n(r?.wins), 0),
    tournamentWins: Object.values(tournamentWins ?? {}).reduce<number>((a, w) => a + n(w), 0),
  };
}

/** Grant every achievement the stats now meet (and its item). */
export function grantAchievements(profile: Profile, stats: PlayerStats, now: number): { profile: Profile; unlocked: CatalogueItem[] } {
  const fresh = ACHIEVEMENTS.filter((a) => !profile.achievements.includes(a.id) && a.met(stats));
  if (!fresh.length) return { profile, unlocked: [] };
  let p: Profile = { ...profile, achievements: [...profile.achievements, ...fresh.map((a) => a.id)] };
  const items = fresh.map((a) => itemById(a.itemId)).filter((i): i is CatalogueItem => !!i && !owns(p, i.id));
  p = grant(p, items.map((i) => i.id), 'achievement', now);
  return { profile: p, unlocked: items };
}

// ---------------------------------------------------------------- shop: featured row and prices
export const FEATURED_COUNT = 3;
/** Featured items cost this much less (rounded to 5 cogs). */
export const FEATURED_DISCOUNT = 0.25;

/** Shop items (sold for cogs). */
export const SHOP_ITEMS: readonly CatalogueItem[] = CATALOGUE.filter((i) => i.unlock === 'shop');

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's featured items: FEATURED_COUNT shop items from different categories, the same all day for everyone. */
export function featuredFor(today: string): string[] {
  const rng = mulberry(hash(`featured:${today}`));
  const pool = [...SHOP_ITEMS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks: CatalogueItem[] = [];
  for (const it of pool) if (picks.length < FEATURED_COUNT && !picks.some((p) => p.category === it.category)) picks.push(it);
  for (const it of pool) if (picks.length < FEATURED_COUNT && !picks.includes(it)) picks.push(it);
  return picks.map((i) => i.id);
}

/** What an item costs today (featured items are discounted). 0 for anything not sold. */
export function priceFor(item: CatalogueItem, today: string): number {
  if (item.unlock !== 'shop') return 0;
  if (!featuredFor(today).includes(item.id)) return item.price;
  return Math.max(5, Math.round((item.price * (1 - FEATURED_DISCOUNT)) / 5) * 5);
}

// ---------------------------------------------------------------- buying and equipping
export type BuyError = 'unknown' | 'not-for-sale' | 'owned' | 'too-poor';
export type BuyResult = { ok: true; profile: Profile; price: number } | { ok: false; error: BuyError; price: number };
export const BUY_ERROR_TEXT: Record<BuyError, string> = {
  unknown: 'That item is not in the catalogue.',
  'not-for-sale': 'That one is not for sale: it is earned in the Playroom.',
  owned: 'You already own it.',
  'too-poor': 'Not enough cogs yet. Play a few trials!',
};

/** Buy one item with cogs. Can't buy twice, can't buy what isn't sold, can't go negative. */
export function buyItem(profile: Profile, id: string, today: string, now: number): BuyResult {
  const item = itemById(id);
  if (!item) return { ok: false, error: 'unknown', price: 0 };
  const price = priceFor(item, today);
  if (item.unlock !== 'shop' || price <= 0) return { ok: false, error: 'not-for-sale', price: 0 };
  if (owns(profile, id)) return { ok: false, error: 'owned', price };
  if (profile.wallet.cogs < price) return { ok: false, error: 'too-poor', price };
  return {
    ok: true,
    price,
    profile: {
      ...profile,
      wallet: { ...profile.wallet, cogs: profile.wallet.cogs - price, spent: profile.wallet.spent + price },
      owned: { ...profile.owned, [id]: { source: 'shop', at: now } },
    },
  };
}

export type EquipError = 'unknown' | 'not-owned';
export type EquipResult = { ok: true; profile: Profile } | { ok: false; error: EquipError };

/**
 * Equip an owned item in its slot. Gestures go into `gestureSlot` (0–3, default: the first slot),
 * swapping places if that gesture is already in another slot.
 */
export function equipItem(profile: Profile, id: string, gestureSlot = 0): EquipResult {
  const item = itemById(id);
  if (!item) return { ok: false, error: 'unknown' };
  if (!owns(profile, id)) return { ok: false, error: 'not-owned' };
  if (isEmoteId(id)) return { ok: true, profile: { ...profile, loadout: { ...profile.loadout, gestures: placeGesture(profile.loadout.gestures, id, gestureSlot) } } };
  const slot = slotOf(id);
  if (!slot) return { ok: false, error: 'unknown' };
  return { ok: true, profile: { ...profile, loadout: { ...profile.loadout, [slot]: id } } };
}

/** Take off a hat or an accessory. Paint and key always have something equipped. */
export function unequipSlot(profile: Profile, slot: 'hat' | AccessorySlot): Profile {
  if (profile.loadout[slot] === 'none') return profile;
  return { ...profile, loadout: { ...profile.loadout, [slot]: 'none' } };
}

/** Put `id` into gesture slot `index`; if it was already in another slot, the two swap. */
export function placeGesture(gestures: readonly EmoteId[], id: EmoteId, index: number): EmoteId[] {
  const i = Math.max(0, Math.min(GESTURE_SLOTS - 1, Math.floor(index)));
  const out = [...gestures];
  while (out.length < GESTURE_SLOTS) out.push(FREE_EMOTES.find((g) => !out.includes(g)) ?? FREE_EMOTES[0]);
  const from = out.indexOf(id);
  if (from === i) return out;
  if (from >= 0) out[from] = out[i];
  out[i] = id;
  return out;
}

// ---------------------------------------------------------------- migration of saves
/**
 * Version of the persisted store (zustand persist `version`): 0 = before profiles, 1 = profile,
 * 2 = the Hub welcome tour (`tourSeen`) plus music/voice volumes and the jukebox track.
 */
export const STORE_VERSION = 2;
/** How many paint jobs existed before the shop (legacy `paintIndex` cycled modulo this). */
const LEGACY_PAINTS = 5;

/**
 * Bring a persisted store state up to STORE_VERSION. Version 0 kept `paintIndex`, `hat` and
 * `keySkin` at the top level and unlocked secret items by checking `secretsFound`. The migration
 * builds a profile that owns the same items, wears the same look, is paid the one-off secret
 * cogs for secrets already found, and gets any achievements its records already meet.
 */
export function migratePersisted(state: unknown, fromVersion: number): Record<string, unknown> {
  const s: Record<string, unknown> = state && typeof state === 'object' ? { ...(state as Record<string, unknown>) } : {};
  if (fromVersion < 1) {
    let p = defaultProfile();
    const secrets = Array.isArray(s.secretsFound) ? s.secretsFound.filter((x): x is string => typeof x === 'string') : [];
    for (const id of secrets) p = rewardSecret(p, id, 0).profile;
    p = grantAchievements(p, statsFrom(s.records as RecordsLike, s.tournamentWins as Record<string, number>), 0).profile;
    const idx = typeof s.paintIndex === 'number' && Number.isFinite(s.paintIndex) ? Math.floor(s.paintIndex) : 0;
    const paint = PAINT_IDS[((idx % LEGACY_PAINTS) + LEGACY_PAINTS) % LEGACY_PAINTS];
    const hat = isHatId(s.hat) && (s.hat === 'none' || owns(p, s.hat)) ? s.hat : 'none';
    const keySkin = isKeySkinId(s.keySkin) && owns(p, s.keySkin) ? s.keySkin : 'classic';
    p = { ...p, loadout: { ...p.loadout, paint, hat, keySkin } };
    delete s.paintIndex;
    delete s.hat;
    delete s.keySkin;
    s.profile = p;
  }
  if (fromVersion < 2 && typeof s.tourSeen !== 'boolean') {
    // Saves from before the welcome tour: someone who has already played trials, found secrets or
    // run a tournament knows their way round the Hub, so they are not shown the first-visit tour
    // (they can still replay it). Everyone else sees it once. The new volumes and jukebox track
    // are filled from the store defaults by the persist merge.
    s.tourSeen = hasPlayedBefore(s);
  }
  s.profile = normalizeProfile(s.profile);
  return s;
}

/** Evidence in an older save that the player has already been round the Hub. */
function hasPlayedBefore(s: Record<string, unknown>): boolean {
  const nonEmpty = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0);
  return nonEmpty(s.records) || nonEmpty(s.secretsFound) || nonEmpty(s.tournamentHistory) || nonEmpty(s.tournamentWins);
}
