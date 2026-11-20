/**
 * Background music player: plays the calm generative pieces of src/game/musicScore.ts with the Web
 * Audio API (everything synthesised; no recordings).
 *
 * - A director checks four times a second what should be playing (`musicTargetFor`: the Hub's
 *   jukebox track, a trial's mood, or silence for Music Box Rhythm) and crossfades over a few
 *   seconds when that changes.
 * - Notes are scheduled on the audio clock a bar or so ahead, so a busy frame never makes the
 *   music stumble; a hidden tab fades the music out and stops scheduling.
 * - Its own bus: master volume × Music volume, ducked while a voice line plays. Music Box Rhythm's
 *   music (audio.ts `music`) is separate and untouched.
 * - Cheap: a handful of oscillators at a time. On the Low quality tier (the phone default) the pad
 *   uses one oscillator per note and the echo is left out.
 * - Starts only once the first user gesture has unlocked audio (audio.ts `unlockAudio`).
 */
import { audioOut } from './audio';
import { useGame } from './store';
import { exposeDebug } from './debug';
import { useMatch } from '../minigames/session';
import { barSeconds, barsDue, composeBar, createComposer, musicTargetFor, styleById, type Composer, type MusicStyle, type MusicTarget, type NoteEvent } from './musicScore';

const TICK_MS = 250;
const LOOKAHEAD_S = 1.6;
const FADE_S = 2.8;
/** Overall level of the background music under the sound effects. */
const BGM_LEVEL = 0.42;
/** Music level while a voice line is playing. */
const VOICE_DUCK = 0.38;

interface Layer {
  style: MusicStyle;
  comp: Composer;
  /** Style level (0..1) from the director. */
  level: number;
  filter: BiquadFilterNode;
  gain: GainNode;
  nextBar: number;
  dying: boolean;
  diesAt: number;
}

const st = {
  ctx: null as AudioContext | null,
  bus: null as GainNode | null,
  send: null as GainNode | null,
  noise: null as AudioBuffer | null,
  layers: [] as Layer[],
  duck: 1,
  hidden: false,
  light: false,
  /** Debug counters (?debug): bars composed, notes scheduled, crossfades. */
  bars: 0,
  notes: 0,
  fades: 0,
  target: { style: null, level: 0 } as MusicTarget,
};

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function busLevel() {
  const s = useGame.getState();
  return st.hidden ? 0 : s.masterVolume * s.musicVolume * BGM_LEVEL * st.duck;
}
function applyBus() {
  if (st.ctx && st.bus) st.bus.gain.setTargetAtTime(busLevel(), st.ctx.currentTime, 0.25);
}

function ensureBus(ctx: AudioContext, out: AudioNode) {
  if (st.ctx === ctx && st.bus) return;
  st.ctx = ctx;
  st.light = useGame.getState().quality === 'low';
  st.bus = ctx.createGain();
  st.bus.gain.value = 0;
  st.bus.connect(out);
  if (!st.light) {
    // a soft echo for space: send → delay ⇄ (low-pass, feedback) → bus
    st.send = ctx.createGain();
    st.send.gain.value = 0.22;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.37;
    const fbFilter = ctx.createBiquadFilter();
    fbFilter.type = 'lowpass';
    fbFilter.frequency.value = 1800;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    st.send.connect(delay);
    delay.connect(fbFilter).connect(fb).connect(delay);
    delay.connect(st.bus);
  }
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  st.noise = buf;
  applyBus();
}

function addLayer(style: MusicStyle, level: number) {
  const ctx = st.ctx!;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = style.tone;
  filter.Q.value = 0.4;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(level * style.level, ctx.currentTime, FADE_S / 3);
  filter.connect(gain).connect(st.bus!);
  if (st.send) gain.connect(st.send);
  const seed = (Math.random() * 2 ** 31) | 0;
  st.layers.push({ style, comp: createComposer(style, seed), level, filter, gain, nextBar: ctx.currentTime + 0.25, dying: false, diesAt: 0 });
  st.fades++;
}

function fadeOut(l: Layer) {
  const ctx = st.ctx!;
  l.dying = true;
  l.diesAt = ctx.currentTime + FADE_S + 2.5; // let ringing notes finish under the fade
  l.gain.gain.cancelScheduledValues(ctx.currentTime);
  l.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, FADE_S / 4);
}

// ---------------------------------------------------------------- voices

/** One enveloped oscillator: attack to `peak`, hold, then an exponential release. */
function osc(dest: AudioNode, type: OscillatorType, f: number, t: number, peak: number, attack: number, hold: number, release: number, detune = 0) {
  const ctx = st.ctx!;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  if (detune) o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + hold + release + 0.05);
}

function play(l: Layer, e: NoteEvent, t: number, spb: number) {
  const d = l.filter;
  const v = e.vel;
  const f = hz(e.midi);
  const len = e.dur * spb;
  switch (e.voice) {
    case 'tine': // music-box tine: pure tone with a quick bright overtone
      osc(d, 'sine', f, t, 0.13 * v, 0.004, 0, 1.5);
      osc(d, 'sine', f * 4.01, t, 0.025 * v, 0.002, 0, 0.22);
      break;
    case 'celesta': // softer bell: fundamental plus an octave shimmer
      osc(d, 'sine', f, t, 0.12 * v, 0.008, 0, 1.8);
      osc(d, 'sine', f * 2, t, 0.03 * v, 0.008, 0, 0.7);
      break;
    case 'marimba': // wooden bar: short, warm, with its fourth partial
      osc(d, 'sine', f, t, 0.16 * v, 0.004, 0, 0.6);
      osc(d, 'sine', f * 3.96, t, 0.025 * v, 0.002, 0, 0.09);
      break;
    case 'flute': // breathy: a slow-ish attack and a sustained triangle
      osc(d, 'triangle', f, t, 0.075 * v, 0.09, Math.max(0, len - 0.12), 0.35);
      break;
    case 'pluck':
      osc(d, 'triangle', f, t, 0.08 * v, 0.004, 0, 0.32);
      break;
    case 'pad': // a slow hum under everything
      osc(d, 'sine', f, t, 0.04 * v, 0.9, Math.max(0, len - 0.9), 1.4);
      if (!st.light) osc(d, 'triangle', f, t, 0.018 * v, 1.0, Math.max(0, len - 1.0), 1.4, 6);
      break;
    case 'bass': // felted low bar
      osc(d, 'sine', f, t, 0.2 * v, 0.02, Math.max(0, len * 0.3), Math.min(1.8, len * 0.7 + 0.3));
      osc(d, 'triangle', f * 2, t, 0.02 * v, 0.02, 0, 0.25);
      break;
    case 'tick': { // the room's clock: a tiny filtered click
      const ctx = st.ctx!;
      const src = ctx.createBufferSource();
      src.buffer = st.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06 * v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      src.connect(bp).connect(g).connect(d);
      src.start(t);
      src.stop(t + 0.05);
      break;
    }
  }
  st.notes++;
}

function scheduleLayer(l: Layer, now: number) {
  const barLen = barSeconds(l.style);
  const spb = 60 / l.style.bpm;
  for (const at of barsDue(l.nextBar, now, LOOKAHEAD_S, barLen)) {
    const { events } = composeBar(l.comp);
    for (const e of events) play(l, e, at + e.beat * spb, spb);
    l.nextBar = at + barLen;
    st.bars++;
  }
}

// ---------------------------------------------------------------- director

function tick() {
  const o = audioOut();
  if (!o) return;
  ensureBus(o.ctx, o.out);
  const ctx = o.ctx;
  const now = ctx.currentTime;
  const g = useGame.getState();
  const m = useMatch.getState();
  const target = musicTargetFor({ screen: g.screen, gameId: m.gameId, phase: m.phase, hubTrack: g.hubTrack });
  st.target = target;
  const cur = st.layers.find((l) => !l.dying);
  if ((cur?.style.id ?? null) !== target.style) {
    if (cur) fadeOut(cur);
    const style = target.style ? styleById(target.style) : undefined;
    if (style) addLayer(style, target.level);
  } else if (cur && Math.abs(cur.level - target.level) > 1e-3) {
    cur.level = target.level;
    cur.gain.gain.setTargetAtTime(Math.max(0.0001, target.level * cur.style.level), now, 0.6);
  }
  for (const l of st.layers) {
    if (l.dying && now > l.diesAt) {
      l.gain.disconnect();
      l.filter.disconnect();
    }
  }
  st.layers = st.layers.filter((l) => !(l.dying && now > l.diesAt));
  if (st.hidden) return;
  for (const l of st.layers) if (!l.dying) scheduleLayer(l, now);
}

/** Lower the music under a voice line (and bring it back). */
export function duckMusic(on: boolean) {
  const v = on ? VOICE_DUCK : 1;
  if (v === st.duck) return;
  st.duck = v;
  applyBus();
}

let installed = false;
/** Start the music director (once, from App). Silent until audio has been unlocked by a gesture. */
export function installMusic() {
  if (installed) return;
  installed = true;
  window.setInterval(tick, TICK_MS);
  useGame.subscribe((s, p) => {
    if (s.masterVolume !== p.masterVolume || s.musicVolume !== p.musicVolume) applyBus();
    if (s.hubTrack !== p.hubTrack) tick(); // the jukebox answers at once
  });
  document.addEventListener('visibilitychange', () => {
    st.hidden = document.visibilityState === 'hidden';
    applyBus();
  });
  exposeDebug({
    music: {
      state: () => ({
        running: !!st.bus,
        style: st.layers.find((l) => !l.dying)?.style.id ?? null,
        target: { ...st.target },
        layers: st.layers.length,
        bars: st.bars,
        notes: st.notes,
        fades: st.fades,
        duck: st.duck,
        bus: st.bus ? st.bus.gain.value : 0,
      }),
    },
  });
}
