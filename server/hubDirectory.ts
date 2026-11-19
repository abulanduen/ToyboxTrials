/**
 * All rooms on the server, and which room each connection belongs to. Pure and deterministic
 * (time and randomness are passed in); the socket layer (server/index.ts) delivers what it returns.
 *
 *   - Public Hub: a `public` join goes to the lowest-numbered instance with space (24 each); when
 *     every instance is full a new one opens. Empty instances are forgotten.
 *   - Private rooms: `host` creates a room under a fresh unique 5-character code; `code` joins
 *     an open room by its code. A room closes after 60 s with nobody connected (HubRoom).
 *   - Resume: a `hello` carrying a known resume token goes back to that token's room and slot.
 */
import { HubRoom, CLOSE, type Outgoing } from './hubRoom';
import {
  ERROR_TEXT,
  MAX_PUBLIC_INSTANCES,
  PROTOCOL_VERSION,
  generateRoomCode,
  normalizeRoomCode,
  publicRoomId,
  type ClientMsg,
  type ErrorCode,
  type RoomInfo,
} from '../src/net/protocol';

/** Connected players across all rooms before the server turns new players away. */
export const DEFAULT_MAX_PLAYERS = 1000;

export interface DirectoryOptions {
  /** Uniform [0, 1): room codes, resume tokens, spawn spots. Use a CSPRNG in production. */
  random: () => number;
  publicCap?: number;
  privateCap?: number;
  maxPlayers?: number;
  /** Test servers only (MATCH_DEBUG=1): lobbies accept the `timescale` action. */
  matchDebug?: boolean;
}

export class HubDirectory {
  private readonly rooms = new Map<string, HubRoom>();
  private readonly byConn = new Map<string, HubRoom>();

  constructor(private readonly opts: DirectoryOptions) {}

  // ------------------------------------------------------------ inspection
  stats() {
    let players = 0;
    let connected = 0;
    let publicRooms = 0;
    let lobbies = 0;
    let matches = 0;
    for (const r of this.rooms.values()) {
      players += r.playerCount;
      connected += r.connectedCount;
      lobbies += r.lobbyCount;
      matches += r.runningMatches;
      if (r.kind === 'public') publicRooms++;
    }
    return { rooms: this.rooms.size, publicRooms, privateRooms: this.rooms.size - publicRooms, players, connected, lobbies, matches };
  }
  roomOf(conn: string): RoomInfo | null {
    return this.byConn.get(conn)?.info() ?? null;
  }
  /** A connection's player as the room sees it (tests). */
  playerOf(conn: string) {
    return this.byConn.get(conn)?.playerOf(conn) ?? null;
  }

  // ------------------------------------------------------------ events
  handle(conn: string, msg: ClientMsg, now: number): Outgoing[] {
    const current = this.byConn.get(conn);
    if (msg.t === 'hello' && !current) return this.hello(conn, msg, now);
    if (!current) return msg.t === 'leave' ? [] : [this.error(conn, 'not_joined', false)];
    const out = current.handle(conn, msg, now);
    this.settle(current, conn, out);
    return out;
  }

  disconnect(conn: string, now: number): Outgoing[] {
    const room = this.byConn.get(conn);
    if (!room) return [];
    this.byConn.delete(conn);
    const out = room.disconnect(conn, now);
    this.sweep(room);
    return out;
  }

  /** Snapshots for every room with someone connected, plus slot expiry and room closing. */
  tick(now: number): Outgoing[] {
    const out: Outgoing[] = [];
    for (const room of [...this.rooms.values()]) {
      const wake = room.nextWakeAt();
      if (room.connectedCount || (wake !== null && now >= wake)) out.push(...room.tick(now));
      this.sweep(room);
    }
    return out;
  }

  /** Step every running lobby match (MATCH_TICK_HZ). */
  tickMatches(now: number): Outgoing[] {
    const out: Outgoing[] = [];
    for (const room of this.rooms.values()) if (room.runningMatches) out.push(...room.tickLobbies(now));
    return out;
  }

  /** Link a signed-in account's username to a connection (after the socket layer checked the token). */
  setAccount(conn: string, username: string | null, now: number): Outgoing[] {
    return this.byConn.get(conn)?.setAccount(conn, username, now) ?? [];
  }

  /** The room a connection is in (tests). */
  roomFor(conn: string): HubRoom | null {
    return this.byConn.get(conn) ?? null;
  }

  shutdown(): Outgoing[] {
    return [...this.rooms.values()].flatMap((r) => r.shutdown());
  }

  // ------------------------------------------------------------ joining
  private hello(conn: string, msg: Extract<ClientMsg, { t: 'hello' }>, now: number): Outgoing[] {
    if (msg.v !== PROTOCOL_VERSION) return [this.error(conn, 'version_mismatch', true), { kind: 'close', conn, code: CLOSE.versionMismatch, reason: 'version mismatch' }];

    let room: HubRoom | undefined;
    if (msg.resume) room = [...this.rooms.values()].find((r) => r.hasToken(msg.resume!));
    if (!room) {
      if (this.connectedTotal() >= (this.opts.maxPlayers ?? DEFAULT_MAX_PLAYERS)) return this.refuse(conn, 'server_full');
      if (msg.join.kind === 'public') room = this.publicRoomWithSpace();
      else if (msg.join.kind === 'host') room = this.newPrivateRoom();
      else {
        const code = normalizeRoomCode(msg.join.code);
        room = code ? this.rooms.get(code) : undefined;
        if (!room || room.kind !== 'private' || !room.isOpen) return this.refuse(conn, 'no_such_room');
        msg = { ...msg, join: { kind: 'code', code: code! } };
      }
      if (!room) return this.refuse(conn, 'server_full');
    }
    const out = room.handle(conn, msg, now);
    this.settle(room, conn, out);
    this.sweep(room);
    return out;
  }

  /** Keep the connection map in step with what the room did (joined, refused, replaced, left). */
  private settle(room: HubRoom, conn: string, out: Outgoing[]) {
    if (room.hasConn(conn)) this.byConn.set(conn, room);
    else if (this.byConn.get(conn) === room) this.byConn.delete(conn);
    for (const o of out) if (o.kind === 'close' && !room.hasConn(o.conn) && this.byConn.get(o.conn) === room) this.byConn.delete(o.conn);
    this.sweep(room);
  }

  private publicRoomWithSpace(): HubRoom | undefined {
    for (let n = 1; n <= MAX_PUBLIC_INSTANCES; n++) {
      const id = publicRoomId(n);
      const r = this.rooms.get(id);
      if (!r) return this.add(new HubRoom({ id, random: this.opts.random, publicCap: this.opts.publicCap, matchDebug: this.opts.matchDebug }));
      if (r.playerCount < r.cap) return r;
    }
    return undefined;
  }

  private newPrivateRoom(): HubRoom | undefined {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode(this.opts.random);
      if (this.rooms.has(code)) continue;
      return this.add(new HubRoom({ id: code, random: this.opts.random, privateCap: this.opts.privateCap, matchDebug: this.opts.matchDebug }));
    }
    return undefined;
  }

  private add(room: HubRoom) {
    this.rooms.set(room.id, room);
    return room;
  }

  /** Forget a room with nobody in it and nothing to keep (and a private room nobody managed to host). */
  private sweep(room: HubRoom) {
    if (room.isEmpty && room.connectedCount === 0 && this.rooms.get(room.id) === room) this.rooms.delete(room.id);
  }

  private connectedTotal() {
    return this.byConn.size;
  }

  private refuse(conn: string, code: ErrorCode): Outgoing[] {
    return [this.error(conn, code, true), { kind: 'close', conn, code: CLOSE.joinRefused, reason: code }];
  }

  private error(conn: string, code: ErrorCode, fatal: boolean): Outgoing {
    return { kind: 'send', to: [conn], msg: { t: 'error', code, message: ERROR_TEXT[code], fatal } };
  }
}
