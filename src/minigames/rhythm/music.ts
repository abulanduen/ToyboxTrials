/**
 * Music Box Rhythm — plays a Song on the shared audio bus (src/game/audio.ts `music` voices).
 *
 * The match clock is the authority; the AudioContext clock is only where notes are placed.
 * Each frame the scheduler maps song time → audio time through an anchor
 * (`audioTime = anchor + songTime`), schedules the events of the next ~200 ms, and re-anchors
 * when the two clocks disagree by more than 30 ms (a pause, a hitch, a tab switch). Small
 * disagreements are followed slowly so note spacing stays even.
 *
 * With no running AudioContext (locked, unsupported, headless) or a time scale other than 1 it
 * schedules nothing and just keeps its place, so the game plays (and tests) silently.
 */
import { music } from '../../game/audio';
import { midiToHz, type AudioEvent, type Song } from './tracks';

const LOOKAHEAD_MS = 200;
const REANCHOR_S = 0.03;

const st = {
  song: null as Song | null,
  /** Next event to schedule. */
  idx: 0,
  /** AudioContext time of song time 0, or null when not anchored. */
  anchor: null as number | null,
  lastSongMs: 0,
  /** For tests/debug: how many events have been handed to the audio clock, and re-anchors. */
  scheduled: 0,
  reanchors: 0,
  /** Whether this scheduler opened the music bus (so it only closes what it opened). */
  open: false,
};

function setBus(on: boolean) {
  if (st.open === on) return;
  st.open = on;
  music.setActive(on);
}

function play(e: AudioEvent, when: number) {
  switch (e.voice) {
    case 'tine':
      music.tine(midiToHz(e.midi!), when, e.dur);
      break;
    case 'pluck':
      music.pluck(midiToHz(e.midi!), when, e.dur);
      break;
    case 'bass':
      music.bass(midiToHz(e.midi!), when, e.dur);
      break;
    case 'tick':
      music.tick(when, e.accent);
      break;
    case 'shake':
      music.shake(when, e.accent);
      break;
  }
}

/**
 * Call every rendered frame. `audible` is false while paused, before/after the song, or when the
 * match clock isn't running at normal speed.
 */
export function driveMusic(song: Song | null, songMs: number, audible: boolean) {
  if (song !== st.song || songMs < st.lastSongMs - 50) {
    st.song = song;
    st.idx = 0;
    st.anchor = null;
  }
  st.lastSongMs = songMs;
  const now = music.now();
  if (!song || !audible || now === null) {
    setBus(false);
    st.anchor = null;
    if (song) while (st.idx < song.audio.length && song.audio[st.idx].t < songMs) st.idx++;
    return;
  }
  setBus(true);
  const want = now - songMs / 1000;
  if (st.anchor === null || Math.abs(want - st.anchor) > REANCHOR_S) {
    if (st.anchor !== null) st.reanchors++;
    st.anchor = want;
    // Don't replay what has already gone by.
    while (st.idx < song.audio.length && song.audio[st.idx].t < songMs - 20) st.idx++;
  } else {
    st.anchor += (want - st.anchor) * 0.01;
  }
  const horizon = songMs + LOOKAHEAD_MS;
  while (st.idx < song.audio.length && song.audio[st.idx].t <= horizon) {
    const e = song.audio[st.idx++];
    const when = st.anchor + e.t / 1000;
    if (when < now - 0.03) continue; // too late to be worth playing
    play(e, Math.max(when, now + 0.003));
    st.scheduled++;
  }
}

export function stopMusic() {
  setBus(false);
  st.anchor = null;
  st.song = null;
}

export const musicStats = () => ({ scheduled: st.scheduled, reanchors: st.reanchors, anchored: st.anchor !== null });
