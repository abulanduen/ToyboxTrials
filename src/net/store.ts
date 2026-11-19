/**
 * Online state the UI shows: connection status, room, roster, errors. Changes only on events
 * (join, leave, reconnect), never per frame: positions live in plain objects (remotes.ts).
 */
import { create } from 'zustand';
import type { JoinRequest, PlayerInfo, RoomInfo } from './protocol';

export type NetStatus = 'offline' | 'connecting' | 'online' | 'reconnecting';

export interface NetState {
  status: NetStatus;
  /** What the player asked for (shown while connecting). */
  joining: JoinRequest | null;
  /** Last error, in player-facing words; cleared on the next attempt. */
  error: string | null;
  room: RoomInfo | null;
  selfId: string | null;
  /** Everyone in the room, including this player, in join order. */
  players: PlayerInfo[];
  /** Online sheet open (main menu, pause menu or a deep link). */
  sheetOpen: boolean;
  set: (patch: Partial<NetState>) => void;
}

export const useNet = create<NetState>()((set) => ({
  status: 'offline',
  joining: null,
  error: null,
  room: null,
  selfId: null,
  players: [],
  sheetOpen: false,
  set: (patch) => set(patch),
}));

/** Shareable link that joins a private room. */
export function roomLink(code: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#room=${code}`;
}
