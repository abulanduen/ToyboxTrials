/**
 * Remote players' live state, in plain mutable objects the frame loop reads (no React state per
 * frame). The roster (who is here) is mirrored in the net store; this map holds the moving parts.
 */
import { createToyAnim, startEmote, type ToyAnim } from '../character/anim';
import type { EmoteId } from '../game/emotes';
import { SnapshotBuffer } from './interp';
import type { Activity, PlayerInfo } from './protocol';
import type { RideKind } from '../game/hubRides';

export interface RemotePlayer {
  info: PlayerInfo;
  buf: SnapshotBuffer;
  /** Animation state of this player's toy (written by the net client and RemotePlayers). */
  anim: ToyAnim;
  /** Last emote sequence number seen, so a snapshot doesn't restart an emote already playing. */
  emoteSeq: number;
  activity: Activity | null;
  /** Connection lost; the room is holding their slot. */
  off: boolean;
  /** Last emote received (for tests and the debug hook). */
  lastEmote: { emote: EmoteId; at: number } | null;
  /** Emote messages received from this player (debug hook). */
  emoteEvents: number;
  /** On a ride between the levels: which, and when it boarded (server clock, seconds). */
  ride: { kind: RideKind; t0: number } | null;
}

export const remotes = new Map<string, RemotePlayer>();

/** Name-tag elements by player id (rendered by NameTags in the overlay, positioned by RemotePlayers). */
export const nameTagEls = new Map<string, HTMLElement>();

export function upsertRemote(info: PlayerInfo): RemotePlayer {
  const r = remotes.get(info.id);
  if (r) {
    r.info = info;
    return r;
  }
  const fresh: RemotePlayer = { info, buf: new SnapshotBuffer(), anim: createToyAnim(), emoteSeq: -1, activity: null, off: false, lastEmote: null, emoteEvents: 0, ride: null };
  remotes.set(info.id, fresh);
  return fresh;
}

export function playRemoteEmote(r: RemotePlayer, emote: EmoteId) {
  startEmote(r.anim, emote);
  r.lastEmote = { emote, at: performance.now() };
}
