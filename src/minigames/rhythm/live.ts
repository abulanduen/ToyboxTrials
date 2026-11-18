/**
 * Music Box Rhythm — client-side live state shared by the module entry, Scene, Hud and intro
 * options: the smooth song clock and the practice track choice. (Not part of the rules core.)
 */
import { create } from 'zustand';
import { createSongClock, songTimeAt } from './timing';
import type { TrackId } from './tracks';

/** Follows the host's match clock against performance.now(); synced once per rendered frame. */
export const songClock = createSongClock();

/** Smooth song time right now (for drawing pins and scheduling music between 60 Hz steps). */
export const songNow = () => songTimeAt(songClock, performance.now());

/** The local player's most recent judgement (written by the HUD; read by the `?debug` test hook). */
export const lastLocalJudge = { judgement: '', delta: 0, count: 0 };

/** Latency calibration limits (ms). */
export const OFFSET_MIN = -150;
export const OFFSET_MAX = 250;
export const clampOffset = (ms: number) => Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(ms)));

/** Practice picks a track on the intro card; tournaments take one from the match seed. */
export const useRhythmPrefs = create<{ track: TrackId; setTrack: (t: TrackId) => void }>()((set) => ({
  track: 'tin-waltz',
  setTrack: (track) => set({ track }),
}));
