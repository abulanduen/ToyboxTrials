/**
 * Online Hub wire protocol, shared by the browser client and the game server (`server/`).
 *
 * Pure TypeScript: no DOM, no Node APIs, no three.js. Messages are JSON text frames, each a
 * single object with a `t` (type) field. Clients send *intent* (where they say they are, which
 * emote they want); the server validates everything and is the only source of what other players
 * see. Bump PROTOCOL_VERSION whenever a message changes shape: the server turns away clients
 * with a different version with a clear "refresh the page" error.
 */
import { EMOTE_IDS, isEmoteId, type EmoteId } from '../game/emotes';
import { MINIGAME_IDS, type MinigameId } from '../minigames/ids';

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------- limits and rates
/** Largest client → server frame the server accepts (bytes). Bigger frames close the socket. */
export const MAX_MESSAGE_BYTES = 2048;
/** Server → client snapshot rate. */
export const SNAPSHOT_HZ = 15;
/** How often a client sends its movement intent (ms). */
export const MOVE_INTERVAL_MS = 66;
/** Client-side interpolation delay behind the newest snapshot (ms). */
export const INTERP_DELAY_MS = 100;
export const PUBLIC_ROOM_CAP = 24;
export const PRIVATE_ROOM_CAP = 16;
/** A private room closes after it has had nobody connected for this long (ms). */
export const PRIVATE_ROOM_IDLE_MS = 60_000;
/** A dropped player keeps their room slot this long, waiting for a reconnect (ms). */
export const RESUME_WINDOW_MS = 30_000;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

// ---------------------------------------------------------------- room codes
/** Room-code alphabet: no 0/O, 1/I/L, so codes survive being read aloud or handwritten. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

/** A random room code from the unambiguous alphabet (the server passes a CSPRNG-backed `random`). */
export function generateRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Uppercases and strips spaces/dashes; returns null unless it is a well-formed code. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

// ---------------------------------------------------------------- rooms
/**
 * Room ids on the server: public Hub instances are `public-1`, `public-2`, …; a private room's id
 * is its code. Clients never pick a public instance: the server puts them in the first with space.
 */
export const MAX_PUBLIC_INSTANCES = 40;
export const publicRoomId = (instance: number) => `public-${instance}`;

export type RoomRef = { kind: 'public'; instance: number } | { kind: 'private'; code: string };

/** Parse a room id; null for anything that is neither `public-<1..MAX>` nor a valid code. */
export function parseRoomId(id: unknown): RoomRef | null {
  if (typeof id !== 'string') return null;
  const m = /^public-([1-9][0-9]?)$/.exec(id);
  if (m) {
    const instance = Number(m[1]);
    return instance <= MAX_PUBLIC_INSTANCES ? { kind: 'public', instance } : null;
  }
  const code = normalizeRoomCode(id);
  return code && code === id ? { kind: 'private', code } : null;
}

// ---------------------------------------------------------------- shared shapes
/** What a player is doing away from the hub. Null = walking around the hub. */
export const ACTIVITIES = [...MINIGAME_IDS, 'workshop'] as const;
export type Activity = MinigameId | 'workshop';

export function isActivity(v: unknown): v is Activity {
  return typeof v === 'string' && (ACTIVITIES as readonly string[]).includes(v);
}

/**
 * Cosmetics on the wire. `paint` is an index into PAINT_JOBS, `hat`/`keySkin` are catalogue ids
 * from src/game/cosmetics.ts. The server replaces anything unknown with the defaults.
 */
export interface Look {
  paint: number;
  hat: string;
  keySkin: string;
}

export type JoinRequest = { kind: 'public' } | { kind: 'host' } | { kind: 'code'; code: string };

export interface RoomInfo {
  kind: 'public' | 'private';
  /** Private rooms: the 5-character code. */
  code: string | null;
  /** Public Hub instance number (1, 2, …). */
  instance: number | null;
  /** Player id of the host (private rooms), or null. */
  host: string | null;
  cap: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  look: Look;
}

/** One player in a snapshot. Short keys: this is sent 15 times a second. */
export interface PlayerState {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Facing (radians, three.js rotation.y convention). */
  r: number;
  /** Horizontal speed (cm/s), drives the walk animation. */
  s: number;
  /** Grounded: 1, airborne: 0. */
  g: 0 | 1;
  /** Current emote, or null. */
  e: EmoteId | null;
  /** Emote sequence number: changes every time this player starts an emote. */
  es: number;
  /** Activity (playing a minigame, in the Workshop), or null. */
  a: Activity | null;
  /** 1 while this player's connection is lost and their slot is being held. */
  off: 0 | 1;
}

export type ErrorCode =
  | 'version_mismatch'
  | 'room_full'
  | 'no_such_room'
  | 'bad_request'
  | 'not_joined'
  | 'replaced'
  | 'server_full'
  | 'shutting_down';

// ---------------------------------------------------------------- client → server
export interface HelloMsg {
  t: 'hello';
  v: number;
  name: string;
  look: Look;
  join: JoinRequest;
  /** Resume token from a previous welcome, to take back the same slot after a drop. */
  resume?: string;
}
export interface MoveMsg {
  t: 'move';
  x: number;
  y: number;
  z: number;
  yaw: number;
  grounded: boolean;
  speed: number;
}
export interface EmoteMsg {
  t: 'emote';
  id: EmoteId;
}
export interface ActivityMsg {
  t: 'activity';
  a: Activity | null;
}
export interface LookMsg {
  t: 'look';
  look: Look;
}
export interface LeaveMsg {
  t: 'leave';
}
export type ClientMsg = HelloMsg | MoveMsg | EmoteMsg | ActivityMsg | LookMsg | LeaveMsg;

// ---------------------------------------------------------------- server → client
export interface WelcomeMsg {
  t: 'welcome';
  v: number;
  you: string;
  /** Keep this to rejoin the same slot if the connection drops (valid for RESUME_WINDOW_MS). */
  resume: string;
  resumed: boolean;
  room: RoomInfo;
  players: PlayerInfo[];
  /** Where the server has this player: clients move their toy here if it is far away. */
  spawn: { x: number; y: number; z: number; yaw: number };
  /** Server clock (ms), the same clock as snapshot `now`. */
  now: number;
}
export interface JoinedMsg {
  t: 'joined';
  player: PlayerInfo;
}
export interface LeftMsg {
  t: 'left';
  id: string;
}
export interface RoomMsg {
  t: 'room';
  room: RoomInfo;
}
export interface SnapMsg {
  t: 'snap';
  now: number;
  p: PlayerState[];
}
export interface EmoteEventMsg {
  t: 'emote';
  id: string;
  emote: EmoteId;
}
export interface LookEventMsg {
  t: 'look';
  id: string;
  look: Look;
}
export interface ErrorMsg {
  t: 'error';
  code: ErrorCode;
  message: string;
  /** The server closes the connection after a fatal error. */
  fatal: boolean;
}
export type ServerMsg = WelcomeMsg | JoinedMsg | LeftMsg | RoomMsg | SnapMsg | EmoteEventMsg | LookEventMsg | ErrorMsg;

/** Player-facing text for each error. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  version_mismatch: 'This copy of the game is out of date. Refresh the page to play online.',
  room_full: 'That room is full.',
  no_such_room: 'No room with that code. Check the code and try again.',
  bad_request: 'The server did not understand the game. Refresh the page and try again.',
  not_joined: 'Not in a room yet.',
  replaced: 'You joined from another tab, so this one left the room.',
  server_full: 'The server is full right now. Try again in a minute.',
  shutting_down: 'The server is restarting. Try again in a minute.',
};

// ---------------------------------------------------------------- validation
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

function parseJson(raw: unknown, maxLength: number): Obj | null {
  if (typeof raw !== 'string' || raw.length > maxLength) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** Structural check of a look (ids are checked against the catalogue by the server). */
function parseLook(v: unknown): Look | null {
  if (!isObj(v)) return null;
  if (!isNum(v.paint) || !isStr(v.hat, 32) || !isStr(v.keySkin, 32)) return null;
  return { paint: v.paint, hat: v.hat, keySkin: v.keySkin };
}

function parseJoin(v: unknown): JoinRequest | null {
  if (!isObj(v)) return null;
  if (v.kind === 'public') return { kind: 'public' };
  if (v.kind === 'host') return { kind: 'host' };
  if (v.kind === 'code' && isStr(v.code, 32)) return { kind: 'code', code: v.code };
  return null;
}

/**
 * Parse and structurally validate a client message. Returns null for anything malformed:
 * not JSON, unknown type, missing fields, wrong types, NaN or infinite numbers, unknown emotes
 * or activities. Semantic checks (bounds, speed, rate limits, cosmetics) happen in the room logic.
 */
export function parseClientMessage(raw: unknown): ClientMsg | null {
  return validateClientMessage(parseJson(raw, MAX_MESSAGE_BYTES));
}

/** Byte size of a message once JSON-encoded (UTF-8). */
export function encodedSize(msg: unknown): number {
  let json: string | undefined;
  try {
    json = JSON.stringify(msg);
  } catch {
    return Infinity;
  }
  if (json === undefined) return 0;
  let bytes = 0;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3;
  }
  return bytes;
}

/** The same checks as `parseClientMessage` for an already-parsed value. Oversized messages are rejected too. */
export function validateClientMessage(m: unknown): ClientMsg | null {
  if (!isObj(m) || encodedSize(m) > MAX_MESSAGE_BYTES) return null;
  switch (m.t) {
    case 'hello': {
      if (!isNum(m.v) || !isStr(m.name, 64)) return null;
      const look = parseLook(m.look);
      const join = parseJoin(m.join);
      if (!look || !join) return null;
      if (m.resume !== undefined && !isStr(m.resume, 64)) return null;
      const msg: HelloMsg = { t: 'hello', v: m.v, name: m.name, look, join };
      if (typeof m.resume === 'string') msg.resume = m.resume;
      return msg;
    }
    case 'move': {
      if (!isNum(m.x) || !isNum(m.y) || !isNum(m.z) || !isNum(m.yaw) || !isNum(m.speed) || typeof m.grounded !== 'boolean') return null;
      return { t: 'move', x: m.x, y: m.y, z: m.z, yaw: m.yaw, grounded: m.grounded, speed: m.speed };
    }
    case 'emote':
      return isEmoteId(m.id) ? { t: 'emote', id: m.id } : null;
    case 'activity':
      return m.a === null || isActivity(m.a) ? { t: 'activity', a: m.a } : null;
    case 'look': {
      const look = parseLook(m.look);
      return look ? { t: 'look', look } : null;
    }
    case 'leave':
      return { t: 'leave' };
    default:
      return null;
  }
}

function parseRoom(v: unknown): RoomInfo | null {
  if (!isObj(v) || (v.kind !== 'public' && v.kind !== 'private') || !isNum(v.cap)) return null;
  const code = typeof v.code === 'string' ? v.code : null;
  const instance = isNum(v.instance) ? v.instance : null;
  const host = typeof v.host === 'string' ? v.host : null;
  return { kind: v.kind, code, instance, host, cap: v.cap };
}

function parsePlayerInfo(v: unknown): PlayerInfo | null {
  if (!isObj(v) || !isStr(v.id, 32) || !isStr(v.name, 64)) return null;
  const look = parseLook(v.look);
  return look ? { id: v.id, name: v.name, look } : null;
}

function parsePlayerState(v: unknown): PlayerState | null {
  if (!isObj(v) || !isStr(v.id, 32)) return null;
  if (!isNum(v.x) || !isNum(v.y) || !isNum(v.z) || !isNum(v.r) || !isNum(v.s) || !isNum(v.es)) return null;
  return {
    id: v.id,
    x: v.x,
    y: v.y,
    z: v.z,
    r: v.r,
    s: v.s,
    g: v.g ? 1 : 0,
    e: isEmoteId(v.e) ? v.e : null,
    es: v.es,
    a: isActivity(v.a) ? v.a : null,
    off: v.off ? 1 : 0,
  };
}

/** Parse a server message on the client. Defensive: a bad frame is dropped rather than thrown. */
export function parseServerMessage(raw: unknown): ServerMsg | null {
  return validateServerMessage(parseJson(raw, 1 << 20));
}

/** The same checks as `parseServerMessage` for an already-parsed value. */
export function validateServerMessage(m: unknown): ServerMsg | null {
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'welcome': {
      const room = parseRoom(m.room);
      if (!room || !isNum(m.v) || !isStr(m.you, 32) || !isStr(m.resume, 64) || !Array.isArray(m.players) || !isNum(m.now) || !isObj(m.spawn)) return null;
      const s = m.spawn;
      if (!isNum(s.x) || !isNum(s.y) || !isNum(s.z) || !isNum(s.yaw)) return null;
      const players = m.players.map(parsePlayerInfo).filter((p): p is PlayerInfo => !!p);
      return { t: 'welcome', v: m.v, you: m.you, resume: m.resume, resumed: !!m.resumed, room, players, spawn: { x: s.x, y: s.y, z: s.z, yaw: s.yaw }, now: m.now };
    }
    case 'joined': {
      const player = parsePlayerInfo(m.player);
      return player ? { t: 'joined', player } : null;
    }
    case 'left':
      return isStr(m.id, 32) ? { t: 'left', id: m.id } : null;
    case 'room': {
      const room = parseRoom(m.room);
      return room ? { t: 'room', room } : null;
    }
    case 'snap': {
      if (!isNum(m.now) || !Array.isArray(m.p)) return null;
      return { t: 'snap', now: m.now, p: m.p.map(parsePlayerState).filter((p): p is PlayerState => !!p) };
    }
    case 'emote':
      return isStr(m.id, 32) && isEmoteId(m.emote) ? { t: 'emote', id: m.id, emote: m.emote } : null;
    case 'look': {
      const look = parseLook(m.look);
      return isStr(m.id, 32) && look ? { t: 'look', id: m.id, look } : null;
    }
    case 'error': {
      const code = m.code as ErrorCode;
      if (typeof m.code !== 'string' || !Object.prototype.hasOwnProperty.call(ERROR_TEXT, code)) return null;
      return { t: 'error', code, message: isStr(m.message, 300) ? m.message : ERROR_TEXT[code], fatal: !!m.fatal };
    }
    default:
      return null;
  }
}

/** Every emote id, re-exported for UIs that list them. */
export { EMOTE_IDS };
