/**
 * Tournament lobbies (server/lobby.ts): create, alerts, join, leave, kick, cap, lock, settings and
 * mode changes, host handover, rate limits, start checks, join-in-progress, and the lobby as part
 * of a Hub room (server/hubRoom.ts). Pure: time and randomness are passed in.
 */
import { describe, expect, it } from 'vitest';
import { CREATE_COOLDOWN_MS, LobbyBoard, LOBBY_ACTION_BURST, type LobbyOut, type LobbyPlayer } from '../../server/lobby';
import { HubDirectory } from '../../server/hubDirectory';
import { seededRng } from '../../src/minigames/rng';
import { DEFAULT_LOBBY_SETTINGS, PROTOCOL_VERSION, type LobbySettings, type ServerMsg } from '../../src/net/protocol';
import { DEFAULT_LOOK } from '../../server/sanitize';

const player = (id: string, name = id.toUpperCase()): LobbyPlayer => ({ id, name, look: { ...DEFAULT_LOOK }, account: null });
const A = player('p1', 'Ticker');
const B = player('p2', 'Bobbin');
const C = player('p3', 'Clank');
const D = player('p4', 'Dottie');

function setup(debug = true) {
  const board = new LobbyBoard({ random: seededRng(7), debug });
  let now = 1000;
  for (const p of [A, B, C, D]) board.playerArrived(p, now);
  return { board, at: () => (now += 50) };
}

/** Messages of type `t` sent to player `id` (directly, or to the whole room). */
function sentTo<T extends ServerMsg['t']>(out: LobbyOut[], id: string, t: T): Extract<ServerMsg, { t: T }>[] {
  return out.flatMap((o) => (o.kind === 'send' && (o.to === 'room' || o.to.includes(id)) && o.msg.t === t ? [o.msg as Extract<ServerMsg, { t: T }>] : []));
}

const settings = (p: Partial<LobbySettings> = {}): LobbySettings => ({ ...DEFAULT_LOBBY_SETTINGS, ...p });

function create(board: LobbyBoard, host: LobbyPlayer, now: number, p: Partial<LobbySettings> = {}) {
  const out = board.handle(host, { t: 'lobby', a: 'create', settings: settings(p) }, now);
  const id = sentTo(out, host.id, 'lobby')[0]?.lobby?.id;
  return { out, id: id! };
}

describe('lobby: hosting and the Hub alert', () => {
  it('creates a lobby with the host in it and alerts everyone else in the room', () => {
    const { board, at } = setup();
    const { out, id } = create(board, A, at());
    expect(id).toMatch(/^[A-Z2-9]{4}$/);
    const mine = sentTo(out, A.id, 'lobby')[0].lobby!;
    expect(mine.hostId).toBe(A.id);
    expect(mine.members.map((m) => m.id)).toEqual([A.id]);
    // Alert to the others, never to the host.
    expect(sentTo(out, B.id, 'lobbyAlert')[0].lobby).toMatchObject({ id, host: 'Ticker', mode: 'tournament', format: 'blitz', players: 1, cap: 8 });
    expect(sentTo(out, A.id, 'lobbyAlert')).toHaveLength(0);
    // And the room's list.
    expect(sentTo(out, C.id, 'lobbies')[0].list.map((l) => l.id)).toEqual([id]);
  });

  it('limits hosting: a cooldown between lobbies, and at most MAX_LOBBIES_PER_ROOM per room', () => {
    const { board, at } = setup();
    create(board, A, at());
    const again = board.handle(A, { t: 'lobby', a: 'create', settings: settings() }, at());
    expect(sentTo(again, A.id, 'lobbyErr')[0].code).toBe('slow_down');
    const later = board.handle(A, { t: 'lobby', a: 'create', settings: settings() }, at() + CREATE_COOLDOWN_MS);
    expect(sentTo(later, A.id, 'lobby').some((m) => m.lobby)).toBe(true);
    // Hosting a new lobby leaves the old one (A was alone in it, so it closed).
    expect(board.count).toBe(1);

    const many = new LobbyBoard({ random: seededRng(3) });
    for (let i = 1; i <= 9; i++) {
      const p = player(`p${i}`);
      many.playerArrived(p, 0);
      const out = many.handle(p, { t: 'lobby', a: 'create', settings: settings() }, i);
      if (i === 9) expect(sentTo(out, p.id, 'lobbyErr')[0].code).toBe('too_many_lobbies');
    }
    expect(many.count).toBe(8);
  });

  it('rate-limits lobby actions per player', () => {
    const { board, at } = setup();
    create(board, A, at());
    const t = at();
    let refused = 0;
    for (let i = 0; i < LOBBY_ACTION_BURST + 5; i++) {
      const out = board.handle(A, { t: 'lobby', a: 'ready', ready: i % 2 === 0 }, t);
      if (sentTo(out, A.id, 'lobbyErr').some((e) => e.code === 'slow_down')) refused++;
    }
    expect(refused).toBeGreaterThan(0);
  });
});

describe('lobby: joining, caps, locks and kicks', () => {
  it('anyone can join an open lobby; everyone sees the member list', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at());
    const out = board.handle(B, { t: 'lobby', a: 'join', id }, at());
    const forA = sentTo(out, A.id, 'lobby')[0].lobby!;
    expect(forA.members.map((m) => m.name)).toEqual(['Ticker', 'Bobbin']);
    expect(sentTo(out, D.id, 'lobbies')[0].list[0].players).toBe(2);
    expect(sentTo(board.handle(B, { t: 'lobby', a: 'join', id: 'ZZZZ' }, at()), B.id, 'lobbyErr')[0].code).toBe('no_such_lobby');
  });

  it('the host caps the lobby: a full lobby turns newcomers away', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at(), { cap: 2 });
    board.handle(B, { t: 'lobby', a: 'join', id }, at());
    expect(sentTo(board.handle(C, { t: 'lobby', a: 'join', id }, at()), C.id, 'lobbyErr')[0].code).toBe('lobby_full');
    board.handle(A, { t: 'lobby', a: 'settings', settings: { cap: 3 } }, at());
    expect(sentTo(board.handle(C, { t: 'lobby', a: 'join', id }, at()), C.id, 'lobby')[0].lobby!.members).toHaveLength(3);
  });

  it('the host locks and unlocks the lobby', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at());
    board.handle(A, { t: 'lobby', a: 'settings', settings: { locked: true } }, at());
    expect(sentTo(board.handle(B, { t: 'lobby', a: 'join', id }, at()), B.id, 'lobbyErr')[0].code).toBe('lobby_locked');
    board.handle(A, { t: 'lobby', a: 'settings', settings: { locked: false } }, at());
    expect(sentTo(board.handle(B, { t: 'lobby', a: 'join', id }, at()), B.id, 'lobby')[0].lobby).not.toBeNull();
  });

  it('the host kicks a player, who cannot come back to that lobby', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at());
    board.handle(B, { t: 'lobby', a: 'join', id }, at());
    board.handle(C, { t: 'lobby', a: 'join', id }, at());
    const out = board.handle(A, { t: 'lobby', a: 'kick', id: C.id }, at());
    expect(sentTo(out, C.id, 'lobby')[0]).toMatchObject({ lobby: null, reason: 'kicked' });
    expect(sentTo(out, B.id, 'lobby')[0].lobby!.members.map((m) => m.id)).toEqual([A.id, B.id]);
    expect(sentTo(board.handle(C, { t: 'lobby', a: 'join', id }, at()), C.id, 'lobbyErr')[0].code).toBe('kicked');
  });

  it('only the host can kick, change settings or start', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at());
    board.handle(B, { t: 'lobby', a: 'join', id }, at());
    for (const msg of [
      { t: 'lobby', a: 'kick', id: A.id },
      { t: 'lobby', a: 'settings', settings: { cap: 2 } },
      { t: 'lobby', a: 'start' },
    ] as const) {
      expect(sentTo(board.handle(B, msg, at()), B.id, 'lobbyErr')[0].code).toBe('not_host');
    }
    expect(board.lobbyOf(A.id)!.settings.cap).toBe(8);
  });
});

describe('lobby: settings, mode and host handover', () => {
  it('switches between one trial and a tournament; everyone sees the settings', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at());
    board.handle(B, { t: 'lobby', a: 'join', id }, at());
    let out = board.handle(A, { t: 'lobby', a: 'settings', settings: { mode: 'single', game: 'jack-in-the-box' } }, at());
    expect(sentTo(out, B.id, 'lobby')[0].lobby!.settings).toMatchObject({ mode: 'single', game: 'jack-in-the-box' });
    expect(sentTo(out, C.id, 'lobbies')[0].list[0]).toMatchObject({ mode: 'single', game: 'jack-in-the-box' });
    out = board.handle(A, { t: 'lobby', a: 'settings', settings: { mode: 'tournament', format: 'treasure', botFill: false, difficulty: 'hard' } }, at());
    expect(sentTo(out, B.id, 'lobby')[0].lobby!.settings).toMatchObject({ mode: 'tournament', format: 'treasure', botFill: false, difficulty: 'hard' });
  });

  it('when the host leaves, the longest-present member takes over; the last one out closes it', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at());
    board.handle(B, { t: 'lobby', a: 'join', id }, at());
    board.handle(C, { t: 'lobby', a: 'join', id }, at());
    const out = board.handle(A, { t: 'lobby', a: 'leave' }, at());
    expect(sentTo(out, A.id, 'lobby')[0]).toMatchObject({ lobby: null, reason: 'left' });
    expect(sentTo(out, C.id, 'lobby')[0].lobby!.hostId).toBe(B.id);
    expect(sentTo(out, D.id, 'lobbies')[0].list[0]).toMatchObject({ hostId: B.id, host: 'Bobbin', players: 2 });
    board.playerGone(B.id, at()); // left the Hub room for good
    expect(board.lobbyOf(C.id)!.hostId).toBe(C.id);
    const last = board.handle(C, { t: 'lobby', a: 'leave' }, at());
    expect(board.count).toBe(0);
    expect(sentTo(last, D.id, 'lobbies')[0].list).toEqual([]);
  });

  it('a dropped connection keeps the seat (shown as off) and passes host only once gone for good', () => {
    const { board, at } = setup();
    const { id } = create(board, A, at());
    board.handle(B, { t: 'lobby', a: 'join', id }, at());
    const out = board.playerDropped(A.id, at());
    expect(sentTo(out, B.id, 'lobby')[0].lobby!.members.find((m) => m.id === A.id)!.off).toBe(true);
    expect(board.lobbyOf(B.id)!.hostId).toBe(A.id);
    const back = board.playerArrived(A, at());
    expect(sentTo(back, A.id, 'lobby')[0].lobby!.members.find((m) => m.id === A.id)!.off).toBe(false);
    expect(sentTo(back, A.id, 'lobbies')).toHaveLength(1);
  });
});

describe('lobby: starting', () => {
  it('refuses to start a trial that needs more toys when bot fill is off', () => {
    const { board, at } = setup();
    create(board, A, at(), { mode: 'single', game: 'jack-in-the-box', botFill: false });
    expect(sentTo(board.handle(A, { t: 'lobby', a: 'start' }, at()), A.id, 'lobbyErr')[0].code).toBe('need_players');
    board.handle(A, { t: 'lobby', a: 'settings', settings: { botFill: true, cap: 4 } }, at());
    const out = board.handle(A, { t: 'lobby', a: 'start' }, at());
    const match = sentTo(out, A.id, 'lobby')[0].lobby!.match!;
    expect(match).toMatchObject({ phase: 'reveal', game: 'jack-in-the-box' });
    expect(match.seats).toHaveLength(4);
    expect(match.seats.filter((s) => s.bot).length).toBe(3);
    expect(sentTo(out, B.id, 'lobbies')[0].list[0].playing).toBe(true);
  });

  it('someone joining mid-match spectates, and is seated at the next trial of a tournament', () => {
    const { board } = setup();
    let now = 5000;
    const { id } = create(board, A, now, { mode: 'tournament', format: 'blitz', botFill: true, cap: 3 });
    board.handle(A, { t: 'lobby', a: 'timescale', k: 40 }, (now += 10));
    board.handle(A, { t: 'lobby', a: 'start' }, (now += 10));
    const flow = board.flowOf(A.id)!;
    expect(flow.tournament!.games).toHaveLength(3);
    // Run until the first trial is being played, then B joins.
    while (board.flowOf(A.id)?.phase !== 'playing') board.tick((now += 33));
    const join = board.handle(B, { t: 'lobby', a: 'join', id }, (now += 10));
    const me = sentTo(join, B.id, 'lobby')[0].lobby!;
    expect(me.members.find((m) => m.id === B.id)!.spectating).toBe(true);
    expect(me.match!.seats.some((s) => s.id === B.id)).toBe(false);
    // B watches: B gets match state (A's view) while not seated.
    let watched = false;
    while (board.flowOf(A.id)?.phase === 'playing') {
      const out = board.tick((now += 33));
      if (sentTo(out, B.id, 'ms').length) watched = true;
    }
    expect(watched).toBe(true);
    // Next trial: B is in the field, and in the standings with nothing for the trial they missed.
    while (board.flowOf(A.id)?.phase !== 'countdown') board.tick((now += 33));
    const state = board.lobbyOf(B.id, now)!;
    expect(state.match!.seats.some((s) => s.id === B.id)).toBe(true);
    expect(state.members.find((m) => m.id === B.id)!.spectating).toBe(false);
    const standing = state.match!.tournament!.standings.find((s) => s.contestantId === B.id)!;
    expect(standing.rounds).toEqual([0]);
    // The field stays at the cap: B took a bot's seat.
    expect(state.match!.seats).toHaveLength(3);
  });

  it('ignores the time-scale action unless the server allows it (test servers only)', () => {
    const { board, at } = setup(false);
    create(board, A, at());
    board.handle(A, { t: 'lobby', a: 'start' }, at());
    board.handle(A, { t: 'lobby', a: 'timescale', k: 40 }, at());
    expect(board.flowOf(A.id)!.timeScale).toBe(1);
  });
});

describe('lobby inside a Hub room', () => {
  it('routes lobby messages by connection, alerts the room, and leaves on disconnect expiry', () => {
    const hub = new HubDirectory({ random: seededRng(11) });
    const hello = (name: string) => ({ t: 'hello' as const, v: PROTOCOL_VERSION, name, look: { paint: 0, hat: 'none', keySkin: 'classic', back: 'none', face: 'none', neck: 'none' }, join: { kind: 'public' as const } });
    let now = 0;
    const w1 = hub.handle('c1', hello('Ticker'), (now += 10));
    const w2 = hub.handle('c2', hello('Bobbin'), (now += 10));
    // Joining the room sends the lobby list.
    expect(w1.some((o) => o.kind === 'send' && o.msg.t === 'lobbies')).toBe(true);
    expect(w2.some((o) => o.kind === 'send' && o.msg.t === 'lobbies')).toBe(true);
    const out = hub.handle('c1', { t: 'lobby', a: 'create', settings: settings() }, (now += 10));
    const alert = out.find((o) => o.kind === 'send' && o.msg.t === 'lobbyAlert');
    expect(alert && alert.kind === 'send' && alert.to).toEqual(['c2']);
    const id = hub.roomFor('c1')!.lobbyBoard.summaries()[0].id;
    hub.handle('c2', { t: 'lobby', a: 'join', id }, (now += 10));
    expect(hub.stats().lobbies).toBe(1);
    // c1 drops; after the resume window their slot and lobby seat go, and c2 becomes host.
    hub.disconnect('c1', (now += 10));
    hub.tick((now += 31_000));
    const room = hub.roomFor('c2')!;
    expect(room.lobbyBoard.summaries()[0]).toMatchObject({ players: 1, host: 'Bobbin' });
  });
});
