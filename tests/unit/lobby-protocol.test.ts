/** Protocol v3 validation: lobby actions, match inputs, account link, and the client-side parsing of lobby state and match snapshots. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOBBY_SETTINGS as LOBBY_DEFAULTS, PROTOCOL_VERSION, parseClientMessage, parseInputItem, parseServerMessage } from '../../src/net/protocol';

const P = (v: unknown) => parseClientMessage(JSON.stringify(v));
const S = (v: unknown) => parseServerMessage(JSON.stringify(v));

describe('lobby and match messages (protocol v3)', () => {
  it('is protocol version 3', () => expect(PROTOCOL_VERSION).toBe(3));

  it('accepts every lobby action with valid fields', () => {
    expect(P({ t: 'lobby', a: 'create', settings: LOBBY_DEFAULTS })).toEqual({ t: 'lobby', a: 'create', settings: LOBBY_DEFAULTS });
    expect(P({ t: 'lobby', a: 'join', id: 'AB2C' })).toEqual({ t: 'lobby', a: 'join', id: 'AB2C' });
    expect(P({ t: 'lobby', a: 'settings', settings: { cap: 4, locked: true } })).toEqual({ t: 'lobby', a: 'settings', settings: { cap: 4, locked: true } });
    expect(P({ t: 'lobby', a: 'settings', settings: { mode: 'single', game: 'toy-squad' } })).toEqual({ t: 'lobby', a: 'settings', settings: { mode: 'single', game: 'toy-squad' } });
    expect(P({ t: 'lobby', a: 'kick', id: 'p3' })).toEqual({ t: 'lobby', a: 'kick', id: 'p3' });
    expect(P({ t: 'lobby', a: 'ready', ready: true })).toEqual({ t: 'lobby', a: 'ready', ready: true });
    expect(P({ t: 'lobby', a: 'watch', id: 'bot-2' })).toEqual({ t: 'lobby', a: 'watch', id: 'bot-2' });
    for (const a of ['leave', 'start']) expect(P({ t: 'lobby', a })).toEqual({ t: 'lobby', a });
  });

  it('drops extra fields on lobby actions', () => {
    expect(P({ t: 'lobby', a: 'settings', settings: { cap: 4, admin: true }, host: 'me' })).toEqual({ t: 'lobby', a: 'settings', settings: { cap: 4 } });
  });

  it('rejects bad lobby settings and ids', () => {
    expect(P({ t: 'lobby', a: 'create', settings: { ...LOBBY_DEFAULTS, cap: 9 } })).toBeNull();
    expect(P({ t: 'lobby', a: 'create', settings: { ...LOBBY_DEFAULTS, cap: 1 } })).toBeNull();
    expect(P({ t: 'lobby', a: 'create', settings: { ...LOBBY_DEFAULTS, cap: 4.5 } })).toBeNull();
    expect(P({ t: 'lobby', a: 'create', settings: { ...LOBBY_DEFAULTS, game: 'chess' } })).toBeNull();
    expect(P({ t: 'lobby', a: 'create', settings: { ...LOBBY_DEFAULTS, format: 'marathon' } })).toBeNull();
    expect(P({ t: 'lobby', a: 'create', settings: { ...LOBBY_DEFAULTS, difficulty: 'impossible' } })).toBeNull();
    expect(P({ t: 'lobby', a: 'create', settings: { mode: 'single' } })).toBeNull(); // create needs every field
    expect(P({ t: 'lobby', a: 'settings', settings: {} })).toBeNull();
    expect(P({ t: 'lobby', a: 'settings', settings: { botFill: 'yes' } })).toBeNull();
    expect(P({ t: 'lobby', a: 'join', id: 'ab2c' })).toBeNull();
    expect(P({ t: 'lobby', a: 'join', id: 'AB0C' })).toBeNull(); // 0 is not in the alphabet
    expect(P({ t: 'lobby', a: 'kick', id: '<script>' })).toBeNull();
    expect(P({ t: 'lobby', a: 'timescale', k: 1e9 })).toBeNull();
    expect(P({ t: 'lobby', a: 'explode' })).toBeNull();
  });

  it('match inputs: flat objects of plain values only, at most MAX_INPUTS_PER_MSG', () => {
    const ok = { t: 'in', m: 3, i: [{ slot: 2 }, { type: 'move', x: 0.5, z: -1 }, { text: 'banana' }, { direction: null, hit: true }] };
    expect(P(ok)).toEqual(ok);
    expect(P({ t: 'in', m: 3, i: [{ nested: { a: 1 } }] })).toBeNull();
    expect(P({ t: 'in', m: 3, i: [[1, 2]] })).toBeNull();
    expect(P({ t: 'in', m: 3, i: [7] })).toBeNull();
    expect(P({ t: 'in', m: 3, i: [{ text: 'x'.repeat(65) }] })).toBeNull();
    expect(P({ t: 'in', m: 3, i: [{ a_b: 1 }] })).toBeNull();
    expect(P({ t: 'in', m: 1.5, i: [] })).toBeNull();
    expect(P({ t: 'in', m: 1, i: Array.from({ length: 33 }, () => ({ s: 1 })) })).toBeNull();
    expect(parseInputItem(JSON.parse('{"__proto__": {"x": 1}}'))).toBeNull();
    expect(P({ t: 'auth', token: 'abc' })).toEqual({ t: 'auth', token: 'abc' });
    expect(P({ t: 'auth', token: '' })).toBeNull();
  });

  it('parses lobby state, alerts, errors and match snapshots on the client', () => {
    const look = { paint: 1, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' };
    const lobby = {
      id: 'AB2C',
      hostId: 'p1',
      settings: LOBBY_DEFAULTS,
      members: [{ id: 'p1', name: 'Ticker', look, ready: false, off: false, spectating: false }],
      match: {
        seq: 2,
        phase: 'results',
        game: 'copycat-conductor',
        endsAt: 1000,
        seats: [
          { id: 'p1', name: 'Ticker', look, bot: null },
          { id: 'bot-1', name: 'Pip', look, bot: 'easy' },
        ],
        tournament: { format: 'blitz', games: ['copycat-conductor'], round: 0, standings: [{ contestantId: 'p1', points: 10, rounds: [10], wins: 1 }] },
        result: { placements: [{ contestantId: 'p1', place: 1, score: 3 }], durationMs: 5000 },
        forfeits: [],
        timeScale: 1,
      },
    };
    expect(S({ t: 'lobby', you: 'p1', lobby })).toMatchObject({ t: 'lobby', you: 'p1', lobby: { id: 'AB2C', match: { seq: 2, phase: 'results' } } });
    expect(S({ t: 'lobby', you: 'p1', lobby: null, reason: 'kicked' })).toEqual({ t: 'lobby', you: 'p1', lobby: null, reason: 'kicked' });
    expect(S({ t: 'lobby', you: 'p1', lobby: { ...lobby, match: { ...lobby.match, phase: 'nap' } } })).toBeNull();
    expect(S({ t: 'lobbies', list: [{ id: 'AB2C', hostId: 'p1', host: 'Ticker', mode: 'tournament', game: 'copycat-conductor', format: 'blitz', players: 3, cap: 8, locked: false, playing: true }] })).toMatchObject({ t: 'lobbies', list: [{ players: 3, playing: true }] });
    expect(S({ t: 'lobbyErr', code: 'lobby_full', message: 'Full' })).toEqual({ t: 'lobbyErr', code: 'lobby_full', message: 'Full' });
    expect(S({ t: 'lobbyErr', code: 'mystery' })).toBeNull();
    expect(S({ t: 'ms', m: 2, k: 0, d: { o: {} }, e: [{ type: 'note', slot: 1 }, 7], n: 5 })).toEqual({ t: 'ms', m: 2, k: 0, d: { o: {} }, e: [{ type: 'note', slot: 1 }], n: 5 });
    expect(S({ t: 'ms', m: 2, k: 2, d: {}, e: [], n: 5 })).toBeNull();
  });
});
