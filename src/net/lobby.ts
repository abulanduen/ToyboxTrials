/**
 * Tournament lobbies, client side: the room's lobby list, the "someone is hosting" alert, the
 * lobby you are in, and the actions (host, join, leave, kick, settings, ready, start). The server
 * (server/lobby.ts) validates every action and is the only source of lobby state; this store
 * only shows what it last said. Changes on events only, never per frame.
 *
 * Your lobby and its match are mirrored into the match host by src/minigames/remote.ts.
 */
import { create } from 'zustand';
import { useGame } from '../game/store';
import { sfx } from '../game/audio';
import { exposeDebug } from '../game/debug';
import { netLink } from './link';
import { useNet } from './store';
import { endOnlineMatch, onMatchState, remoteDebug, syncLobby, watchSeat } from '../minigames/remote';
import { useMatch } from '../minigames/session';
import type { LobbiesMsg, LobbyAlertMsg, LobbyErrMsg, LobbySettings, LobbyState, LobbyStateMsg, LobbySummary } from './protocol';

export interface LobbyStore {
  /** Open lobbies in this Hub room. */
  list: LobbySummary[];
  /** The lobby you are in, as the server last described it. */
  current: LobbyState | null;
  you: string | null;
  /** The latest "someone is hosting" alert (the Hub banner shows it for a while). */
  alert: { lobby: LobbySummary; at: number } | null;
  /** The last refusal, in player-facing words. */
  error: string | null;
  /** The Lobbies sheet (HUD button, Pavilion). */
  sheetOpen: boolean;
  /** Waiting for the server to answer a host/join. */
  busy: boolean;
  set: (p: Partial<LobbyStore>) => void;
}

export const useLobby = create<LobbyStore>()((set) => ({
  list: [],
  current: null,
  you: null,
  alert: null,
  error: null,
  sheetOpen: false,
  busy: false,
  set: (p) => set(p),
}));

/** Lobbies need the online Hub: you can host or join only while connected to a room. */
export const lobbiesAvailable = () => useNet.getState().status === 'online';

// ---------------------------------------------------------------- actions
export function hostLobby(settings: LobbySettings) {
  if (!lobbiesAvailable()) return;
  useLobby.getState().set({ error: null, busy: true });
  netLink.send({ t: 'lobby', a: 'create', settings });
}

export function joinLobby(id: string) {
  if (!lobbiesAvailable()) return;
  useLobby.getState().set({ error: null, busy: true, sheetOpen: false });
  netLink.send({ t: 'lobby', a: 'join', id });
}

/** Leave your lobby (and its match: a running trial counts as a forfeit). */
export function leaveLobby() {
  netLink.send({ t: 'lobby', a: 'leave' });
  useLobby.getState().set({ current: null });
  endOnlineMatch();
}

export const kickFromLobby = (id: string) => netLink.send({ t: 'lobby', a: 'kick', id });
export const changeLobby = (settings: Partial<LobbySettings>) => netLink.send({ t: 'lobby', a: 'settings', settings });
export const setLobbyReady = (ready: boolean) => netLink.send({ t: 'lobby', a: 'ready', ready });
export const startLobby = () => netLink.send({ t: 'lobby', a: 'start' });
/** The Lobbies list, as a Hub panel (blocks the toy's controls like the other panels). */
export const openLobbiesSheet = () => {
  useLobby.getState().set({ error: null });
  useGame.getState().openPanel({ kind: 'lobbies', title: 'Lobbies', subtitle: 'Online in this Hub', accent: '#6BA7C8' });
};

// ---------------------------------------------------------------- server messages (from client.ts)
export function onLobbies(m: LobbiesMsg) {
  const s = useLobby.getState();
  // The alert goes once its lobby is gone.
  const alert = s.alert && m.list.some((l) => l.id === s.alert!.lobby.id) ? s.alert : null;
  s.set({ list: m.list, alert });
}

export function onLobbyAlert(m: LobbyAlertMsg) {
  if (useLobby.getState().current) return; // already in a lobby: no banner
  useLobby.getState().set({ alert: { lobby: m.lobby, at: Date.now() } });
  if (useGame.getState().screen === 'playing') sfx.click();
}

const END_TEXT = {
  kicked: { title: 'Removed from the lobby', body: 'The host removed you from that lobby.' },
  closed: { title: 'Lobby closed', body: 'That lobby has closed.' },
};

export function onLobbyState(m: LobbyStateMsg) {
  const s = useLobby.getState();
  if (!m.lobby) {
    const wasIn = !!s.current;
    s.set({ current: null, you: m.you, busy: false });
    if (wasIn && m.reason && m.reason !== 'left') endOnlineMatch(END_TEXT[m.reason]);
    else if (wasIn) endOnlineMatch();
    return;
  }
  s.set({ current: m.lobby, you: m.you, busy: false, error: null, alert: null, sheetOpen: false });
  useGame.getState().closePanel();
  syncLobby(m.lobby, m.you);
}

export function onLobbyErr(m: LobbyErrMsg) {
  useLobby.getState().set({ error: m.message, busy: false });
  useGame.getState().pushTicket({ title: 'Lobby', body: m.message, tone: 'warning' });
}

export { onMatchState };

/** The connection is gone, or we were welcomed into a fresh slot: no lobby any more. */
export function resetLobbies(reason: 'offline' | 'fresh') {
  const wasIn = !!useLobby.getState().current || useMatch.getState().kind === 'online';
  useLobby.getState().set({ list: [], current: null, alert: null, busy: false });
  if (wasIn) endOnlineMatch({ title: 'Left the lobby', body: reason === 'offline' ? 'You are no longer connected to the online Hub.' : 'Your place in the lobby expired.' });
}

exposeDebug({
  lobby: {
    list: () => useLobby.getState().list,
    current: () => useLobby.getState().current,
    you: () => useLobby.getState().you,
    alert: () => useLobby.getState().alert?.lobby ?? null,
    error: () => useLobby.getState().error,
    host: (settings: LobbySettings) => hostLobby(settings),
    join: (id: string) => joinLobby(id),
    leave: () => leaveLobby(),
    kick: (id: string) => kickFromLobby(id),
    settings: (p: Partial<LobbySettings>) => changeLobby(p),
    ready: (on: boolean) => setLobbyReady(on),
    start: () => startLobby(),
    watch: (id: string) => watchSeat(id),
    /** Test servers only (MATCH_DEBUG=1): speed this lobby's match up. */
    timeScale: (k: number, hold?: 'results' | 'final') => netLink.send({ t: 'lobby', a: 'timescale', k, ...(hold ? { hold } : {}) }),
    remote: () => remoteDebug(),
  },
});
