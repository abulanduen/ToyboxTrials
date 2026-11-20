/**
 * Voice lines: plays `public/assets/audio/voice/<id>.mp3` for a line of the script
 * (src/game/voiceLines.ts) when that recording exists, and does nothing otherwise — the line is
 * still shown as text, so the game works the same with or without recordings.
 *
 * Which recordings exist is known at build time (vite.config.ts `virtual:voice-files`), so missing
 * lines cost no request. Playback goes through Web Audio (fetched, decoded once, cached) rather
 * than an <audio> element, so the Voice volume works on iOS too; volume is master × Voice. The
 * background music ducks while a line plays. One line at a time: a new line cuts the last one off.
 */
import recorded from 'virtual:voice-files';
import { audioOut } from './audio';
import { useGame } from './store';
import { duckMusic } from './music';
import { exposeDebug } from './debug';

const have = new Set<string>(recorded);
const cache = new Map<string, Promise<AudioBuffer | null>>();
let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
/**
 * The last line asked for and how far it has got: 'loading' (fetching or decoding), 'playing'
 * (since `startedAt`, AudioContext time), 'ended' (played to the end), or 'none' (no recording,
 * audio not available yet, stopped early). The tour card follows it for captions and moves on
 * when a line has ended.
 */
let progress: { id: string; state: 'loading' | 'playing' | 'ended' | 'none'; startedAt: number; ctx: AudioContext | null } = { id: '', state: 'none', startedAt: 0, ctx: null };
let gen = 0;
/** ?debug test aid: every line asked for, in order, and whether a recording existed. */
const log: { id: string; recorded: boolean }[] = [];

export const hasRecording = (id: string) => have.has(id);

function load(ctx: AudioContext, id: string) {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}assets/audio/voice/${id}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

const level = () => {
  const s = useGame.getState();
  return s.masterVolume * s.voiceVolume;
};

/** Speak a line (if it has a recording). Safe to call before audio is unlocked: it just stays silent. */
export function speak(id: string) {
  const rec = have.has(id);
  log.push({ id, recorded: rec });
  if (log.length > 50) log.shift();
  stopVoice();
  progress = { id, state: 'none', startedAt: 0, ctx: null };
  if (!rec) return;
  const o = audioOut();
  if (!o) return;
  const mine = ++gen;
  progress = { id, state: 'loading', startedAt: 0, ctx: o.ctx };
  void load(o.ctx, id).then((buf) => {
    if (mine !== gen) return;
    if (!buf) {
      progress = { id, state: 'none', startedAt: 0, ctx: null };
      return;
    }
    const src = o.ctx.createBufferSource();
    src.buffer = buf;
    const gain = o.ctx.createGain();
    gain.gain.value = level();
    src.connect(gain).connect(o.out);
    src.onended = () => {
      if (current?.src === src) {
        current = null;
        duckMusic(false);
        if (progress.id === id && progress.state === 'playing') progress = { ...progress, state: 'ended' };
      }
    };
    current = { src, gain };
    duckMusic(true);
    src.start();
    progress = { id, state: 'playing', startedAt: o.ctx.currentTime, ctx: o.ctx };
  });
}

/**
 * Where line `id` has got: its state and, while playing, the seconds since it started. Any other
 * line (or none) reads as 'none'.
 */
export function voiceProgress(id: string): { state: 'loading' | 'playing' | 'ended' | 'none'; elapsed: number } {
  if (progress.id !== id) return { state: 'none', elapsed: 0 };
  // A suspended context (audio not unlocked yet, tab hidden) isn't going anywhere: read it as no voice.
  if (progress.ctx && progress.ctx.state !== 'running' && progress.state !== 'ended') return { state: 'none', elapsed: 0 };
  const elapsed = progress.state === 'playing' && progress.ctx ? Math.max(0, progress.ctx.currentTime - progress.startedAt) : 0;
  return { state: progress.state, elapsed };
}

/** Stop whatever line is playing. */
export function stopVoice() {
  gen++;
  if (progress.state === 'loading' || progress.state === 'playing') progress = { ...progress, state: 'none' };
  if (!current) return;
  try {
    current.src.stop();
  } catch {
    /* already stopped */
  }
  current = null;
  duckMusic(false);
}

useGame.subscribe((s, p) => {
  if (current && (s.masterVolume !== p.masterVolume || s.voiceVolume !== p.voiceVolume)) current.gain.gain.value = level();
});

exposeDebug({ voice: { log: () => log.slice(), recorded: () => [...have] } });
