# Cogs, the Odds & Ends shop and the player profile

Status: **implemented locally** (no login, no server-side economy). Players earn one soft
currency, **cogs**, by playing. They spend it at the Odds & Ends shop on paint jobs, hats, wind-up
keys, accessories and gestures. There is no real money and nothing can be bought with money.

| File | Role |
| --- | --- |
| `src/game/cosmetics.ts` | The catalogue: every item's id, name, category, slot, rarity, unlock source, price and blurb. Pure data, shared with the server. |
| `src/game/economy.ts` | Earning amounts, rewards, achievements, daily featured row, prices, buying, equipping, save migration. Pure and deterministic. |
| `src/game/profile.ts` | The profile shape, defaults, ownership, and `normalizeProfile` (makes any stored value valid). |
| `src/game/store.ts` | Holds `profile` in the persisted store (`toybox-trials:prototype:v1`, store version 1). |
| `src/ui/ShopScreen.tsx`, `WorkshopScreen.tsx`, `Catalogue.tsx`, `itemIcons.tsx` | Shop and Workshop panels, shared cards, the gesture slots and the drawn card art. |
| `src/character/Accessories.tsx`, `Cosmetics.tsx`, `WindupBot.tsx` | The 3D accessories, hats and keys, and the gesture animations. |
| `tests/unit/economy.test.ts`, `tests/e2e/shop.cjs` | Unit and browser tests. |

## Earning

All amounts live in `EARN` in `src/game/economy.ts`.

| Source | Cogs |
| --- | --- |
| Finish any trial (practice or a tournament round; quitting earns nothing) | 10 |
| Solo run (a trial played alone, so there are no placings) | +5 |
| Placement in a field of 2 or more: 1st place gets the full bonus, falling evenly to 0 for last | +15 … 0 |
| New personal best in that trial | +5 |
| First win of the day (1st of 2 or more, or winning a tournament), once per local calendar day | +50 |
| Finish a tournament | +10 per trial in the format (Blitz 30, Normal 50, Treasure 80) |
| Tournament final place | 1st +60, 2nd +35, 3rd +20 |
| Each Playroom secret, once | +40 |

A trial against three bots pays 10 to 25 cogs: 17.5 on average if a player finishes 1st, 2nd,
3rd and 4th equally often. The cheapest items cost 60 to 80, so a regular player can buy something
every three to five games, sooner with the daily win bonus. The median shop item (120) takes about
seven games. The 28 shop items cost 4,140 cogs in total, which gives a long tail. These numbers are
a starting point and have not been playtested.

The results screen shows the cogs with a breakdown (for example "+25 cogs: Finished the trial +10
· 1st place +15"). The tournament's final screen shows the tournament bonus. The hub HUD, the
main menu card, the pause menu, the Workshop and the shop show the wallet.

### Achievements

Three items are earned rather than bought (`ACHIEVEMENTS` in `economy.ts`). They are checked after
every trial and tournament, and once when an old save is migrated.

| Achievement | Unlocks |
| --- | --- |
| Win a tournament | Champion laurel (hat) |
| Win 10 trials against other toys | Bottle-cap medal (neck) |
| Finish 25 trials | Cog key |

## Catalogue (48 items)

Rarity uses the colours in `RARITY` in `src/game/palette.ts`: common grey, uncommon green, rare blue,
epic purple, legendary yellow. Item cards show it as a coloured top band, and the detail box as a chip.

| Category | Starter (free) | Secret | Achievement | Shop |
| --- | --- | --- | --- | --- |
| Paints (11) | Toy Blue, Coral Clank, Sage Sprocket, Honey Hustle, Midnight Tin | | | Mint Condition 60, Plum Pudding 120, Racing Red 120, Chalkboard 200, Bubblegum 200, Copper Kettle 300 |
| Hats (8, plus the bare turret) | Thimble helmet, Bottle-cap crown | Paper-boat hat (music box), Acorn cap (marble) | Champion laurel | Party cone 80, Cotton-reel top hat 120, Propeller cap 300 |
| Keys (7) | Classic, Heart | Star (jack-in-the-box), Golden (tower key) | Cog key | Clover 120, Crescent 200 |
| Accessories, back (4) | | | | Button backpack 80, Party balloon 140, Felt cape 200, Paper wings 320 |
| Accessories, face (4) | | | | Bristle moustache 60, Bead nose 60, Brass monocle 120, Tinker goggles 220 |
| Accessories, neck (4) | | | Bottle-cap medal | Ribbon bow tie 70, Knitted scarf 80, Bell collar 120 |
| Gestures (10) | Wave, Cheer, Spin, Bow | | | Laugh 80, Sit 80, Salute 90, Dance 120, Juggle 220, Faint 260 |

- **Accessories** have three slots, one item each: back, face and neck. They render on the
  player's WindupBot in the hub, in the Workshop and shop preview, on remote players online, and on
  the local player's toy in minigames that use the shared stage (`MatchStage`, `Racer`). Opponents
  and crowds use `MiniContender`, which ignores accessories. Some minigame scenes build their own
  local toy and don't pass accessories yet (Copycat, Jack-in-the-Box, Rhythm, Midnight, Inferno,
  Blink, Spellbox): adding `accessories={c.accessories}` there is a one-line change per game.
  Back items push the wind-up key back so it still pokes out.
- **Gestures** are hub emotes. A player equips four (keys 1–4 or the touch Emote menu). Each new
  gesture has a procedural WindupBot animation (in `WindupBot.tsx`) and a synthesised sound
  (`sfx.emote` in `src/game/audio.ts`). Juggling beads and the faint's X eyes are part of the rig.
- Everything is built in code in the chunky toy style, and the card art is original inline SVG.
  There are no models, textures, sound files or icon packs.

### Daily featured row

`featuredFor(dateKey)` picks three shop items from three different categories with a seeded
shuffle of the local date (YYYY-MM-DD). The row is the same all day and changes at local midnight.
Featured items are 25 % off, rounded to 5 cogs. The shop reads the date when it opens.

## Shop and Workshop

- **Opening the shop:** walk up to Odds & Ends in the hub and press E or tap the prompt. It also
  opens from **Shop** on the main menu, the pause menu and the Workshop. The address is `#shop`.
- The shop shares the Workshop's turntable (screen `workshop`, `workshopMode: 'shop'`). Picking a
  card tries the item on the toy (`tryOn` in the store, never saved or sent online) or plays the
  gesture. Keys and back items turn the toy round.
- **Buy** spends cogs. **Equip** wears the item. **Take off** empties a hat or accessory slot.
  A bought gesture shows the four key slots; tap one to put it there (the two gestures swap).
- The **Workshop** stays the place to equip owned items. It has the same five tabs. Locked items
  explain how to get them (the secret, the achievement, or the shop price). Gestures are assigned
  by tapping a gesture and then a key slot.
- **Mobile:** portrait uses a bottom sheet with the toy above it; landscape uses a right-hand
  column. Tabs wrap into two rows on narrow screens, and nothing scrolls sideways. Every button is
  at least 56 × 56 px, which `tests/e2e/shop.cjs` checks on all three layouts.

## Profile schema (version 1)

One JSON-serialisable object, `profile` in the persisted store:

```ts
{
  schema: 1,
  wallet: { cogs: number, earned: number, spent: number },     // whole numbers, never negative
  owned: { [itemId]: { source: 'shop' | 'secret' | 'achievement' | 'gift', at: number } },
  loadout: {
    paint: PaintId, hat: HatId | 'none', keySkin: KeySkinId,
    back: BackId | 'none', face: FaceId | 'none', neck: NeckId | 'none',
    gestures: [EmoteId, EmoteId, EmoteId, EmoteId],            // distinct, in key order
  },
  firstWinDay: 'YYYY-MM-DD' | null,                            // last first-win bonus
  secretsPaid: string[],                                        // secrets whose 40 cogs were paid
  achievements: string[],
}
```

- Starter items are owned implicitly and are not listed in `owned`.
- `normalizeProfile` runs on every load. It drops unknown items, fixes negative or fractional
  numbers, and unequips anything not owned, so a hand-edited or corrupted save can't break the game.
- Records, tournament history, secrets found and settings stay where they were in the store.

### Migration from older saves

The store's persist version went from 0 to 1 (`migratePersisted` in `economy.ts`). A version-0 save
kept `paintIndex`, `hat` and `keySkin` at the top level and unlocked secret items by checking
`secretsFound`. The migration:
- builds a profile that owns every item its secrets unlock, with source `secret`;
- pays the one-off 40 cogs for each secret already found, so existing explorers start with some cogs;
- grants achievements the existing records already meet;
- keeps the same paint (the old index, modulo the five old paints), hat and key, unless the save was
  wearing a secret item it never unlocked;
- removes the three legacy fields.

Secrets found after the migration unlock their items and pay their cogs as before. Unit tests cover
the migration; `shop.cjs` loads a real version-0 save in the browser.

## Online

- The online look carries the three accessory slots, and the server accepts all ten gesture ids
  (protocol version 2; see `docs/ONLINE.md`). The server checks every id against this shared
  catalogue and each accessory against its own slot. Anything unknown becomes the default.
- **Ownership is client-side.** Until accounts exist the server can't know what a player owns, so a
  modified client could wear any catalogue item or play any gesture. Only valid ids get through.
- The wallet never leaves the browser. Earning is local and could be edited, which is acceptable
  while cogs only buy cosmetics, there is nothing to trade, and nothing is ranked by cogs.

## Planned: optional login and sync (not built)

Login stays optional. Guests keep playing with the local profile as they do now. The profile is
already one versioned object so that a later account system can store it.

Proposed design, for the owner to approve:
1. **Accounts and storage:** a small accounts API on the existing Railway service, with a Railway
   **Postgres** database. Tables: `accounts` (id, login identity, created), `profiles` (account id,
   profile JSON, schema, updated), and later `purchases`/`earnings` ledgers.
2. **First sign-in:** the local profile is uploaded and becomes the account's profile. If the
   account already has one (signing in on a second device), merge: union of owned items, the higher
   balance (or a sum of unsynced earnings once there's a ledger), the newest loadout.
3. **Trust:** once accounts exist, the server should derive cogs from results it can verify (online
   matches) and record purchases in a ledger. Offline earnings can stay local or be capped.
   Online, the server could then refuse looks that use items the account doesn't own.
4. **Sync:** load on sign-in, save on change (debounced) and on leaving. The client keeps working
   offline and syncs later.

**Decisions the owner needs to make:**
- **Login method:** username and password, an email magic link, or Google sign-in (or a
  combination). Magic links and Google avoid storing passwords. Magic links need an email-sending
  service; Google needs an OAuth client set up in Google Cloud.
- **Database:** add a Railway Postgres database to the project (monthly cost), or choose another
  host.
- Whether offline earnings count towards an account, and any cap.
- Whether usernames are public (leaderboards, online name tags) or only nicknames are.
- Privacy policy, data deletion, and age requirements for accounts, especially for children.

## Not done or not verified

- The pacing above is arithmetic, not playtesting. Prices and rewards may need tuning.
- Gesture animations and accessories were reviewed in software-rendered screenshots only. There are
  no real-device checks. The sounds are synthesised and not heard here, because this container has
  no audio output.
- Some minigame scenes don't show accessories on the local toy yet (listed above).
- No achievements screen. Achievement progress isn't shown, only the unlock and the Workshop hint.
