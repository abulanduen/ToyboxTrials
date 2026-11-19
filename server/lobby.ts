/**
 * Tournament lobbies inside one online Hub room. A player in the room hosts a lobby from the
 * Tournament Pavilion or a trial gate; everyone in the room is alerted and sees it in the Lobbies
 * list; anyone can join at any time unless the host has locked it or it is at its cap. The host
 * can kick, cap and lock the lobby, set bot fill and difficulty, switch between one trial and a
 * tournament, and start. If the host leaves, the longest-present member takes over; when the
 * last member leaves, the lobby closes. A running match (lobbyMatch.ts) is entirely server-side.
 *
 * Pure and deterministic, like HubRoom: no sockets, timers or wall clock; `now` and randomness are
 * passed in, and every method returns what to send (to player ids, or to the whole room).
 * Unit-tested in tests/unit/lobby.test.ts.
 */
import {
  LOBBY_ERROR_TEXT,
  LOBBY_ID_LENGTH,
  MAX_LOBBIES_PER_ROOM,
  ROOM_CODE_ALPHABET,
  type InputMsg,
  type LobbyErrCode,
  type LobbyEndReason,
  type LobbyMsg,
  type LobbySettings,
  type LobbyState,
  type LobbySummary,
  type Look,
  type MatchPhaseWire,
  type ServerMsg,
} from '../src/net/protocol';
import type { LeaderboardResult } from '../src/net/leaderboardProtocol';
import { RateLimiter } from './limits';
import { MatchFlow, newMatchSeed, startProblem, type FlowMember } from './lobbyMatch';

/** What the lobby needs to know about a player in the Hub room. */
export interface LobbyPlayer {
  id: string;
  name: string;
  look: Look;
  /** Signed-in account's username (linked with an `auth` message), or null. */
  account: string | null;
}

export type LobbyOut = { kind: 'send'; to: string[] | 'room'; msg: ServerMsg } | { kind: 'record'; rows: LeaderboardResult[] };

/** A player may host a new lobby at most this often (ms): keeps the room's alerts from spamming. */
export const CREATE_COOLDOWN_MS = 10_000;
/** Lobby actions per player: a burst, then this many a second. */
export const LOBBY_ACTION_BURST = 12;
export const LOBBY_ACTIONS_PER_SECOND = 4;

interface Member extends FlowMember {
  joinedAt: number;
}

interface Lobby {
  id: string;
  hostId: string;
  settings: LobbySettings;
  /** Join order. */
  members: Member[];
  kicked: Set<string>;
  flow: MatchFlow | null;
  /** Next match sequence number (every trial gets a fresh one). */
  nextSeq: number;
  timeScale: number;
  /** Test servers only: freeze the next match on reaching this phase. */
  holdAt: MatchPhaseWire | null;
}

export interface LobbyBoardOptions {
  random: () => number;
  /** Test servers only: allow the `timescale` action (MATCH_DEBUG=1). */
  debug?: boolean;
}

export class LobbyBoard {
  private readonly lobbies = new Map<string, Lobby>();
  private readonly byPlayer = new Map<string, Lobby>();
  private readonly limits = new Map<string, { bucket: RateLimiter; lastCreate: number }>();
  /** Players in the room right now (for names and connection state). */
  private readonly connected = new Set<string>();

  constructor(private readonly opts: LobbyBoardOptions) {}

  // ------------------------------------------------------------ inspection
  get count() {
    return this.lobbies.size;
  }
  get running() {
    let n = 0;
    for (const l of this.lobbies.values()) if (l.flow) n++;
    return n;
  }
  lobbyOf(playerId: string, now = 0): LobbyState | null {
    const l = this.byPlayer.get(playerId);
    return l ? this.state(l, now) : null;
  }
  /** The live match of a player's lobby (tests). */
  flowOf(playerId: string): MatchFlow | null {
    return this.byPlayer.get(playerId)?.flow ?? null;
  }
  summaries(): LobbySummary[] {
    return [...this.lobbies.values()].map((l) => this.summary(l));
  }

  // ------------------------------------------------------------ room events
  /** A player arrived in the room (or came back): they get the list, and their lobby if they have one. */
  playerArrived(p: LobbyPlayer, now: number): LobbyOut[] {
    this.connected.add(p.id);
    const out: LobbyOut[] = [this.send([p.id], { t: 'lobbies', list: this.summaries() })];
    const l = this.byPlayer.get(p.id);
    if (l) {
      const m = l.members.find((x) => x.id === p.id)!;
      m.connected = true;
      l.flow?.resync(p.id);
      out.push(...this.broadcastState(l, now));
    }
    return out;
  }

  /** Connection lost; the room holds the slot. The match goes on without their inputs. */
  playerDropped(id: string, now: number): LobbyOut[] {
    this.connected.delete(id);
    const l = this.byPlayer.get(id);
    if (!l) return [];
    const m = l.members.find((x) => x.id === id);
    if (m) m.connected = false;
    return this.broadcastState(l, now);
  }

  /** The player left the room for good (or their held slot expired): they leave their lobby. */
  playerGone(id: string, now: number): LobbyOut[] {
    this.connected.delete(id);
    this.limits.delete(id);
    const l = this.byPlayer.get(id);
    return l ? this.removeMember(l, id, now, null) : [];
  }

  /** Name, look or account changed. */
  updatePlayer(p: LobbyPlayer, now: number): LobbyOut[] {
    const l = this.byPlayer.get(p.id);
    const m = l?.members.find((x) => x.id === p.id);
    if (!l || !m) return [];
    m.name = p.name;
    m.look = p.look;
    m.account = p.account;
    return this.broadcastState(l, now);
  }

  /** Every lobby closes (the room is closing). */
  clear() {
    this.lobbies.clear();
    this.byPlayer.clear();
  }

  // ------------------------------------------------------------ messages
  handle(p: LobbyPlayer, msg: LobbyMsg | InputMsg, now: number): LobbyOut[] {
    this.connected.add(p.id);
    if (msg.t === 'in') {
      const l = this.byPlayer.get(p.id);
      l?.flow?.input(p.id, msg.m, msg.i);
      return [];
    }
    if (!this.allow(p.id, now)) return [this.err(p.id, 'slow_down')];
    switch (msg.a) {
      case 'create':
        return this.create(p, msg.settings, now);
      case 'join':
        return this.join(p, msg.id, now);
      case 'leave': {
        const l = this.byPlayer.get(p.id);
        return l ? this.removeMember(l, p.id, now, 'left') : [];
      }
      case 'kick':
        return this.hostOnly(p.id, (l) => {
          if (msg.id === p.id || !l.members.some((m) => m.id === msg.id)) return [];
          l.kicked.add(msg.id);
          return this.removeMember(l, msg.id, now, 'kicked');
        });
      case 'settings':
        return this.hostOnly(p.id, (l) => {
          l.settings = { ...l.settings, ...msg.settings };
          return [...this.broadcastState(l, now), this.listToRoom()];
        });
      case 'ready': {
        const l = this.byPlayer.get(p.id);
        const m = l?.members.find((x) => x.id === p.id);
        if (!l || !m) return [this.err(p.id, 'not_in_lobby')];
        m.ready = msg.ready;
        return this.broadcastState(l, now);
      }
      case 'start':
        return this.hostOnly(p.id, (l) => this.start(l, now));
      case 'watch': {
        const l = this.byPlayer.get(p.id);
        const m = l?.members.find((x) => x.id === p.id);
        if (!l || !m) return [];
        m.watch = msg.id;
        l.flow?.resync(p.id);
        return [];
      }
      case 'timescale': {
        const l = this.byPlayer.get(p.id);
        if (!this.opts.debug || !l) return [];
        l.timeScale = msg.k;
        l.holdAt = msg.hold ?? null;
        if (l.flow) {
          l.flow.timeScale = msg.k;
          l.flow.holdAt = l.holdAt;
          l.holdAt = null;
        }
        return this.broadcastState(l, now);
      }
    }
  }

  /** Advance every running match; one call per server match tick. */
  tick(now: number): LobbyOut[] {
    const out: LobbyOut[] = [];
    for (const l of [...this.lobbies.values()]) {
      if (!l.flow) continue;
      const r = l.flow.tick(now, l.members);
      if (r.records.length) out.push({ kind: 'record', rows: r.records });
      if (r.done) {
        l.nextSeq = l.flow.seq + 1;
        l.flow = null;
        for (const m of l.members) m.ready = false;
        out.push(...this.broadcastState(l, now), this.listToRoom());
        continue;
      }
      // The new phase first, then its snapshots (a new trial's keyframe follows its lobby state).
      if (r.changed) {
        for (const m of l.members) m.ready = false;
        out.push(...this.broadcastState(l, now));
      }
      for (const s of r.snapshots) out.push(this.send([s.to], s.msg));
    }
    return out;
  }

  // ------------------------------------------------------------ actions
  private create(p: LobbyPlayer, settings: LobbySettings, now: number): LobbyOut[] {
    const lim = this.limits.get(p.id)!;
    if (now - lim.lastCreate < CREATE_COOLDOWN_MS) return [this.err(p.id, 'slow_down')];
    if (this.lobbies.size >= MAX_LOBBIES_PER_ROOM) return [this.err(p.id, 'too_many_lobbies')];
    const out: LobbyOut[] = [];
    const old = this.byPlayer.get(p.id);
    if (old) out.push(...this.removeMember(old, p.id, now, 'left'));
    const id = this.newId();
    if (!id) return [...out, this.err(p.id, 'too_many_lobbies')];
    lim.lastCreate = now;
    const l: Lobby = { id, hostId: p.id, settings: { ...settings }, members: [], kicked: new Set(), flow: null, nextSeq: 1, timeScale: 1, holdAt: null };
    this.lobbies.set(id, l);
    this.addMember(l, p, now);
    out.push(...this.broadcastState(l, now), this.listToRoom());
    // The alert: everyone else in this Hub room hears that someone is hosting.
    const others = [...this.connected].filter((x) => x !== p.id);
    if (others.length) out.push(this.send(others, { t: 'lobbyAlert', lobby: this.summary(l) }));
    return out;
  }

  private join(p: LobbyPlayer, id: string, now: number): LobbyOut[] {
    const l = this.lobbies.get(id);
    if (!l) return [this.err(p.id, 'no_such_lobby')];
    if (l.members.some((m) => m.id === p.id)) return this.broadcastState(l, now);
    if (l.kicked.has(p.id)) return [this.err(p.id, 'kicked')];
    if (l.settings.locked) return [this.err(p.id, 'lobby_locked')];
    if (l.members.length >= l.settings.cap) return [this.err(p.id, 'lobby_full')];
    const out: LobbyOut[] = [];
    const old = this.byPlayer.get(p.id);
    if (old) out.push(...this.removeMember(old, p.id, now, 'left'));
    this.addMember(l, p, now);
    // Joining a running match: watch now, play from the next trial.
    l.flow?.addLate(p.id);
    out.push(...this.broadcastState(l, now), this.listToRoom());
    return out;
  }

  private start(l: Lobby, now: number): LobbyOut[] {
    if (l.flow) return this.broadcastState(l, now);
    const problem = startProblem(l.settings, l.members.length);
    if (problem) return [this.err(l.hostId, problem)];
    l.flow = new MatchFlow(l.settings, l.members, newMatchSeed(this.opts.random), now, l.nextSeq, l.timeScale);
    l.flow.holdAt = l.holdAt;
    l.holdAt = null;
    for (const m of l.members) m.ready = false;
    return [...this.broadcastState(l, now), this.listToRoom()];
  }

  private addMember(l: Lobby, p: LobbyPlayer, now: number) {
    l.members.push({ id: p.id, name: p.name, look: p.look, account: p.account, connected: true, ready: false, watch: null, joinedAt: now });
    this.byPlayer.set(p.id, l);
  }

  private removeMember(l: Lobby, id: string, now: number, reason: LobbyEndReason | null): LobbyOut[] {
    const i = l.members.findIndex((m) => m.id === id);
    if (i < 0) return [];
    l.members.splice(i, 1);
    this.byPlayer.delete(id);
    l.flow?.forfeit(id);
    const out: LobbyOut[] = [];
    if (reason && this.connected.has(id)) out.push(this.send([id], { t: 'lobby', you: id, lobby: null, reason }));
    if (!l.members.length) {
      this.lobbies.delete(l.id);
      out.push(this.listToRoom());
      return out;
    }
    if (l.hostId === id) {
      // The longest-present member takes over (join order; connected first).
      const next = l.members.find((m) => m.connected) ?? l.members[0];
      l.hostId = next.id;
    }
    out.push(...this.broadcastState(l, now), this.listToRoom());
    return out;
  }

  private hostOnly(id: string, f: (l: Lobby) => LobbyOut[]): LobbyOut[] {
    const l = this.byPlayer.get(id);
    if (!l) return [this.err(id, 'not_in_lobby')];
    if (l.hostId !== id) return [this.err(id, 'not_host')];
    return f(l);
  }

  // ------------------------------------------------------------ helpers
  private allow(id: string, now: number): boolean {
    let lim = this.limits.get(id);
    if (!lim) this.limits.set(id, (lim = { bucket: new RateLimiter(LOBBY_ACTION_BURST, LOBBY_ACTIONS_PER_SECOND, now), lastCreate: -Infinity }));
    return lim.bucket.take(now);
  }

  private newId(): string | null {
    for (let tries = 0; tries < 200; tries++) {
      let id = '';
      for (let i = 0; i < LOBBY_ID_LENGTH; i++) id += ROOM_CODE_ALPHABET[Math.floor(this.opts.random() * ROOM_CODE_ALPHABET.length)];
      if (!this.lobbies.has(id)) return id;
    }
    return null;
  }

  private summary(l: Lobby): LobbySummary {
    const host = l.members.find((m) => m.id === l.hostId);
    return {
      id: l.id,
      hostId: l.hostId,
      host: host?.name ?? '',
      mode: l.settings.mode,
      game: l.settings.game,
      format: l.settings.format,
      players: l.members.length,
      cap: l.settings.cap,
      locked: l.settings.locked,
      playing: !!l.flow,
    };
  }

  private state(l: Lobby, now: number): LobbyState {
    return {
      id: l.id,
      hostId: l.hostId,
      settings: { ...l.settings },
      members: l.members.map((m) => ({ id: m.id, name: m.name, look: { ...m.look }, ready: m.ready, off: !m.connected, spectating: !!l.flow && !l.flow.isSeated(m.id) })),
      match: l.flow ? l.flow.info(now) : null,
    };
  }

  private broadcastState(l: Lobby, now: number): LobbyOut[] {
    const state = this.state(l, now);
    return l.members.filter((m) => m.connected).map((m) => this.send([m.id], { t: 'lobby', you: m.id, lobby: state }));
  }

  private listToRoom(): LobbyOut {
    return this.send('room', { t: 'lobbies', list: this.summaries() });
  }

  private send(to: string[] | 'room', msg: ServerMsg): LobbyOut {
    return { kind: 'send', to, msg };
  }

  private err(id: string, code: LobbyErrCode): LobbyOut {
    return this.send([id], { t: 'lobbyErr', code, message: LOBBY_ERROR_TEXT[code] });
  }
}
