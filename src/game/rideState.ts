/**
 * The local toy's ride between the Hub's levels (src/game/hubRides.ts): boarding, and where it is on
 * its ride. Plain mutable state the frame loop reads (no React state per frame).
 *
 * Offline a ride starts the moment you board. Online the server decides: boarding asks it (`ride`),
 * and the ride starts when it says yes (it then moves the toy for everyone else on the same clock).
 */
import { RIDES, type RideKind } from './hubRides';
import { netLink } from '../net/link';
import { useNet } from '../net/store';
import { useGame } from './store';
import { events } from './events';
import { sfx } from './audio';
import { exposeDebug } from './debug';

/** How long to wait for the server's answer before giving up on a boarding (ms). */
const ASK_TIMEOUT_MS = 3000;

export const ride = {
  /** The ride the toy is on, or null. */
  kind: null as RideKind | null,
  /** performance.now() / 1000 when it boarded. */
  t0: 0,
  /** Asked the server to board this ride (online), waiting for its answer. */
  asked: null as RideKind | null,
  askedAt: 0,
  /** ?debug only (tests, screenshots): hold the ride at this many seconds in, or null. */
  hold: null as number | null,
};

const clock = () => performance.now() / 1000;

/** Seconds into the current ride (0 when not riding). */
export function rideTime(): number {
  if (!ride.kind) return 0;
  return ride.hold ?? clock() - ride.t0;
}

/** Riding, or about to (waiting for the server): the toy doesn't take input meanwhile. */
export function riding(): boolean {
  if (ride.asked && performance.now() - ride.askedAt > ASK_TIMEOUT_MS) ride.asked = null;
  return ride.kind !== null || ride.asked !== null;
}

function start(kind: RideKind) {
  ride.kind = kind;
  ride.t0 = clock();
  ride.asked = null;
  sfx.windUp(6);
  events.emit('ride:start', { kind });
}

/** Board ride `kind` (Interact at its boarding spot). */
export function boardRide(kind: RideKind) {
  if (riding()) return;
  if (useNet.getState().status === 'online') {
    ride.asked = kind;
    ride.askedAt = performance.now();
    netLink.send({ t: 'ride', k: kind });
    return;
  }
  start(kind);
}

/** The server answered a boarding. */
export function rideAnswer(kind: RideKind, ok: boolean) {
  if (ride.asked !== kind) return;
  if (ok) return start(kind);
  ride.asked = null;
  useGame.getState().pushTicket({ title: 'Not just now', body: RIDES[kind].from === 'table' ? 'The car is busy winding up. Try again in a moment.' : 'The lift is busy winding up. Try again in a moment.', tone: 'warning' });
}

/** The ride is over (landed, or cut short): forget it. */
export function endRide() {
  if (!ride.kind) return;
  const kind = ride.kind;
  ride.kind = null;
  ride.hold = null;
  events.emit('ride:land', { kind });
}

/** Leaving the online room: a pending boarding won't be answered. */
export function rideOffline() {
  ride.asked = null;
}

// ?debug only (tests): read the ride, and hold it at a moment (null lets it run on from there)
exposeDebug({
  ride: {
    state: () => ({ kind: ride.kind, t: rideTime(), asked: ride.asked }),
    hold: (t: number | null) => {
      if (t === null && ride.hold !== null) ride.t0 = clock() - ride.hold;
      ride.hold = t;
    },
  },
});
