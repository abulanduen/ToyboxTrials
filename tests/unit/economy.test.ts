/* Cog economy (src/game/economy.ts), profile (src/game/profile.ts) and catalogue (src/game/cosmetics.ts). */
import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_SLOTS,
  BACK_IDS,
  CATALOGUE,
  FACE_IDS,
  HAT_IDS,
  KEY_SKIN_IDS,
  NECK_IDS,
  PAINT_IDS,
  RARITIES,
  SECRET_LABELS,
  STARTER_IDS,
  itemById,
  itemsIn,
  paintIdAt,
  paintIndexOf,
} from '../../src/game/cosmetics';
import { PAINT_JOBS, RARITY } from '../../src/game/palette';
import { EMOTE_IDS, FREE_EMOTES, GESTURE_SLOTS } from '../../src/game/emotes';
import {
  ACHIEVEMENTS,
  EARN,
  FEATURED_COUNT,
  NO_REWARD,
  SHOP_ITEMS,
  STORE_VERSION,
  applyReward,
  buyItem,
  dateKey,
  equipItem,
  featuredFor,
  grantAchievements,
  migratePersisted,
  placeGesture,
  priceFor,
  rewardForGame,
  rewardForTournament,
  rewardSecret,
  statsFrom,
  unequipSlot,
} from '../../src/game/economy';
import { DEFAULT_LOADOUT, defaultProfile, isEquipped, normalizeProfile, owns, type Profile } from '../../src/game/profile';

const TODAY = '2026-11-19';
const rich = (cogs = 5000): Profile => ({ ...defaultProfile(), wallet: { cogs, earned: cogs, spent: 0 } });
const field = (n: number, myPlace: number) => Array.from({ length: n }, (_, i) => ({ contestantId: i === 0 ? 'you' : `bot-${i}`, place: i === 0 ? myPlace : i + 1 > myPlace ? i + 1 : i }));
/** A shop item that is not featured today (so its price is the list price). */
const unfeatured = (cat?: string) => SHOP_ITEMS.find((i) => (!cat || i.category === cat) && !featuredFor(TODAY).includes(i.id))!;

describe('catalogue integrity', () => {
  it('has 30–50 items with unique ids across every category', () => {
    const ids = CATALOGUE.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    expect(ids.length).toBeLessThanOrEqual(50);
    for (const c of ['paint', 'hat', 'key', 'accessory', 'gesture'] as const) expect(itemsIn(c).length).toBeGreaterThan(0);
  });
  it('prices: shop items cost a positive multiple of 5; everything else is free', () => {
    for (const i of CATALOGUE) {
      if (i.unlock === 'shop') {
        expect(i.price, i.id).toBeGreaterThan(0);
        expect(i.price % 5, i.id).toBe(0);
      } else expect(i.price, i.id).toBe(0);
      expect(RARITIES).toContain(i.rarity);
      expect(Object.keys(RARITY)).toContain(i.rarity);
      expect(i.name.length).toBeGreaterThan(1);
      expect(i.blurb.length).toBeGreaterThan(3);
    }
  });
  it('accessories have exactly one valid slot; nothing else has a slot', () => {
    for (const i of CATALOGUE) {
      if (i.category === 'accessory') expect(ACCESSORY_SLOTS).toContain(i.slot);
      else expect(i.slot).toBeUndefined();
    }
    expect(itemsIn('accessory', 'back').map((i) => i.id).sort()).toEqual([...BACK_IDS].sort());
    expect(itemsIn('accessory', 'face').map((i) => i.id).sort()).toEqual([...FACE_IDS].sort());
    expect(itemsIn('accessory', 'neck').map((i) => i.id).sort()).toEqual([...NECK_IDS].sort());
    for (const s of ACCESSORY_SLOTS) expect(itemsIn('accessory', s).length).toBeGreaterThanOrEqual(3);
  });
  it('id lists, paint jobs and gestures agree with the catalogue', () => {
    expect(itemsIn('hat').map((i) => i.id).sort()).toEqual(HAT_IDS.filter((h) => h !== 'none').sort());
    expect(itemsIn('key').map((i) => i.id).sort()).toEqual([...KEY_SKIN_IDS].sort());
    expect(itemsIn('paint').map((i) => i.id)).toEqual([...PAINT_IDS]);
    expect(itemsIn('paint').map((i) => i.paintIndex)).toEqual(PAINT_JOBS.map((_, i) => i));
    expect(itemsIn('gesture').map((i) => i.id).sort()).toEqual([...EMOTE_IDS].sort());
    for (const g of FREE_EMOTES) expect(itemById(g)?.unlock).toBe('starter');
    expect(itemsIn('gesture').filter((i) => i.unlock === 'shop').length).toBeGreaterThanOrEqual(6);
    expect(paintIdAt(7)).toBe('racing-red');
    expect(paintIndexOf('copper-kettle')).toBe(10);
  });
  it('secret and achievement unlocks point at real secrets and achievements', () => {
    for (const i of CATALOGUE.filter((x) => x.unlock === 'secret')) {
      expect(Object.keys(SECRET_LABELS)).toContain(i.secret);
      expect(SECRET_LABELS[i.secret!]).toBeTruthy();
    }
    for (const i of CATALOGUE.filter((x) => x.unlock === 'achievement')) expect(ACHIEVEMENTS.map((a) => a.id)).toContain(i.achievement);
    for (const a of ACHIEVEMENTS) expect(itemById(a.itemId)?.achievement).toBe(a.id);
  });
  it('the old starter cosmetics are still free (existing saves keep them)', () => {
    for (const id of ['toy-blue', 'coral-clank', 'sage-sprocket', 'honey-hustle', 'midnight-tin', 'thimble', 'bottlecap', 'classic', 'heart', ...FREE_EMOTES]) expect(STARTER_IDS).toContain(id);
  });
});

describe('earning', () => {
  it('pays for finishing, scaled by placement', () => {
    const solo = rewardForGame({ placements: field(1, 1), localId: 'you', newBest: false, today: TODAY, firstWinDay: TODAY });
    expect(solo.total).toBe(EARN.finish + EARN.solo);
    const win = rewardForGame({ placements: field(4, 1), localId: 'you', newBest: false, today: TODAY, firstWinDay: TODAY });
    const second = rewardForGame({ placements: field(4, 2), localId: 'you', newBest: false, today: TODAY, firstWinDay: TODAY });
    const last = rewardForGame({ placements: field(4, 4), localId: 'you', newBest: false, today: TODAY, firstWinDay: TODAY });
    expect(win.total).toBe(EARN.finish + EARN.winnerBonus);
    expect(second.total).toBe(EARN.finish + 10);
    expect(last.total).toBe(EARN.finish);
    expect(win.total).toBeGreaterThan(second.total);
    expect(second.total).toBeGreaterThan(last.total);
  });
  it('adds a personal-best bonus and the first win of the day, once per day', () => {
    const r = rewardForGame({ placements: field(3, 1), localId: 'you', newBest: true, today: TODAY, firstWinDay: '2026-11-18' });
    expect(r.firstWin).toBe(true);
    expect(r.total).toBe(EARN.finish + EARN.winnerBonus + EARN.newBest + EARN.firstWinOfDay);
    const p = applyReward(defaultProfile(), r, TODAY);
    expect(p.firstWinDay).toBe(TODAY);
    expect(p.wallet).toEqual({ cogs: r.total, earned: r.total, spent: 0 });
    const again = rewardForGame({ placements: field(3, 1), localId: 'you', newBest: false, today: TODAY, firstWinDay: p.firstWinDay });
    expect(again.firstWin).toBe(false);
    // A solo run is not a "win".
    expect(rewardForGame({ placements: field(1, 1), localId: 'you', newBest: false, today: TODAY, firstWinDay: null }).firstWin).toBe(false);
  });
  it('pays nothing for a forfeit or when the local player is missing', () => {
    const quit = field(3, 3).map((p) => (p.contestantId === 'you' ? { ...p, forfeit: true } : p));
    expect(rewardForGame({ placements: quit, localId: 'you', newBest: false, today: TODAY, firstWinDay: null })).toBe(NO_REWARD);
    expect(rewardForGame({ placements: field(3, 1), localId: 'nobody', newBest: false, today: TODAY, firstWinDay: null }).total).toBe(0);
    expect(applyReward(defaultProfile(), NO_REWARD, TODAY)).toEqual(defaultProfile());
  });
  it('pays tournament finishes by length and final place', () => {
    const champ = rewardForTournament({ trials: 5, place: 1, today: TODAY, firstWinDay: TODAY });
    expect(champ.total).toBe(5 * EARN.tournamentPerTrial + EARN.tournamentPlace[0]);
    expect(rewardForTournament({ trials: 3, place: 2, today: TODAY, firstWinDay: null }).total).toBe(30 + EARN.tournamentPlace[1]);
    expect(rewardForTournament({ trials: 8, place: 5, today: TODAY, firstWinDay: null }).total).toBe(80);
    expect(rewardForTournament({ trials: 3, place: 1, today: TODAY, firstWinDay: null }).firstWin).toBe(true);
  });
  it('pays each secret once and unlocks its items', () => {
    const a = rewardSecret(defaultProfile(), 'marble', 1);
    expect(a.cogs).toBe(EARN.secret);
    expect(a.items.map((i) => i.id)).toEqual(['acorn']);
    expect(owns(a.profile, 'acorn')).toBe(true);
    expect(a.profile.owned.acorn).toEqual({ source: 'secret', at: 1 });
    const b = rewardSecret(a.profile, 'marble', 2);
    expect(b.cogs).toBe(0);
    expect(b.profile.wallet.cogs).toBe(EARN.secret);
  });
  it('lets a regular player buy something every few games', () => {
    // A middling practice player against 3 bots: places 1–4 in turn, no bonuses.
    const perGame = [1, 2, 3, 4].map((p) => rewardForGame({ placements: field(4, p), localId: 'you', newBest: false, today: TODAY, firstWinDay: TODAY }).total);
    const avg = perGame.reduce((a, b) => a + b, 0) / perGame.length;
    const cheapest = Math.min(...SHOP_ITEMS.map((i) => i.price));
    const median = [...SHOP_ITEMS].sort((a, b) => a.price - b.price)[Math.floor(SHOP_ITEMS.length / 2)].price;
    expect(cheapest / avg).toBeLessThanOrEqual(5);
    expect(median / avg).toBeLessThanOrEqual(10);
  });
  it('local date keys roll over at local midnight', () => {
    expect(dateKey(new Date(2026, 10, 19, 23, 59))).toBe('2026-11-19');
    expect(dateKey(new Date(2026, 10, 20, 0, 1))).toBe('2026-11-20');
    expect(dateKey(new Date(2027, 0, 5))).toBe('2027-01-05');
  });
});

describe('achievements', () => {
  it('reads stats from records and grants each achievement once', () => {
    const stats = statsFrom({ 'copycat-conductor': { best: 9, plays: 20, wins: 6 }, 'jack-in-the-box': { best: 3, plays: 6, wins: 4 } }, { blitz: 1 });
    expect(stats).toEqual({ trialsPlayed: 26, trialWins: 10, tournamentWins: 1 });
    const g = grantAchievements(defaultProfile(), stats, 5);
    expect(g.unlocked.map((i) => i.id).sort()).toEqual(['gear', 'laurel', 'medal']);
    expect(g.profile.owned.laurel.source).toBe('achievement');
    expect(grantAchievements(g.profile, stats, 6).unlocked).toEqual([]);
    expect(grantAchievements(defaultProfile(), statsFrom({}, {}), 1).unlocked).toEqual([]);
  });
});

describe('daily featured row', () => {
  it('is deterministic by date, distinct, from different categories and only shop items', () => {
    const a = featuredFor(TODAY);
    expect(a).toEqual(featuredFor(TODAY));
    expect(a).toHaveLength(FEATURED_COUNT);
    expect(new Set(a).size).toBe(FEATURED_COUNT);
    expect(new Set(a.map((id) => itemById(id)!.category)).size).toBe(FEATURED_COUNT);
    for (const id of a) expect(itemById(id)!.unlock).toBe('shop');
  });
  it('rotates from day to day', () => {
    const days = Array.from({ length: 14 }, (_, i) => featuredFor(dateKey(new Date(2026, 10, 1 + i))).join());
    expect(new Set(days).size).toBeGreaterThanOrEqual(10);
  });
  it('featured items are discounted, rounded to 5 cogs; others cost the list price', () => {
    for (const id of featuredFor(TODAY)) {
      const it = itemById(id)!;
      const p = priceFor(it, TODAY);
      expect(p).toBeLessThan(it.price);
      expect(p % 5).toBe(0);
      expect(p).toBeGreaterThan(0);
    }
    const plain = unfeatured();
    expect(priceFor(plain, TODAY)).toBe(plain.price);
    expect(priceFor(itemById('acorn')!, TODAY)).toBe(0);
  });
});

describe('buying', () => {
  it('buys an item: cogs go down, the item is owned with its source', () => {
    const it = unfeatured('accessory');
    const r = buyItem(rich(1000), it.id, TODAY, 42);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.price).toBe(it.price);
    expect(r.profile.wallet).toEqual({ cogs: 1000 - it.price, earned: 1000, spent: it.price });
    expect(r.profile.owned[it.id]).toEqual({ source: 'shop', at: 42 });
  });
  it("can't buy twice", () => {
    const it = unfeatured();
    const first = buyItem(rich(), it.id, TODAY, 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = buyItem(first.profile, it.id, TODAY, 2);
    expect(second).toMatchObject({ ok: false, error: 'owned' });
  });
  it("can't go negative", () => {
    const it = unfeatured();
    expect(buyItem(rich(it.price - 1), it.id, TODAY, 1)).toMatchObject({ ok: false, error: 'too-poor' });
    const exact = buyItem(rich(it.price), it.id, TODAY, 1);
    expect(exact.ok && exact.profile.wallet.cogs).toBe(0);
    expect(buyItem(defaultProfile(), it.id, TODAY, 1)).toMatchObject({ ok: false, error: 'too-poor' });
  });
  it("can't buy starters, secret or achievement items, or unknown ids", () => {
    expect(buyItem(rich(), 'acorn', TODAY, 1)).toMatchObject({ ok: false, error: 'not-for-sale' });
    expect(buyItem(rich(), 'laurel', TODAY, 1)).toMatchObject({ ok: false, error: 'not-for-sale' });
    expect(buyItem(rich(), 'wave', TODAY, 1)).toMatchObject({ ok: false, error: 'not-for-sale' });
    expect(buyItem(rich(), 'golden-yacht', TODAY, 1)).toMatchObject({ ok: false, error: 'unknown' });
    expect(buyItem(rich(), '__proto__', TODAY, 1)).toMatchObject({ ok: false, error: 'unknown' });
  });
  it('charges the featured price for a featured item', () => {
    const id = featuredFor(TODAY)[0];
    const r = buyItem(rich(1000), id, TODAY, 1);
    expect(r.ok && r.price).toBe(priceFor(itemById(id)!, TODAY));
  });
  it('a whole shopping spree never takes the wallet below zero', () => {
    let p = rich(700);
    for (const it of SHOP_ITEMS) {
      const r = buyItem(p, it.id, TODAY, 1);
      if (r.ok) p = r.profile;
      expect(p.wallet.cogs).toBeGreaterThanOrEqual(0);
    }
    expect(p.wallet.cogs + p.wallet.spent).toBe(700);
  });
});

describe('equipping', () => {
  it('equips owned items in their slot and refuses items not owned', () => {
    expect(equipItem(defaultProfile(), 'cape')).toEqual({ ok: false, error: 'not-owned' });
    expect(equipItem(defaultProfile(), 'nope')).toEqual({ ok: false, error: 'unknown' });
    const bought = buyItem(rich(), 'cape', TODAY, 1);
    if (!bought.ok) throw new Error('buy failed');
    const r = equipItem(bought.profile, 'cape');
    expect(r.ok && r.profile.loadout.back).toBe('cape');
    expect(r.ok && isEquipped(r.profile.loadout, 'cape')).toBe(true);
    const hat = equipItem(defaultProfile(), 'thimble');
    expect(hat.ok && hat.profile.loadout.hat).toBe('thimble');
    const paint = equipItem(defaultProfile(), 'midnight-tin');
    expect(paint.ok && paint.profile.loadout.paint).toBe('midnight-tin');
  });
  it('takes off hats and accessories', () => {
    const r = equipItem(defaultProfile(), 'thimble');
    if (!r.ok) throw new Error();
    expect(unequipSlot(r.profile, 'hat').loadout.hat).toBe('none');
    expect(unequipSlot(defaultProfile(), 'back')).toEqual(defaultProfile());
  });
  it('places gestures in one of four slots, swapping instead of duplicating', () => {
    expect(placeGesture(['wave', 'cheer', 'spin', 'bow'], 'dance', 2)).toEqual(['wave', 'cheer', 'dance', 'bow']);
    expect(placeGesture(['wave', 'cheer', 'spin', 'bow'], 'bow', 0)).toEqual(['bow', 'cheer', 'spin', 'wave']);
    expect(placeGesture(['wave', 'cheer', 'spin', 'bow'], 'spin', 2)).toEqual(['wave', 'cheer', 'spin', 'bow']);
    expect(placeGesture(['wave', 'cheer', 'spin', 'bow'], 'faint', 9)).toEqual(['wave', 'cheer', 'spin', 'faint']);
    const bought = buyItem(rich(), 'juggle', TODAY, 1);
    if (!bought.ok) throw new Error();
    const r = equipItem(bought.profile, 'juggle', 3);
    expect(r.ok && r.profile.loadout.gestures).toEqual(['wave', 'cheer', 'spin', 'juggle']);
    expect(equipItem(defaultProfile(), 'juggle', 0)).toEqual({ ok: false, error: 'not-owned' });
    expect(DEFAULT_LOADOUT.gestures).toHaveLength(GESTURE_SLOTS);
  });
});

describe('profile normalising', () => {
  it('turns garbage into a valid default profile', () => {
    for (const junk of [null, undefined, 42, 'x', [], { wallet: 'lots' }]) expect(normalizeProfile(junk)).toEqual(defaultProfile());
  });
  it('drops unknown items, negative or fractional cogs, and equipment that is not owned', () => {
    const p = normalizeProfile({
      wallet: { cogs: -50, earned: 12.7, spent: NaN },
      owned: { cape: { source: 'shop', at: 3 }, 'not-an-item': { source: 'shop' }, wave: { source: 'shop' }, monocle: { source: 'stolen' } },
      loadout: { paint: 'racing-red', hat: 'propeller', keySkin: 'golden', back: 'cape', face: 'monocle', neck: 'scarf', gestures: ['dance', 'wave', 'wave', 'moonwalk'] },
      firstWinDay: 'yesterday',
      secretsPaid: ['marble', 3],
    });
    expect(p.wallet).toEqual({ cogs: 0, earned: 12, spent: 0 });
    expect(Object.keys(p.owned).sort()).toEqual(['cape', 'monocle']);
    expect(p.owned.monocle.source).toBe('gift');
    expect(p.loadout).toEqual({ paint: 'toy-blue', hat: 'none', keySkin: 'classic', back: 'cape', face: 'monocle', neck: 'none', gestures: ['wave', 'cheer', 'spin', 'bow'] });
    expect(p.firstWinDay).toBeNull();
    expect(p.secretsPaid).toEqual(['marble']);
  });
  it('keeps a valid profile as it is', () => {
    let p = rich(500);
    const r = buyItem(p, 'dance', TODAY, 9);
    if (!r.ok) throw new Error();
    const e = equipItem(r.profile, 'dance', 1);
    if (!e.ok) throw new Error();
    p = e.profile;
    expect(normalizeProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe('save migration', () => {
  it('moves a v0 save into a profile: same look, same unlocks, secret cogs paid', () => {
    const v0 = { quality: 'low', contenderName: 'Bolt', paintIndex: 8, hat: 'acorn', keySkin: 'star', secretsFound: ['marble', 'jack'], records: {}, tournamentWins: {} };
    const s = migratePersisted(v0, 0);
    expect(s.paintIndex).toBeUndefined();
    expect(s.hat).toBeUndefined();
    expect(s.keySkin).toBeUndefined();
    expect(s.contenderName).toBe('Bolt');
    expect(s.quality).toBe('low');
    const p = s.profile as Profile;
    // paintIndex cycled modulo the five old paint jobs: 8 → index 3.
    expect(p.loadout).toMatchObject({ paint: 'honey-hustle', hat: 'acorn', keySkin: 'star' });
    expect(owns(p, 'acorn') && owns(p, 'star')).toBe(true);
    expect(owns(p, 'paperboat')).toBe(false);
    expect(p.wallet.cogs).toBe(2 * EARN.secret);
    expect(p.secretsPaid.sort()).toEqual(['jack', 'marble']);
    // Finding the same secret again pays nothing.
    expect(rewardSecret(p, 'marble', 1).cogs).toBe(0);
  });
  it('does not let a v0 save wear a secret item it never unlocked', () => {
    const p = migratePersisted({ hat: 'paperboat', keySkin: 'golden', paintIndex: -1 }, 0).profile as Profile;
    expect(p.loadout).toMatchObject({ paint: 'midnight-tin', hat: 'none', keySkin: 'classic' });
  });
  it('a fresh v0 seed (tests and new players) becomes the default profile', () => {
    expect(migratePersisted({ quality: 'low', tutorials: false }, 0).profile).toEqual(defaultProfile());
    expect(migratePersisted(undefined, 0).profile).toEqual(defaultProfile());
  });
  it('grants achievements a v0 save already earned', () => {
    const p = migratePersisted({ records: { 'copycat-conductor': { best: 4, plays: 30, wins: 2 } }, tournamentWins: { normal: 2 } }, 0).profile as Profile;
    expect(owns(p, 'laurel') && owns(p, 'gear')).toBe(true);
    expect(owns(p, 'medal')).toBe(false);
  });
  it('is idempotent on a current save', () => {
    const v1 = migratePersisted({ secretsFound: ['key'], hat: 'thimble' }, 0);
    expect(migratePersisted(JSON.parse(JSON.stringify(v1)), STORE_VERSION)).toEqual(v1);
  });
});
