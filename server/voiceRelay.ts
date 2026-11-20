/**
 * Proximity voice chat, server side: who has their mic on, and the WebRTC handshake relay between
 * two players of one Hub room. One VoiceRelay per HubRoom (hubRoom.ts calls it and turns its
 * answers into messages). Audio itself never passes through the server: browsers connect to each
 * other (src/net/voiceChat.ts).
 *
 * Pure and deterministic like the room: no sockets, timers or wall clock; `now` (ms) is passed in.
 * Unit-tested in tests/unit/voice-chat.test.ts.
 *
 * What is checked before a `sig` is relayed (anything else is dropped silently and counted):
 *   - both players are in this room (ids are per room, so a link can never cross rooms), the
 *     target is not the sender, and both are connected (not a held slot);
 *   - both are walking the Hub (voice is Hub-only: not in a trial, the Workshop or the shop);
 *   - an offer only goes to a player whose mic is on, and only a player whose mic is on answers;
 *   - the sender is within its signalling budget (token bucket, below).
 * The message shape and sizes were checked by the protocol parser (src/net/protocol.ts).
 */
import { RateLimiter } from './limits';
import type { SignalBody } from '../src/net/protocol';

/** Signalling budget per player: a burst of this many messages… */
export const SIGNAL_BURST = 80;
/** …refilled at this many a second. A listener's 6 links and a speaker's 8 need far less. */
export const SIGNAL_PER_SECOND = 25;
/** Mic changes per player: a burst of this many… */
export const MIC_BURST = 6;
/** …refilled at this many a second (push-to-talk doesn't change the mic state, so this is plenty). */
export const MIC_PER_SECOND = 1;

/** What the relay needs to know about a player (from the room). */
export interface VoicePeerView {
  id: string;
  /** Connected now (not a held slot). */
  connected: boolean;
  /** Walking the Hub (no activity). */
  inHub: boolean;
}

export type SignalVerdict =
  | { ok: true }
  | { ok: false; why: 'no_target' | 'self' | 'offline' | 'not_in_hub' | 'mic_off' | 'rate' };

export type MicVerdict =
  /** Accepted; `changed` when it differs from before (tell the others). */
  | { ok: true; changed: boolean }
  /** Refused (rate limit, or turning on outside the Hub): tell the sender the real state. */
  | { ok: false; on: boolean };

interface Budget {
  sig: RateLimiter;
  mic: RateLimiter;
}

export class VoiceRelay {
  private readonly on = new Set<string>();
  private readonly budgets = new Map<string, Budget>();
  /** Diagnostics (and tests): relayed and refused `sig` messages. */
  readonly stats = { relayed: 0, refused: 0 };

  isOn(id: string): boolean {
    return this.on.has(id);
  }

  /** Ids with their mic on, in the order they turned it on. */
  list(): string[] {
    return [...this.on];
  }

  private budget(id: string, now: number): Budget {
    let b = this.budgets.get(id);
    if (!b) {
      b = { sig: new RateLimiter(SIGNAL_BURST, SIGNAL_PER_SECOND, now), mic: new RateLimiter(MIC_BURST, MIC_PER_SECOND, now) };
      this.budgets.set(id, b);
    }
    return b;
  }

  /** A player asks to turn their mic on or off. */
  setMic(p: VoicePeerView, on: boolean, now: number): MicVerdict {
    const was = this.on.has(p.id);
    if (!this.budget(p.id, now).mic.take(now)) return { ok: false, on: was };
    if (on && !(p.inHub && p.connected)) return { ok: false, on: was };
    if (on) this.on.add(p.id);
    else this.on.delete(p.id);
    return { ok: true, changed: on !== was };
  }

  /**
   * The room turns a mic off by itself (the player disconnected, left, or went into a trial, the
   * Workshop or the shop). True if it was on, so the others need telling.
   */
  forceOff(id: string): boolean {
    return this.on.delete(id);
  }

  /** The player is gone for good: forget them. */
  remove(id: string) {
    this.on.delete(id);
    this.budgets.delete(id);
  }

  clear() {
    this.on.clear();
    this.budgets.clear();
  }

  /** May `from` send this handshake message to `to`? (`to` is null when no such player is in this room.) */
  checkSignal(from: VoicePeerView, to: VoicePeerView | null, body: SignalBody, now: number): SignalVerdict {
    const v = this.verdict(from, to, body, now);
    if (v.ok) this.stats.relayed++;
    else this.stats.refused++;
    return v;
  }

  private verdict(from: VoicePeerView, to: VoicePeerView | null, body: SignalBody, now: number): SignalVerdict {
    if (!to) return { ok: false, why: 'no_target' };
    if (to.id === from.id) return { ok: false, why: 'self' };
    if (!from.connected || !to.connected) return { ok: false, why: 'offline' };
    // A bye always gets through between two connected players (it only ever closes a link).
    if (body.k !== 'bye') {
      if (!from.inHub || !to.inHub) return { ok: false, why: 'not_in_hub' };
      if (body.k === 'offer' && !this.on.has(to.id)) return { ok: false, why: 'mic_off' };
      if (body.k === 'answer' && !this.on.has(from.id)) return { ok: false, why: 'mic_off' };
    }
    if (!this.budget(from.id, now).sig.take(now)) return { ok: false, why: 'rate' };
    return { ok: true };
  }
}
