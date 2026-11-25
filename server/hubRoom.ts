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
import { LEVEL_MAX_RISE, LEVEL_Y, levelOfY, type HubLevel } from '../src/game/hubBounds';
import { HUB_MAX_SPEED, HUB_MOTION, HUB_SPAWN } from '../src/game/hubMotion';
import { EMOTE_COOLDOWN, EMOTE_DURATION, type EmoteId } from '../src/game/emotes';
import { DOG_PERCH, DOG_VISIT, dogPet, newDogClock, settleDog, type DogClock } from '../src/game/dogRoute';
import {
  REACH_SLACK,
  DRIBBLE_SPEED,
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
  type DogWire,
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
  type SignalMsg,
} from '../src/net/protocol';
import { sanitizeLook, sanitizeNickname, uniqueName, type CleanLook } from './sanitize';
import { LobbyBoard, type LobbyOut, type LobbyPlayer } from './lobby';
import { HubChat, type ChatPlayer } from './hubChat';
import { VoiceRelay, type VoicePeerView } from './voiceRelay';
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
/**
 * A snatch (catching the ball in mid-air) also counts if the ball was in reach this long ago (ms):
 * a player presses on the ball they see, drawn INTERP_DELAY_MS behind the server plus the time
 * their press took to arrive.
 */
export const SNATCH_REWIND_MS = 400;

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
  /** The level the toy is on: the tables, or the arcade on the floor under the spawn table. */
  level: HubLevel;
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
  /** Where the loose ball was lately (room clock ms), for SNATCH_REWIND_MS. Emptied while it is held. */
  private ballTrail: { t: number; x: number; y: number; z: number }[] = [];
  private readonly matchDebug: boolean;
  /** Text chat and Who Am I? cards (hubChat.ts). */
  private readonly chat: HubChat;
  /** Proximity voice chat: mic states and the WebRTC handshake relay (voiceRelay.ts). */
  private readonly voice = new VoiceRelay();
  /**
   * The family dog's stroll (src/game/dogRoute.ts), on the room clock in seconds: everyone in the
   * room sees the same dog, and a pet from anyone keeps it at the table. Stepped only by pets.
   */
  private readonly dog: DogClock = newDogClock();

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
    this.chat = new HubChat(opts.random, () => [...this.players.values()].map((p) => this.chatPlayer(p)));
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
  /** The room's chat and Who Am I? cards (tests). */
  get hubChat(): HubChat {
    return this.chat;
  }
  /** The shared marble and basketball (tests). */
  get hubPlay(): Readonly<HubPlayState> {
    return this.play;
  }
  /** The room's dog (tests). */
  get dogClock(): Readonly<DogClock> {
    return this.dog;
  }
  /** Voice chat state (tests). */
  get voiceRelay(): VoiceRelay {
    return this.voice;
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
    return [...this.micForcedOff(p), ...this.fromLobby(this.lobbies.playerDropped(p.id, now)), ...this.fromLobby(this.chat.drop(this.chatPlayer(p)))];
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
          // voice is Hub-only; a Who Am I? card falls off too
          return [...this.micForcedOff(p), ...this.fromLobby(this.chat.drop(this.chatPlayer(p)))];
        }
        return [];
      case 'chat':
        return this.fromLobby(this.chat.say(this.chatPlayer(p), msg.text, now));
      case 'card':
        return this.fromLobby(msg.a === 'deal' ? this.chat.deal(this.chatPlayer(p), now) : this.chat.peel(this.chatPlayer(p)));
      case 'mic':
        return this.setMic(p, msg.on, now);
      case 'dog':
        if (msg.at === undefined) return this.petDog(p, now);
        if (!this.matchDebug) return [];
        // test servers: jump the room's dog to a point in its loop (a fresh visit)
        Object.assign(this.dog, newDogClock(msg.at - now / 1000));
        return [{ kind: 'send', to: this.conns(), msg: { t: 'dog', c: this.dogWire(now) } }];
      case 'sig':
        return this.relaySignal(p, msg, now);
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
      y: LEVEL_Y.table,
      z: spawn.z,
      level: 'table',
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

    const out: Outgoing[] = [this.welcome(p, false, now), ...this.cardsFor(p), ...this.micList(p)];
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
    return [this.welcome(p, true, now), ...this.cardsFor(p), ...this.micList(p), ...this.fromLobby(this.lobbies.playerArrived(this.lobbyPlayer(p), now))];
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

    // A toy changes level only on a ride or a lift (to come: docs/ARCADE_PLAN.md phase 2), or after
    // being sent back to the spawn point. Test servers (MATCH_DEBUG) also let a move put it on the
    // other level, where the browser tests' teleport hook put it.
    const said = levelOfY(m.y);
    if (said !== p.level && this.matchDebug) {
      this.changeLevel(p, said, now);
      p.x = m.x;
      p.z = m.z;
    }
    const lv = p.level;
    const target = { x: m.x, z: m.z };
    clampToBounds(target, HUB_MOTION.radius, lv);
    let clamped = target.x !== m.x || target.z !== m.z;
    let y = clamp(m.y, LEVEL_Y[lv], LEVEL_Y[lv] + LEVEL_MAX_RISE[lv]);
    clamped ||= y !== m.y;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    let respawn = lv === 'table' && Math.hypot(target.x - HUB_SPAWN.x, target.z - HUB_SPAWN.z) <= RESPAWN_SNAP_RADIUS && y <= 0.5;
    if (!respawn && said === 'table' && lv === 'floor' && Math.hypot(m.x - HUB_SPAWN.x, m.z - HUB_SPAWN.z) <= RESPAWN_SNAP_RADIUS && m.y <= 0.5) {
      // sent back to the spawn point from the arcade (the client respawns a toy there)
      this.changeLevel(p, 'table', now);
      target.x = m.x;
      target.z = m.z;
      clampToBounds(target, HUB_MOTION.radius);
      y = LEVEL_Y.table;
      respawn = true;
    }
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
      clampToBounds(partial, HUB_MOTION.radius, lv);
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

  /**
   * `p` pets the dog: they must be on the Hub floor, by its pet spot, while it is up at the table.
   * Everyone hears of it (the heart, the lick); a pet that doesn't count just resyncs the petter.
   */
  private petDog(p: Player, now: number): Outgoing[] {
    const ok = this.onTables(p) && Math.hypot(p.x - DOG_PERCH.pet.x, p.z - DOG_PERCH.pet.z) <= DOG_VISIT.reach;
    const r = ok ? dogPet(now / 1000, this.dog) : null;
    if (!r) return p.conn ? [{ kind: 'send', to: [p.conn], msg: { t: 'dog', c: this.dogWire(now) } }] : [];
    return [{ kind: 'send', to: this.conns(), msg: { t: 'dog', c: this.dogWire(now), k: r, by: p.id } }];
  }

  private dogWire(now: number): DogWire {
    settleDog(now / 1000, this.dog);
    const d = this.dog;
    return { o: d.offset, p: d.lastPet, e: d.perchEnd, n: d.pets, v: d.visit };
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
    this.voice.remove(p.id); // the others drop their links on `left`
    this.players.delete(p.id);
    if (p.conn) this.byConn.delete(p.conn);
    p.conn = null;
    this.byToken.delete(p.resume);
    const out: Outgoing[] = [...this.fromLobby(this.lobbies.playerGone(p.id, now)), ...this.fromLobby(this.chat.forget(p.id, p.name))];
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
    this.chat.clear();
    this.voice.clear();
    this.players.clear();
    this.byConn.clear();
    this.byToken.clear();
    this.open = false;
    this.host = null;
    this.emptySince = null;
    this.play = createHubPlay();
    this.playEpoch = null;
    this.playEvents = [];
    this.ballTrail = [];
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
    const b = this.play.ball;
    const trail = this.ballTrail;
    if (b.holder) trail.length = 0;
    else if (!trail.length || now > trail[trail.length - 1].t) trail.push({ t: now, x: b.x, y: b.y, z: b.z });
    while (trail.length && trail[0].t < now - SNATCH_REWIND_MS) trail.shift();
  }

  private playBodies(): PlayBody[] {
    const out: PlayBody[] = [];
    for (const p of this.players.values()) if (p.conn && this.onTables(p)) out.push(this.body(p));
    return out;
  }

  /** Walking the Hub's tables (not in a trial, the Workshop or the shop, and not down in the arcade). */
  private onTables(p: Player): boolean {
    return !p.activity && p.level === 'table';
  }

  /** Move `p` to another level: the ball they hold stays behind. */
  private changeLevel(p: Player, level: HubLevel, now: number) {
    if (p.level === level) return;
    this.letGoOfBall(p, now);
    p.level = level;
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
    if (!this.onTables(p) || now - p.lastKickAt < KICK_COOLDOWN_MS) return [];
    p.lastKickAt = now;
    this.advancePlay(now);
    kickMarble(this.play, this.body(p), m.dx, m.dz, m.p, REACH_SLACK, this.playEvents);
    return [];
  }

  /**
   * Take the basketball (pick it up, snatch it in mid-air, or steal it from a dribbling holder) or
   * throw it (only its holder). A snatch also counts against where the ball was in the last
   * SNATCH_REWIND_MS; a holder is dribbling while the server has them moving on the ground.
   */
  private ball(p: Player, m: BallMsg, now: number): Outgoing[] {
    if (!this.onTables(p) || now - p.lastBallAt < BALL_COOLDOWN_MS) return [];
    p.lastBallAt = now;
    this.advancePlay(now);
    if (m.a === 'grab') {
      const h = this.play.ball.holder ? this.players.get(this.play.ball.holder) : undefined;
      const holderDribbling = !!h && !!h.conn && !h.activity && h.grounded && h.speed >= DRIBBLE_SPEED;
      grabBall(this.play, this.body(p), REACH_SLACK, this.playEvents, { rewind: this.ballTrail, holderDribbling });
    } else throwBall(this.play, this.body(p), m.yaw, m.p, this.playEvents);
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

  // ------------------------------------------------------------ proximity voice chat (voiceRelay.ts)
  private voicePeer(p: Player): VoicePeerView {
    return { id: p.id, connected: p.conn !== null, inHub: p.activity === null };
  }

  /** Mic on/off: the others hear of a change; a refused one tells the sender how things stand. */
  private setMic(p: Player, on: boolean, now: number): Outgoing[] {
    const v = this.voice.setMic(this.voicePeer(p), on, now);
    if (!v.ok) return [{ kind: 'send', to: [p.conn!], msg: { t: 'mic', id: p.id, on: v.on } }];
    const others = this.conns(p);
    return v.changed && others.length ? [{ kind: 'send', to: others, msg: { t: 'mic', id: p.id, on } }] : [];
  }

  /** The room turns a mic off (disconnect, a trial, the Workshop): everyone is told, the player too. */
  private micForcedOff(p: Player): Outgoing[] {
    if (!this.voice.forceOff(p.id)) return [];
    const to = this.conns();
    return to.length ? [{ kind: 'send', to, msg: { t: 'mic', id: p.id, on: false } }] : [];
  }

  /** Who has their mic on, for a player who has just (re)joined (nothing when nobody has). */
  private micList(p: Player): Outgoing[] {
    const on = this.voice.list();
    return on.length && p.conn ? [{ kind: 'send', to: [p.conn], msg: { t: 'mics', on } }] : [];
  }

  /** Relay a WebRTC handshake message to another player of this room, if allowed (see voiceRelay.ts). */
  private relaySignal(p: Player, m: SignalMsg, now: number): Outgoing[] {
    const target = this.players.get(m.to);
    const v = this.voice.checkSignal(this.voicePeer(p), target ? this.voicePeer(target) : null, m, now);
    if (!v.ok || !target?.conn) return [];
    const msg: ServerMsg = { t: 'sig', from: p.id, c: m.c, s: m.s, k: m.k, ...(m.d !== undefined ? { d: m.d } : {}) };
    return [{ kind: 'send', to: [target.conn], msg }];
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
        dog: this.dogWire(now),
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

  private chatPlayer(p: Player): ChatPlayer {
    return { id: p.id, name: p.name, connected: !!p.conn, away: !!p.activity, x: p.x, z: p.z, below: p.level !== 'table' };
  }

  /** Who wears a Who Am I? card, for a player arriving (only sent when someone does). */
  private cardsFor(p: Player): Outgoing[] {
    if (!this.chat.cardCount || !p.conn) return [];
    return [{ kind: 'send', to: [p.conn], msg: this.chat.view(p.id) }];
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
