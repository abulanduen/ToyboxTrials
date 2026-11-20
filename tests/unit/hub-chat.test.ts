/* Hub text chat and Who Am I? cards in a room (server/hubChat.ts through server/hubRoom.ts). */
import { describe, expect, it } from 'vitest';
import { HubRoom, type Outgoing } from '../../server/hubRoom';
import { seededRng } from '../../src/minigames/rng';
import { CHAT_BURST, CHAT_REFILL_MS } from '../../src/net/chatFilter';
import { CARD_COOLDOWN_MS, JACK_SPOT, WHO_CARDS, fold } from '../../src/game/whoAmI';
import { PROTOCOL_VERSION, type ClientMsg, type HelloMsg, type ServerMsg } from '../../src/net/protocol';

const look = { paint: 1, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };
const hello = (name: string): HelloMsg => ({ t: 'hello', v: PROTOCOL_VERSION, name, look, join: { kind: 'public' } });
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.flatMap((o) => (o.kind === 'send' && o.to.includes(conn) ? [o.msg] : []));
const of = <T extends ServerMsg['t']>(out: Outgoing[], conn: string, t: T) => to(out, conn).filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];

function setup(seed = 3) {
  const room = new HubRoom({ id: 'public-1', random: seededRng(seed) });
  let now = 5_000_000;
  /** Everything each connection was sent, in order. */
  const inbox = new Map<string, ServerMsg[]>();
  const record = (out: Outgoing[]) => {
    for (const o of out) if (o.kind === 'send') for (const c of o.to) (inbox.get(c) ?? inbox.set(c, []).get(c)!).push(o.msg);
    return out;
  };
  const send = (conn: string, msg: ClientMsg) => record(room.handle(conn, msg, now));
  const wait = (ms: number) => {
    now += ms;
    return record(room.tick(now));
  };
  /** Walk a player to (x, z) within the server's speed limit. */
  const walkTo = (conn: string, x: number, z: number) => {
    for (let i = 0; i < 200; i++) {
      const p = room.playerOf(conn)!;
      if (Math.hypot(p.x - x, p.z - z) < 0.2) return;
      now += 250;
      send(conn, { t: 'move', x, y: 0, z, yaw: 0, grounded: true, speed: 10 });
    }
  };
  const idOf = (conn: string) => room.playerOf(conn)!;
  return { room, send, wait, walkTo, idOf, inbox, at: () => now, skip: (ms: number) => (now += ms) };
}

/** Three players in a public room: Alpha (a) stands by the box. */
function threeAtTheBox() {
  const s = setup();
  s.send('a', hello('Alpha'));
  s.send('b', hello('Bravo'));
  s.send('c', hello('Charlie'));
  s.walkTo('a', JACK_SPOT.x, JACK_SPOT.z);
  return s;
}
const wordOf = (room: HubRoom, conn: string) => WHO_CARDS[room.hubChat.cardOf(room.playerOf(conn)!.id)!].name;

describe('text chat', () => {
  it('relays a message to everyone in the room with the name from the roster', () => {
    const { send } = threeAtTheBox();
    const out = send('b', { t: 'chat', text: '  hello   there ' });
    for (const c of ['a', 'b', 'c']) expect(of(out, c, 'chat')).toEqual([expect.objectContaining({ name: 'Bravo', text: 'hello there' })]);
    expect(of(out, 'a', 'chat')[0].m).toBeUndefined();
  });

  it('uses the de-duplicated roster name, never anything the sender claims', () => {
    const s = setup();
    s.send('a', hello('Alpha'));
    s.send('b', hello('Alpha'));
    const out = s.send('b', { t: 'chat', text: 'I am Alpha' } as ClientMsg);
    expect(of(out, 'a', 'chat')[0].name).toBe('Alpha 2');
    expect(of(out, 'a', 'chat')[0].id).toBe(s.idOf('b').id);
  });

  it('cleans and filters the text', () => {
    const { send } = threeAtTheBox();
    const out = send('b', { t: 'chat', text: 'oh​ shit\u0007' });
    expect(of(out, 'c', 'chat')[0].text).toBe('oh ****');
    expect(send('b', { t: 'chat', text: ' \n ' })).toEqual([]);
  });

  it(`rate-limits: a burst of ${CHAT_BURST}, then one every ${CHAT_REFILL_MS} ms, and tells the sender`, () => {
    const s = threeAtTheBox();
    s.skip(10_000);
    for (let i = 0; i < CHAT_BURST; i++) expect(of(s.send('b', { t: 'chat', text: `m${i}` }), 'c', 'chat')).toHaveLength(1);
    const slow = s.send('b', { t: 'chat', text: 'too fast' });
    expect(of(slow, 'c', 'chat')).toHaveLength(0);
    expect(of(slow, 'b', 'chatNote')[0]).toMatchObject({ code: 'slow' });
    expect(to(slow, 'a')).toEqual([]);
    s.skip(CHAT_REFILL_MS + 10);
    expect(of(s.send('b', { t: 'chat', text: 'again' }), 'c', 'chat')).toHaveLength(1);
    expect(of(s.send('b', { t: 'chat', text: 'and again' }), 'b', 'chatNote')[0]).toMatchObject({ code: 'slow' });
  });

  it('refuses chat before joining', () => {
    const { send } = setup();
    expect(to(send('x', { t: 'chat', text: 'hi' }), 'x')[0]).toMatchObject({ t: 'error', code: 'not_joined' });
  });
});

describe('Who Am I? cards', () => {
  it('deals only by the box', () => {
    const { send } = threeAtTheBox();
    expect(of(send('b', { t: 'card', a: 'deal' }), 'b', 'chatNote')[0]).toMatchObject({ code: 'card_far' });
    const out = send('a', { t: 'card', a: 'deal' });
    expect(of(out, 'a', 'card')).toHaveLength(1);
  });

  it("never sends the holder their own card's word, while everyone else gets it", () => {
    const { room, send, wait, inbox, idOf } = threeAtTheBox();
    const out = send('a', { t: 'card', a: 'deal' });
    const word = wordOf(room, 'a');
    expect(of(out, 'a', 'card')[0]).toEqual({ t: 'card', k: 'on', id: idOf('a').id, name: 'Alpha' });
    expect(of(out, 'b', 'card')[0]).toMatchObject({ k: 'on', id: idOf('a').id, w: word });
    expect(of(out, 'c', 'card')[0]).toMatchObject({ w: word });
    // chat that names it, a newcomer arriving, snapshots, wrong guesses, another deal: still nothing for A
    send('b', { t: 'chat', text: `you are a ${word}! a ${word.toUpperCase()}` });
    send('d', hello('Delta'));
    send('a', { t: 'chat', text: 'am I a teapot-shaped thing?' });
    send('a', { t: 'card', a: 'deal' });
    wait(200);
    const all = JSON.stringify(inbox.get('a'));
    const key = fold(word).replace(/ /g, '');
    expect(fold(all).replace(/ /g, '').includes(key)).toBe(false);
    // the newcomer is told who wears what
    expect(inbox.get('d')!.find((m) => m.t === 'cards')).toEqual({ t: 'cards', c: [{ id: idOf('a').id, w: word }] });
    expect(room.hubChat.view(idOf('a').id)).toEqual({ t: 'cards', c: [{ id: idOf('a').id }] });
  });

  it("masks a holder's answer in other players' messages for that holder only", () => {
    const { room, send } = threeAtTheBox();
    send('a', { t: 'card', a: 'deal' });
    const word = wordOf(room, 'a');
    const out = send('b', { t: 'chat', text: `psst, it is ${word}` });
    const forA = of(out, 'a', 'chat')[0];
    expect(forA.m).toBe(1);
    expect(forA.text).not.toContain(word);
    expect(forA.text.startsWith(`psst, it is ${word[0]}*`)).toBe(true);
    expect(of(out, 'b', 'chat')[0].text).toBe(`psst, it is ${word}`);
    expect(of(out, 'c', 'chat')[0]).toMatchObject({ text: `psst, it is ${word}` });
    expect(of(out, 'c', 'chat')[0].m).toBeUndefined();
  });

  it('a wrong guess posts as chat; the right one takes the card off for everyone with the answer', () => {
    const { room, send, idOf } = threeAtTheBox();
    send('a', { t: 'card', a: 'deal' });
    const word = wordOf(room, 'a');
    const wrong = send('a', { t: 'chat', text: word === 'teapot' ? 'am I a kite?' : 'am I a teapot?' });
    expect(of(wrong, 'b', 'chat')).toHaveLength(1);
    expect(room.hubChat.cardOf(idOf('a').id)).not.toBeNull();
    const right = send('a', { t: 'chat', text: `Am I ${word.toUpperCase()}?` });
    expect(of(right, 'b', 'chat')).toHaveLength(0);
    for (const c of ['a', 'b', 'c']) expect(of(right, c, 'card')[0]).toMatchObject({ k: 'solved', id: idOf('a').id, name: 'Alpha', w: word });
    expect(room.hubChat.cardOf(idOf('a').id)).toBeNull();
  });

  it('one card at a time, a short cool-down between cards, and Peel it off reveals the answer', () => {
    const s = threeAtTheBox();
    s.send('a', { t: 'card', a: 'deal' });
    const word = wordOf(s.room, 'a');
    expect(of(s.send('a', { t: 'card', a: 'deal' }), 'a', 'chatNote')[0]).toMatchObject({ code: 'card_busy' });
    const peel = s.send('a', { t: 'card', a: 'peel' });
    expect(of(peel, 'a', 'card')[0]).toMatchObject({ k: 'peeled', w: word });
    expect(of(peel, 'b', 'card')[0]).toMatchObject({ k: 'peeled', w: word });
    expect(of(s.send('a', { t: 'card', a: 'peel' }), 'a', 'chatNote')[0]).toMatchObject({ code: 'card_none' });
    expect(of(s.send('a', { t: 'card', a: 'deal' }), 'a', 'chatNote')[0]).toMatchObject({ code: 'card_wait' });
    s.skip(CARD_COOLDOWN_MS);
    expect(of(s.send('a', { t: 'card', a: 'deal' }), 'a', 'card')[0]).toMatchObject({ k: 'on' });
    expect(wordOf(s.room, 'a')).not.toBe(word); // not the same card again straight away
  });

  it('falls off, unrevealed to the holder, on entering a trial or the Workshop', () => {
    const { room, send, idOf } = threeAtTheBox();
    send('a', { t: 'card', a: 'deal' });
    const word = wordOf(room, 'a');
    const out = send('a', { t: 'activity', a: 'workshop' });
    expect(of(out, 'a', 'card')[0]).toEqual({ t: 'card', k: 'off', id: idOf('a').id, name: 'Alpha' });
    expect(of(out, 'b', 'card')[0]).toMatchObject({ k: 'off', w: word });
    expect(room.hubChat.cardCount).toBe(0);
    expect(of(send('a', { t: 'card', a: 'deal' }), 'a', 'chatNote')[0]).toMatchObject({ code: 'card_away' });
  });

  it('falls off on disconnecting and on leaving', () => {
    const s = threeAtTheBox();
    s.send('a', { t: 'card', a: 'deal' });
    const out = s.room.disconnect('a', s.at());
    expect(of(out, 'b', 'card')[0]).toMatchObject({ k: 'off' });
    expect(s.room.hubChat.cardCount).toBe(0);
    s.send('b', { t: 'move', x: JACK_SPOT.x, y: 0, z: JACK_SPOT.z, yaw: 0, grounded: true, speed: 0 });
    s.walkTo('b', JACK_SPOT.x, JACK_SPOT.z);
    s.send('b', { t: 'card', a: 'deal' });
    const left = s.send('b', { t: 'leave' });
    expect(of(left, 'c', 'card')[0]).toMatchObject({ k: 'off' });
    expect(s.room.hubChat.cardCount).toBe(0);
  });

  it('deals different cards to players wearing them at the same time', () => {
    const s = threeAtTheBox();
    s.walkTo('b', JACK_SPOT.x, JACK_SPOT.z + 1);
    s.send('a', { t: 'card', a: 'deal' });
    s.send('b', { t: 'card', a: 'deal' });
    expect(wordOf(s.room, 'a')).not.toBe(wordOf(s.room, 'b'));
    // B's answer is masked for B, A's for A, in the same message from C
    const out = s.send('c', { t: 'chat', text: `${wordOf(s.room, 'a')} and ${wordOf(s.room, 'b')}` });
    expect(of(out, 'a', 'chat')[0].text).toContain(wordOf(s.room, 'b'));
    expect(of(out, 'a', 'chat')[0].text).not.toContain(wordOf(s.room, 'a'));
    expect(of(out, 'b', 'chat')[0].text).toContain(wordOf(s.room, 'a'));
    expect(of(out, 'b', 'chat')[0].text).not.toContain(wordOf(s.room, 'b'));
  });
});
