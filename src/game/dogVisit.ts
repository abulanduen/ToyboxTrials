/**
 * The dog's visits to the spawn table (src/scene/room/RoomDog.tsx): every loop of its stroll it
 * stands up at the table's front edge, sniffs and looks round at the toys, and a toy can walk up
 * and pet it (Interact). Each pet shows a heart; the 10th pet earns a big lick. It stays while it is
 * being petted, and goes back to its stroll 10 s after the last pet (or 10 s after arriving if
 * nobody comes). Local to each player, like the dog itself.
 *
 * Plain state, written by RoomDog (perched or not) and by petDog (the interaction); times are in
 * seconds on the caller's clock.
 */
export const DOG_VISIT = {
  /** Pets that earn a lick. */
  petsToLick: 10,
  /** The dog stays this long after the last pet (s). (Tests on slow renderers may raise it.) */
  stay: 10,
};

export const dogVisit = {
  /** Up at the table and ready to be petted. */
  perched: false,
  /** Pets since the last lick (this visit). */
  pets: 0,
  lastPetAt: -1e9,
  lickAt: -1e9,
  /** Pet attempts (tests: a press that reached the dog, perched or not). */
  tries: 0,
  /** When each recent heart popped (s), for the scene to float them up. */
  hearts: [] as number[],
};

/** A toy pets the perched dog at time `now` (s). Returns what happened, or null if it isn't perched. */
export function petDog(now: number): 'pet' | 'lick' | null {
  dogVisit.tries++;
  if (!dogVisit.perched) return null;
  dogVisit.lastPetAt = now;
  dogVisit.hearts.push(now);
  if (dogVisit.hearts.length > 8) dogVisit.hearts.shift();
  dogVisit.pets++;
  if (dogVisit.pets >= DOG_VISIT.petsToLick) {
    dogVisit.pets = 0;
    dogVisit.lickAt = now;
    return 'lick';
  }
  return 'pet';
}

/**
 * How many more seconds the dog should stay perched at `now`, given the seconds its stroll still
 * holds the perch (`holdLeft`): at least DOG_VISIT.stay after the last pet.
 */
export function perchStay(now: number, holdLeft: number): number {
  return Math.max(holdLeft, DOG_VISIT.stay - (now - dogVisit.lastPetAt));
}

/** The visit ended (the dog walked off): start the count afresh next time. */
export function endVisit() {
  dogVisit.perched = false;
  dogVisit.pets = 0;
  dogVisit.lastPetAt = -1e9;
}
