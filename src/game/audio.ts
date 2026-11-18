/**
 * Toybox Trials sound identity — 100% synthesised with the Web Audio API (no samples, no
 * third-party recordings). Every sound is short, tactile and mechanical: wooden clicks,
 * clockwork ratchets, springs, bells and music-box tines.
 *
 * Autoplay: the AudioContext is created lazily and resumed on the first user gesture.
 * Volume: master × sfx from the persisted settings store, applied live.
 */
import { useGame } from './store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.connect(comp).connect(ctx.destination);
  applyVolume();
  // White noise buffer reused by percussive sounds.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function applyVolume() {
  if (!master || !ctx) return;
  const s = useGame.getState();
  master.gain.setTargetAtTime(s.masterVolume * s.sfxVolume * 0.9, ctx.currentTime, 0.02);
}
useGame.subscribe((s, p) => {
  if (s.masterVolume !== p.masterVolume || s.sfxVolume !== p.sfxVolume) applyVolume();
});

/** Call from any user gesture handler. Safe to call repeatedly. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

function live(): AudioContext | null {
  if (!ctx || ctx.state !== 'running' || !master) return null;
  return ctx;
}

// ---------- building blocks ----------

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, t: number, peak: number, decay: number, type: OscillatorType = 'sine', attack = 0.003, glideTo?: number) {
  const c = live();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
  env(g, t, peak, attack, decay);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function noise(t: number, peak: number, decay: number, filterFreq: number, q = 1, type: BiquadFilterType = 'bandpass') {
  const c = live();
  if (!c || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, peak, 0.002, decay);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.3);
  src.stop(t + decay + 0.05);
}

/** Struck tine / bar: fundamental plus a quickly-fading upper partial. */
function tine(freq: number, t: number, peak: number, decay: number, partial = 3.0) {
  tone(freq, t, peak, decay, 'sine', 0.002);
  tone(freq * partial, t, peak * 0.35, decay * 0.25, 'sine', 0.001);
}

const now = () => (ctx ? ctx.currentTime + 0.005 : 0);
const jitter = (v: number, amt: number) => v * (1 + (Math.random() * 2 - 1) * amt);

/** Short material sounds for busy action games; never changes Copycat's instrument voices. */
export type ToyCue = 'puff' | 'fan' | 'marble' | 'bubble' | 'ribbon' | 'storm' | 'stitch' | 'button' | 'charge' | 'hit' | 'out' | 'warning' | 'count';
export function playToyCue(cue: ToyCue, volume = 1) {
  if (!live()) return;
  const t = now(), k = Math.max(0, Math.min(1, volume));
  if (!k) return;
  switch (cue) {
    case 'puff': noise(t, .11*k, .075, 650, .6, 'lowpass'); tone(240,t,.07*k,.08,'sine',.008,130); break;
    case 'fan': noise(t,.1*k,.15,950,.5,'lowpass'); break;
    case 'marble': tone(520,t,.09*k,.11,'sine',.006,390); noise(t,.035*k,.025,1100,.6,'lowpass'); break;
    case 'bubble': tone(380,t,.08*k,.12,'sine',.012,680); break;
    case 'ribbon': noise(t,.09*k,.13,1450,.5,'lowpass'); tone(300,t,.025*k,.1,'sine',.012,240); break;
    case 'storm': noise(t,.1*k,.21,700,.5,'lowpass'); noise(t+.06,.04*k,.12,1100,.5,'lowpass'); break;
    case 'stitch': tone(440,t,.065*k,.11,'sine',.012); tone(550,t+.07,.045*k,.12,'sine',.012); break;
    case 'button': tone(290,t,.08*k,.055,'sine',.006,190); noise(t,.04*k,.025,800,.5,'lowpass'); break;
    case 'charge': noise(t,.035*k,.045,850,.5,'lowpass'); break;
    case 'hit': tone(jitter(180,.05),t,.1*k,.07,'sine',.006,110); noise(t,.04*k,.035,650,.5,'lowpass'); break;
    case 'out': tone(350,t,.09*k,.23,'sine',.012,130); noise(t+.08,.035*k,.065,700,.5,'lowpass'); break;
    case 'warning': tone(660,t,.09*k,.14,'sine',.01); tone(440,t+.17,.07*k,.14,'sine',.01); break;
    case 'count': tone(400,t,.06*k,.055,'sine',.008,300); break;
  }
}

// ---------- the sound palette ----------

export const sfx = {
  /** Wooden UI click. */
  click() {
    const t = now();
    noise(t, 0.12, 0.025, 1200, 0.7, 'lowpass');
    tone(jitter(700, 0.03), t, 0.06, 0.035, 'sine', 0.006);
  },
  /** Softer hover tick for menu focus. */
  tick() {
    const t = now();
    noise(t, 0.12, 0.02, 3800, 4);
  },
  /** Muted wooden/plastic foot tap without a sharp clockwork overtone. */
  footstep(left: boolean) {
    const t = now();
    noise(t, 0.07, 0.03, left ? 850 : 950, 0.6, 'lowpass');
    tone(jitter(left ? 280 : 310, 0.05), t, 0.025, 0.03, 'sine', 0.006);
  },
  /** Clockwork ratchet: a run of accelerating clicks. */
  windUp(clicks = 9) {
    const t = now();
    let dt = 0.075;
    let at = t;
    for (let i = 0; i < clicks; i++) {
      noise(at, 0.22, 0.018, 3200 + i * 120, 5);
      tone(1900 + i * 40, at, 0.04, 0.015, 'square');
      at += dt;
      dt *= 0.9;
    }
    tone(880, at + 0.02, 0.12, 0.25, 'sine', 0.003, 1320); // spring "ready" glint
  },
  /** Spring launch. */
  jump() {
    const t = now();
    tone(220, t, 0.22, 0.22, 'sine', 0.004, 640);
    tone(330, t + 0.01, 0.06, 0.18, 'triangle', 0.004, 900);
    noise(t, 0.12, 0.03, 900, 1.2);
  },
  /** Soft wooden landing thud, scaled by impact. */
  land(impact = 1) {
    const t = now();
    const k = Math.min(1, 0.35 + impact * 0.25);
    tone(150, t, 0.25 * k, 0.09, 'sine', 0.002, 70);
    noise(t, 0.18 * k, 0.05, 700, 1.0, 'lowpass');
  },
  /** Plastic bonk when walking into something. */
  bump() {
    const t = now();
    tone(jitter(260, 0.05), t, 0.12, 0.07, 'triangle', 0.002, 190);
  },
  /** Two-note music-box chime for interacting. */
  interact() {
    const t = now();
    tine(1046.5, t, 0.16, 0.5);
    tine(1568, t + 0.08, 0.13, 0.6);
  },
  /** Prompt appears: a single very soft tine. */
  promptIn() {
    const t = now();
    tine(2093, t, 0.035, 0.25, 2.0);
  },
  /** Reward: rising music-box arpeggio + bell sparkle. */
  reward() {
    const t = now();
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tine(f, t + i * 0.085, 0.14, 0.7));
    sfx.bell(t + 0.38, 0.08);
  },
  /** Elimination: spring sproing, descending slide, clatter. */
  eliminate() {
    const t = now();
    const c = live();
    if (!c) return;
    // wobbling spring
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.75);
    lfo.frequency.setValueAtTime(18, t);
    lfo.frequency.linearRampToValueAtTime(6, t + 0.75);
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(o.frequency);
    env(g, t, 0.22, 0.005, 0.8);
    o.connect(g).connect(master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.9);
    lfo.stop(t + 0.9);
    // clatter of tin parts
    for (let i = 0; i < 5; i++) noise(t + 0.8 + i * 0.06 + Math.random() * 0.03, 0.18 - i * 0.03, 0.04, 2500 + Math.random() * 1500, 4);
  },
  /** Respawn pop. */
  pop() {
    const t = now();
    tone(300, t, 0.2, 0.12, 'sine', 0.003, 900);
    noise(t, 0.1, 0.03, 4000, 2);
  },

  // ---- Copycat Conductor instrument voices (A / S / J / K) ----

  /** A — coral toy drum: membrane thump + snare-ish rattle. */
  drum(t = now(), gain = 0.32) {
    tone(190, t, gain, 0.22, 'sine', 0.002, 85);
    tone(120, t, gain * 0.6, 0.18, 'triangle', 0.002, 70);
    noise(t, gain * 0.55, 0.09, 1800, 0.8);
  },
  /** S — golden toy bell: inharmonic partials, long ring. */
  bell(t = now(), gain = 0.16) {
    const f = 1318.5;
    tone(f, t, gain, 1.4, 'sine', 0.002);
    tone(f * 2.76, t, gain * 0.45, 0.7, 'sine', 0.001);
    tone(f * 5.4, t, gain * 0.2, 0.3, 'sine', 0.001);
    tone(f * 0.5, t, gain * 0.25, 0.9, 'sine', 0.004);
  },
  /** J — toy-blue xylophone: woody bar with a bright 4th partial, short decay. */
  xylophone(t = now(), gain = 0.26) {
    tone(784, t, gain, 0.35, 'sine', 0.001);
    tone(784 * 3.93, t, gain * 0.35, 0.08, 'sine', 0.001);
    noise(t, gain * 0.25, 0.015, 3000, 3);
  },
  /** K — sage mechanical music box: plucked tine plus a tiny comb click. */
  musicBox(t = now(), gain = 0.2) {
    tine(1046.5, t, gain, 0.9, 5.2);
    tone(1046.5 * 1.003, t, gain * 0.4, 0.8, 'sine', 0.002); // slight detune shimmer
    noise(t, gain * 0.25, 0.012, 6000, 5);
  },
  /** A short original music-box phrase (used by the hidden music-box prop). */
  musicBoxTune() {
    const t = now();
    // Original 8-note phrase in C major pentatonic.
    const notes = [1046.5, 1318.5, 1568, 1318.5, 1760, 1568, 1318.5, 2093];
    const durs = [0.22, 0.22, 0.34, 0.22, 0.22, 0.34, 0.22, 0.6];
    let at = t;
    notes.forEach((f, i) => {
      tine(f, at, 0.13, 0.9, 5.2);
      at += durs[i];
    });
  },

  // ---- Jack-in-the-Box ----

  /**
   * One crank of the jack-in-the-box handle: a ratchet click plus the next two notes of the box's
   * own tune (an original pentatonic phrase that loops), so a fast round "plays" the box.
   */
  crank(step: number) {
    const t = now();
    const tune = [784, 880, 1046.5, 880, 1174.7, 1046.5, 880, 784, 659.3, 784, 880, 1046.5, 1318.5, 1174.7, 1046.5, 880];
    for (let i = 0; i < 3; i++) noise(t + i * 0.045, 0.16, 0.014, 3400 + i * 200, 5);
    tine(tune[(step * 2) % tune.length], t + 0.02, 0.12, 0.6, 5.2);
    tine(tune[(step * 2 + 1) % tune.length], t + 0.16, 0.1, 0.7, 5.2);
  },
  /** Answer not accepted: a dull double bonk. */
  reject() {
    const t = now();
    tone(196, t, 0.14, 0.08, 'triangle', 0.002, 150);
    tone(165, t + 0.1, 0.12, 0.12, 'triangle', 0.002, 120);
  },
  /** The jack pops: lid clack, big spring boing, a burst of confetti noise. */
  jackPop() {
    const t = now();
    const c = live();
    if (!c) return;
    noise(t, 0.3, 0.05, 1800, 1.5);
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.9);
    lfo.frequency.setValueAtTime(22, t);
    lfo.frequency.linearRampToValueAtTime(5, t + 0.9);
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(o.frequency);
    env(g, t, 0.28, 0.004, 0.95);
    o.connect(g).connect(master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.05);
    lfo.stop(t + 1.05);
    for (let i = 0; i < 6; i++) noise(t + 0.05 + i * 0.03, 0.08, 0.05, 5000 + i * 400, 3);
  },
};

export type SfxName = keyof typeof sfx;
