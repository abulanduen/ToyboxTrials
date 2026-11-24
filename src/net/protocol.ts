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
import { CHAT_RAW_MAX } from './chatFilter';

/**
 * v2: looks carry the accessory slots (back/face/neck), six more gesture ids, and a 'shop' activity.
 * v3: tournament lobbies (`lobby`, `lobbies`, `lobbyAlert`, `lobbyErr`), server-run matches (`in`,
 *     `ms`) and the account link for the leaderboard (`auth`).
 * v4: hub play: the shared marble and basketball (`kick`, `ball`, snapshot `hp`, `play` events).
 * v5: Hub text chat (`chat` both ways, `chatNote`) and Who Am I? cards at the suspicious box
 *     (`card` both ways, `cards`).
 * v6: proximity voice chat: mic state (`mic`, `mics`) and WebRTC signalling (`sig`).
 */
export const PROTOCOL_VERSION = 6;

// ---------------------------------------------------------------- limits and rates
/** Largest client → server message the server accepts (bytes), except voice signalling (`sig`). */
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
export const ACTIVITIES = [...MINIGAME_IDS, 'workshop', 'shop'] as const;
export type Activity = MinigameId | 'workshop' | 'shop';

export function isActivity(v: unknown): v is Activity {
  return typeof v === 'string' && (ACTIVITIES as readonly string[]).includes(v);
}

/**
 * Cosmetics on the wire. `paint` is an index into PAINT_JOBS; `hat`, `keySkin` and the accessory
 * slots `back`, `face`, `neck` are catalogue ids from src/game/cosmetics.ts ('none' = empty). The
 * server replaces anything unknown with the defaults. Ownership is not checked (no accounts yet).
 */
export interface Look {
  paint: number;
  hat: string;
  keySkin: string;
  back: string;
  face: string;
  neck: string;
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

// ---------------------------------------------------------------- lobbies and online matches (v3)
/** Player cap a host can set on a lobby (humans; bot fill tops the field up to it). */
export const LOBBY_MIN_CAP = 2;
export const LOBBY_MAX_CAP = 8;
/** Open lobbies one Hub room can hold. */
export const MAX_LOBBIES_PER_ROOM = 8;
/** Lobby ids: 4 characters from the room-code alphabet, unique within a Hub room. */
export const LOBBY_ID_LENGTH = 4;
/** The server steps every running match on a timer at this rate, in fixed 60 Hz rules sub-steps. */
export const MATCH_TICK_HZ = 30;
/** Most inputs one `in` message may carry. */
export const MAX_INPUTS_PER_MSG = 32;
/** How often a client flushes its queued match inputs to the server (ms). */
export const INPUT_FLUSH_MS = 1000 / MATCH_TICK_HZ;
/**
 * Held-input games (`heldInputs` in src/minigames/facts.ts): the server keeps stepping a player's
 * newest input batch until the next one arrives, for at most this long (match ms). Client
 * prediction replays the same (src/minigames/shared/predictGrid.ts).
 */
export const HELD_INPUT_MS = 250;

export const LOBBY_FORMATS = ['blitz', 'normal', 'treasure'] as const;
export type LobbyFormat = (typeof LOBBY_FORMATS)[number];
export const LOBBY_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type LobbyDifficulty = (typeof LOBBY_DIFFICULTIES)[number];
export type LobbyMode = 'single' | 'tournament';

/** Everything the host controls. Visible to every member. */
export interface LobbySettings {
  mode: LobbyMode;
  /** The trial for `single` mode. */
  game: MinigameId;
  /** The tournament format for `tournament` mode. */
  format: LobbyFormat;
  /** Most players (humans) allowed in, LOBBY_MIN_CAP..LOBBY_MAX_CAP. */
  cap: number;
  /** Locked: nobody new can join (members stay). */
  locked: boolean;
  /** Bots fill the empty seats up to the cap. */
  botFill: boolean;
  difficulty: LobbyDifficulty;
}

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = { mode: 'tournament', game: 'copycat-conductor', format: 'blitz', cap: 8, locked: false, botFill: true, difficulty: 'normal' };

/** One lobby in the room's list (and in the "someone is hosting" alert). */
export interface LobbySummary {
  id: string;
  hostId: string;
  host: string;
  mode: LobbyMode;
  game: MinigameId;
  format: LobbyFormat;
  /** Human players in the lobby (spectators included). */
  players: number;
  cap: number;
  locked: boolean;
  /** A match is running (newcomers watch and enter at the next trial). */
  playing: boolean;
}

export interface LobbyMember {
  id: string;
  name: string;
  look: Look;
  ready: boolean;
  /** Connection lost; the slot is held for RESUME_WINDOW_MS. */
  off: boolean;
  /** Joined while a match was running: watching, and enters at the next trial. */
  spectating: boolean;
}

/** One toy in a server-run match. Bots have `bot` set. */
export interface MatchSeat {
  id: string;
  name: string;
  look: Look;
  bot: LobbyDifficulty | null;
}

export interface WirePlacement {
  contestantId: string;
  place: number;
  score: number;
  eliminated?: boolean;
  forfeit?: boolean;
}

export interface WireStanding {
  contestantId: string;
  points: number;
  rounds: number[];
  wins: number;
}

export const MATCH_PHASES = ['reveal', 'countdown', 'playing', 'results', 'standings', 'final'] as const;
export type MatchPhaseWire = (typeof MATCH_PHASES)[number];

/** The match a lobby is running: phase, field, tournament table and the last result. */
export interface MatchInfo {
  /** Bumped for every trial; `in` and `ms` messages carry it. */
  seq: number;
  phase: MatchPhaseWire;
  game: MinigameId;
  /** Server time (ms, the snapshot clock) when this phase moves on by itself, or null. */
  endsAt: number | null;
  seats: MatchSeat[];
  tournament: { format: LobbyFormat; games: MinigameId[]; round: number; standings: WireStanding[] } | null;
  result: { placements: WirePlacement[]; durationMs: number } | null;
  /** Players who forfeited this trial (left, kicked, or gone longer than RESUME_WINDOW_MS). */
  forfeits: string[];
  /** Server time scale (1 in normal play; test servers may speed matches up). */
  timeScale: number;
}

export interface LobbyState {
  id: string;
  hostId: string;
  settings: LobbySettings;
  /** In join order: the longest-present member takes over if the host leaves. */
  members: LobbyMember[];
  match: MatchInfo | null;
}

export type LobbyAction =
  | { a: 'create'; settings: LobbySettings }
  | { a: 'join'; id: string }
  | { a: 'leave' }
  | { a: 'kick'; id: string }
  | { a: 'settings'; settings: Partial<LobbySettings> }
  /**
   * `phase`: the match phase the button was pressed in (intro, results, standings, final). The
   * server ignores a ready that arrives after its phase has moved on, so a late "Next trial" can't
   * count as Ready on the next trial's intro card.
   */
  | { a: 'ready'; ready: boolean; phase?: MatchPhaseWire }
  | { a: 'start' }
  /** Spectators: whose view to follow. */
  | { a: 'watch'; id: string }
  /**
   * Test servers only (MATCH_DEBUG=1): speed the lobby's match up (0 freezes it), and optionally
   * freeze it when it next reaches phase `hold`. Ignored otherwise.
   */
  | { a: 'timescale'; k: number; hold?: MatchPhaseWire };

export type LobbyEndReason = 'left' | 'kicked' | 'closed';

export type LobbyErrCode =
  | 'no_such_lobby'
  | 'lobby_full'
  | 'lobby_locked'
  | 'kicked'
  | 'not_host'
  | 'too_many_lobbies'
  | 'slow_down'
  | 'need_players'
  | 'bad_settings'
  | 'not_in_lobby'
  | 'not_online';

export const LOBBY_ERROR_TEXT: Record<LobbyErrCode, string> = {
  no_such_lobby: 'That lobby has closed.',
  lobby_full: 'That lobby is full.',
  lobby_locked: 'The host has locked that lobby.',
  kicked: 'The host removed you from that lobby.',
  not_host: 'Only the host can do that.',
  too_many_lobbies: 'This Hub has as many lobbies as it can hold. Join one of them, or try again soon.',
  slow_down: 'Slow down a little and try again.',
  need_players: 'Not enough toys for that trial. Turn on bot fill or wait for more players.',
  bad_settings: 'Those lobby settings are not allowed.',
  not_in_lobby: 'You are not in a lobby.',
  not_online: "That trial can't be played online yet. Pick another, or practise it with bots.",
};

/** Max string length of anything inside one match input (Jack-in-the-Box answers are ≤ 48). */
const INPUT_STRING_MAX = 64;

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
export type LobbyMsg = { t: 'lobby' } & LobbyAction;
/** Match inputs, in the shape the game's `readLocalInput` produces, for match `m`. */
export interface InputMsg {
  t: 'in';
  m: number;
  i: unknown[];
  /**
   * The sender's running count of `in` messages this match (1, 2, 3…). Optional: the server echoes
   * the newest one it has stepped as the snapshot's `a`, so the client can replay only the inputs
   * the server has not used yet (own-toy prediction, see src/minigames/remote.ts).
   */
  q?: number;
}
/** Link a signed-in account to this connection, so the leaderboard shows the username. */
export interface AuthMsg {
  t: 'auth';
  token: string;
}
// ---------------------------------------------------------------- hub play (v4)
/** Kick (power 1) or push (walking into it, a lower power) the shared marble along (dx, dz). */
export interface KickMsg {
  t: 'kick';
  dx: number;
  dz: number;
  /** Power, 0..1. */
  p: number;
}
/** Pick up the basketball, or throw the one you hold (facing `yaw`, power `p` 0..1). */
export type BallMsg = { t: 'ball'; a: 'grab' } | { t: 'ball'; a: 'throw'; yaw: number; p: number };
/** Test servers only (MATCH_DEBUG=1): put the marble at (x, z). Ignored otherwise. */
export interface HubPlayDebugMsg {
  t: 'hpdebug';
  x: number;
  z: number;
}
// ---------------------------------------------------------------- chat and Who Am I? (v5)
/** Say something in the room's chat (the server cleans, filters and rate-limits it). */
export interface ChatSendMsg {
  t: 'chat';
  text: string;
}
/** At the suspicious box: ask for a Who Am I? card (`deal`), or give up on yours (`peel`). */
export interface CardActionMsg {
  t: 'card';
  a: 'deal' | 'peel';
}
export type ClientMsg = HelloMsg | MoveMsg | EmoteMsg | ActivityMsg | LookMsg | LeaveMsg | LobbyMsg | InputMsg | AuthMsg | KickMsg | BallMsg | HubPlayDebugMsg | ChatSendMsg | CardActionMsg | MicMsg | SignalMsg;

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
  /** The room's shared marble and basketball at `now` (v4). */
  hp?: HubPlayWire;
}
/**
 * Hub play state in a snapshot. Short keys and arrays: it is sent 15 times a second.
 * `m` marble [x, z, vx, vz]; `n` 1 while it sits in a net after a goal; `b` ball
 * [x, y, z, vx, vy, vz]; `h` the ball's holder (player id) or null; `s` goals [Coral, Blue];
 * `k` baskets scored in the room.
 */
export interface HubPlayWire {
  m: [number, number, number, number];
  n: 0 | 1;
  b: [number, number, number, number, number, number];
  h: string | null;
  s: [number, number];
  k: number;
}
/** Hub play events since the last message (kicks, goals, baskets, bounces), in order. */
export interface PlayEventsMsg {
  t: 'play';
  e: PlayEventWire[];
}
export const PLAY_EVENT_KINDS = ['goal', 'hoop', 'kick', 'grab', 'snatch', 'steal', 'throw', 'drop', 'rim', 'board', 'bounce', 'wall', 'reset'] as const;
export interface PlayEventWire {
  k: (typeof PLAY_EVENT_KINDS)[number];
  /** Who (player id): kicker, scorer, holder. */
  by?: string | null;
  /** Steal: who had the ball. */
  from?: string;
  /** Goal: the net it went in ('w' | 'e'). */
  net?: 'w' | 'e';
  /** Goal: the score after it. */
  score?: [number, number];
  /** Basket: the room's total after it. */
  total?: number;
  /** Kick/throw power or impact speed. */
  p?: number;
  v?: number;
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
export type ServerMsg =
  | WelcomeMsg
  | JoinedMsg
  | LeftMsg
  | RoomMsg
  | SnapMsg
  | EmoteEventMsg
  | LookEventMsg
  | ErrorMsg
  | LobbiesMsg
  | LobbyAlertMsg
  | LobbyStateMsg
  | LobbyErrMsg
  | MatchStateMsg
  | PlayEventsMsg
  | ChatLineMsg
  | ChatNoteMsg
  | CardEventMsg
  | CardsMsg
  | MicEventMsg
  | MicsMsg
  | SignalEventMsg;

/**
 * A chat line, as this recipient may see it: `name` comes from the server's roster, `text` is
 * cleaned and filtered, and a Who Am I? holder gets their own answer masked (`m` = 1).
 */
export interface ChatLineMsg {
  t: 'chat';
  /** Sender's player id. */
  id: string;
  name: string;
  text: string;
  /** Room message number (increasing). */
  n: number;
  /** 1 when this copy had a Who Am I? answer masked for you. */
  m?: 1;
}
export const CHAT_NOTE_CODES = ['slow', 'card_busy', 'card_far', 'card_wait', 'card_none', 'card_away'] as const;
export type ChatNoteCode = (typeof CHAT_NOTE_CODES)[number];
export const CHAT_NOTE_TEXT: Record<ChatNoteCode, string> = {
  slow: 'Slow down a little: wait a moment before your next message.',
  card_busy: "You're already wearing a card. Guess it in chat, or peel it off.",
  card_far: 'Stand by the suspicious box to open it.',
  card_wait: 'The jack is winding back up. Try again in a moment.',
  card_none: "You aren't wearing a card.",
  card_away: 'Come back to the Hub first.',
};
/** Something about your chat or card the server refused (only you get it). `wait`: ms until you may chat again. */
export interface ChatNoteMsg {
  t: 'chatNote';
  code: ChatNoteCode;
  message: string;
  wait?: number;
}
/**
 * A Who Am I? card went on, was guessed, peeled off, or fell off (left, went into a trial or the
 * Workshop, disconnected). `w` (the word) and `ar` (its article) are never sent to the holder
 * while the card is on: only `solved` and `peeled` reveal it to them. `guess`: the right guess.
 */
export interface CardEventMsg {
  t: 'card';
  k: 'on' | 'solved' | 'peeled' | 'off';
  /** The holder's player id. */
  id: string;
  name: string;
  w?: string;
  ar?: string;
}
/** Everyone wearing a card in the room, as this recipient may see it (sent on joining). */
export interface CardsMsg {
  t: 'cards';
  c: { id: string; w?: string }[];
}

/** The open lobbies in this Hub room (sent on joining the room and whenever one changes). */
export interface LobbiesMsg {
  t: 'lobbies';
  list: LobbySummary[];
}
/** Someone in this Hub room started hosting a lobby. */
export interface LobbyAlertMsg {
  t: 'lobbyAlert';
  lobby: LobbySummary;
}
/** Your lobby as it is now; null when you are no longer in one (with the reason). */
export interface LobbyStateMsg {
  t: 'lobby';
  you: string;
  lobby: LobbyState | null;
  reason?: LobbyEndReason;
}
export interface LobbyErrMsg {
  t: 'lobbyErr';
  code: LobbyErrCode;
  message: string;
}
/**
 * Match state for match `m`: a full keyframe (`k` = 1, `d` is the state) or a patch against the
 * last state sent to this player (`k` = 0, see delta.ts). `e` holds the rules events since the
 * last message; `n` is the server clock. Filtered per player: secrets never leave the server.
 */
export interface MatchStateMsg {
  t: 'ms';
  m: number;
  k: 0 | 1;
  d: unknown;
  e: MatchEventWire[];
  n: number;
  /** The newest of this recipient's `in` messages (its `q`) that the rules have stepped. Seated players whose client sends `q` only. */
  a?: number;
  /** With `a`: match ms the rules have run since they first stepped message `a` (the state already holds that much of it). */
  g?: number;
}
export interface MatchEventWire {
  type: string;
  [k: string]: unknown;
}

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

/**
 * Structural check of a look (ids are checked against the catalogue by the server). A missing
 * accessory slot reads as 'none'; a slot of the wrong type rejects the message.
 */
function parseLook(v: unknown): Look | null {
  if (!isObj(v)) return null;
  if (!isNum(v.paint) || !isStr(v.hat, 32) || !isStr(v.keySkin, 32)) return null;
  const slot = (x: unknown) => (x === undefined ? 'none' : isStr(x, 32) ? x : null);
  const back = slot(v.back);
  const face = slot(v.face);
  const neck = slot(v.neck);
  if (back === null || face === null || neck === null) return null;
  return { paint: v.paint, hat: v.hat, keySkin: v.keySkin, back, face, neck };
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
  return validateClientMessage(parseJson(raw, MAX_SIGNAL_BYTES));
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
  if (!isObj(m) || encodedSize(m) > (m.t === 'sig' ? MAX_SIGNAL_BYTES : MAX_MESSAGE_BYTES)) return null;
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
    case 'lobby':
      return parseLobbyAction(m);
    case 'in': {
      if (!isInt(m.m) || !Array.isArray(m.i) || m.i.length > MAX_INPUTS_PER_MSG) return null;
      const items: unknown[] = [];
      for (const x of m.i) {
        const v = parseInputItem(x);
        if (v === null) return null;
        items.push(v);
      }
      return isInt(m.q) && m.q >= 0 ? { t: 'in', m: m.m, i: items, q: m.q } : { t: 'in', m: m.m, i: items };
    }
    case 'auth':
      return isStr(m.token, 128) && m.token.length > 0 ? { t: 'auth', token: m.token } : null;
    case 'kick':
      return isNum(m.dx) && isNum(m.dz) && isNum(m.p) && Math.abs(m.dx) <= 2 && Math.abs(m.dz) <= 2 && m.p >= 0 && m.p <= 1 ? { t: 'kick', dx: m.dx, dz: m.dz, p: m.p } : null;
    case 'ball':
      if (m.a === 'grab') return { t: 'ball', a: 'grab' };
      if (m.a === 'throw' && isNum(m.yaw) && isNum(m.p) && Math.abs(m.yaw) <= 10 && m.p >= 0 && m.p <= 1) return { t: 'ball', a: 'throw', yaw: m.yaw, p: m.p };
      return null;
    case 'hpdebug':
      return isNum(m.x) && isNum(m.z) ? { t: 'hpdebug', x: m.x, z: m.z } : null;
    case 'chat':
      return isStr(m.text, CHAT_RAW_MAX) ? { t: 'chat', text: m.text } : null;
    case 'card':
      return m.a === 'deal' || m.a === 'peel' ? { t: 'card', a: m.a } : null;
    case 'mic':
      return typeof m.on === 'boolean' ? { t: 'mic', on: m.on } : null;
    case 'sig': {
      if (!isPlayerId(m.to)) return null;
      const body = parseSignalBody(m);
      return body ? { t: 'sig', to: m.to, ...body } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- lobby validation
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

export const isMinigameId = (v: unknown): v is MinigameId => isOneOf(MINIGAME_IDS, v);

export function isLobbyId(v: unknown): v is string {
  if (typeof v !== 'string' || v.length !== LOBBY_ID_LENGTH) return false;
  for (const ch of v) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** A player or bot id as the server issues them (`p1`, `bot-3`). */
const isPlayerId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 32 && /^[A-Za-z0-9-]+$/.test(v);

/**
 * Lobby settings: every field when `partial` is false (create), any subset otherwise (a host's
 * change). Null if any field present is the wrong type or out of range.
 */
export function parseLobbySettings(v: unknown, partial: true): Partial<LobbySettings> | null;
export function parseLobbySettings(v: unknown, partial: false): LobbySettings | null;
export function parseLobbySettings(v: unknown, partial: boolean): Partial<LobbySettings> | null {
  if (!isObj(v)) return null;
  const out: Partial<LobbySettings> = {};
  const has = (k: keyof LobbySettings) => v[k] !== undefined;
  if (has('mode')) {
    if (v.mode !== 'single' && v.mode !== 'tournament') return null;
    out.mode = v.mode;
  }
  if (has('game')) {
    if (!isMinigameId(v.game)) return null;
    out.game = v.game;
  }
  if (has('format')) {
    if (!isOneOf(LOBBY_FORMATS, v.format)) return null;
    out.format = v.format;
  }
  if (has('cap')) {
    if (!isInt(v.cap) || v.cap < LOBBY_MIN_CAP || v.cap > LOBBY_MAX_CAP) return null;
    out.cap = v.cap;
  }
  if (has('locked')) {
    if (typeof v.locked !== 'boolean') return null;
    out.locked = v.locked;
  }
  if (has('botFill')) {
    if (typeof v.botFill !== 'boolean') return null;
    out.botFill = v.botFill;
  }
  if (has('difficulty')) {
    if (!isOneOf(LOBBY_DIFFICULTIES, v.difficulty)) return null;
    out.difficulty = v.difficulty;
  }
  if (!partial && Object.keys(out).length !== 7) return null;
  return out;
}

function parseLobbyAction(m: Obj): LobbyMsg | null {
  switch (m.a) {
    case 'create': {
      const settings = parseLobbySettings(m.settings, false);
      return settings ? { t: 'lobby', a: 'create', settings } : null;
    }
    case 'join':
      return isLobbyId(m.id) ? { t: 'lobby', a: 'join', id: m.id } : null;
    case 'leave':
      return { t: 'lobby', a: 'leave' };
    case 'kick':
      return isPlayerId(m.id) ? { t: 'lobby', a: 'kick', id: m.id } : null;
    case 'settings': {
      const settings = parseLobbySettings(m.settings, true);
      return settings && Object.keys(settings).length ? { t: 'lobby', a: 'settings', settings } : null;
    }
    case 'ready':
      if (typeof m.ready !== 'boolean') return null;
      if (m.phase === undefined) return { t: 'lobby', a: 'ready', ready: m.ready };
      return (MATCH_PHASES as readonly unknown[]).includes(m.phase) ? { t: 'lobby', a: 'ready', ready: m.ready, phase: m.phase as MatchPhaseWire } : null;
    case 'start':
      return { t: 'lobby', a: 'start' };
    case 'watch':
      return isPlayerId(m.id) ? { t: 'lobby', a: 'watch', id: m.id } : null;
    case 'timescale':
      if (!isNum(m.k) || m.k < 0 || m.k > 50 || (m.hold !== undefined && !isOneOf(MATCH_PHASES, m.hold))) return null;
      return { t: 'lobby', a: 'timescale', k: m.k, ...(m.hold ? { hold: m.hold as MatchPhaseWire } : {}) };
    default:
      return null;
  }
}

/**
 * One match input, structurally: a flat object of at most 8 fields whose names are plain letters
 * (so never `__proto__`) and whose values are finite numbers, booleans, null or short strings.
 * Every game's input fits; the game's own validator (server/games.ts) checks the meaning.
 */
export function parseInputItem(v: unknown): Record<string, unknown> | null {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (keys.length > 8) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (!/^[A-Za-z]{1,16}$/.test(k)) return null;
    const x = v[k];
    if (x === null || typeof x === 'boolean' || isNum(x) || isStr(x, INPUT_STRING_MAX)) out[k] = x;
    else return null;
  }
  return out;
}

function parseSummary(v: unknown): LobbySummary | null {
  if (!isObj(v) || !isLobbyId(v.id) || !isPlayerId(v.hostId) || !isStr(v.host, 64)) return null;
  if ((v.mode !== 'single' && v.mode !== 'tournament') || !isMinigameId(v.game) || !isOneOf(LOBBY_FORMATS, v.format)) return null;
  if (!isInt(v.players) || !isInt(v.cap)) return null;
  return { id: v.id, hostId: v.hostId, host: v.host, mode: v.mode, game: v.game, format: v.format, players: v.players, cap: v.cap, locked: !!v.locked, playing: !!v.playing };
}

function parseMember(v: unknown): LobbyMember | null {
  if (!isObj(v) || !isPlayerId(v.id) || !isStr(v.name, 64)) return null;
  const look = parseLook(v.look);
  return look ? { id: v.id, name: v.name, look, ready: !!v.ready, off: !!v.off, spectating: !!v.spectating } : null;
}

function parseSeat(v: unknown): MatchSeat | null {
  if (!isObj(v) || !isPlayerId(v.id) || !isStr(v.name, 64)) return null;
  const look = parseLook(v.look);
  if (!look) return null;
  return { id: v.id, name: v.name, look, bot: isOneOf(LOBBY_DIFFICULTIES, v.bot) ? v.bot : null };
}

function parsePlacement(v: unknown): WirePlacement | null {
  if (!isObj(v) || !isPlayerId(v.contestantId) || !isInt(v.place) || !isNum(v.score)) return null;
  const p: WirePlacement = { contestantId: v.contestantId, place: v.place, score: v.score };
  if (v.eliminated) p.eliminated = true;
  if (v.forfeit) p.forfeit = true;
  return p;
}

function parseStanding(v: unknown): WireStanding | null {
  if (!isObj(v) || !isPlayerId(v.contestantId) || !isNum(v.points) || !isInt(v.wins) || !Array.isArray(v.rounds) || !v.rounds.every(isNum)) return null;
  return { contestantId: v.contestantId, points: v.points, rounds: v.rounds as number[], wins: v.wins };
}

const parseAll = <T>(v: unknown, f: (x: unknown) => T | null): T[] | null => {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const x of v) {
    const p = f(x);
    if (!p) return null;
    out.push(p);
  }
  return out;
};

function parseMatchInfo(v: unknown): MatchInfo | null {
  if (!isObj(v) || !isInt(v.seq) || !isOneOf(MATCH_PHASES, v.phase) || !isMinigameId(v.game) || !isNum(v.timeScale)) return null;
  const seats = parseAll(v.seats, parseSeat);
  if (!seats) return null;
  let tournament: MatchInfo['tournament'] = null;
  if (v.tournament !== null && v.tournament !== undefined) {
    const t = v.tournament;
    if (!isObj(t) || !isOneOf(LOBBY_FORMATS, t.format) || !isInt(t.round) || !Array.isArray(t.games) || !t.games.every(isMinigameId)) return null;
    const standings = parseAll(t.standings, parseStanding);
    if (!standings) return null;
    tournament = { format: t.format, games: t.games as MinigameId[], round: t.round, standings };
  }
  let result: MatchInfo['result'] = null;
  if (v.result !== null && v.result !== undefined) {
    const r = v.result;
    const placements = isObj(r) ? parseAll(r.placements, parsePlacement) : null;
    if (!isObj(r) || !placements || !isNum(r.durationMs)) return null;
    result = { placements, durationMs: r.durationMs };
  }
  const forfeits = Array.isArray(v.forfeits) ? v.forfeits.filter(isPlayerId) : [];
  return { seq: v.seq, phase: v.phase, game: v.game, endsAt: isNum(v.endsAt) ? v.endsAt : null, seats, tournament, result, forfeits, timeScale: v.timeScale };
}

function parseLobbyState(v: unknown): LobbyState | null {
  if (!isObj(v) || !isLobbyId(v.id) || !isPlayerId(v.hostId)) return null;
  const settings = parseLobbySettings(v.settings, false);
  const members = parseAll(v.members, parseMember);
  if (!settings || !members) return null;
  let match: MatchInfo | null = null;
  if (v.match !== null && v.match !== undefined) {
    match = parseMatchInfo(v.match);
    if (!match) return null;
  }
  return { id: v.id, hostId: v.hostId, settings, members, match };
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

const numArray = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(isNum);

function parseHubPlay(v: unknown): HubPlayWire | null {
  if (!isObj(v) || !numArray(v.m, 4) || !numArray(v.b, 6) || !numArray(v.s, 2) || !isNum(v.k)) return null;
  const h = v.h === null || v.h === undefined ? null : isPlayerId(v.h) ? v.h : null;
  return { m: v.m as HubPlayWire['m'], n: v.n ? 1 : 0, b: v.b as HubPlayWire['b'], h, s: v.s as HubPlayWire['s'], k: v.k };
}

function parsePlayEvent(v: unknown): PlayEventWire | null {
  if (!isObj(v) || !isOneOf(PLAY_EVENT_KINDS, v.k)) return null;
  const e: PlayEventWire = { k: v.k };
  if (v.by === null) e.by = null;
  else if (isPlayerId(v.by)) e.by = v.by;
  if (isPlayerId(v.from)) e.from = v.from;
  if (v.net === 'w' || v.net === 'e') e.net = v.net;
  if (numArray(v.score, 2)) e.score = v.score as [number, number];
  if (isNum(v.total)) e.total = v.total;
  if (isNum(v.p)) e.p = v.p;
  if (isNum(v.v)) e.v = v.v;
  return e;
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
      const snap: SnapMsg = { t: 'snap', now: m.now, p: m.p.map(parsePlayerState).filter((p): p is PlayerState => !!p) };
      const hp = parseHubPlay(m.hp);
      if (hp) snap.hp = hp;
      return snap;
    }
    case 'play': {
      if (!Array.isArray(m.e)) return null;
      return { t: 'play', e: m.e.map(parsePlayEvent).filter((e): e is PlayEventWire => !!e) };
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
    case 'lobbies': {
      const list = parseAll(m.list, parseSummary);
      return list ? { t: 'lobbies', list } : null;
    }
    case 'lobbyAlert': {
      const lobby = parseSummary(m.lobby);
      return lobby ? { t: 'lobbyAlert', lobby } : null;
    }
    case 'lobby': {
      if (!isPlayerId(m.you)) return null;
      const reason = m.reason === 'left' || m.reason === 'kicked' || m.reason === 'closed' ? m.reason : undefined;
      if (m.lobby === null) return { t: 'lobby', you: m.you, lobby: null, ...(reason ? { reason } : {}) };
      const lobby = parseLobbyState(m.lobby);
      return lobby ? { t: 'lobby', you: m.you, lobby } : null;
    }
    case 'lobbyErr': {
      const code = m.code as LobbyErrCode;
      if (typeof m.code !== 'string' || !Object.prototype.hasOwnProperty.call(LOBBY_ERROR_TEXT, code)) return null;
      return { t: 'lobbyErr', code, message: isStr(m.message, 300) ? m.message : LOBBY_ERROR_TEXT[code] };
    }
    case 'ms': {
      if (!isInt(m.m) || (m.k !== 0 && m.k !== 1) || !isNum(m.n) || !Array.isArray(m.e) || m.d === undefined) return null;
      const e = m.e.filter((x): x is MatchEventWire => isObj(x) && typeof x.type === 'string');
      if (!(isInt(m.a) && m.a >= 0)) return { t: 'ms', m: m.m, k: m.k, d: m.d, e, n: m.n };
      return isNum(m.g) && m.g >= 0 ? { t: 'ms', m: m.m, k: m.k, d: m.d, e, n: m.n, a: m.a, g: m.g } : { t: 'ms', m: m.m, k: m.k, d: m.d, e, n: m.n, a: m.a };
    }
    case 'chat':
      if (!isPlayerId(m.id) || !isStr(m.name, 64) || !isStr(m.text, CHAT_RAW_MAX) || !isInt(m.n)) return null;
      return { t: 'chat', id: m.id, name: m.name, text: m.text, n: m.n, ...(m.m === 1 ? { m: 1 as const } : {}) };
    case 'chatNote': {
      if (!isOneOf(CHAT_NOTE_CODES, m.code)) return null;
      const code = m.code;
      return { t: 'chatNote', code, message: isStr(m.message, 300) ? m.message : CHAT_NOTE_TEXT[code], ...(isNum(m.wait) ? { wait: m.wait } : {}) };
    }
    case 'card': {
      if ((m.k !== 'on' && m.k !== 'solved' && m.k !== 'peeled' && m.k !== 'off') || !isPlayerId(m.id) || !isStr(m.name, 64)) return null;
      const ev: CardEventMsg = { t: 'card', k: m.k, id: m.id, name: m.name };
      if (isStr(m.w, 64)) ev.w = m.w;
      if (isStr(m.ar, 4)) ev.ar = m.ar;
      return ev;
    }
    case 'cards': {
      if (!Array.isArray(m.c)) return null;
      const c: CardsMsg['c'] = [];
      for (const x of m.c) {
        if (!isObj(x) || !isPlayerId(x.id)) continue;
        c.push(isStr(x.w, 64) ? { id: x.id, w: x.w } : { id: x.id });
      }
      return { t: 'cards', c };
    }
    case 'mic':
      return isPlayerId(m.id) && typeof m.on === 'boolean' ? { t: 'mic', id: m.id, on: m.on } : null;
    case 'mics':
      return Array.isArray(m.on) ? { t: 'mics', on: m.on.filter(isPlayerId) } : null;
    case 'sig': {
      if (!isPlayerId(m.from)) return null;
      const body = parseSignalBody(m);
      return body ? { t: 'sig', from: m.from, ...body } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- proximity voice chat (v5)
/*
 * Voice itself never touches the server: browsers send audio to each other over WebRTC. The server
 * only (1) keeps each player's mic state (on = they are willing to send audio) and tells the room,
 * and (2) relays the WebRTC handshake (`sig`) between two players in the same Hub room. Each audio
 * link is one-way, speaker → listener, and the listener starts it (an offer with a receive-only
 * transceiver), so hearing needs no microphone and no permission.
 */
/** Largest `sig` frame the server accepts (bytes). Everything else stays under MAX_MESSAGE_BYTES. */
export const MAX_SIGNAL_BYTES = 8192;
/** Longest SDP (offer or answer) in characters. An audio-only Opus offer is about 1.5–3 KB. */
export const MAX_SDP_LENGTH = 6000;
/** Most ICE candidates in one `sig` message (clients batch them). */
export const MAX_ICE_PER_MSG = 8;
/** Longest ICE candidate line (characters). */
export const MAX_ICE_LENGTH = 512;
/** Link ids (`c`) are positive integers below this. */
export const MAX_SIGNAL_CONN = 2 ** 31;

export const SIGNAL_KINDS = ['offer', 'answer', 'ice', 'bye'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];
/** One ICE candidate: `c` candidate line, `m` sdpMid, `i` sdpMLineIndex. */
export interface IceWire {
  c: string;
  m: string | null;
  i: number | null;
}
/**
 * The handshake of one audio link. `c` is the link id (chosen by the listener, unique among its
 * links); `s` is 1 when the sender is the speaker side of that link, 0 when it is the listener
 * side. `d` is the SDP (offer, answer) or a batch of candidates (ice); a bye has none.
 */
export interface SignalBody {
  c: number;
  s: 0 | 1;
  k: SignalKind;
  d?: string | IceWire[];
}
/** Client → server: my mic is on (willing to send audio) or off. */
export interface MicMsg {
  t: 'mic';
  on: boolean;
}
/** Client → server: relay this to player `to` in my room. */
export type SignalMsg = { t: 'sig'; to: string } & SignalBody;
/** Server → client: player `id`'s mic is on or off (sent to the others; to yourself only when the server overrode you). */
export interface MicEventMsg {
  t: 'mic';
  id: string;
  on: boolean;
}
/** Server → client, right after `welcome`: the players in the room whose mic is on. */
export interface MicsMsg {
  t: 'mics';
  on: string[];
}
/** Server → client: a relayed handshake message; `from` is set by the server. */
export type SignalEventMsg = { t: 'sig'; from: string } & SignalBody;

function parseIce(v: unknown): IceWire | null {
  if (!isObj(v) || !isStr(v.c, MAX_ICE_LENGTH)) return null;
  const m = v.m === null || v.m === undefined ? null : isStr(v.m, 32) ? v.m : undefined;
  const i = v.i === null || v.i === undefined ? null : isInt(v.i) && v.i >= 0 && v.i < 64 ? v.i : undefined;
  return m === undefined || i === undefined ? null : { c: v.c, m, i };
}

/** The shared part of `sig` in both directions; null if any field is malformed or too big. */
export function parseSignalBody(m: Obj): SignalBody | null {
  if (!isInt(m.c) || m.c <= 0 || m.c >= MAX_SIGNAL_CONN || (m.s !== 0 && m.s !== 1) || !isOneOf(SIGNAL_KINDS, m.k)) return null;
  const base = { c: m.c, s: m.s as 0 | 1, k: m.k };
  switch (m.k) {
    case 'offer':
    case 'answer':
      // The listener offers, the speaker answers.
      if (m.s !== (m.k === 'offer' ? 0 : 1) || !isStr(m.d, MAX_SDP_LENGTH) || !m.d.startsWith('v=0')) return null;
      return { ...base, d: m.d };
    case 'ice': {
      if (!Array.isArray(m.d) || m.d.length === 0 || m.d.length > MAX_ICE_PER_MSG) return null;
      const list: IceWire[] = [];
      for (const x of m.d) {
        const c = parseIce(x);
        if (!c) return null;
        list.push(c);
      }
      return { ...base, d: list };
    }
    case 'bye':
      return base;
  }
  return null;
}

/** Every emote id, re-exported for UIs that list them. */
export { EMOTE_IDS };
