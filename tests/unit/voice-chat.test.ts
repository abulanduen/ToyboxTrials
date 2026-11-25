/* Proximity voice chat: the protocol (sizes, shapes), the server's mic state and handshake relay
   (server/voiceRelay.ts through server/hubRoom.ts and hubDirectory.ts: validation, room isolation,
   rate limits), the pure link planner and audio shaping (src/net/voicePlan.ts), the ICE server
   setting and the persisted voice settings. */
import { describe, expect, it } from 'vitest';
import { HubRoom, type Outgoing } from '../../server/hubRoom';
import { HubDirectory } from '../../server/hubDirectory';
import { SIGNAL_BURST, MIC_BURST } from '../../server/voiceRelay';
import { seededRng } from '../../src/minigames/rng';
import {
  MAX_ICE_PER_MSG,
  MAX_MESSAGE_BYTES,
  MAX_SDP_LENGTH,
  MAX_SIGNAL_BYTES,
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
  type ClientMsg,
  type HelloMsg,
  type ServerMsg,
  type SignalMsg,
} from '../../src/net/protocol';
import {
  MAX_LISTENERS_PER_SPEAKER,
  MAX_SPEAKERS_PER_LISTENER,
  VOICE_CONNECT_CM,
  VOICE_DISCONNECT_CM,
  planListeners,
  planSpeakers,
  proximityGain,
  rmsLevel,
  stereoPan,
  type VoiceCandidate,
} from '../../src/net/voicePlan';
import { DEFAULT_ICE_SERVERS, parseIceServers } from '../../src/net/voiceConfig';
import { VOICE_SETTING_DEFAULTS, cleanVoiceSettings } from '../../src/game/voiceSettings';
import { migratePersisted } from '../../src/game/economy';

const look = { paint: 1, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };
const hello = (name: string, join: HelloMsg['join'] = { kind: 'public' }): HelloMsg => ({ t: 'hello', v: PROTOCOL_VERSION, name, look, join });
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.flatMap((o) => (o.kind === 'send' && o.to.includes(conn) ? [o.msg] : []));
const sigs = (out: Outgoing[], conn: string) => to(out, conn).filter((m): m is Extract<ServerMsg, { t: 'sig' }> => m.t === 'sig');
const mics = (out: Outgoing[], conn: string) => to(out, conn).filter((m): m is Extract<ServerMsg, { t: 'mic' }> => m.t === 'mic');

/** One room, three players: a, b, c (ids from their welcomes). */
function room3() {
  const room = new HubRoom({ id: 'public-1', random: seededRng(7) });
  let now = 1_000_000;
  const send = (conn: string, msg: ClientMsg) => room.handle(conn, msg, now);
  const id: Record<string, string> = {};
  for (const n of ['a', 'b', 'c']) {
    const w = to(send(n, hello(n.toUpperCase() + 'name')), n).find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    id[n] = w.you;
  }
  return { room, send, id, advance: (ms: number) => (now += ms) };
}
const offer = (toId: string, c = 1): SignalMsg => ({ t: 'sig', to: toId, c, s: 0, k: 'offer', d: SDP });
const answer = (toId: string, c = 1): SignalMsg => ({ t: 'sig', to: toId, c, s: 1, k: 'answer', d: SDP });
const ice = (toId: string, c = 1, s: 0 | 1 = 0): SignalMsg => ({ t: 'sig', to: toId, c, s, k: 'ice', d: [{ c: 'candidate:1 1 udp 2122260223 192.168.1.2 54321 typ host', m: '0', i: 0 }] });

// ---------------------------------------------------------------- protocol
describe('voice protocol (v6)', () => {
  it('arrived in version 6 (now 8: the shared dog, then rides)', () => expect(PROTOCOL_VERSION).toBe(8));

  it('accepts well-formed mic and sig messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'mic', on: true }))).toEqual({ t: 'mic', on: true });
    expect(parseClientMessage(JSON.stringify(offer('p2', 3)))).toEqual(offer('p2', 3));
    expect(parseClientMessage(JSON.stringify(ice('p2')))).toEqual(ice('p2'));
    expect(parseClientMessage(JSON.stringify({ t: 'sig', to: 'p2', c: 9, s: 1, k: 'bye' }))).toEqual({ t: 'sig', to: 'p2', c: 9, s: 1, k: 'bye' });
  });

  it('rejects malformed ones', () => {
    const bad = [
      { t: 'mic', on: 'yes' },
      { t: 'sig', to: '../p2', c: 1, s: 0, k: 'offer', d: SDP },
      { t: 'sig', to: 'p2', c: 0, s: 0, k: 'offer', d: SDP }, // link ids are positive
      { t: 'sig', to: 'p2', c: 1.5, s: 0, k: 'offer', d: SDP },
      { t: 'sig', to: 'p2', c: 1, s: 1, k: 'offer', d: SDP }, // only a listener offers
      { t: 'sig', to: 'p2', c: 1, s: 0, k: 'answer', d: SDP }, // only a speaker answers
      { t: 'sig', to: 'p2', c: 1, s: 0, k: 'offer', d: 'hello' }, // not an SDP
      { t: 'sig', to: 'p2', c: 1, s: 0, k: 'offer' },
      { t: 'sig', to: 'p2', c: 1, s: 0, k: 'ice', d: [] },
      { t: 'sig', to: 'p2', c: 1, s: 0, k: 'ice', d: [{ c: 5 }] },
      { t: 'sig', to: 'p2', c: 1, s: 0, k: 'ice', d: [{ c: 'x'.repeat(600), m: '0', i: 0 }] },
      { t: 'sig', to: 'p2', c: 1, s: 0, k: 'shout', d: SDP },
      { t: 'sig', to: 'p2', c: 1, s: 2, k: 'bye' },
    ];
    for (const m of bad) expect(parseClientMessage(JSON.stringify(m)), JSON.stringify(m).slice(0, 80)).toBeNull();
  });

  it('caps sizes: SDP length, candidates per message, and the frame', () => {
    const long = { ...offer('p2'), d: SDP + 'a=x\r\n'.repeat(Math.ceil(MAX_SDP_LENGTH / 5)) };
    expect(parseClientMessage(JSON.stringify(long))).toBeNull();
    const many = { ...ice('p2'), d: Array.from({ length: MAX_ICE_PER_MSG + 1 }, () => ({ c: 'candidate:1', m: '0', i: 0 })) };
    expect(parseClientMessage(JSON.stringify(many))).toBeNull();
    // a real-sized SDP (over 2 KB) fits in a sig frame…
    const big = { ...offer('p2'), d: SDP + 'a=x\r\n'.repeat(500) };
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseClientMessage(JSON.stringify(big))).not.toBeNull();
    // …but every other message keeps the 2 KB limit, and nothing goes past MAX_SIGNAL_BYTES
    expect(parseClientMessage(JSON.stringify({ t: 'emote', id: 'wave', pad: 'x'.repeat(MAX_MESSAGE_BYTES) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...big, pad: 'x'.repeat(MAX_SIGNAL_BYTES) }))).toBeNull();
  });

  it('parses the server side (mic, mics, sig)', () => {
    expect(parseServerMessage(JSON.stringify({ t: 'mic', id: 'p3', on: true }))).toEqual({ t: 'mic', id: 'p3', on: true });
    expect(parseServerMessage(JSON.stringify({ t: 'mics', on: ['p1', 'bad id!', 'p4'] }))).toEqual({ t: 'mics', on: ['p1', 'p4'] });
    expect(parseServerMessage(JSON.stringify({ t: 'sig', from: 'p2', c: 4, s: 1, k: 'answer', d: SDP }))).toEqual({ t: 'sig', from: 'p2', c: 4, s: 1, k: 'answer', d: SDP });
    expect(parseServerMessage(JSON.stringify({ t: 'sig', c: 4, s: 1, k: 'answer', d: SDP }))).toBeNull();
  });
});

// ---------------------------------------------------------------- mic state
describe('mic state on the server', () => {
  it('tells the others (not the sender) when a mic goes on or off, and newcomers get the list', () => {
    const { send, id } = room3();
    const out = send('a', { t: 'mic', on: true });
    expect(mics(out, 'b')).toEqual([{ t: 'mic', id: id.a, on: true }]);
    expect(mics(out, 'c')).toHaveLength(1);
    expect(mics(out, 'a')).toHaveLength(0);
    expect(send('a', { t: 'mic', on: true })).toEqual([]); // no change, nothing sent
    const join = send('d', hello('Dname'));
    expect(to(join, 'd').find((m) => m.t === 'mics')).toEqual({ t: 'mics', on: [id.a] });
    expect(mics(send('a', { t: 'mic', on: false }), 'b')).toEqual([{ t: 'mic', id: id.a, on: false }]);
  });

  it('turns a mic off when its player goes into a trial or the Workshop, or drops', () => {
    const { room, send, id, advance } = room3();
    send('a', { t: 'mic', on: true });
    const out = send('a', { t: 'activity', a: 'workshop' });
    expect(mics(out, 'b')).toEqual([{ t: 'mic', id: id.a, on: false }]);
    expect(mics(out, 'a')).toEqual([{ t: 'mic', id: id.a, on: false }]);
    // and can't be switched on outside the Hub: the sender is told how things stand
    advance(2000);
    const refused = send('a', { t: 'mic', on: true });
    expect(mics(refused, 'a')).toEqual([{ t: 'mic', id: id.a, on: false }]);
    expect(mics(refused, 'b')).toHaveLength(0);
    send('a', { t: 'activity', a: null });
    send('b', { t: 'mic', on: true });
    const dropped = room.disconnect('b', 1_000_000 + 5000);
    expect(mics(dropped, 'c')).toEqual([{ t: 'mic', id: id.b, on: false }]);
    expect(room.voiceRelay.isOn(id.b)).toBe(false);
  });

  it('rate-limits mic changes and answers a refused one with the real state', () => {
    const { room, send, id } = room3();
    let last: Outgoing[] = [];
    for (let i = 0; i <= MIC_BURST; i++) last = send('a', { t: 'mic', on: i % 2 === 0 });
    expect(mics(last, 'a')).toHaveLength(1);
    expect(mics(last, 'a')[0].on).toBe(room.voiceRelay.isOn(id.a));
  });
});

// ---------------------------------------------------------------- handshake relay
describe('signalling relay', () => {
  it('relays an offer to a speaker, the answer back, candidates and bye; the server sets `from`', () => {
    const { send, id } = room3();
    send('b', { t: 'mic', on: true });
    const o = send('a', offer(id.b, 7));
    expect(sigs(o, 'b')).toEqual([{ t: 'sig', from: id.a, c: 7, s: 0, k: 'offer', d: SDP }]);
    expect(sigs(o, 'c')).toHaveLength(0);
    expect(sigs(send('b', answer(id.a, 7)), 'a')).toEqual([{ t: 'sig', from: id.b, c: 7, s: 1, k: 'answer', d: SDP }]);
    expect(sigs(send('a', ice(id.b, 7)), 'b')[0]).toMatchObject({ from: id.a, k: 'ice' });
    expect(sigs(send('b', ice(id.a, 7, 1)), 'a')[0]).toMatchObject({ from: id.b, k: 'ice', s: 1 });
    expect(sigs(send('a', { t: 'sig', to: id.b, c: 7, s: 0, k: 'bye' }), 'b')[0]).toMatchObject({ from: id.a, k: 'bye' });
  });

  it('drops offers to a player whose mic is off, and answers from one whose mic is off', () => {
    const { room, send, id } = room3();
    expect(send('a', offer(id.b))).toEqual([]);
    expect(send('b', answer(id.a))).toEqual([]);
    expect(room.voiceRelay.stats.refused).toBe(2);
  });

  it('drops messages to yourself, to unknown or held players, and outside the Hub', () => {
    const { room, send, id, advance } = room3();
    send('b', { t: 'mic', on: true });
    send('a', { t: 'mic', on: true });
    expect(send('a', offer(id.a))).toEqual([]);
    expect(send('a', offer('p99'))).toEqual([]);
    send('c', { t: 'activity', a: 'copycat-conductor' });
    expect(send('c', offer(id.b))).toEqual([]); // sender in a trial
    send('c', { t: 'activity', a: null });
    send('b', { t: 'activity', a: 'shop' }); // turns b's mic off too
    send('b', { t: 'activity', a: null });
    advance(2000);
    send('b', { t: 'mic', on: true });
    send('b', { t: 'activity', a: 'workshop' });
    expect(send('c', ice(id.b))).toEqual([]); // target outside the Hub
    send('b', { t: 'activity', a: null });
    room.disconnect('a', 1_000_000);
    expect(send('c', offer(id.a))).toEqual([]); // a's slot is held, not connected
  });

  it('never relays across rooms: the same player id in another room is not reachable', () => {
    const d = new HubDirectory({ random: seededRng(3) });
    const now = 5_000_000;
    const w = (out: Outgoing[], conn: string) => to(out, conn).find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    const a = w(d.handle('a', hello('Aname', { kind: 'host' }), now), 'a');
    const b = w(d.handle('b', hello('Bname', { kind: 'host' }), now), 'b');
    expect(a.room.code).not.toBe(b.room.code);
    expect(a.you).toBe(b.you); // ids are per room: both rooms have a "p1"
    d.handle('x', hello('Xname', { kind: 'code', code: a.room.code! }), now); // a second player in room A
    d.handle('b', { t: 'mic', on: true }, now);
    // x (room A) offers to "p1": that is a, in x's own room, whose mic is off → dropped; b never sees it
    const out = d.handle('x', offer(b.you), now);
    expect(sigs(out, 'b')).toHaveLength(0);
    d.handle('a', { t: 'mic', on: true }, now);
    const out2 = d.handle('x', offer(a.you), now);
    expect(sigs(out2, 'a')).toHaveLength(1);
    expect(sigs(out2, 'b')).toHaveLength(0);
  });

  it('rate-limits signalling per player', () => {
    const { send, id } = room3();
    send('b', { t: 'mic', on: true });
    let relayed = 0;
    for (let i = 0; i < SIGNAL_BURST + 20; i++) relayed += sigs(send('a', ice(id.b, 1 + i)), 'b').length;
    expect(relayed).toBe(SIGNAL_BURST);
  });

  it('forgets a player who leaves', () => {
    const { room, send, id } = room3();
    send('a', { t: 'mic', on: true });
    send('a', { t: 'leave' });
    expect(room.voiceRelay.list()).not.toContain(id.a);
  });
});

// ---------------------------------------------------------------- planner
const cand = (id: string, x: number, z = 0, micOn = true, inHub = true): VoiceCandidate => ({ id, x, z, micOn, inHub });
const ME = { x: 0, z: 0 };
const none = new Set<string>();

describe('who hears whom (voicePlan)', () => {
  it('connects within 45 cm and disconnects beyond 60 cm (hysteresis)', () => {
    const opts = { hearing: true, muted: none };
    expect(planSpeakers(ME, [cand('a', VOICE_CONNECT_CM - 1)], none, opts)).toEqual(['a']);
    expect(planSpeakers(ME, [cand('a', 50)], none, opts)).toEqual([]); // not yet
    expect(planSpeakers(ME, [cand('a', 50)], new Set(['a']), opts)).toEqual(['a']); // already linked: kept
    expect(planSpeakers(ME, [cand('a', VOICE_DISCONNECT_CM + 1)], new Set(['a']), opts)).toEqual([]);
  });

  it('only links to speakers whose mic is on, in the Hub, not muted, not backing off; nothing with hearing off', () => {
    const others = [cand('on', 10), cand('off', 10, 0, false), cand('trial', 10, 0, true, false), cand('muted', 10), cand('busy', 10)];
    expect(planSpeakers(ME, others, none, { hearing: true, muted: new Set(['muted']), blocked: new Set(['busy']) })).toEqual(['on']);
    expect(planSpeakers(ME, others, none, { hearing: false, muted: none })).toEqual([]);
  });

  it('keeps the nearest 6 speakers', () => {
    const others = Array.from({ length: 10 }, (_, i) => cand(`s${i}`, 40 - i * 3));
    const got = planSpeakers(ME, others, none, { hearing: true, muted: none });
    expect(got).toHaveLength(MAX_SPEAKERS_PER_LISTENER);
    expect(got).toEqual(['s9', 's8', 's7', 's6', 's5', 's4']);
  });

  it('a speaker keeps the nearest 8 listeners within reach', () => {
    const where = new Map(Array.from({ length: 12 }, (_, i) => [`l${i}`, { x: 5 + i * 5, z: 0, inHub: true }] as const));
    where.set('away', { x: 5, z: 0, inHub: false });
    const got = planListeners(ME, true, [...where.keys(), 'ghost'], where);
    expect(got).toHaveLength(MAX_LISTENERS_PER_SPEAKER);
    expect(got[0]).toBe('l0');
    expect(got).not.toContain('away');
    expect(got).not.toContain('ghost');
    where.set('far', { x: 80, z: 0, inHub: true });
    expect(planListeners(ME, true, ['l11'], where)).toEqual(['l11']); // 60 cm: the speaker allows a little slack
    expect(planListeners(ME, true, ['far'], where)).toEqual([]); // 80 cm: beyond 60 + 15
    expect(planListeners(ME, false, ['l0'], where)).toEqual([]);
  });

  it('shapes the audio: full near, silent at 60 cm, panned by side', () => {
    expect(proximityGain(0)).toBe(1);
    expect(proximityGain(10)).toBe(1);
    expect(proximityGain(30)).toBeGreaterThan(0);
    expect(proximityGain(30)).toBeLessThan(1);
    expect(proximityGain(40)).toBeLessThan(proximityGain(30));
    expect(proximityGain(VOICE_DISCONNECT_CM)).toBe(0);
    expect(proximityGain(NaN)).toBe(0);
    // camera looking down -z: its right is +x
    expect(stereoPan(ME, { x: 20, z: 0 }, 1, 0)).toBeCloseTo(0.8);
    expect(stereoPan(ME, { x: -20, z: 0 }, 1, 0)).toBeCloseTo(-0.8);
    expect(stereoPan(ME, { x: 0, z: -20 }, 1, 0)).toBeCloseTo(0);
    expect(Math.abs(stereoPan(ME, { x: 0.5, z: 0 }, 1, 0))).toBeLessThan(0.1); // on top of you: centred
    expect(rmsLevel([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
    expect(rmsLevel([])).toBe(0);
  });
});

// ---------------------------------------------------------------- config and settings
describe('ICE servers (VITE_ICE_SERVERS)', () => {
  it('defaults to one public STUN server and no TURN', () => {
    expect(parseIceServers(undefined)).toEqual(DEFAULT_ICE_SERVERS);
    expect(DEFAULT_ICE_SERVERS.every((s) => String(s.urls).startsWith('stun:'))).toBe(true);
  });
  it('takes a JSON list, including TURN with credentials, or [] for none', () => {
    const turn = [{ urls: ['turns:turn.example.org:5349'], username: 'u', credential: 'p' }];
    expect(parseIceServers(JSON.stringify(turn))).toEqual(turn);
    expect(parseIceServers('[]')).toEqual([]);
  });
  it('falls back to the default for anything malformed', () => {
    for (const bad of ['nope', '{}', '[{"urls":"http://x"}]', '[{"urls":[]}]', '[1]']) expect(parseIceServers(bad)).toEqual(DEFAULT_ICE_SERVERS);
  });
});

describe('voice settings (persisted)', () => {
  it('a save from before voice chat gets the defaults: hearing on, push to talk', () => {
    const old = migratePersisted({ quality: 'low', tourSeen: true, masterVolume: 0.5 }, 2);
    expect(cleanVoiceSettings(old)).toEqual(VOICE_SETTING_DEFAULTS);
    expect(cleanVoiceSettings(migratePersisted(undefined, 0))).toEqual(VOICE_SETTING_DEFAULTS);
    expect(VOICE_SETTING_DEFAULTS).toEqual({ voiceHear: true, voiceChatVolume: 0.8, micMode: 'ptt' });
  });
  it('keeps valid choices and repairs damaged ones', () => {
    expect(cleanVoiceSettings({ voiceHear: false, voiceChatVolume: 0.3, micMode: 'open' })).toEqual({ voiceHear: false, voiceChatVolume: 0.3, micMode: 'open' });
    expect(cleanVoiceSettings({ voiceHear: 'yes', voiceChatVolume: 7, micMode: 'shout' })).toEqual({ voiceHear: true, voiceChatVolume: 1, micMode: 'ptt' });
    expect(cleanVoiceSettings({ voiceChatVolume: NaN }).voiceChatVolume).toBe(0.8);
    expect(cleanVoiceSettings(null)).toEqual(VOICE_SETTING_DEFAULTS);
  });
});
