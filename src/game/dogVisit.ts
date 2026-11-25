/**
 * The dog's visits to the spawn table, on this page (src/scene/room/RoomDog.tsx draws it): every loop
 * of its stroll it stands up at the table's front edge, sniffs and looks round at the toys, and a toy
 * can walk up and pet it (Interact). Each pet shows a heart; the 10th pet earns a big lick. It stays
 * while it is being petted, and goes back to its stroll 10 s after the last pet (or 10 s after
 * arriving if nobody comes).
 *
 * Who owns the dog (`dogSync`): offline, this page, on its own clock. Online, the room's server:
 * everyone in the room sees the same dog in the same place, a pet by anyone keeps it there for all,
 * and the server counts the pets towards the lick (src/game/dogRoute.ts has the shared rules). During
 * a trial the dog never stands up at the table (RoomDog: it sits by it instead), so it can't be petted.
 *
 * Plain state, written by RoomDog (perched or not), by petDog (the interaction) and by the net
 * client (the server's dog). Times in `dogVisit` are seconds on this page's clock.
 */
import { DOG_VISIT, dogPet, dogTime, newDogClock, settleDog, type DogClock } from './dogRoute';
import { netLink } from '../net/link';
import { sfx } from './audio';
import { useGame } from './store';

export { DOG_VISIT };

export const dogVisit = {
  /** Up at the table and ready to be petted (and not during a trial). */
  perched: false,
  /** Pets this visit towards the lick (online: the server's count, as of its last word). */
  pets: 0,
  /** When it was last petted, by anyone (page s): it wags harder for a moment. */
  lastPetAt: -1e9,
  lickAt: -1e9,
  /** Pet attempts (tests: a press that reached the dog, perched or not). */
  tries: 0,
  /** When each recent heart popped (page s), for the scene to float them up. */
  hearts: [] as number[],
};

/**
 * The dog's clock and who keeps it. `skew` (server ms − page ms) stands in for the snapshot clock
 * until the first snapshot has synced it.
 */
export const dogSync = { clock: newDogClock(), online: false, skew: 0 };

const pageNow = () => performance.now() / 1000;

/** Seconds on the dog's clock now (the page's offline, the server's online). */
export function dogNow(): number {
  if (!dogSync.online) return pageNow();
  return (netLink.serverTime() ?? performance.now() + dogSync.skew) / 1000;
}

/** Where the dog is in its loop now (s, unwrapped: dogPose wraps it). */
export const dogLoopTime = () => dogTime(dogNow(), dogSync.clock);

/** A heart (and on a lick, the tongue) for a pet just now. */
function cheer(lick: boolean) {
  const now = pageNow();
  dogVisit.lastPetAt = now;
  dogVisit.hearts.push(now);
  if (dogVisit.hearts.length > 8) dogVisit.hearts.shift();
  if (lick) dogVisit.lickAt = now;
}

/** The lick's sound and ticket, for the toy that earned it. */
export function lickCheer() {
  sfx.dogLick();
  useGame.getState().pushTicket({ title: 'Slobbery lick!', body: 'Ten pets and the dog licked you. It loves you.', tone: 'reward' });
}

/**
 * The local toy pets the dog. Offline the page decides ('pet', 'lick', or null if it isn't up at the
 * table). Online the server decides: this shows the heart at once, asks, and returns 'sent'; the
 * server's answer (dogFromServer) brings the lick if this pet earned it.
 */
export function petDog(): 'pet' | 'lick' | 'sent' | null {
  dogVisit.tries++;
  if (!dogVisit.perched) return null;
  if (dogSync.online) {
    netLink.send({ t: 'dog' });
    cheer(false);
    return 'sent';
  }
  const r = dogPet(pageNow(), dogSync.clock);
  if (!r) return null;
  dogVisit.pets = dogSync.clock.pets;
  cheer(r === 'lick');
  return r;
}

/** The server's dog, as sent in `welcome` and `dog` messages (seconds on the server clock). */
export interface DogWireIn {
  o: number;
  p: number;
  e: number;
  n: number;
  v: number;
}

/**
 * Online: take the room's dog. `pet` is what just happened (by `by`), if anything: someone else's
 * pet pops a heart here too; a lick shows the tongue for everyone, and returns true if it was ours.
 */
export function dogFromServer(c: DogWireIn, pet?: { k: 'pet' | 'lick'; by: string }, selfId?: string | null): boolean {
  dogSync.online = true;
  dogSync.clock = { offset: c.o, lastPet: c.p, perchEnd: c.e, pets: c.n, visit: c.v };
  dogVisit.pets = c.n;
  if (!pet) return false;
  const mine = !!selfId && pet.by === selfId;
  if (!mine) cheer(pet.k === 'lick');
  else if (pet.k === 'lick') dogVisit.lickAt = pageNow();
  return mine && pet.k === 'lick';
}

/** Online, before the first snapshot: how far the server's clock is ahead of the page's (ms). */
export function setDogSkew(serverNow: number) {
  dogSync.skew = serverNow - performance.now();
}

/**
 * Back offline (or a fresh start): the page takes the dog over from where it is now, so it doesn't
 * jump, and the pet count starts afresh.
 */
export function dogOffline() {
  if (!dogSync.online) return;
  const t = dogLoopTime();
  dogSync.online = false;
  dogSync.clock = newDogClock(t - pageNow());
  dogVisit.pets = 0;
}

/** Tests and debug hooks: put the dog `t` seconds into its loop now (a fresh visit: no hold, no pets). */
export function setDogLoopTime(t: number) {
  // online the room's dog is the server's: a test server moves it for everyone
  if (dogSync.online) return netLink.send({ t: 'dog', at: t });
  const c: DogClock = dogSync.clock;
  settleDog(dogNow(), c);
  Object.assign(c, { lastPet: 0, perchEnd: 0, pets: 0, visit: -1, offset: t - dogNow() });
  dogVisit.pets = 0;
}
