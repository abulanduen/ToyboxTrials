/* The online room keeps each toy on its level (server/hubRoom.ts; src/game/hubBounds.ts levels). */
import { describe, expect, it } from 'vitest';
import { HubRoom, type Outgoing } from '../../server/hubRoom';
import { seededRng } from '../../src/minigames/rng';
import { ARCADE_WALK, LEVEL_MAX_RISE, LEVEL_Y } from '../../src/game/hubBounds';
import { HUB_SPAWN } from '../../src/game/hubMotion';
import { DOG_LOOP, DOG_PERCH, dogArrivalTime } from '../../src/game/dogRoute';
import { JACK_SPOT } from '../../src/game/whoAmI';
import { PROTOCOL_VERSION, type ClientMsg, type HelloMsg, type ServerMsg } from '../../src/net/protocol';

const look = { paint: 1, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };
const hello = (name: string): HelloMsg => ({ t: 'hello', v: PROTOCOL_VERSION, name, look, join: { kind: 'public' } });
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.flatMap((o) => (o.kind === 'send' && o.to.includes(conn) ? [o.msg] : []));
const move = (x: number, y: number, z: number): ClientMsg => ({ t: 'move', x, y, z, yaw: 0, grounded: true, speed: 9 });

function setup(matchDebug = false) {
  const room = new HubRoom({ id: 'public-1', random: seededRng(9), matchDebug });
  let now = 3_000_000;
  const send = (conn: string, msg: ClientMsg) => room.handle(conn, msg, now);
  /** Walk within the speed limit to (x, z) at height y. */
  const walkTo = (conn: string, x: number, y: number, z: number) => {
    for (let i = 0; i < 400; i++) {
      const p = room.playerOf(conn)!;
      if (Math.hypot(p.x - x, p.z - z) < 0.2) return;
      now += 250;
      send(conn, move(x, y, z));
    }
  };
  return { room, send, walkTo, at: () => now, skip: (ms: number) => (now += ms) };
}

describe('levels on the server', () => {
  it('a toy cannot put itself in the arcade: a floor height from the tables is clamped back up', () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    s.skip(100);
    s.send('a', move(HUB_SPAWN.x, LEVEL_Y.floor, HUB_SPAWN.z - 0.5));
    expect(s.room.playerOf('a')!.y).toBe(LEVEL_Y.table);
  });

  it('on a test server the teleport hook takes a toy down; there it keeps to the arcade floor', () => {
    const s = setup(true);
    s.send('a', hello('Alpha'));
    s.skip(100);
    s.send('a', move(0, LEVEL_Y.floor, 0));
    expect(s.room.playerOf('a')).toMatchObject({ x: 0, y: LEVEL_Y.floor, z: 0 });
    // walking off the arcade floor (towards the room) stops at its edge
    s.walkTo('a', ARCADE_WALK.maxX + 30, LEVEL_Y.floor, 0);
    expect(s.room.playerOf('a')!.x).toBeLessThanOrEqual(ARCADE_WALK.maxX);
    // and it can't climb higher than a jump down there
    s.skip(100);
    s.send('a', move(0, LEVEL_Y.floor + 30, 0)); // (still the floor's height, but far above a jump)
    expect(s.room.playerOf('a')!.y).toBeLessThanOrEqual(LEVEL_Y.floor + LEVEL_MAX_RISE.floor);
  });

  it('down in the arcade the box and the dog overhead are out of reach', () => {
    const s = setup(true);
    s.send('a', hello('Alpha'));
    s.skip(100);
    // right under the suspicious box
    s.send('a', move(JACK_SPOT.x, LEVEL_Y.floor, JACK_SPOT.z));
    const card = to(s.send('a', { t: 'card', a: 'deal' }), 'a').find((m) => m.t === 'chatNote');
    expect(card).toMatchObject({ code: 'card_far' });
    // right under the dog's pet spot while it is up at the table
    s.walkTo('a', DOG_PERCH.pet.x, LEVEL_Y.floor, DOG_PERCH.pet.z);
    const k = (((s.at() / 1000) % DOG_LOOP) + DOG_LOOP) % DOG_LOOP;
    s.skip(((((dogArrivalTime('perch')! + 1 - k) % DOG_LOOP) + DOG_LOOP) % DOG_LOOP) * 1000);
    s.send('a', { t: 'dog' });
    expect(s.room.dogClock.lastPet).toBe(0);
  });

  it('a toy sent back to the spawn point from the arcade is on the tables again', () => {
    const s = setup(true);
    s.send('a', hello('Alpha'));
    s.skip(100);
    s.send('a', move(0, LEVEL_Y.floor, 0));
    s.skip(100);
    s.send('a', move(HUB_SPAWN.x, 0, HUB_SPAWN.z)); // the respawn snap, as on any server
    expect(s.room.playerOf('a')).toMatchObject({ x: HUB_SPAWN.x, y: 0, z: HUB_SPAWN.z });
  });
});
