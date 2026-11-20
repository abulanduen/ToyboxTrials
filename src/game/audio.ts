/**
 * Toybox Trials sound identity — 100% synthesised with the Web Audio API (no samples, no
 * third-party recordings). Every sound is short, tactile and mechanical: wooden clicks,
 * clockwork ratchets, springs, bells and music-box tines.
 *
 * Autoplay: the AudioContext is created lazily and resumed on the first user gesture.
 * Volume: master × sfx from the persisted settings store, applied live.
 */
import { useGame } from './store';
import type { EmoteId } from './emotes';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Music bus (Music Box Rhythm, amendment A6): follows the master volume, not the sfx volume. */
let musicOut: GainNode | null = null;
let musicActive = false;
const MUSIC_LEVEL = 0.8;
let noiseBuf: AudioBuffer | null = null;
/** The shared output stage (compressor → speakers) that every bus feeds. */
let outStage: DynamicsCompressorNode | null = null;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  outStage = comp;
  master = ctx.createGain();
  master.connect(comp).connect(ctx.destination);
  musicOut = ctx.createGain();
  musicOut.gain.value = 0;
  musicOut.connect(comp);
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
  musicOut?.gain.setTargetAtTime(musicActive ? s.masterVolume * MUSIC_LEVEL : 0, ctx.currentTime, 0.03);
}
useGame.subscribe((s, p) => {
  if (s.masterVolume !== p.masterVolume || s.sfxVolume !== p.sfxVolume) applyVolume();
});

/** Call from any user gesture handler. Safe to call repeatedly. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

/**
 * The running AudioContext and the shared output stage, for the background music and voice lines
 * (src/game/music.ts, src/game/voice.ts), which keep their own buses. Null until the first user
 * gesture has unlocked audio (and wherever Web Audio is unavailable).
 */
export function audioOut(): { ctx: AudioContext; out: AudioNode } | null {
  if (!ctx || ctx.state !== 'running' || !outStage) return null;
  return { ctx, out: outStage };
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

function tone(freq: number, t: number, peak: number, decay: number, type: OscillatorType = 'sine', attack = 0.003, glideTo?: number, dest: AudioNode | null = master) {
  const c = live();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
  env(g, t, peak, attack, decay);
  o.connect(g).connect(dest ?? master!);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function noise(t: number, peak: number, decay: number, filterFreq: number, q = 1, type: BiquadFilterType = 'bandpass', dest: AudioNode | null = master) {
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
  src.connect(f).connect(g).connect(dest ?? master!);
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
export type ToyCue = 'puff' | 'fan' | 'marble' | 'bubble' | 'ribbon' | 'storm' | 'stitch' | 'button' | 'charge' | 'hit' | 'out' | 'warning' | 'count' | 'chime';
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
    // A soft, short muted chime for rapid auto-fire (Toybox Siege's Chime Burst): a rounded low tine
    // that dies in a tenth of a second, a faint fifth above, no long bell ring or bright partials.
    case 'chime': tone(jitter(698,.02),t,.042*k,.1,'sine',.006,660); tone(1047,t+.012,.012*k,.06,'sine',.005); break;
  }
}

/**
 * Hub play cues: the shared marble (football) and the basketball (src/hubplay/). `volume` is the
 * mix gain (0–1): the caller makes distant ones quieter.
 */
export type HubCue = 'kick' | 'push' | 'clack' | 'goal' | 'swish' | 'rim' | 'board' | 'bounce' | 'grab' | 'throw';
export function playHubCue(cue: HubCue, volume = 1) {
  if (!live()) return;
  const t = now(), k = Math.max(0, Math.min(1, volume));
  if (k < 0.02) return;
  switch (cue) {
    case 'kick': // a wooden toe on glass: low thock, then the marble's clink
      tone(jitter(170, .04), t, .2*k, .09, 'sine', .003, 95); noise(t, .1*k, .04, 900, .7, 'lowpass'); tone(jitter(1900, .03), t+.01, .05*k, .09, 'sine', .002); break;
    case 'push': tone(jitter(240, .05), t, .08*k, .06, 'sine', .004, 160); tone(jitter(2100, .03), t, .025*k, .06, 'sine', .002); break;
    case 'clack': tone(jitter(2400, .04), t, .07*k, .07, 'sine', .002); noise(t, .05*k, .025, 3200, 1.5); break;
    case 'goal': // music-box fanfare over a little crowd of clicking toys
      [784, 988, 1175, 1568].forEach((f, i) => tine(f, t + i * .09, .15*k, .55));
      tine(2093, t + .4, .12*k, .9);
      noise(t + .05, .07*k, .7, 1400, .6);
      for (let i = 0; i < 8; i++) noise(t + .08 + i * .06 + Math.random() * .03, .05*k, .02, 2600 + i * 120, 4);
      break;
    case 'swish': // the ball through the net, then a bell
      noise(t, .12*k, .22, 3400, .8, 'bandpass'); noise(t + .04, .06*k, .18, 1800, .6, 'bandpass'); tine(2093, t + .12, .12*k, .7); tine(2637, t + .22, .09*k, .8); break;
    case 'rim': tone(jitter(640, .03), t, .11*k, .32, 'triangle', .002); tone(jitter(1290, .03), t, .04*k, .2, 'sine', .002); break;
    case 'board': tone(jitter(210, .04), t, .13*k, .09, 'sine', .003, 140); noise(t, .08*k, .05, 800, .8, 'lowpass'); break;
    case 'bounce': tone(jitter(330, .05), t, .13*k, .09, 'sine', .004, 190); noise(t, .05*k, .03, 600, .6, 'lowpass'); break;
    case 'grab': tone(520, t, .08*k, .07, 'sine', .006, 760); noise(t, .04*k, .03, 1200, .7, 'lowpass'); break;
    case 'throw': noise(t, .1*k, .2, 1100, .7, 'bandpass'); tone(380, t, .05*k, .16, 'sine', .01, 620); break;
  }
}

/**
 * Arena spell cues (Spellbox Showdown). Fuller and punchier than the soft ToyCue set, at levels
 * comparable to Copycat's instruments and Blink Duel's spring sounds, but still rounded (low-passed
 * noise, sine/triangle bodies, no harsh clicks). `volume` is the mix gain (0–1, the caller attenuates
 * distant opponents); `intensity` (0–1) makes impacts heavier for bigger knockback.
 */
export type SpellCue =
  | 'rocket' | 'gust' | 'marbleShot' | 'ward' | 'tether' | 'whirl' | 'mend' | 'mineSet' | 'zip'
  | 'thump' | 'impact' | 'burst' | 'ringout' | 'charge' | 'alarm' | 'tick' | 'rumble' | 'go';
/** Calls received by the bus (counted even while audio is locked or unavailable): a ?debug test aid. */
export const spellCueStats = { calls: 0, audible: 0, byCue: {} as Record<string, number>, loudest: {} as Record<string, number> };
export function playSpellCue(cue: SpellCue, volume = 1, intensity = 0.5) {
  const k = Math.max(0, Math.min(1, volume)), i = Math.max(0, Math.min(1, intensity));
  spellCueStats.calls++;
  spellCueStats.byCue[cue] = (spellCueStats.byCue[cue] ?? 0) + 1;
  spellCueStats.loudest[cue] = Math.max(spellCueStats.loudest[cue] ?? 0, k);
  if (!live() || k < 0.01) return;
  spellCueStats.audible++;
  const t = now();
  switch (cue) {
    case 'rocket': // pop and a rising whoosh
      tone(900, t, 0.1 * k, 0.04, 'sine', 0.002, 320);
      tone(170, t, 0.17 * k, 0.15, 'triangle', 0.004, 560);
      noise(t, 0.2 * k, 0.11, 1500, 0.7, 'lowpass');
      break;
    case 'gust': // spring boing pushing a broad puff of air
      tone(210, t, 0.15 * k, 0.17, 'triangle', 0.004, 470);
      noise(t, 0.22 * k, 0.19, 1150, 0.6, 'lowpass');
      break;
    case 'marbleShot': // glassy clink, then the marble rolling away
      tone(1180, t, 0.12 * k, 0.12, 'sine', 0.002);
      tone(2950, t, 0.05 * k, 0.05, 'sine', 0.001);
      tone(320, t + 0.02, 0.12 * k, 0.12, 'triangle', 0.004, 210);
      noise(t, 0.1 * k, 0.05, 1300, 0.7, 'lowpass');
      break;
    case 'ward': // a bubble blooming open with a soft shimmer
      tone(320, t, 0.17 * k, 0.2, 'sine', 0.01, 780);
      tone(660, t + 0.03, 0.07 * k, 0.22, 'sine', 0.01, 1500);
      break;
    case 'tether': // ribbon whip
      noise(t, 0.16 * k, 0.08, 2200, 1, 'bandpass');
      tone(720, t, 0.11 * k, 0.13, 'triangle', 0.003, 250);
      break;
    case 'whirl': // big pinwheel whoosh with a low body
      noise(t, 0.26 * k, 0.32, 900, 0.6, 'lowpass');
      tone(150, t, 0.2 * k, 0.26, 'sine', 0.006, 85);
      noise(t + 0.08, 0.12 * k, 0.16, 1700, 0.6, 'lowpass');
      break;
    case 'mend': // three warm rising tines
      tine(660, t, 0.13 * k, 0.32);
      tine(880, t + 0.08, 0.12 * k, 0.36);
      tine(1108.7, t + 0.16, 0.1 * k, 0.42);
      break;
    case 'mineSet': // a button clacked down, then a little arming tick
      noise(t, 0.18 * k, 0.03, 1500, 1.2, 'bandpass');
      tone(330, t, 0.14 * k, 0.07, 'triangle', 0.002, 200);
      tone(900, t + 0.12, 0.05 * k, 0.1, 'sine', 0.003);
      break;
    case 'zip': // blink departure: a fast rising whistle with air
      tone(480, t, 0.13 * k, 0.1, 'sine', 0.004, 2300);
      noise(t, 0.12 * k, 0.07, 3000, 1.5, 'bandpass');
      break;
    case 'thump': // blink arrival shockwave: a deep felt thump with a dusty push
      tone(125, t, 0.32 * k, 0.22, 'sine', 0.003, 52);
      tone(250, t, 0.1 * k, 0.1, 'triangle', 0.002, 120);
      noise(t, 0.26 * k, 0.13, 520, 0.7, 'lowpass');
      break;
    case 'impact': { // a spell connecting: heavier and lower for bigger knockback
      const f = jitter(200 - 70 * i, 0.04);
      tone(f, t, (0.2 + 0.12 * i) * k, 0.09 + 0.08 * i, 'sine', 0.002, f * 0.45);
      noise(t, (0.15 + 0.11 * i) * k, 0.04 + 0.04 * i, 900 + 700 * i, 0.7, 'lowpass');
      tone(540, t, 0.06 * k, 0.03, 'triangle', 0.001);
      break;
    }
    case 'burst': // marble or mine popping
      noise(t, 0.24 * k, 0.15, 1100, 0.7, 'lowpass');
      tone(165, t, 0.2 * k, 0.17, 'sine', 0.003, 70);
      break;
    case 'ringout': // falling whistle off the edge, then a thud on the table below
      tone(880, t, 0.17 * k, 0.45, 'triangle', 0.006, 180);
      tone(100, t + 0.42, 0.3 * k, 0.25, 'sine', 0.003, 48);
      noise(t + 0.42, 0.2 * k, 0.13, 700, 0.7, 'lowpass');
      break;
    case 'charge': // own wind-up
      noise(t, 0.08 * k, 0.06, 1200, 0.6, 'lowpass');
      tone(300, t, 0.05 * k, 0.08, 'sine', 0.006, 430);
      break;
    case 'alarm': // shrink warning: two soft two-tone calls
      for (let n = 0; n < 2; n++) {
        tone(660, t + n * 0.4, 0.16 * k, 0.15, 'triangle', 0.008);
        tone(495, t + n * 0.4 + 0.2, 0.16 * k, 0.15, 'triangle', 0.008);
      }
      break;
    case 'tick': // countdown tick (fight count-in, last shrink seconds)
      noise(t, 0.2 * k, 0.03, 1800, 2, 'bandpass');
      tone(880, t, 0.1 * k, 0.06, 'triangle', 0.002);
      break;
    case 'rumble': // the ring starts contracting
      tone(72, t, 0.22 * k, 0.6, 'sine', 0.02, 45);
      noise(t, 0.14 * k, 0.5, 320, 0.7, 'lowpass');
      break;
    case 'go': // fight!
      tine(784, t, 0.14 * k, 0.3);
      tine(1174.7, t + 0.08, 0.15 * k, 0.45);
      break;
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
  /**
   * Hub emotes: a tiny synthesised signature each. `gain` scales it (remote players' emotes play
   * quieter with distance).
   */
  emote(id: EmoteId, gain = 1) {
    const t = now();
    const k = Math.max(0, Math.min(1, gain));
    if (k < 0.02) return;
    switch (id) {
      case 'wave': // "hel-lo": two bright tines, up a fourth
        tine(1174.7, t, 0.11 * k, 0.32);
        tine(1568, t + 0.13, 0.1 * k, 0.4);
        break;
      case 'cheer': // quick rising music-box arpeggio with a little rattle
        [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tine(f, t + i * 0.055, 0.09 * k, 0.35));
        noise(t + 0.22, 0.05 * k, 0.08, 3800, 3);
        break;
      case 'spin': // a wind-up whirr that slides up
        tone(330, t, 0.08 * k, 0.5, 'triangle', 0.02, 990);
        for (let i = 0; i < 5; i++) noise(t + i * 0.07, 0.07 * k, 0.015, 3000 + i * 250, 5);
        break;
      case 'bow': // a soft, polite falling pair
        tine(1046.5, t, 0.09 * k, 0.45, 2.0);
        tine(784, t + 0.18, 0.09 * k, 0.6, 2.0);
        break;
      case 'dance': // a bouncy tick-tock bass line with tine accents on the off-beats
        for (let i = 0; i < 8; i++) {
          const at = t + i * 0.125;
          if (i % 2 === 0) tone(i % 4 === 0 ? 196 : 247, at, 0.1 * k, 0.12, 'triangle', 0.003);
          else tine(i % 4 === 1 ? 1318.5 : 1568, at, 0.06 * k, 0.15);
          noise(at, 0.03 * k, 0.01, 5000, 6);
        }
        break;
      case 'laugh': // "ha-ha-ha-ha": bright, wobbly blips falling in pitch, with ratchet clicks
        for (let i = 0; i < 5; i++) {
          const at = t + i * 0.13;
          tone(880 - i * 70, at, 0.08 * k, 0.09, 'square', 0.004, 700 - i * 60);
          noise(at + 0.05, 0.03 * k, 0.012, 2600, 4);
        }
        break;
      case 'sit': // a springy settle: falling boing, then a soft wooden thump
        tone(520, t, 0.08 * k, 0.32, 'sine', 0.004, 170);
        tone(130, t + 0.3, 0.12 * k, 0.16, 'sine', 0.002, 70);
        noise(t + 0.3, 0.05 * k, 0.05, 900, 1);
        break;
      case 'salute': // a crisp heel click and a little bugle-ish fanfare of tines
        noise(t, 0.09 * k, 0.025, 3500, 3);
        [784, 1046.5, 1318.5].forEach((f, i) => tine(f, t + 0.08 + i * 0.09, 0.08 * k, 0.3));
        tine(1568, t + 0.4, 0.09 * k, 0.5);
        break;
      case 'juggle': // three bead tosses: soft rising pops, each with a tiny catch tick
        for (let i = 0; i < 3; i++) {
          const at = t + i * 0.26;
          tone(420 + i * 90, at, 0.07 * k, 0.12, 'sine', 0.003, 900 + i * 120);
          noise(at + 0.18, 0.04 * k, 0.012, 4200, 5);
        }
        break;
      case 'faint': // a wilting slide down, then a tin clunk as it lands
        tone(1046.5, t, 0.08 * k, 0.55, 'triangle', 0.01, 260);
        tone(98, t + 0.55, 0.13 * k, 0.2, 'sine', 0.002, 60);
        for (let i = 0; i < 3; i++) noise(t + 0.55 + i * 0.05, (0.08 - i * 0.02) * k, 0.03, 2200 + i * 600, 3);
        break;
    }
  },
  /** Shop purchase: a little clockwork till: ratchet clicks, then a bright two-tine ding. */
  purchase() {
    const t = now();
    for (let i = 0; i < 4; i++) noise(t + i * 0.035, 0.07, 0.012, 3000 + i * 300, 5);
    tine(1568, t + 0.16, 0.11, 0.5);
    tine(2093, t + 0.24, 0.1, 0.7);
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

  // ---- Find the Original ----

  /** Spotted the real one: a quick "ta-da" on music-box tines with a tin sparkle. */
  spotted() {
    const t = now();
    tine(1174.7, t, 0.13, 0.35, 4.1);
    tine(1568, t + 0.09, 0.14, 0.6, 4.1);
    tine(2349.3, t + 0.18, 0.1, 0.8, 3.0);
    for (let i = 0; i < 4; i++) noise(t + 0.2 + i * 0.04, 0.05, 0.03, 6200 + i * 500, 4);
  },
  /** Picked a Not-Baldwyn: your spring unwinds (clicks slowing down, a sagging tone). */
  windDown() {
    const t = now();
    let dt = 0.04;
    let at = t + 0.12;
    for (let i = 0; i < 7; i++) {
      noise(at, 0.14, 0.02, 3000 - i * 220, 5);
      at += dt;
      dt *= 1.28;
    }
    tone(330, t + 0.1, 0.09, 0.5, 'triangle', 0.004, 150);
  },
  /** Someone else found him: two quick wooden knocks ("hurry up"). */
  knock() {
    const t = now();
    noise(t, 0.2, 0.03, 900, 2);
    noise(t + 0.11, 0.24, 0.035, 1100, 2);
  },

  // ---- Odd Page Out ----

  /** A storybook page turning: a soft paper swish that rises and settles. */
  pageTurn() {
    const t = now();
    noise(t, 0.09, 0.22, 1800, 0.7);
    noise(t + 0.12, 0.07, 0.18, 2600, 0.8);
    noise(t + 0.26, 0.05, 0.08, 900, 1.2, 'lowpass');
  },
  /** A difference circled: a quick crayon scribble and a bright two-note pluck. */
  inkRing(count = 1) {
    const t = now();
    noise(t, 0.06, 0.06, 3800, 2);
    const up = Math.min(count, 15) * 0.012;
    tine(880 * (1 + up), t + 0.02, 0.1, 0.25, 4.0);
    tine(1318.5 * (1 + up), t + 0.09, 0.09, 0.35, 4.0);
  },
  /** A wrong tap: a short, flat buzz. */
  buzz() {
    const t = now();
    tone(110, t, 0.1, 0.22, 'sawtooth', 0.004);
    tone(116, t, 0.07, 0.22, 'square', 0.004);
  },

  // ---- Movement minigames (Red Light Green Light, Wind-Up Dash) ----

  /** Green light: two bright bell dings, rising. */
  signalGo() {
    const t = now();
    tine(1046.5, t, 0.17, 0.45, 4.1);
    tine(1568, t + 0.11, 0.17, 0.7, 4.1);
  },
  /** The referee winding up to turn round: ratchet clicks spread across the tell, climbing in pitch. */
  signalWarn(ms = 700) {
    const t = now();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const at = t + (i / n) * (ms / 1000) * 0.9;
      noise(at, 0.24, 0.02, 2600 + i * 260, 5);
      tone(520 + i * 75, at, 0.06, 0.03, 'square');
    }
  },
  /** Red light: a short pea-whistle blast. */
  signalStop() {
    const t = now();
    const c = live();
    if (!c) return;
    for (const f of [2150, 2420]) {
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      lfo.frequency.value = 38; // the rattling pea
      lfoGain.gain.value = 70;
      lfo.connect(lfoGain).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.015);
      g.gain.setValueAtTime(0.11, t + 0.26);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(g).connect(master!);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.4);
      lfo.stop(t + 0.4);
    }
    noise(t, 0.08, 0.3, 3200, 2);
  },
  /** Caught or sprung: a spring flick that sends a toy flying. */
  flick() {
    const t = now();
    noise(t, 0.26, 0.04, 1500, 1.5);
    tone(230, t, 0.24, 0.42, 'triangle', 0.004, 760);
    tone(460, t + 0.02, 0.08, 0.3, 'sine', 0.004, 1300);
  },
  /** Across the finish line: a quick rising run on the tines. */
  finishLine() {
    const t = now();
    [784, 987.8, 1174.7, 1568].forEach((f, i) => tine(f, t + i * 0.07, 0.15, 0.6, 4.1));
  },
  /** A domino tipping over: a dry tile clack, then the slap as it lands. */
  dominoClack() {
    const t = now();
    noise(t, 0.22, 0.02, jitter(3000, 0.1), 4);
    tone(jitter(1350, 0.06), t, 0.07, 0.03, 'triangle');
    noise(t + 0.2, 0.16, 0.035, 1500, 2);
  },
  /** Snap jaws slamming shut: a hard metallic clack with a short spring ring. */
  trapSnap(gain = 1) {
    const t = now();
    noise(t, 0.4 * gain, 0.035, 2200, 1.2);
    tone(310, t, 0.2 * gain, 0.07, 'square', 0.001, 120);
    tone(1750, t + 0.01, 0.06 * gain, 0.22, 'sine', 0.001, 1500);
  },
};

export type SfxName = keyof typeof sfx;

// ---------- music (Music Box Rhythm) ----------

/**
 * Voices for the in-code compositions of Music Box Rhythm (GAME_DESIGN.md amendment A6: music is
 * the one exception to "sound effects only"). Everything is still synthesised here; the tunes
 * themselves live in src/minigames/rhythm/tracks.ts and are scheduled by rhythm/music.ts.
 *
 * All voices take an absolute AudioContext time so a scheduler can place notes ahead of time on
 * the audio clock. They go to the music bus (master volume × a fixed level), which is silent
 * unless `music.setActive(true)`.
 */
export const music = {
  /** AudioContext time in seconds, or null when audio isn't running (locked, unsupported, headless). */
  now(): number | null {
    const c = live();
    return c ? c.currentTime : null;
  },
  /** Open or close the music bus (short fade). Notes already scheduled are silenced by closing it. */
  setActive(on: boolean) {
    if (musicActive === on) return;
    musicActive = on;
    applyVolume();
  },
  /** Melody: a bright plucked music-box tine. `dur` (s) lengthens the ring a little for long notes. */
  tine(freq: number, t: number, dur = 0.4, gain = 0.2) {
    const decay = Math.min(1.6, 0.55 + dur * 0.9);
    tone(freq, t, gain, decay, 'sine', 0.002, undefined, musicOut);
    tone(freq * 4.02, t, gain * 0.28, decay * 0.18, 'sine', 0.001, undefined, musicOut);
    tone(freq * 1.004, t, gain * 0.3, decay * 0.8, 'sine', 0.003, undefined, musicOut);
    noise(t, gain * 0.2, 0.01, 6200, 5, 'bandpass', musicOut);
  },
  /** Accompaniment chord tone: a softer, shorter tine. */
  pluck(freq: number, t: number, dur = 0.3, gain = 0.07) {
    tone(freq, t, gain, Math.min(0.7, 0.25 + dur), 'sine', 0.003, undefined, musicOut);
    tone(freq * 3, t, gain * 0.2, 0.08, 'sine', 0.001, undefined, musicOut);
  },
  /** Bass: a round, felted low bar. */
  bass(freq: number, t: number, dur = 0.5, gain = 0.2) {
    tone(freq, t, gain, Math.min(1.2, 0.3 + dur), 'sine', 0.012, undefined, musicOut);
    tone(freq * 2, t, gain * 0.3, 0.22, 'triangle', 0.008, undefined, musicOut);
  },
  /** Wooden tick (count-in and calibration metronome). */
  tick(t: number, accent = false) {
    noise(t, accent ? 0.34 : 0.22, 0.028, accent ? 2100 : 2700, 3.5, 'bandpass', musicOut);
    tone(accent ? 1480 : 1110, t, accent ? 0.13 : 0.08, 0.045, 'triangle', 0.001, undefined, musicOut);
  },
  /** Light shaker / ratchet tick for the rhythm bed. */
  shake(t: number, accent = false) {
    noise(t, accent ? 0.075 : 0.04, accent ? 0.05 : 0.03, 6500, 2.2, 'bandpass', musicOut);
  },
};
