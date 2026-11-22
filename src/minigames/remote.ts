/**
 * The remote side of the shared match host: an online lobby match, run by the server.
 *
 * The lobby's state (src/net/lobby.ts) says which phase the match is in; this module mirrors it
 * into the same `useMatch` store the local host uses, so MatchStage and the game's own Scene and
 * Hud render it unchanged. Through `remoteHost` (session.ts):
 *   - `getState()` returns the latest server state (patched from keyframes, see src/net/delta.ts),
 *     with its clock `t` advanced smoothly between snapshots so animations and the rhythm song
 *     clock run at frame rate;
 *   - the frame tick reads local input with the game's own `readLocalInput` and sends it to the
 *     server instead of to the local rules (flushed MATCH_TICK_HZ times a second).
 * Rules events arrive with the snapshots and are re-broadcast on `matchBus`, as locally.
 *
 * Own-toy prediction (games with `predictLocal`, e.g. Toybox Siege): every input message is numbered
 * (`q`) and the server says which one its rules have stepped (`a`). Each rendered frame's inputs are
 * kept until then, and the game replays the unstepped ones on the newest server state, so your toy
 * moves the moment you press instead of a round trip later. With a server that sends no `a` (older
 * build) nothing is predicted.
 *
 * Nothing here decides anything: placements, standings and results come from the server.
 */
import { useGame } from '../game/store';
import { HUB_BINDINGS, clearInput, getPressLog, setBindings } from '../game/input';
import { sfx } from '../game/audio';
import { PAINT_JOBS } from '../game/palette';
import { applyPatch } from '../net/delta';
import { netLink } from '../net/link';
import { INPUT_FLUSH_MS, MAX_INPUTS_PER_MSG, MAX_MESSAGE_BYTES, type LobbyMember, type LobbyState, type MatchSeat, type MatchStateMsg } from '../net/protocol';
import { GAME_FACTS } from './facts';
import { gameById } from './registry';
import { LOCAL_ID, enterMinigameScreen, matchBus, quitMatch, remoteHost, useMatch, type MatchPhase } from './session';
import type { Contestant, MinigameId, PredictFrame } from './types';
import type { HatId, KeySkinId } from '../game/cosmetics';

type Obj = Record<string, unknown>;

/** How far past the newest snapshot the shown clock may run (ms of real time). */
const MAX_AHEAD_MS = 120;
/** Most unstepped frames kept for prediction (about 2 s at 60 fps; older ones are dropped). */
const MAX_PREDICT_FRAMES = 120;

const rt = {
  /** Match sequence of the state we hold. */
  stateSeq: -1,
  state: null as Obj | null,
  display: null as Obj | null,
  recvAt: 0,
  snapT: 0,
  shownT: 0,
  timeScale: 1,
  pending: [] as unknown[],
  lastFlush: 0,
  /** Lobby match sequence and phase last mirrored. */
  seq: -1,
  phase: '' as string,
  loading: null as MinigameId | null,
  bound: -1,
  seated: false,
  countdownEndsAt: 0,
  lastCount: 4,
  /** Spectators: whose view to follow (null: the server's default). */
  watch: null as string | null,
  you: '',
  /** Input messages sent this match (the next one is numbered q + 1), and the newest the server has stepped (−1: unknown). */
  q: 0,
  ack: -1,
  /** This match's rendered frames of input the server has not stepped yet, each tagged with the message it goes out in. */
  frames: [] as (PredictFrame & { q: number })[],
};

remoteHost.getState = () => rt.display;
remoteHost.tick = tickRemote;
// A seated player viewing another board from a game's player rail (spectators use watchSeat).
remoteHost.follow = (id) => {
  if (!rt.seated || !rt.you) return;
  netLink.send({ t: 'lobby', a: 'watch', id: id ?? rt.you });
};

export const remoteDebug = () => ({ stateSeq: rt.stateSeq, seated: rt.seated, watch: rt.watch, pendingInputs: rt.pending.length, hasState: !!rt.state, sent: rt.q, ack: rt.ack, unstepped: rt.frames.length });
/** Test hook: the newest server state and the state being drawn (with own-toy prediction). */
export const remoteStates = () => ({ server: rt.state, shown: rt.display });

/** A lobby member or match seat as the local host's Contestant. */
function contestant(p: { id: string; name: string; look: MatchSeat['look'] }, you: string, bot: MatchSeat['bot'] = null): Contestant {
  return {
    id: p.id,
    name: p.name,
    paint: PAINT_JOBS[p.look.paint] ?? PAINT_JOBS[0],
    hat: p.look.hat as HatId,
    keySkin: p.look.keySkin as KeySkinId,
    accessories: { back: p.look.back, face: p.look.face, neck: p.look.neck } as Contestant['accessories'],
    isLocal: p.id === you,
    ...(bot ? { bot } : {}),
  };
}

const membersAsContestants = (members: LobbyMember[], you: string) => members.map((m) => contestant(m, you));

function resetState() {
  rt.state = null;
  rt.display = null;
  rt.stateSeq = -1;
  rt.pending = [];
  rt.q = 0;
  rt.ack = -1;
  rt.frames = [];
}

/** What the game draws: the newest server state on the shown clock, with the local toy's own movement replayed when the game predicts. */
function rebuildDisplay() {
  if (!rt.state) return;
  const shown = { ...rt.state, t: rt.display ? rt.display.t : rt.snapT };
  const m = useMatch.getState();
  const predict = m.module?.predictLocal;
  const predicted = predict && rt.seated && rt.ack >= 0 && m.phase === 'playing' ? predict(shown, rt.you, rt.frames) : null;
  rt.display = (predicted as Obj | null) ?? shown;
}

/** Leave online play's match screen (left, kicked, closed, or the connection is gone). */
export function endOnlineMatch(message?: { title: string; body: string }) {
  if (!remoteHost.active && useMatch.getState().kind !== 'online') return;
  remoteHost.active = false;
  resetState();
  rt.seq = -1;
  rt.phase = '';
  rt.bound = -1;
  rt.watch = null;
  if (useGame.getState().screen === 'minigame') quitMatch();
  else setBindings(HUB_BINDINGS);
  useMatch.getState().set({ localId: LOCAL_ID, kind: null, phase: 'idle' });
  if (message) useGame.getState().pushTicket({ ...message, tone: 'warning' });
}

/** Mirror the lobby (and its match, if one is running) into the match host. */
export function syncLobby(lobby: LobbyState, you: string) {
  const m = useMatch.getState();
  rt.you = you;
  if (!remoteHost.active || m.kind !== 'online') {
    // Into the lobby screen (from the Hub, a gate's intro card or the Pavilion).
    remoteHost.active = true;
    resetState();
    rt.seq = -1;
    rt.phase = '';
    enterMinigameScreen();
    setBindings(HUB_BINDINGS);
    clearInput();
    m.set({ kind: 'online', phase: 'lobby', gameId: null, module: null, tournament: null, lastResult: null, paused: false, error: null, localId: you, contestants: membersAsContestants(lobby.members, you) });
  }
  const match = lobby.match;
  if (!match) {
    if (rt.phase !== 'lobby') {
      if (rt.bound !== -1) setBindings(HUB_BINDINGS);
      rt.bound = -1;
      resetState();
      rt.seq = -1;
    }
    rt.phase = 'lobby';
    useMatch.getState().set({ phase: 'lobby', gameId: null, module: null, localId: you, paused: false, contestants: membersAsContestants(lobby.members, you) });
    return;
  }

  const me = lobby.members.find((x) => x.id === you);
  rt.seated = !!me && !me.spectating && match.seats.some((s) => s.id === you);
  rt.timeScale = match.timeScale || 1;
  if (match.seq !== rt.seq) {
    rt.seq = match.seq;
    if (rt.stateSeq !== match.seq) resetState();
    rt.lastCount = 4;
  }
  // Load the trial's module (code-split) as soon as it is revealed.
  if (m.gameId !== match.game || (!m.module && rt.loading !== match.game)) loadModule(match.game);

  const firstHuman = match.seats.find((s) => !s.bot)?.id ?? match.seats[0]?.id ?? you;
  const watched = rt.watch && match.seats.some((s) => s.id === rt.watch) ? rt.watch : firstHuman;
  const localId = rt.seated ? you : watched;
  const contestants = match.seats.map((s) => contestant(s, rt.seated ? you : '', s.bot));
  const phase: MatchPhase = match.phase;
  const t = match.tournament;
  useMatch.getState().set({
    phase,
    localId,
    contestants,
    tournament: t ? { format: t.format, seed: 0, games: t.games, round: t.round, standings: t.standings } : null,
    lastResult: match.result ? { minigame: match.game, placements: match.result.placements, durationMs: match.result.durationMs } : null,
  });
  if (phase === 'countdown' && rt.phase !== 'countdown') rt.countdownEndsAt = match.endsAt ?? 0;
  if (phase === 'playing' && rt.phase !== 'playing' && rt.lastCount !== 0) {
    rt.lastCount = 0;
    matchBus.emit('countdown', { n: 0 });
    sfx.bell();
  }
  rt.phase = phase;
  bindForPhase();
}

/** Game keys while this player is in the trial; Hub keys otherwise. */
function bindForPhase() {
  const m = useMatch.getState();
  const inPlay = (m.phase === 'countdown' || m.phase === 'playing') && rt.seated && m.module;
  if (inPlay && rt.bound !== rt.seq) {
    setBindings(m.module!.bindings);
    clearInput();
    rt.bound = rt.seq;
  } else if (!inPlay && rt.bound !== -1) {
    setBindings(HUB_BINDINGS);
    clearInput();
    rt.bound = -1;
  }
}

function loadModule(id: MinigameId) {
  const def = gameById(id);
  rt.loading = id;
  useMatch.getState().set({ gameId: id, module: null });
  if (!def.load) return;
  def.load().then(
    (mod) => {
      if (rt.loading !== id || useMatch.getState().kind !== 'online') return;
      rt.loading = null;
      useMatch.getState().set({ module: mod });
      bindForPhase();
    },
    (e: Error) => useMatch.getState().set({ error: e.message }),
  );
}

/** A server snapshot: a keyframe, or a patch on the last one. Events go out on the match bus. */
export function onMatchState(msg: MatchStateMsg) {
  if (!remoteHost.active) return;
  try {
    if (msg.k === 1) {
      rt.state = msg.d as Obj;
      rt.stateSeq = msg.m;
      rt.shownT = Number((rt.state as { t?: number }).t) || 0;
    } else if (rt.state && msg.m === rt.stateSeq) {
      rt.state = applyPatch(rt.state, msg.d) as Obj;
    } else return;
  } catch {
    return;
  }
  rt.recvAt = performance.now();
  rt.snapT = Number(rt.state.t) || 0;
  if (typeof msg.a === 'number') {
    rt.ack = msg.a;
    let drop = 0;
    while (drop < rt.frames.length && rt.frames[drop].q <= msg.a) drop++;
    if (drop) rt.frames.splice(0, drop);
  }
  rt.display = { ...rt.state, t: Math.max(rt.snapT, Math.min(rt.shownT, rt.snapT + MAX_AHEAD_MS * rt.timeScale)) };
  rebuildDisplay();
  for (const e of msg.e) matchBus.emit('event', e);
}

/** Spectators: follow another player's view. */
export function watchSeat(id: string) {
  rt.watch = id;
  netLink.send({ t: 'lobby', a: 'watch', id });
}

/** Called every rendered frame while an online match screen is up (session.tickMatch). */
function tickRemote(dtRealMs: number) {
  const m = useMatch.getState();
  const now = performance.now();

  // Countdown numbers from the server's deadline (same sounds as the local host).
  if (m.phase === 'countdown' && rt.countdownEndsAt) {
    const st = netLink.serverTime();
    if (st !== null) {
      const left = Math.max(0, (rt.countdownEndsAt - st) * rt.timeScale);
      const n = Math.min(3, Math.ceil(left / 1000));
      if (n !== rt.lastCount && n > 0) {
        rt.lastCount = n;
        matchBus.emit('countdown', { n });
        sfx.click();
      }
    }
  }

  // The shown clock runs on between snapshots, never backwards, never far past the newest one.
  if (rt.display && rt.state) {
    if (m.phase === 'playing') {
      const target = rt.snapT + Math.min(now - rt.recvAt, MAX_AHEAD_MS) * rt.timeScale;
      if (target > rt.shownT) rt.shownT = Math.min(target, rt.shownT + Math.max(dtRealMs, 1) * rt.timeScale * 2);
      if (rt.shownT < rt.snapT - 250) rt.shownT = rt.snapT;
      rt.display.t = rt.shownT;
    } else rt.display.t = rt.snapT;
  }

  // Input: the game's own adapter, sent to the server instead of the local rules.
  if (m.phase !== 'playing' || !rt.seated || !m.module || m.paused || !rt.state) {
    rt.pending = [];
    rt.frames.length = 0;
    return;
  }
  const fresh = m.module.readLocalInput(getPressLog());
  for (const i of fresh) rt.pending.push(i);
  if (m.module.predictLocal) {
    // This frame goes out in the next message (q + 1); the replay covers it until the server has stepped that one.
    rt.frames.push({ q: rt.q + 1, dt: Math.min(Math.max(dtRealMs, 0), 100) * rt.timeScale, inputs: fresh });
    if (rt.frames.length > MAX_PREDICT_FRAMES) rt.frames.shift();
    rebuildDisplay();
  }
  if (now - rt.lastFlush < INPUT_FLUSH_MS) return;
  rt.lastFlush = now;
  const held = !!(m.gameId && GAME_FACTS[m.gameId]?.heldInputs);
  // A predicting game sends a (possibly empty) message every flush, so the server's `a` keeps up
  // and the replay never covers more than a round trip of frames.
  if (!rt.pending.length && !held && !m.module.predictLocal) return;
  // Every input in order (a repeated press is two presses); at most the newest MAX_INPUTS_PER_MSG.
  const items = rt.pending.slice(-MAX_INPUTS_PER_MSG);
  rt.pending = [];
  // Stay well inside the server's frame limit (a slow frame can queue a lot of stick samples).
  while (items.length > 1 && JSON.stringify(items).length > MAX_MESSAGE_BYTES - 200) items.shift();
  rt.q++;
  netLink.send({ t: 'in', m: rt.stateSeq, i: items, q: rt.q });
}
