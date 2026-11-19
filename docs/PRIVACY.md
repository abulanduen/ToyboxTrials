# Privacy note: optional accounts

A short, factual note on what Toybox Trials stores. It is not a legal privacy policy; the owner
still needs to publish one (and decide age requirements) before promoting accounts, especially to
children.

## Without an account (guests)

Nothing about the player is stored on a server. The toy, cogs, items, records and settings live in
the browser's localStorage (`toybox-trials:prototype:v1`). Playing online sends a nickname and the
toy's look to the online Hub while connected; rooms live in memory and are gone when the player
leaves or the server restarts (docs/ONLINE.md).

## With an account

The accounts database (Railway PostgreSQL) stores:

| What | Why |
| --- | --- |
| **Username** (as typed, plus a lower-case copy for uniqueness) | To sign in. It is also the default online nickname, which the player can change. |
| **Password hash** (scrypt with a random salt) | To check the password. The password itself is never stored or logged. |
| **Profile** (cogs and lifetime totals, owned items with when and how each was unlocked, the equipped loadout and gestures, achievements, paid secrets, the date of the last daily-win bonus), with a revision number and the time of the last save | So the toy follows the player to other devices. |
| **Session hashes** (SHA-256 of each sign-in token), with when each was created and expires | To keep the player signed in for up to 30 days. Tokens themselves are not stored. |
| When the account was created | Bookkeeping. |

Not collected: email, real name, age, location, contacts or payment details. IP addresses are used
only in memory, for rate limits against password guessing; they are never written to the database
or the logs. Server logs contain counts and events (such as "account created"), never usernames,
passwords or tokens.

On the device, the browser keeps the sign-in token, the username and the last synced copy of the
profile in localStorage (`toybox-trials:account`). Signing out removes that key.

## Deleting an account

In the game: **Account** (main menu top-right, Settings or the pause menu) → **Delete account** →
enter the password → **Delete for good**. The server deletes the user row, every session and the
saved profile at once (`DELETE /api/account`; the database removes sessions and the profile with
the user). It can't be undone. The device keeps a guest copy of the toy, which the player can clear
with the browser's site data settings.

If the player has forgotten the password there is no self-service reset (no email is stored). The
owner can delete an account directly in the database: `DELETE FROM users WHERE username_key =
lower('<name>');` removes its sessions and profile too.

Railway's own database backups, if enabled, may keep deleted data until they expire.
