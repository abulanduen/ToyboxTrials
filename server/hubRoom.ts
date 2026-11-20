/**
 * Online Hub room logic for one room (a public Hub instance or a private room): joining, caps,
 * hosts, validated movement, emotes, snapshots, disconnects and resume. `HubDirectory`
 * (hubDirectory.ts) owns the rooms and routes connections to them.
 *
 * Pure and deterministic: no sockets, timers, wall clock or platform APIs. Time (`now`, ms) and
 * randomness are passed in; every method returns the messages to deliver, which the socket layer
 * (server/index.ts) sends. Unit-tested in tests/unit/online-hub.test.ts.
 *
 * Connections are identified by an opaque `conn` string from the host. Players have a separate
 * public id (seen by everyone in the room) and a secret resume token (seen only by that player)
 * that takes the same slot back within RESUME_WINDOW_MS of a dropped connection.
 */
import { clampToBounds } from '../src/game/collision';
import { HUB_MAX_SPEED, HUB_MAX_Y, HUB_MOTION, HUB_SPAWN } from '../src/game/hubMotion';
import { EMOTE_COOLDOWN, EMOTE_DURATION, type EmoteId } from '../src/game/emotes';
import {
  REACH_SLACK,
  advanceHubPlay,
  createHubPlay,
  dropBall,
  grabBall,
  kickMarble,
  throwBall,
  type HubPlayState,
  type PlayBody,
  type PlayEvent,
} from '../src/game/hubPlaySim';
import {
  ERROR_TEXT,
  PRIVATE_ROOM_CAP,
  PRIVATE_ROOM_IDLE_MS,
  PROTOCOL_VERSION,
  PUBLIC_ROOM_CAP,
  RESUME_WINDOW_MS,
  parseRoomId,
  type Activity,
  type ClientMsg,
  type ErrorCode,
  type BallMsg,
  type HelloMsg,
  type HubPlayWire,
  type KickMsg,
  type Look,
  type MoveMsg,
  type PlayerInfo,
  type PlayerState,
  type RoomInfo,
  type ServerMsg,
} from '../src/net/protocol';
import { sanitizeLook, sanitizeNickname, uniqueName, type CleanLook } from './sanitize';
import { LobbyBoard, type LobbyOut, type LobbyPlayer } from './lobby';
import type { LeaderboardResult } from '../src/net/leaderboardProtocol';

/**
 * What the host must do: send a message to some connections, close one, or store finished lobby
 * results on the leaderboard (the socket layer does the storage; the room stays pure).
 */
export type Outgoing =
  | { kind: 'send'; to: string[]; msg: ServerMsg }
  | { kind: 'close'; conn: string; code: number; reason: string }
  | { kind: 'record'; rows: LeaderboardResult[] };

/** WebSocket close codes (4000–4999 are application codes). */
export const CLOSE = {
  versionMismatch: 4001,
  replaced: 4002,
  joinRefused: 4003,
  badRequest: 4004,
  rateLimited: 4008,
  shuttingDown: 1001,
} as const;

/** Moves may go this much faster than the fastest legitimate speed (network jitter, frame spikes). */
export const MOVE_SPEED_TOLERANCE = 1.25;
/** At most this many seconds of travel can be banked between two moves (late/bunched packets). */
export const MOVE_BUDGET_SECONDS = 1;
/** Within this distance of the spawn point a move is a respawn and is never speed-limited. */
export const RESPAWN_SNAP_RADIUS = 1;
/** Minimum gap between look (cosmetics) changes from one player (ms). */
export const LOOK_COOLDOWN_MS = 500;
/** Minimum gap between two marble kicks or pushes from one player (ms); faster ones are dropped. */
export const KICK_COOLDOWN_MS = 120;
/** Minimum gap between two basketball actions (pick up, throw) from one player (ms). */
export const BALL_COOLDOWN_MS = 150;
/** Most hub play events sent per snapshot (bounces and rattles beyond this are dropped). */
export const MAX_PLAY_EVENTS = 12;

const ALLOWED_SPEED = HUB_MAX_SPEED * MOVE_SPEED_TOLERANCE;

/** The lasting part of a player (the rest is live movement and emote state). */
interface PlayerRecord {
  id: string;
  name: string;
  look: CleanLook;
  resume: string;
  joinedAt: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  emoteSeq: number;
  activity: Activity | null;
  /** When the connection dropped (slot held for RESUME_WINDOW_MS), or null while connected. */
  disconnectedAt: number | null;
  /** Signed-in account's username, linked with an `auth` message (leaderboard names). */
  account: string | null;
}

export interface RoomOptions {
  /** Room id: `public-<n>` or a private room code. */
  id: string;
  /** Uniform [0, 1): spawn spots, resume tokens, fallback names. Use a CSPRNG in production. */
  random: () => number;
  publicCap?: number;
  privateCap?: number;
  /** Test servers only: lobbies accept the `timescale` action. */
  matchDebug?: boolean;
}

interface Player extends PlayerRecord {
  conn: string | null;
  speed: number;
  grounded: boolean;
  budget: number;
  budgetAt: number;
  emote: EmoteId | null;
  emoteUntil: number;
  lastEmoteAt: number;
  lastLookAt: number;
  lastKickAt: number;
  lastBallAt: number;
  /** Moves that had to be clamped (speed or bounds): diagnostics only. */
  clamped: number;
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function makeToken(random: () => number): string {
  let t = '';
  for (let i = 0; i < 24; i++) t += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)];
  return t;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, k: number) => Math.round(v * k) / k;

export class HubRoom {
  readonly id: string;
  readonly kind: 'public' | 'private';
  readonly code: string | null;
  readonly instance: number | null;
  readonly cap: number;
  private readonly random: () => number;
  /** Private rooms exist once hosted; public instances are always open. */
  private open: boolean;
  private host: string | null = null;
  private nextPlayer = 1;
  private emptySince: number | null = null;
  /** Join order. */
  private readonly players = new Map<string, Player>();
  private readonly byConn = new Map<string, Player>();
  private readonly byToken = new Map<string, Player>();
  /** Tournament lobbies hosted in this room (lobby.ts). */
  private readonly lobbies: LobbyBoard;
  /** The room's shared marble and basketball (src/game/hubPlaySim.ts), stepped on the room clock. */
  private play: HubPlayState = createHubPlay();
  /** Room clock (ms) at hub play sim time 0; re-anchored when the room wakes from empty. */
  private playEpoch: number | null = null;
  private playEvents: PlayEvent[] = [];
  private readonly matchDebug: boolean;

  /** Throws for an id that is neither `public-<n>` nor a valid room code. */
  constructor(opts: RoomOptions) {
    const s = parseRoomId(opts.id);
    if (!s) throw new Error('invalid room id');
    this.id = opts.id;
    this.kind = s.kind;
    this.code = s.kind === 'private' ? s.code : null;
    this.instance = s.kind === 'public' ? s.instance : null;
    this.cap = s.kind === 'public' ? (opts.publicCap ?? PUBLIC_ROOM_CAP) : (opts.privateCap ?? PRIVATE_ROOM_CAP);
    this.random = opts.random;
    this.open = s.kind === 'public';
    this.lobbies = new LobbyBoard({ random: opts.random, debug: opts.matchDebug });
    this.matchDebug = !!opts.matchDebug;
  }

  // ------------------------------------------------------------ inspection (directory, tests)
  get isOpen() {
    return this.open;
  }
  get playerCount() {
    return this.players.size;
  }
  get connectedCount() {
    return this.byConn.size;
  }
  /** Nobody connected, nobody held, nothing to keep: the directory can forget this room. */
  get isEmpty() {
    return this.players.size === 0 && (this.kind === 'public' || !this.open);
  }
  info(): RoomInfo {
    return { kind: this.kind, code: this.code, instance: this.instance, host: this.host, cap: this.cap };
  }
  /** Server-side state of a connection's player (what everyone else sees), or null. */
  playerOf(conn: string): (PlayerState & { name: string; look: CleanLook; clamped: number }) | null {
    const p = this.byConn.get(conn);
    return p ? { ...this.state(p), name: p.name, look: p.look, clamped: p.clamped } : null;
  }
  hasConn(conn: string) {
    return this.byConn.has(conn);
  }
  /** Lobbies open in this room, and how many are running a match. */
  get lobbyCount() {
    return this.lobbies.count;
  }
  get runningMatches() {
    return this.lobbies.running;
  }
  /** The lobby board (tests). */
  get lobbyBoard() {
    return this.lobbies;
  }
  /** The shared marble and basketball (tests). */
  get hubPlay(): Readonly<HubPlayState> {
    return this.play;
  }
  /** Is this resume token one of this room's players? */
  hasToken(token: string) {
    return this.byToken.has(token);
  }

  /** When `tick()` is next needed even with nobody connected (slot expiry, room close), or null. */
  nextWakeAt(): number | null {
    let t: number | null = null;
    for (const p of this.players.values()) if (p.disconnectedAt !== null) t = Math.min(t ?? Infinity, p.disconnectedAt + RESUME_WINDOW_MS);
    if (this.kind === 'private' && this.open && this.emptySince !== null) t = Math.min(t ?? Infinity, this.emptySince + PRIVATE_ROOM_IDLE_MS);
    return t;
  }

  // ------------------------------------------------------------ connection events
  /** The socket closed without a `leave`: hold the slot for RESUME_WINDOW_MS. */
  disconnect(conn: string, now: number): Outgoing[] {
    const p = this.byConn.get(conn);
    if (!p) return [];
    this.byConn.delete(conn);
    p.conn = null;
    p.disconnectedAt = now;
    p.speed = 0;
    p.emote = null;
    this.letGoOfBall(p, now);
    this.updateEmpty(now);
    return this.fromLobby(this.lobbies.playerDropped(p.id, now));
  }

  /** Link a signed-in account (the socket layer has checked the token). */
  setAccount(conn: string, username: string | null, now: number): Outgoing[] {
    const p = this.byConn.get(conn);
    if (!p) return [];
    p.account = username;
    return this.fromLobby(this.lobbies.updatePlayer(this.lobbyPlayer(p), now));
  }

  /** Step this room's lobby matches (MATCH_TICK_HZ, from the socket layer's match timer). */
  tickLobbies(now: number): Outgoing[] {
    return this.lobbies.running ? this.fromLobby(this.lobbies.tick(now)) : [];
  }

  handle(conn: string, msg: ClientMsg, now: number): Outgoing[] {
    if (msg.t === 'hello') return this.hello(conn, msg, now);
    const p = this.byConn.get(conn);
    if (!p) return msg.t === 'leave' ? [] : [this.error(conn, 'not_joined', false)];
    switch (msg.t) {
      case 'move':
        this.move(p, msg, now);
        return [];
      case 'emote':
        return this.emote(p, msg.id, now);
      case 'activity':
        p.activity = msg.a;
        if (msg.a) {
          p.speed = 0;
          this.letGoOfBall(p, now);
        }
        return [];
      case 'kick':
        return this.kick(p, msg, now);
      case 'ball':
        return this.ball(p, msg, now);
      case 'hpdebug':
        if (this.matchDebug) {
          this.advancePlay(now);
          Object.assign(this.play.marble, { x: msg.x, z: msg.z, vx: 0, vz: 0, inNet: null });
          clampToBounds(this.play.marble, 1.3);
        }
        return [];
      case 'look':
        return this.setLook(p, msg.look, now);
      case 'leave':
        return this.removePlayer(p, now);
      case 'lobby':
      case 'in':
        return this.fromLobby(this.lobbies.handle(this.lobbyPlayer(p), msg, now));
      case 'auth':
        return []; // checked asynchronously by the socket layer, then setAccount()
    }
  }

  /**
   * Advance time: expire held slots, close a private room that has been empty for
   * PRIVATE_ROOM_IDLE_MS, end emotes, and produce one snapshot for the connected players.
   * Called SNAPSHOT_HZ times a second while anyone is connected, and at `nextWakeAt()`.
   */
  tick(now: number): Outgoing[] {
    const out: Outgoing[] = [];
    for (const p of [...this.players.values()]) {
      if (p.disconnectedAt !== null && now - p.disconnectedAt >= RESUME_WINDOW_MS) out.push(...this.removePlayer(p, now));
    }
    if (this.kind === 'private' && this.open && this.emptySince !== null && now - this.emptySince >= PRIVATE_ROOM_IDLE_MS) {
      this.closeRoom();
      return out;
    }
    if (!this.byConn.size) return out;
    this.advancePlay(now);
    const to: string[] = [];
    const states: PlayerState[] = [];
    for (const p of this.players.values()) {
      if (p.emote && now >= p.emoteUntil) p.emote = null;
      if (p.conn) to.push(p.conn);
      states.push(this.state(p));
    }
    if (this.playEvents.length) {
      out.push({ kind: 'send', to, msg: { t: 'play', e: this.playEvents.slice(0, MAX_PLAY_EVENTS) } });
      this.playEvents = [];
    }
    out.push({ kind: 'send', to, msg: { t: 'snap', now, p: states, hp: this.hubPlayWire() } });
    return out;
  }

  /** Server shutting down: tell everyone, close every connection. */
  shutdown(): Outgoing[] {
    const out: Outgoing[] = [];
    for (const conn of this.byConn.keys()) out.push(this.error(conn, 'shutting_down', true), { kind: 'close', conn, code: CLOSE.shuttingDown, reason: 'shutting down' });
    return out;
  }

  // ------------------------------------------------------------ joining
  private hello(conn: string, msg: HelloMsg, now: number): Outgoing[] {
    if (this.byConn.has(conn)) return [this.error(conn, 'bad_request', false)];
    if (msg.v !== PROTOCOL_VERSION) return [this.error(conn, 'version_mismatch', true), { kind: 'close', conn, code: CLOSE.versionMismatch, reason: 'version mismatch' }];

    // Reconnect: same slot, same id. A still-open old socket (second tab, half-dead link) loses it.
    const held = msg.resume ? this.byToken.get(msg.resume) : undefined;
    if (held) {
      const out: Outgoing[] = [];
      if (held.conn) {
        this.byConn.delete(held.conn);
        out.push(this.error(held.conn, 'replaced', true), { kind: 'close', conn: held.conn, code: CLOSE.replaced, reason: 'replaced' });
        held.conn = null;
      }
      out.push(...this.reattach(held, conn, now));
      return out;
    }

    const want = msg.join.kind;
    if (this.kind === 'public' ? want !== 'public' : want === 'public') return this.refuse(conn, 'bad_request');
    if (want === 'host' && this.open) return this.refuse(conn, 'bad_request');
    if (want === 'code' && !this.open) return this.refuse(conn, 'no_such_room');
    if (this.players.size >= this.cap) return this.refuse(conn, 'room_full');

    if (want === 'host') {
      this.open = true;
      this.emptySince = null;
    }
    const name = uniqueName(
      sanitizeNickname(msg.name, this.random),
      [...this.players.values()].map((p) => p.name),
    );
    const resume = makeToken(this.random);
    const spawn = this.spawnSpot();
    const p: Player = {
      id: `p${(this.nextPlayer++).toString(36)}`,
      conn,
      name,
      look: sanitizeLook(msg.look),
      resume,
      joinedAt: now,
      x: spawn.x,
      y: 0,
      z: spawn.z,
      yaw: HUB_SPAWN.yaw,
      speed: 0,
      grounded: true,
      budget: 0,
      budgetAt: now,
      emote: null,
      emoteSeq: 0,
      emoteUntil: 0,
      lastEmoteAt: -Infinity,
      lastLookAt: -Infinity,
      lastKickAt: -Infinity,
      lastBallAt: -Infinity,
      activity: null,
      disconnectedAt: null,
      account: null,
      clamped: 0,
    };
    const others = this.conns();
    this.players.set(p.id, p);
    this.byConn.set(conn, p);
    this.byToken.set(resume, p);
    if (this.kind === 'private' && !this.host) this.host = p.id;
    this.emptySince = null;

    const out: Outgoing[] = [this.welcome(p, false, now)];
    if (others.length) out.push({ kind: 'send', to: others, msg: { t: 'joined', player: this.playerInfo(p) } });
    out.push(...this.fromLobby(this.lobbies.playerArrived(this.lobbyPlayer(p), now)));
    return out;
  }

  private reattach(p: Player, conn: string, now: number): Outgoing[] {
    p.conn = conn;
    p.disconnectedAt = null;
    p.budget = 0;
    p.budgetAt = now;
    this.byConn.set(conn, p);
    this.emptySince = null;
    return [this.welcome(p, true, now), ...this.fromLobby(this.lobbies.playerArrived(this.lobbyPlayer(p), now))];
  }

  private refuse(conn: string, code: ErrorCode): Outgoing[] {
    return [this.error(conn, code, true), { kind: 'close', conn, code: CLOSE.joinRefused, reason: code }];
  }

  /** A spot on the spawn tile, spread out a little so new arrivals don't stack. */
  private spawnSpot() {
    const a = this.random() * Math.PI * 2;
    const r = 1.5 + this.random() * 2.5;
    const pos = { x: HUB_SPAWN.x + Math.cos(a) * r, z: HUB_SPAWN.z + Math.sin(a) * r * 0.6 };
    clampToBounds(pos, HUB_MOTION.radius);
    return pos;
  }

  // ------------------------------------------------------------ in-room messages
  /**
   * Validated movement. The client reports where it is; the server keeps it inside the hub
   * bounds and limits how far it can have travelled since the last accepted move (a distance
   * budget refilled at the fastest legitimate speed plus a tolerance). A too-long move is clamped
   * along its direction, so speed hacks and teleports only ever crawl. Height is clamped too.
   * Non-finite numbers never get here (the protocol validator rejects them).
   */
  private move(p: Player, m: MoveMsg, now: number) {
    const dt = Math.max(0, now - p.budgetAt) / 1000;
    p.budgetAt = now;
    p.budget = Math.min(ALLOWED_SPEED * MOVE_BUDGET_SECONDS, p.budget + dt * ALLOWED_SPEED);

    const target = { x: m.x, z: m.z };
    clampToBounds(target, HUB_MOTION.radius);
    let clamped = target.x !== m.x || target.z !== m.z;
    const y = clamp(m.y, 0, HUB_MAX_Y);
    clamped ||= y !== m.y;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    const respawn = Math.hypot(target.x - HUB_SPAWN.x, target.z - HUB_SPAWN.z) <= RESPAWN_SNAP_RADIUS && y <= 0.5;
    if (respawn || d <= p.budget) {
      p.x = target.x;
      p.z = target.z;
      if (!respawn) p.budget -= d;
    } else {
      const k = p.budget / d;
      const partial = { x: p.x + dx * k, z: p.z + dz * k };
      // The hub is two tables joined by a bridge (not one convex area): a straight crawl towards a
      // far target can cross the gap between the tables, so the partial step is kept on walkable
      // ground too.
      clampToBounds(partial, HUB_MOTION.radius);
      p.x = partial.x;
      p.z = partial.z;
      p.budget = 0;
      clamped = true;
    }
    if (clamped) p.clamped++;
    p.y = y;
    p.yaw = wrapAngle(m.yaw);
    p.speed = clamp(m.speed, 0, HUB_MAX_SPEED);
    p.grounded = m.grounded;
  }

  private emote(p: Player, id: EmoteId, now: number): Outgoing[] {
    if (now - p.lastEmoteAt < EMOTE_COOLDOWN * 1000) return []; // rate limited: dropped
    p.lastEmoteAt = now;
    p.emote = id;
    p.emoteSeq++;
    p.emoteUntil = now + EMOTE_DURATION * 1000;
    const others = this.conns(p);
    return others.length ? [{ kind: 'send', to: others, msg: { t: 'emote', id: p.id, emote: id } }] : [];
  }

  private setLook(p: Player, look: Look, now: number): Outgoing[] {
    if (now - p.lastLookAt < LOOK_COOLDOWN_MS) return [];
    p.lastLookAt = now;
    p.look = sanitizeLook(look);
    return [{ kind: 'send', to: this.conns(), msg: { t: 'look', id: p.id, look: { ...p.look } } }, ...this.fromLobby(this.lobbies.updatePlayer(this.lobbyPlayer(p), now))];
  }

  private removePlayer(p: Player, now: number): Outgoing[] {
    if (!this.players.has(p.id)) return [];
    this.letGoOfBall(p, now);
    this.players.delete(p.id);
    if (p.conn) this.byConn.delete(p.conn);
    p.conn = null;
    this.byToken.delete(p.resume);
    const out: Outgoing[] = this.fromLobby(this.lobbies.playerGone(p.id, now));
    const others = this.conns();
    if (others.length) out.push({ kind: 'send', to: others, msg: { t: 'left', id: p.id } });
    if (this.host === p.id) {
      // The host left for good: the longest-standing connected player (else anyone) takes over.
      const next = [...this.players.values()].find((q) => q.conn) ?? this.players.values().next().value;
      this.host = next ? next.id : null;
      if (others.length) out.push({ kind: 'send', to: others, msg: { t: 'room', room: this.info() } });
    }
    this.updateEmpty(now);
    return out;
  }

  private closeRoom() {
    this.lobbies.clear();
    this.players.clear();
    this.byConn.clear();
    this.byToken.clear();
    this.open = false;
    this.host = null;
    this.emptySince = null;
    this.play = createHubPlay();
    this.playEpoch = null;
    this.playEvents = [];
  }

  private updateEmpty(now: number) {
    if (this.byConn.size) this.emptySince = null;
    else this.emptySince ??= now;
  }

  // ------------------------------------------------------------ hub play: the shared marble and basketball
  /**
   * Step the shared marble and ball (fixed STEP sub-steps) up to `now` on the room clock. The toys
   * are the connected players walking the hub, where the server has them (their validated moves).
   * While nobody is connected the sim pauses; it carries on from where it was when someone returns.
   */
  private advancePlay(now: number) {
    const t = this.playEpoch === null ? null : (now - this.playEpoch) / 1000;
    if (t === null || t < this.play.t - 0.5 || t > this.play.t + 1) {
      // first use, or the room slept: re-anchor the sim clock here
      this.playEpoch = now - this.play.t * 1000;
      return;
    }
    advanceHubPlay(this.play, t, this.playBodies(), this.playEvents, 90);
    if (this.playEvents.length > 4 * MAX_PLAY_EVENTS) this.playEvents.splice(0, this.playEvents.length - 4 * MAX_PLAY_EVENTS);
  }

  private playBodies(): PlayBody[] {
    const out: PlayBody[] = [];
    for (const p of this.players.values()) if (p.conn && !p.activity) out.push(this.body(p));
    return out;
  }

  private body(p: Player): PlayBody {
    return { id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw };
  }

  /**
   * A kick (or a push, at a lower power). Checked: the player is in the hub (not in a trial), within
   * reach of the marble where the server has them (plus REACH_SLACK for the time their last move
   * took to arrive), not kicking it backwards through themselves, and not faster than
   * KICK_COOLDOWN_MS (extra kicks are dropped).
   */
  private kick(p: Player, m: KickMsg, now: number): Outgoing[] {
    if (p.activity || now - p.lastKickAt < KICK_COOLDOWN_MS) return [];
    p.lastKickAt = now;
    this.advancePlay(now);
    kickMarble(this.play, this.body(p), m.dx, m.dz, m.p, REACH_SLACK, this.playEvents);
    return [];
  }

  /** Pick up the basketball (in reach, nobody holding it) or throw it (only its holder). */
  private ball(p: Player, m: BallMsg, now: number): Outgoing[] {
    if (p.activity || now - p.lastBallAt < BALL_COOLDOWN_MS) return [];
    p.lastBallAt = now;
    this.advancePlay(now);
    if (m.a === 'grab') grabBall(this.play, this.body(p), REACH_SLACK, this.playEvents);
    else throwBall(this.play, this.body(p), m.yaw, m.p, this.playEvents);
    return [];
  }

  /** A holder who leaves, drops or goes into a trial lets go: the ball falls from their hands. */
  private letGoOfBall(p: Player, now: number) {
    if (this.play.ball.holder !== p.id) return;
    this.advancePlay(now);
    dropBall(this.play, p.id, this.body(p), this.playEvents);
  }

  private hubPlayWire(): HubPlayWire {
    const { marble: m, ball: b } = this.play;
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      m: [r(m.x), r(m.z), r(m.vx), r(m.vz)],
      n: m.inNet ? 1 : 0,
      b: [r(b.x), r(b.y), r(b.z), r(b.vx), r(b.vy), r(b.vz)],
      h: b.holder,
      s: [this.play.score[0], this.play.score[1]],
      k: this.play.hoops,
    };
  }

  // ------------------------------------------------------------ message builders
  private welcome(p: Player, resumed: boolean, now: number): Outgoing {
    return {
      kind: 'send',
      to: [p.conn!],
      msg: {
        t: 'welcome',
        v: PROTOCOL_VERSION,
        you: p.id,
        resume: p.resume,
        resumed,
        room: this.info(),
        players: [...this.players.values()].map((q) => this.playerInfo(q)),
        spawn: { x: p.x, y: p.y, z: p.z, yaw: p.yaw },
        now,
      },
    };
  }

  private error(conn: string, code: ErrorCode, fatal: boolean): Outgoing {
    return { kind: 'send', to: [conn], msg: { t: 'error', code, message: ERROR_TEXT[code], fatal } };
  }

  private playerInfo(p: Player): PlayerInfo {
    return { id: p.id, name: p.name, look: { ...p.look } };
  }

  private state(p: Player): PlayerState {
    return {
      id: p.id,
      x: round(p.x, 100),
      y: round(p.y, 100),
      z: round(p.z, 100),
      r: round(p.yaw, 1000),
      s: p.activity || !p.conn ? 0 : round(p.speed, 10),
      g: p.grounded ? 1 : 0,
      e: p.emote,
      es: p.emoteSeq,
      a: p.activity,
      off: p.conn ? 0 : 1,
    };
  }

  private lobbyPlayer(p: Player): LobbyPlayer {
    return { id: p.id, name: p.name, look: p.look, account: p.account };
  }

  /** Lobby output → room output: player ids become connections ('room' = everyone connected). */
  private fromLobby(list: LobbyOut[]): Outgoing[] {
    const out: Outgoing[] = [];
    for (const o of list) {
      if (o.kind === 'record') {
        out.push(o);
        continue;
      }
      const to: string[] = [];
      if (o.to === 'room') to.push(...this.conns());
      else for (const id of o.to) {
        const c = this.players.get(id)?.conn;
        if (c) to.push(c);
      }
      if (to.length) out.push({ kind: 'send', to, msg: o.msg });
    }
    return out;
  }

  private conns(except?: Player): string[] {
    const out: string[] = [];
    for (const p of this.players.values()) if (p.conn && p !== except) out.push(p.conn);
    return out;
  }
}
