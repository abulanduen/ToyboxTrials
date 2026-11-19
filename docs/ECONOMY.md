# Cogs, the Odds & Ends shop and the player profile

Status: **implemented locally**, with an **optional account** that saves the profile on the
server (username and password; see "Optional account and sync" below). There is no server-side
economy: earning still happens in the browser. Players earn one soft currency, **cogs**, by playing. They spend it at the Odds & Ends shop on paint jobs, hats, wind-up
keys, accessories and gestures. There is no real money and nothing can be bought with money.

| File | Role |
| --- | --- |
| `src/game/cosmetics.ts` | The catalogue: every item's id, name, category, slot, rarity, unlock source, price and blurb. Pure data, shared with the server. |
| `src/game/economy.ts` | Earning amounts, rewards, achievements, daily featured row, prices, buying, equipping, save migration. Pure and deterministic. |
| `src/game/profile.ts` | The profile shape, defaults, ownership, and `normalizeProfile` (makes any stored value valid). Shared with the accounts server, which cleans every saved profile with it. |
| `src/game/profileSync.ts` | Account sync rules, shared by client and server: guest merge, conflict rebase, the wallet soft cap. |
| `src/net/account.ts`, `src/ui/AccountUI.tsx` | The client side of the optional account: sign in, save, merge; the Account sheet. |
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
- `normalizeProfile` runs on every load, and on the server for every save to an account. It drops
  unknown items, secrets and achievements, fixes negative, fractional or huge numbers, and unequips
  anything not owned, so a hand-edited or corrupted save can't break the game.
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
- **Ownership is client-side.** The Hub server doesn't check what a player owns (accounts are
  optional, and the Hub doesn't look at them yet), so a modified client could wear any catalogue
  item or play any gesture. Only valid ids get through.
- Earning is local and could be edited, which is acceptable while cogs only buy cosmetics, there
  is nothing to trade, and nothing is ranked by cogs. The account's soft cap (below) stops only
  absurd values.

## Optional account and sync

Owner decision (19 Nov 2026): an **optional** login with a **username and password**, stored in a
**Railway PostgreSQL** database. Playing never requires it: guests play exactly as before, and the
whole feature hides when the server has no database. The API, security choices and the owner's
Railway steps are in `docs/ONLINE.md`; what is stored and how to delete it is in `docs/PRIVACY.md`.

What an account saves: the whole profile above (cogs and lifetime totals, owned items, loadout and
gestures, achievements, the secrets whose cogs were paid). Signing in on another device also marks
those secrets as found there. Not synced (they stay on each device): records and personal bests,
tournament history, settings, the Toy Squad favourites and the nickname.

### Client

- **Account** sits in the main menu's top-right corner ("Sign in", or the username), in Settings
  and in the pause menu. The sheet has Sign in / Create account, then Sign out and Delete account.
  Fields use `autocomplete="username"`, `current-password` and `new-password`, so password
  managers work. Every button and field is at least 56 px tall; it works in portrait and landscape.
- The session token is stored in localStorage under `toybox-trials:account`, apart from the game
  store (`toybox-trials:prototype:v1`). The same key holds the account's last synced copy of the
  profile and its `rev`, which the conflict merge needs.
- After each change the profile is saved about **2 s** later (debounced), straight away when the
  page is hidden (`visibilitychange`/`pagehide`, with `fetch(…, {keepalive: true})`), and retried
  quietly with backoff (5 s doubling to 60 s, and on the browser's `online` event) while the
  server can't be reached. The sheet shows "Saving…", "Your toy is saved to your account" or the
  offline line.
- Signing in sets the online nickname to the username. The player can still type any nickname
  afterwards, and guests always pick their own.
- **Sign out** saves anything pending, ends the session on the server and keeps a guest copy of the
  toy on the device, so play carries on unchanged. **Delete account** asks for the password again.
- The client reads the API address from `VITE_SERVER_URL`, with `wss://` swapped for `https://`.
  No new environment variable.

### First sign-in on a device with a guest toy: the merge rule

`mergeGuestIntoAccount` in `src/game/profileSync.ts`:
- **A brand-new account** (just created, never saved) simply takes the guest toy: its cogs, items,
  loadout, achievements and secrets.
- **An existing account:** owned items, achievements and paid secrets are a **union**. The loadout
  is the **account's** (the guest's items are added, not worn).
- **Cogs take the larger of the two balances, never the sum.** The lifetime earned/spent totals
  take the larger too.

Why the larger and not the sum: the guest copy that stays on a device after signing out is the
account's own toy, so summing would pay the same cogs again every time someone signs out and back
in, and a shared family device would add its cogs to every account that signs in on it. With
"larger", signing in again changes nothing (the unit tests check this). The cost: if a player
earned cogs both as a guest and on the account separately, the smaller pile is not added.

The player sees one line, for example "Account created with this device's toy: 240 cogs and 3
items are saved to it now." or "Signed in: added 2 items from this device and kept your account's
balance (410 cogs). Your account's look is on."

### Saves, conflicts and the soft cap (server)

- Every save is cleaned by `normalizeProfile` (the same function the client uses on load), so
  unknown ids are dropped on the server too.
- **Optimistic concurrency:** each save sends the `rev` it was based on. If another device saved
  first, the server answers 409 with its copy; the client merges (`rebaseProfile`: the server's
  wallet plus this device's own change since its last sync, so a purchase here and a reward there
  both count once; items a union; this device's loadout only if it changed here) and saves again.
- **Wallet soft cap** (`capProfileSave`, `SOFT_CAP`): a save may raise cogs (and lifetime
  earnings) by at most 270 + 60 per minute since the account's previous save, counting at most
  12 hours. 60 a minute is about twice a fast player's real rate (a trial pays at most 30, plus
  one-off bonuses that the 270 covers). The first save of a brand-new account imports the guest
  toy up to 50,000 cogs. Spending is never capped. When a save is lowered, the server says so and
  the client shows "The server limited a sudden jump in cogs…". A guest merge into an existing
  account is capped like any other save.
- **This is a soft cap, not anti-cheat.** Trials run in the browser and the server has no reward
  authority, so a modified client can still claim anything up to the cap, and ownership of items
  isn't checked against purchases. It only stops absurd values (a wallet set to a billion). Real
  trust needs server-side rewards (online matches) and a purchase ledger: future work.

### Still for the owner

- Whether usernames should ever be public (leaderboards). Today they are only the default online
  nickname, which the player can change.
- Age requirements and a published privacy policy, especially for children. `docs/PRIVACY.md` is a
  short factual note, not a legal policy.
- Whether the online Hub should refuse items an account doesn't own (signed-in players only).
- Password reset: there is no email, so a forgotten password can't be recovered. A future option
  is an optional email or a recovery code.

## Not done or not verified

- The account system was tested here with unit tests, a real PostgreSQL 16 server and a browser
  test against the built server on localhost. It has not been deployed on Railway.
- The pacing above is arithmetic, not playtesting. Prices and rewards may need tuning.
- Gesture animations and accessories were reviewed in software-rendered screenshots only. There are
  no real-device checks. The sounds are synthesised and not heard here, because this container has
  no audio output.
- Some minigame scenes don't show accessories on the local toy yet (listed above).
- No achievements screen. Achievement progress isn't shown, only the unlock and the Workshop hint.
