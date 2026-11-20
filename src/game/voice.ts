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
  if (!rec) return;
  const o = audioOut();
  if (!o) return;
  const mine = ++gen;
  void load(o.ctx, id).then((buf) => {
    if (!buf || mine !== gen) return;
    const src = o.ctx.createBufferSource();
    src.buffer = buf;
    const gain = o.ctx.createGain();
    gain.gain.value = level();
    src.connect(gain).connect(o.out);
    src.onended = () => {
      if (current?.src === src) {
        current = null;
        duckMusic(false);
      }
    };
    current = { src, gain };
    duckMusic(true);
    src.start();
  });
}

/** Stop whatever line is playing. */
export function stopVoice() {
  gen++;
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
