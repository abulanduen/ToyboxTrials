/**
 * Proximity voice chat, the pure part: who should hear whom, and how loud and from which side.
 * No DOM, no WebRTC: src/net/voiceChat.ts feeds it positions (from remotes.ts) and applies the
 * answers. Unit-tested in tests/unit/voice-chat.test.ts.
 *
 * Links are one-way (speaker → listener) and the listener asks for them, so each side decides
 * separately:
 *   - a listener connects to speakers (mic on, in the Hub, not muted) that come within
 *     VOICE_CONNECT_CM and lets them go beyond VOICE_DISCONNECT_CM (hysteresis, so a speaker at the
 *     edge doesn't flap), keeping the nearest MAX_SPEAKERS_PER_LISTENER;
 *   - a speaker accepts the nearest MAX_LISTENERS_PER_SPEAKER listeners within
 *     VOICE_DISCONNECT_CM + LISTENER_SLACK_CM (the two sides see each other ~100 ms apart, so the
 *     speaker is a little more generous than the listener).
 * Units are table centimetres (the Hub's spawn mat is about 136 × 82).
 */

/** A listener connects to a speaker that comes this close (cm). */
export const VOICE_CONNECT_CM = 45;
/** …and disconnects once they are further than this (cm). Voices are silent from here on. */
export const VOICE_DISCONNECT_CM = 60;
/** Voices are at full volume this close (cm). */
export const VOICE_FULL_CM = 12;
/** Extra distance a speaker allows before dropping a listener (cm). */
export const LISTENER_SLACK_CM = 15;
/** The most speakers one listener hears at once (the nearest). */
export const MAX_SPEAKERS_PER_LISTENER = 6;
/** The most listeners one speaker sends to at once (the nearest). */
export const MAX_LISTENERS_PER_SPEAKER = 8;
/** Current links sort as if this much nearer, so two speakers at about the same distance don't swap places back and forth. */
const KEEP_BONUS_CM = 4;

export interface Point {
  x: number;
  z: number;
}

/** Another player as the planner sees them. */
export interface VoiceCandidate extends Point {
  id: string;
  /** Their mic is on (the server says so). */
  micOn: boolean;
  /** Walking the Hub (not in a trial, the Workshop or the shop) and connected. */
  inHub: boolean;
}

export interface ListenerOptions {
  /** "Hear voice chat" is on (and we are in the Hub, online). False → no links at all. */
  hearing: boolean;
  /** Players this listener muted. */
  muted: ReadonlySet<string>;
  /** Players not to ask right now (a recent refusal or failure: backing off). */
  blocked?: ReadonlySet<string>;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * The speakers this listener should be connected to, nearest first. `current` are the speakers it
 * is connected (or connecting) to now: they stay until VOICE_DISCONNECT_CM; others must come within
 * VOICE_CONNECT_CM.
 */
export function planSpeakers(self: Point, others: readonly VoiceCandidate[], current: ReadonlySet<string>, opts: ListenerOptions): string[] {
  if (!opts.hearing) return [];
  const pick: { id: string; key: number }[] = [];
  for (const o of others) {
    if (!o.micOn || !o.inHub || opts.muted.has(o.id)) continue;
    const kept = current.has(o.id);
    if (!kept && opts.blocked?.has(o.id)) continue;
    const d = dist(self, o);
    if (!Number.isFinite(d) || d > (kept ? VOICE_DISCONNECT_CM : VOICE_CONNECT_CM)) continue;
    pick.push({ id: o.id, key: kept ? d - KEEP_BONUS_CM : d });
  }
  pick.sort((a, b) => a.key - b.key || (a.id < b.id ? -1 : 1));
  return pick.slice(0, MAX_SPEAKERS_PER_LISTENER).map((p) => p.id);
}

/**
 * The listeners this speaker keeps sending to, nearest first: of `wanting` (the listeners connected
 * or asking now), the nearest MAX_LISTENERS_PER_SPEAKER within reach. Unknown ids (no position) are
 * dropped. Empty when the speaker's mic is off.
 */
export function planListeners(self: Point, micOn: boolean, wanting: readonly string[], where: ReadonlyMap<string, Point & { inHub: boolean }>): string[] {
  if (!micOn) return [];
  const pick: { id: string; d: number }[] = [];
  for (const id of new Set(wanting)) {
    const o = where.get(id);
    if (!o || !o.inHub) continue;
    const d = dist(self, o);
    if (!Number.isFinite(d) || d > VOICE_DISCONNECT_CM + LISTENER_SLACK_CM) continue;
    pick.push({ id, d });
  }
  pick.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
  return pick.slice(0, MAX_LISTENERS_PER_SPEAKER).map((p) => p.id);
}

/** Loudness of a voice at distance `d` (cm): 1 up to VOICE_FULL_CM, easing down to 0 at VOICE_DISCONNECT_CM. */
export function proximityGain(d: number): number {
  if (!Number.isFinite(d) || d >= VOICE_DISCONNECT_CM) return 0;
  if (d <= VOICE_FULL_CM) return 1;
  const t = (d - VOICE_FULL_CM) / (VOICE_DISCONNECT_CM - VOICE_FULL_CM);
  // smooth, and a little quicker than linear at first so "near" really sounds near
  const s = 1 - t * t * (3 - 2 * t);
  return s * s;
}

/**
 * Stereo position of a voice, −1 (left) … 1 (right): the direction from the listener to the
 * speaker, measured against the camera's right-hand direction on the table (rightX, rightZ). Within
 * a few centimetres it is centred. Kept to ±0.8 so neither ear goes completely silent.
 */
export function stereoPan(listener: Point, speaker: Point, rightX: number, rightZ: number): number {
  const dx = speaker.x - listener.x;
  const dz = speaker.z - listener.z;
  const d = Math.hypot(dx, dz);
  const r = Math.hypot(rightX, rightZ);
  if (d < 1e-6 || r < 1e-6) return 0;
  const side = (dx * rightX + dz * rightZ) / (d * r);
  const near = Math.min(1, d / 6); // centred when nearly on top of each other
  return Math.max(-0.8, Math.min(0.8, side * 0.8 * near));
}

/** Root-mean-square level of a block of samples (−1…1), for the speaking indicator. */
export function rmsLevel(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * RMS above this counts as speaking, for the rings. A guess, not tuned on real microphones: speech
 * after auto gain is usually well above it, and a quiet room after noise suppression well below.
 */
export const SPEAKING_RMS = 0.02;
