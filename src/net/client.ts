/**
 * Online Hub client: joins a room through the transport, keeps the connection healthy
 * (reconnect with the resume token, silence watchdog), streams the local toy's movement intent,
 * and turns room messages into the net store (roster, status) and remote-player objects
 * (positions, emotes). Gameplay never waits on any of this: offline play is unchanged.
 */
import { dogFromServer, dogOffline, lickCheer, setDogSkew } from '../game/dogVisit';
import { SERVER_URL, OFFLINE_TEXT } from './config';
import { wsTransport, type Transport, type TransportConn } from './transport';
import {
  ERROR_TEXT,
  INTERP_DELAY_MS,
  MOVE_INTERVAL_MS,
  PROTOCOL_VERSION,
  RESUME_WINDOW_MS,
  normalizeRoomCode,
  validateServerMessage,
  type Activity,
  type JoinRequest,
  type Look,
  type ServerMsg,
} from './protocol';
import { useNet } from './store';
import { playRemoteEmote, remotes, upsertRemote } from './remotes';
import { ClockSync, type NetSample } from './interp';
import { useGame } from '../game/store';
import { useMatch } from '../minigames/session';
import { events } from '../game/events';
import { player } from '../game/player';
import { paintIndexOf } from '../game/cosmetics';
import { sfx } from '../game/audio';
import { exposeDebug } from '../game/debug';
import { netLink } from './link';
import { onLobbies, onLobbyAlert, onLobbyErr, onLobbyState, onMatchState, resetLobbies } from './lobby';
import { accountToken } from './account';
import { onHubPlayEvents, onHubPlaySnap, setHubPlayOnline } from '../hubplay/runtime';
import { onCard, onCards, onChat, onChatNote, resetChat, useChat } from './chat';
import { DEBUG } from '../game/debug';
import { installVoice, onVoiceMic, onVoiceMics, onVoiceSignal } from './voiceChat';

/** Give up on a room that hasn't welcomed us by then. */
const WELCOME_TIMEOUT_MS = 12_000;
/** Snapshots arrive 15 times a second; this long without any message means the link is dead. */
const SILENCE_MS = 6_000;
/** A gap this long between two runs of the 66 ms pump timer means the page itself was stalled. */
const STALL_MS = 2_000;
/** Without movement, still send the position this often. */
const KEEPALIVE_MS = 1_000;

/** Server clock estimate, shared with the remote-player renderer. */
export const netClock = new ClockSync();

const transport: Transport | null = SERVER_URL ? wsTransport(SERVER_URL) : null;
let conn: TransportConn | null = null;
/** Bumped for every socket: callbacks from an older socket are ignored. */
let gen = 0;
/** What the current socket asked for. */
let joinReq: JoinRequest | null = null;
/** Set once welcomed: the token that takes our slot back after a drop. */
let session: { resume: string } | null = null;
let lastMsgAt = 0;
/** When the connection dropped (reconnecting), for the RESUME_WINDOW_MS limit. */
let droppedAt = 0;
let retryDelay = 500;
let welcomeTimer: number | undefined;
let retryTimer: number | undefined;
let sent = { x: NaN, y: 0, z: 0, yaw: 0, speed: 0, grounded: true, at: 0 };
let sentActivity: Activity | null | undefined;
let sentLook = '';

export const onlineAvailable = () => transport !== null;

/** What others see: the equipped loadout (never a shop try-on). */
function currentLook(): Look {
  const l = useGame.getState().profile.loadout;
  return { paint: paintIndexOf(l.paint), hat: l.hat, keySkin: l.keySkin, back: l.back, face: l.face, neck: l.neck };
}

function currentActivity(): Activity | null {
  const g = useGame.getState();
  if (g.screen === 'workshop') return g.workshopMode === 'shop' ? 'shop' : 'workshop';
  if (g.screen === 'minigame') return useMatch.getState().gameId;
  return null;
}

function send(msg: Parameters<TransportConn['send']>[0]) {
  conn?.send(msg);
}

// ---------------------------------------------------------------- joining and leaving
/** Join a room. Errors land in the net store (and the online sheet shows them). */
export function joinOnline(req: JoinRequest, auto = false) {
  if (!auto) stayOffline = false; // any join the player picks lifts a Leave
  autoJoining = auto;
  if (!transport) {
    useNet.getState().set({ error: OFFLINE_TEXT });
    return;
  }
  if (useNet.getState().status !== 'offline') leaveOnline(true);
  if (req.kind === 'code') {
    const code = normalizeRoomCode(req.code);
    if (!code) {
      useNet.getState().set({ error: ERROR_TEXT.no_such_room });
      return;
    }
    req = { kind: 'code', code };
  }
  useNet.getState().set({ status: 'connecting', joining: req, error: null, room: null, players: [], selfId: null });
  open(req);
}

const UNREACHABLE = "Couldn't reach the online Hub. Check your connection and try again in a minute.";
const LOST = 'Lost the connection to the online Hub.';

function open(join: JoinRequest, resume?: string) {
  const my = ++gen;
  closeSocket();
  joinReq = join;
  window.clearTimeout(welcomeTimer);
  welcomeTimer = window.setTimeout(() => my === gen && onDrop(), WELCOME_TIMEOUT_MS);
  const c = transport!.connect({
    onMessage: (m) => my === gen && onMessage(m),
    onClose: () => my === gen && onDrop(),
  });
  conn = c;
  lastMsgAt = performance.now();
  const g = useGame.getState();
  c.send({ t: 'hello', v: PROTOCOL_VERSION, name: g.contenderName, look: currentLook(), join, ...(resume ? { resume } : {}) });
}

function closeSocket() {
  const c = conn;
  conn = null;
  c?.close();
}

// ---------------------------------------------------------------- automatic public Hub
/** The player pressed Leave this session: don't pull them back in until they choose to join. */
let stayOffline = false;
/** The join in flight was the automatic one (its failure is quiet and retried a few times). */
let autoJoining = false;
let autoRetries = 0;
let autoRetryTimer = 0;
const AUTO_RETRY_MS = [15_000, 45_000, 120_000];

/**
 * Everyone plays in the public online Hub by default: entering the Hub (from the menu, a deep link
 * or a page load) joins it unless the player turned that off in Settings, pressed Leave this
 * session, or is already joining a room (a #room= link).
 */
export function maybeAutoJoin() {
  const g = useGame.getState();
  if (!transport || stayOffline || !g.autoOnline || g.screen !== 'playing') return;
  if (useNet.getState().status !== 'offline') return;
  joinOnline({ kind: 'public' }, true);
}

/** Leave because the player asked to (Leave buttons): stay offline for the rest of the session. */
export function leaveOnlineByChoice() {
  stayOffline = true;
  window.clearTimeout(autoRetryTimer);
  leaveOnline();
}

/** Leave the room on purpose (Leave button, main menu). */
export function leaveOnline(quiet = false) {
  const wasOnline = useNet.getState().status === 'online';
  send({ t: 'leave' });
  gen++;
  closeSocket();
  reset();
  useNet.getState().set({ status: 'offline', joining: null, room: null, players: [], selfId: null, ...(quiet ? {} : { error: null }) });
  if (wasOnline && !quiet) useGame.getState().pushTicket({ title: 'Left the online Hub', body: 'Back to playing on your own.', tone: 'info' });
}

function reset() {
  resetLobbies('offline');
  resetChat(true);
  window.clearTimeout(welcomeTimer);
  window.clearTimeout(retryTimer);
  session = null;
  joinReq = null;
  remotes.clear();
  netClock.reset();
  sentActivity = undefined;
  sentLook = '';
  sent.x = NaN;
  setHubPlayOnline(false);
  dogOffline();
}

/** Give up: back to offline play, with a message. */
function fail(message: string) {
  const s = useNet.getState();
  const wasIn = s.status === 'online' || s.status === 'reconnecting';
  gen++;
  closeSocket();
  reset();
  const auto = autoJoining && !wasIn;
  autoJoining = false;
  // A failed automatic join stays quiet (no error on screen) and tries again a little later.
  s.set({ status: 'offline', joining: null, room: null, players: [], selfId: null, error: auto ? null : message });
  if (wasIn && !s.sheetOpen) useGame.getState().pushTicket({ title: 'Offline', body: message, tone: 'warning' });
  if (auto && autoRetries < AUTO_RETRY_MS.length) {
    window.clearTimeout(autoRetryTimer);
    autoRetryTimer = window.setTimeout(maybeAutoJoin, AUTO_RETRY_MS[autoRetries++]);
  }
}

/** The socket died (or never answered). */
function onDrop() {
  const s = useNet.getState();
  closeSocket();
  if (s.status === 'connecting') return fail(UNREACHABLE);
  if (s.status === 'online') {
    droppedAt = performance.now();
    retryDelay = 500;
    s.set({ status: 'reconnecting' });
  }
  if (useNet.getState().status !== 'reconnecting' || !session) return;
  if (performance.now() - droppedAt > RESUME_WINDOW_MS) return fail(LOST);
  gen++; // ignore anything more from the dead socket
  window.clearTimeout(retryTimer);
  const target = session;
  retryTimer = window.setTimeout(() => {
    if (useNet.getState().status !== 'reconnecting' || session !== target) return;
    open(joinReq ?? { kind: 'public' }, target.resume);
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 4000);
}

// ---------------------------------------------------------------- messages
/** ?debug only: the last messages this page was sent (not snapshots or match state), for tests. */
const received: string[] = [];

function onMessage(raw: unknown) {
  const msg = validateServerMessage(raw);
  if (!msg) return;
  if (DEBUG && msg.t !== 'snap' && msg.t !== 'ms' && msg.t !== 'play') {
    received.push(JSON.stringify(raw));
    if (received.length > 400) received.splice(0, received.length - 400);
  }
  lastMsgAt = performance.now();
  handlers[msg.t](msg as never);
}

const handlers: { [K in ServerMsg['t']]: (m: Extract<ServerMsg, { t: K }>) => void } = {
  welcome(m) {
    window.clearTimeout(welcomeTimer);
    const s = useNet.getState();
    const fresh = s.status === 'connecting';
    session = { resume: m.resume };
    autoJoining = false;
    autoRetries = 0;
    // If the slot has expired by the time we reconnect, rejoin the same room by code, never re-host.
    if (m.room.kind === 'private' && m.room.code) joinReq = { kind: 'code', code: m.room.code };
    remotes.clear();
    netClock.reset();
    setHubPlayOnline(true);
    // the room's dog: everyone here sees the same one
    setDogSkew(m.now);
    dogFromServer(m.dog);
    // Who wears a card comes next (a `cards` message, only when someone does).
    useChat.getState().set({ cards: {} });
    // A fresh slot (not a resume) has no lobby: leave any lobby screen we were on.
    if (!m.resumed) resetLobbies('fresh');
    // Signed in: link the account so finished lobby matches go on the leaderboard by username.
    const token = accountToken();
    if (token) send({ t: 'auth', token });
    for (const p of m.players) if (p.id !== m.you) upsertRemote(p);
    sentActivity = undefined;
    sentLook = JSON.stringify(m.players.find((p) => p.id === m.you)?.look ?? null);
    s.set({ status: 'online', error: null, room: m.room, selfId: m.you, players: m.players, sheetOpen: false });

    // Stand where the room has us: always on a fresh join, after a reconnect only if far off.
    const far = Math.hypot(player.pos.x - m.spawn.x, player.pos.z - m.spawn.z) > 3;
    const g = useGame.getState();
    if (!m.resumed || far) {
      if (g.screen === 'minigame') g.set({ hubReturn: { x: m.spawn.x, z: m.spawn.z, yaw: m.spawn.yaw } });
      else events.emit('player:teleport', { x: m.spawn.x, z: m.spawn.z, yaw: m.spawn.yaw });
    }
    if (fresh) {
      if (g.screen === 'menu') g.goTo('playing');
      else if (g.paused) g.togglePause(false);
      const where = m.room.kind === 'private' ? `Room ${m.room.code}` : `Public Hub ${m.room.instance}`;
      g.pushTicket({ title: `Joined ${where}`, body: m.room.kind === 'private' ? 'Share the code so friends can join.' : g.touchUI ? 'Say hi with the Emote button.' : 'Say hi with the emotes (keys 1–4).', tone: 'reward' });
    }
  },
  joined(m) {
    upsertRemote(m.player);
    const s = useNet.getState();
    s.set({ players: [...s.players.filter((p) => p.id !== m.player.id), m.player] });
  },
  left(m) {
    remotes.delete(m.id);
    const s = useNet.getState();
    s.set({ players: s.players.filter((p) => p.id !== m.id) });
  },
  room(m) {
    useNet.getState().set({ room: m.room });
  },
  dog(m) {
    if (dogFromServer(m.c, m.k && m.by ? { k: m.k, by: m.by } : undefined, useNet.getState().selfId)) lickCheer();
  },
  snap(m) {
    netClock.update(m.now, performance.now());
    const self = useNet.getState().selfId;
    const now = performance.now();
    for (const p of m.p) {
      if (p.id === self) continue;
      const r = remotes.get(p.id);
      if (!r) continue;
      r.buf.push({ t: m.now, x: p.x, y: p.y, z: p.z, yaw: p.r, speed: p.s, grounded: p.g === 1 });
      if (p.es !== r.emoteSeq) {
        r.emoteSeq = p.es;
        // Late joiners see an emote already in progress; one just started by an `emote` event isn't restarted.
        if (p.e && !(r.lastEmote && now - r.lastEmote.at < 1000)) playRemoteEmote(r, p.e);
      }
      r.activity = p.a;
      r.off = p.off === 1;
    }
    if (m.hp) onHubPlaySnap(m.now, m.hp);
  },
  emote(m) {
    const r = remotes.get(m.id);
    if (!r) return;
    r.emoteEvents++;
    playRemoteEmote(r, m.emote);
    const at = r.buf.latest();
    const d = at ? Math.hypot(at.x - player.pos.x, at.z - player.pos.z) : 99;
    if (useGame.getState().screen === 'playing') sfx.emote(m.emote, 0.8 * (1 - d / 45));
  },
  look(m) {
    const s = useNet.getState();
    const players = s.players.map((p) => (p.id === m.id ? { ...p, look: m.look } : p));
    s.set({ players });
    const r = remotes.get(m.id);
    if (r) r.info = { ...r.info, look: m.look };
  },
  error(m) {
    if (m.fatal) fail(m.message || ERROR_TEXT[m.code]);
  },
  lobbies: onLobbies,
  lobbyAlert: onLobbyAlert,
  lobby: onLobbyState,
  lobbyErr: onLobbyErr,
  ms: onMatchState,
  play: (m) => onHubPlayEvents(m.e),
  chat: onChat,
  chatNote: onChatNote,
  card: onCard,
  cards: onCards,
  // proximity voice chat (v6)
  mic: onVoiceMic,
  mics: onVoiceMics,
  sig: onVoiceSignal,
};

// ---------------------------------------------------------------- outgoing intent
/** When pump last ran: a long gap means this page was stalled, not that the server went quiet. */
let lastPumpAt = 0;

function pump() {
  const now = performance.now();
  const stalled = now - lastPumpAt > STALL_MS;
  lastPumpAt = now;
  if (useNet.getState().status !== 'online' || !conn) return;
  // Our own thread was blocked (a long shader compile, a background tab): messages that arrived
  // meanwhile are still queued behind this timer, so give them a moment before calling it silence.
  if (stalled) lastMsgAt = Math.max(lastMsgAt, now - SILENCE_MS / 2);
  if (now - lastMsgAt > SILENCE_MS) return onDrop();
  const activity = currentActivity();
  if (activity !== sentActivity) {
    send({ t: 'activity', a: activity });
    sentActivity = activity;
  }
  const look = currentLook();
  const lookKey = JSON.stringify(look);
  if (lookKey !== sentLook) {
    send({ t: 'look', look });
    sentLook = lookKey;
  }
  const screen = useGame.getState().screen;
  if (screen !== 'playing' && screen !== 'workshop') return; // in a minigame the hub toy stands still
  const p = player.pos;
  const changed =
    Number.isNaN(sent.x) ||
    Math.abs(p.x - sent.x) > 0.01 ||
    Math.abs(p.y - sent.y) > 0.01 ||
    Math.abs(p.z - sent.z) > 0.01 ||
    Math.abs(player.yaw - sent.yaw) > 0.01 ||
    Math.abs(player.speed - sent.speed) > 0.2 ||
    player.grounded !== sent.grounded;
  if (!changed && now - sent.at < KEEPALIVE_MS) return;
  if (![p.x, p.y, p.z, player.yaw, player.speed].every(Number.isFinite)) return;
  send({ t: 'move', x: p.x, y: p.y, z: p.z, yaw: player.yaw, grounded: player.grounded, speed: player.speed });
  sent = { x: p.x, y: p.y, z: p.z, yaw: player.yaw, speed: player.speed, grounded: player.grounded, at: now };
}

/** Where a remote toy should be drawn now (shared by the renderer and the debug hook). */
export function sampleRemote(id: string, out: NetSample): NetSample | null {
  const r = remotes.get(id);
  const t = netClock.serverTime(performance.now());
  if (!r || t === null) return null;
  return r.buf.sample(t - INTERP_DELAY_MS, out);
}

// ---------------------------------------------------------------- install
let installed = false;
/** Start the online client's loops and listeners (once, from App). */
export function installNet() {
  if (installed) return;
  installed = true;
  installVoice();
  netLink.send = (msg) => {
    if (useNet.getState().status === 'online') send(msg);
  };
  netLink.serverTime = () => netClock.serverTime(performance.now());
  window.setInterval(pump, MOVE_INTERVAL_MS);
  events.on('player:emote', ({ id }) => {
    if (useNet.getState().status === 'online') send({ t: 'emote', id });
  });
  // Going back to the main menu leaves the online room.
  useGame.subscribe((s, p) => {
    if (s.screen === 'menu' && p.screen !== 'menu' && useNet.getState().status !== 'offline') leaveOnline();
    // Entering the Hub joins the public online Hub (see maybeAutoJoin); so does switching it on.
    if ((s.screen === 'playing' && p.screen !== 'playing') || (s.autoOnline && !p.autoOnline)) maybeAutoJoin();
  });
  // A page that opens straight into the Hub (#play): join once the start-up hash handling has run.
  window.setTimeout(maybeAutoJoin, 400);
  window.addEventListener('pagehide', () => {
    if (useNet.getState().status !== 'offline') send({ t: 'leave' });
  });

  const tmp: NetSample = { t: 0, x: 0, y: 0, z: 0, yaw: 0, speed: 0, grounded: true };
  exposeDebug({
    net: {
      available: onlineAvailable,
      serverUrl: () => SERVER_URL,
      status: () => useNet.getState().status,
      error: () => useNet.getState().error,
      room: () => useNet.getState().room,
      selfId: () => useNet.getState().selfId,
      players: () => useNet.getState().players.map((p) => p.name),
      remotes: () =>
        [...remotes.values()].map((r) => {
          const s = sampleRemote(r.info.id, tmp);
          return {
            id: r.info.id,
            name: r.info.name,
            look: r.info.look,
            x: s?.x ?? null,
            z: s?.z ?? null,
            speed: s?.speed ?? null,
            activity: r.activity,
            off: r.off,
            anim: { emote: r.anim.emote, emoteT: r.anim.emoteT, speed: r.anim.speed },
            lastEmote: r.lastEmote?.emote ?? null,
            emoteEvents: r.emoteEvents,
          };
        }),
      /** Raw messages received (not snapshots, match state or hub play), newest last. */
      received: () => received.slice(),
      chat: () => {
        const c = useChat.getState();
        return { open: c.open, lines: c.lines.map((l) => ({ id: l.id, name: l.name, text: l.text, kind: l.kind, masked: !!l.masked })), cards: c.cards, muted: c.muted, unread: c.unread };
      },
      /** Simulate a dropped connection (no leave message): the client should resume. */
      drop: () => {
        closeSocket();
        onDrop();
      },
    },
  });
}
