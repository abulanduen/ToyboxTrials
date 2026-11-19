/* Account sync rules for the profile (src/game/profileSync.ts): clean-up, guest merge, conflict
   rebase and the server's soft cap. */
import { describe, expect, it } from 'vitest';
import { defaultProfile, normalizeProfile, type Profile } from '../../src/game/profile';
import { ACHIEVEMENTS, buyItem, equipItem, priceFor, rewardSecret } from '../../src/game/economy';
import { ACHIEVEMENT_IDS, SECRET_IDS, itemById } from '../../src/game/cosmetics';
import { SOFT_CAP, canonicalProfile, capProfileSave, isBlankProfile, mergeGuestIntoAccount, profilesEqual, rebaseProfile, walletAllowance } from '../../src/game/profileSync';

const DAY = '2026-11-19';
const withCogs = (p: Profile, cogs: number, earned = cogs, spent = 0): Profile => ({ ...p, wallet: { cogs, earned, spent } });
/** Today's price (featured items are discounted). */
const price = (id: string) => priceFor(itemById(id)!, DAY);
const buy = (p: Profile, id: string) => {
  const r = buyItem(p, id, DAY, 1);
  if (!r.ok) throw new Error(`could not buy ${id}: ${r.error}`);
  return r.profile;
};
const equip = (p: Profile, id: string) => {
  const r = equipItem(p, id);
  if (!r.ok) throw new Error(`could not equip ${id}`);
  return r.profile;
};

describe('profile clean-up shared by client and server', () => {
  it('drops unknown items, secrets and achievements, and fixes numbers', () => {
    const p = normalizeProfile({
      wallet: { cogs: 12.7, earned: -5, spent: 'x' },
      owned: { scarf: { source: 'shop', at: 5 }, 'not-an-item': { source: 'shop', at: 1 }, 'toy-blue': { source: 'shop', at: 1 }, cape: { source: 'hacked' } },
      loadout: { paint: 'gold-plated', neck: 'scarf', back: 'scarf', hat: 'laurel', gestures: ['juggle', 'wave', 'wave'] },
      secretsPaid: ['marble', 'moon-base', 7],
      achievements: ['champion', 'made-up'],
    });
    expect(p.wallet).toEqual({ cogs: 12, earned: 0, spent: 0 });
    expect(Object.keys(p.owned).sort()).toEqual(['cape', 'scarf']);
    expect(p.owned.cape.source).toBe('gift');
    expect(p.loadout.paint).toBe('toy-blue');
    expect(p.loadout.neck).toBe('scarf');
    expect(p.loadout.back).toBe('none'); // a scarf isn't a back item
    expect(p.loadout.hat).toBe('none'); // laurel not owned
    expect(p.loadout.gestures).toEqual(['wave', 'cheer', 'spin', 'bow']); // juggle not owned
    expect(p.secretsPaid).toEqual(['marble']);
    expect(p.achievements).toEqual(['champion']);
  });
  it('the shared id lists match the rules', () => {
    expect([...ACHIEVEMENT_IDS].sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
    expect(SECRET_IDS).toHaveLength(4);
  });
  it('huge numbers are clamped to safe integers', () => {
    expect(normalizeProfile({ wallet: { cogs: 1e300 } }).wallet.cogs).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('compares profiles regardless of key order', () => {
    const a = buy(buy(withCogs(defaultProfile(), 500), 'scarf'), 'cape');
    const b = { ...a, owned: Object.fromEntries(Object.entries(a.owned).reverse()) };
    expect(Object.keys(b.owned)).not.toEqual(Object.keys(a.owned));
    expect(profilesEqual(a, b)).toBe(true);
    expect(canonicalProfile(a)).toBe(canonicalProfile(b));
    expect(profilesEqual(a, withCogs(a, 1))).toBe(false);
    expect(isBlankProfile(defaultProfile())).toBe(true);
    expect(isBlankProfile(withCogs(defaultProfile(), 1))).toBe(false);
  });
});

describe('first sign-in: merging the guest toy into the account', () => {
  const guest = equip(buy(withCogs(rewardSecret(defaultProfile(), 'marble', 1).profile, 300, 340, 0), 'scarf'), 'scarf');

  it('a brand-new account takes the guest toy whole, loadout included', () => {
    const m = mergeGuestIntoAccount(null, guest);
    expect(profilesEqual(m.profile, guest)).toBe(true);
    expect(m.profile.loadout.neck).toBe('scarf');
    expect(m.summary).toMatch(/Account created/);
    expect(m.summary).toMatch(/cogs/);
  });
  it('a blank guest into a new account says so plainly', () => {
    expect(mergeGuestIntoAccount(null, defaultProfile()).summary).toBe('Account created. Your toy will be saved to your account from now on.');
  });
  it('an existing account: items are a union, cogs the larger balance, the account keeps its look', () => {
    const account = equip(buy(withCogs(defaultProfile(), 500, 700), 'cape'), 'cape');
    const m = mergeGuestIntoAccount(account, guest);
    expect(Object.keys(m.profile.owned).sort()).toEqual(['acorn', 'cape', 'scarf']);
    expect(m.profile.wallet.cogs).toBe(Math.max(account.wallet.cogs, guest.wallet.cogs));
    expect(m.profile.wallet.cogs).toBe(account.wallet.cogs); // account had more
    expect(m.cogsFrom).toBe('account');
    expect(m.profile.loadout.back).toBe('cape');
    expect(m.profile.loadout.neck).toBe('none'); // the guest's scarf is owned but not worn
    expect(m.profile.secretsPaid).toEqual(['marble']);
    expect(m.added).toBe(2);
    expect(m.summary).toMatch(/added 2 items/);
  });
  it('the guest balance wins when it is larger, and the sum is never taken', () => {
    const account = withCogs(defaultProfile(), 40);
    const m = mergeGuestIntoAccount(account, guest);
    expect(m.profile.wallet.cogs).toBe(guest.wallet.cogs);
    expect(m.profile.wallet.cogs).not.toBe(account.wallet.cogs + guest.wallet.cogs);
    expect(m.cogsFrom).toBe('guest');
    expect(m.summary).toMatch(/larger balance/);
  });
  it('merging again (sign out, sign back in) changes nothing: no cogs are minted', () => {
    const account = withCogs(defaultProfile(), 100);
    const once = mergeGuestIntoAccount(account, guest).profile;
    const twice = mergeGuestIntoAccount(once, once).profile;
    expect(profilesEqual(once, twice)).toBe(true);
    expect(mergeGuestIntoAccount(once, once).summary).toMatch(/loaded your account's toy/);
  });
  it('a blank guest just loads the account', () => {
    const account = withCogs(defaultProfile(), 100);
    const m = mergeGuestIntoAccount(account, defaultProfile());
    expect(profilesEqual(m.profile, account)).toBe(true);
    expect(m.summary).toBe("Signed in: loaded your account's toy (100 cogs).");
  });
});

describe('conflict: rebasing this device onto another device\'s save', () => {
  const base = withCogs(defaultProfile(), 200, 200, 0);
  it('a purchase here and a reward there both count once', () => {
    const local = buy(base, 'scarf'); // -80 here
    const server = withCogs(base, 230, 230, 0); // +30 there
    const r = rebaseProfile(base, local, server);
    expect(r.wallet.cogs).toBe(200 - price('scarf') + 30);
    expect(r.wallet.spent).toBe(price('scarf'));
    expect(r.wallet.earned).toBe(230);
    expect(r.owned.scarf).toBeTruthy();
  });
  it('items from both sides survive; the loadout changed here wins', () => {
    const server = equip(buy(base, 'cape'), 'cape');
    const local = equip(buy(base, 'scarf'), 'scarf');
    const r = rebaseProfile(base, local, server);
    expect(Object.keys(r.owned).sort()).toEqual(['cape', 'scarf']);
    expect(r.loadout.neck).toBe('scarf');
    expect(r.loadout.back).toBe('none');
  });
  it('the loadout from the other device stays if this one did not change it', () => {
    const server = equip(buy(base, 'cape'), 'cape');
    const local = withCogs(base, 210, 210);
    const r = rebaseProfile(base, local, server);
    expect(r.loadout.back).toBe('cape');
    expect(r.wallet.cogs).toBe(server.wallet.cogs + 10);
  });
  it('never goes negative', () => {
    const rich = withCogs(defaultProfile(), 300, 300);
    const server = withCogs(rich, 10, 300, 290);
    const local = buy(buy(rich, 'scarf'), 'cape');
    expect(rebaseProfile(rich, local, server).wallet.cogs).toBe(0);
  });
});

describe('server soft cap on saved wallets', () => {
  const stored = withCogs(defaultProfile(), 100, 100);
  const T0 = 1_000_000_000_000;
  it('allowance grows with elapsed time, up to the bank limit', () => {
    expect(walletAllowance(0)).toBe(SOFT_CAP.burst);
    expect(walletAllowance(60_000)).toBe(SOFT_CAP.burst + SOFT_CAP.perMinute);
    expect(walletAllowance(10 * 60_000)).toBe(SOFT_CAP.burst + 10 * SOFT_CAP.perMinute);
    expect(walletAllowance(1e12)).toBe(walletAllowance(SOFT_CAP.maxBankMs));
    expect(walletAllowance(-5)).toBe(SOFT_CAP.burst);
  });
  it('a plausible save goes through unchanged', () => {
    const incoming = withCogs(stored, 160, 160);
    const r = capProfileSave({ stored, storedAt: T0, incoming, now: T0 + 60_000 });
    expect(r.adjusted).toEqual([]);
    expect(r.profile.wallet.cogs).toBe(160);
  });
  it('an absurd jump is lowered to the allowance', () => {
    const incoming = withCogs(stored, 999_999, 999_999);
    const r = capProfileSave({ stored, storedAt: T0, incoming, now: T0 + 5 * 60_000 });
    expect(r.adjusted).toEqual(['cogs', 'earned']);
    expect(r.profile.wallet.cogs).toBe(100 + walletAllowance(5 * 60_000));
    expect(r.profile.wallet.earned).toBe(100 + walletAllowance(5 * 60_000));
  });
  it('spending is never capped', () => {
    const r = capProfileSave({ stored, storedAt: T0, incoming: buy(stored, 'scarf'), now: T0 });
    expect(r.adjusted).toEqual([]);
    expect(r.profile.wallet.cogs).toBe(100 - price('scarf'));
  });
  it('the first save of a new account imports the guest toy up to the import limit', () => {
    expect(capProfileSave({ stored: null, storedAt: 0, incoming: withCogs(defaultProfile(), 4000), now: T0 }).adjusted).toEqual([]);
    const big = capProfileSave({ stored: null, storedAt: 0, incoming: withCogs(defaultProfile(), 10 ** 9), now: T0 });
    expect(big.adjusted).toEqual(['cogs']);
    expect(big.profile.wallet.cogs).toBe(SOFT_CAP.importCogs);
  });
  it('cleans what it saves (unknown ids dropped)', () => {
    const r = capProfileSave({ stored, storedAt: T0, incoming: { ...stored, owned: { 'nope': { source: 'shop', at: 1 } } }, now: T0 });
    expect(r.profile.owned).toEqual({});
  });
  it('a merged sign-in on a second device is capped like any other save', () => {
    const account = withCogs(defaultProfile(), 100, 100);
    const guest = withCogs(defaultProfile(), 5000, 5000);
    const merged = mergeGuestIntoAccount(account, guest).profile;
    const r = capProfileSave({ stored: account, storedAt: T0, incoming: merged, now: T0 + 60_000 });
    expect(r.profile.wallet.cogs).toBe(100 + walletAllowance(60_000));
    expect(r.adjusted).toContain('cogs');
  });
});
