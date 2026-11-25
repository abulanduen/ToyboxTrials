/* The family dog shared by everyone in an online Hub room (server/hubRoom.ts, src/game/dogRoute.ts). */
import { describe, expect, it } from 'vitest';
import { HubRoom, type Outgoing } from '../../server/hubRoom';
import { seededRng } from '../../src/minigames/rng';
import { DOG_LOOP, DOG_PERCH, DOG_SPOTS, DOG_VISIT, dogArrivalTime, dogPose, dogTime, type DogClock } from '../../src/game/dogRoute';
import { PROTOCOL_VERSION, validateServerMessage, type ClientMsg, type DogWire, type HelloMsg, type ServerMsg } from '../../src/net/protocol';

const look = { paint: 1, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };
const hello = (name: string): HelloMsg => ({ t: 'hello', v: PROTOCOL_VERSION, name, look, join: { kind: 'public' } });
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.flatMap((o) => (o.kind === 'send' && o.to.includes(conn) ? [o.msg] : []));
const dogTo = (out: Outgoing[], conn: string) => to(out, conn).filter((m): m is Extract<ServerMsg, { t: 'dog' }> => m.t === 'dog');
const clockOf = (w: DogWire): DogClock => ({ offset: w.o, lastPet: w.p, perchEnd: w.e, pets: w.n, visit: w.v });
const PERCH_AT = dogArrivalTime('perch')!;

function setup() {
  const room = new HubRoom({ id: 'public-1', random: seededRng(5) });
  let now = 7_000_000;
  const send = (conn: string, msg: ClientMsg) => room.handle(conn, msg, now);
  const walkTo = (conn: string, x: number, z: number) => {
    for (let i = 0; i < 400; i++) {
      const p = room.playerOf(conn)!;
      if (Math.hypot(p.x - x, p.z - z) < 0.2) return;
      now += 250;
      send(conn, { t: 'move', x, y: 0, z, yaw: 0, grounded: true, speed: 10 });
    }
  };
  /** Skip ahead to `into` seconds into the dog's next perch (the room's clock starts it at offset 0). */
  const toPerch = (into = 1) => {
    const k = (((now / 1000) % DOG_LOOP) + DOG_LOOP) % DOG_LOOP;
    now += ((((PERCH_AT + into - k) % DOG_LOOP) + DOG_LOOP) % DOG_LOOP) * 1000;
  };
  return { room, send, walkTo, toPerch, at: () => now, skip: (ms: number) => (now += ms) };
}

describe('the shared dog', () => {
  it('everyone joining a room gets the same dog (its clock in the welcome)', () => {
    const s = setup();
    const a = to(s.send('a', hello('Alpha')), 'a').find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    s.skip(4000);
    const b = to(s.send('b', hello('Bravo')), 'b').find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    // the same dog at the same moment, whoever asks
    const t = s.at() / 1000;
    expect(dogTime(t, clockOf(a.dog))).toBeCloseTo(dogTime(t, clockOf(b.dog)), 9);
    // and the wire form survives the client's validation
    expect(validateServerMessage(JSON.parse(JSON.stringify(b)))).toMatchObject({ t: 'welcome', dog: b.dog });
  });

  it("a pet by the table while it's up counts for everyone, and holds it there for all", () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    s.send('b', hello('Bravo'));
    s.walkTo('a', DOG_PERCH.pet.x, DOG_PERCH.pet.z);
    s.toPerch(DOG_SPOTS.perch.hold - 1); // a second of its own hold left
    const out = s.send('a', { t: 'dog' });
    const forA = dogTo(out, 'a')[0];
    const forB = dogTo(out, 'b')[0];
    expect(forB).toMatchObject({ k: 'pet', by: s.room.playerOf('a')!.id });
    expect(forA).toEqual(forB);
    // B's copy keeps the dog up until 10 s after the pet, then it walks on
    const c = clockOf(forB.c);
    const t0 = s.at() / 1000;
    expect(dogPose(dogTime(t0 + DOG_VISIT.stay - 0.2, c)).action).toBe('perch');
    expect(dogPose(dogTime(t0 + DOG_VISIT.stay + 1, c)).action).toBe('walk');
    expect(validateServerMessage(JSON.parse(JSON.stringify(forB)))).toEqual(forB);
  });

  it('ten pets from anyone: the one who gives the tenth gets the lick', () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    s.send('b', hello('Bravo'));
    s.walkTo('a', DOG_PERCH.pet.x, DOG_PERCH.pet.z);
    s.walkTo('b', DOG_PERCH.pet.x + 2, DOG_PERCH.pet.z);
    s.toPerch(1);
    let last: Outgoing[] = [];
    for (let i = 0; i < DOG_VISIT.petsToLick; i++) {
      s.skip(300);
      last = s.send(i % 2 ? 'b' : 'a', { t: 'dog' });
    }
    expect(dogTo(last, 'a')[0]).toMatchObject({ k: 'lick', by: s.room.playerOf('b')!.id });
    expect(s.room.dogClock.pets).toBe(0);
  });

  it('a pet from too far away, or when the dog is not up, or from inside a trial, does not count', () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    s.send('b', hello('Bravo'));
    s.toPerch(1);
    // far away (at spawn): only the petter hears back, with the clock unchanged
    let out = s.send('a', { t: 'dog' });
    expect(dogTo(out, 'b')).toEqual([]);
    expect(dogTo(out, 'a')[0].k).toBeUndefined();
    expect(s.room.dogClock.lastPet).toBe(0);
    // by the table but the dog is off on its stroll
    s.walkTo('a', DOG_PERCH.pet.x, DOG_PERCH.pet.z);
    s.toPerch(DOG_SPOTS.perch.hold + 5);
    out = s.send('a', { t: 'dog' });
    expect(dogTo(out, 'b')).toEqual([]);
    // by the table while it's up, but playing a trial
    s.toPerch(1);
    s.send('a', { t: 'activity', a: 'copycat-conductor' });
    out = s.send('a', { t: 'dog' });
    expect(dogTo(out, 'b')).toEqual([]);
    expect(s.room.dogClock.lastPet).toBe(0);
  });

  it('only a test server (MATCH_DEBUG) lets a client move the dog along its loop', () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    const before = { ...s.room.dogClock };
    expect(s.send('a', { t: 'dog', at: PERCH_AT })).toEqual([]);
    expect(s.room.dogClock).toEqual(before);
    const test = new HubRoom({ id: 'public-2', random: seededRng(6), matchDebug: true });
    test.handle('a', hello('Alpha'), 1_000_000);
    const out = test.handle('a', { t: 'dog', at: PERCH_AT + 1 }, 1_000_000);
    const c = dogTo(out, 'a')[0].c;
    expect(dogPose(dogTime(1000, clockOf(c))).action).toBe('perch');
  });
});
