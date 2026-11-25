/**
 * Proximity voice chat in the online Hub (optional, Hub-only).
 *
 *   - **Microphone:** never touched until the player presses the mic button or V. Then the browser
 *     asks for permission (getUserMedia with echo cancellation, noise suppression and auto gain).
 *     Push to talk (default): the mic stays open while in the Hub and only sends sound while V or
 *     the mic button is held. Always on: the button (or V) switches the mic on and off. The mic is
 *     closed again on leaving the Hub (a trial, the Workshop, the shop, the menu) or going offline.
 *   - **Links:** one-way WebRTC audio, speaker → listener, asked for by the listener with a
 *     receive-only transceiver (so hearing needs no microphone and no permission). Who links to
 *     whom is the pure planner in voicePlan.ts: within about 45 cm, dropped beyond 60 cm, the
 *     nearest 6 speakers per listener and 8 listeners per speaker. The server only relays the
 *     handshake between players of the same room (server/voiceRelay.ts); audio goes peer to peer.
 *   - **Playback:** each voice plays through Web Audio (src/game/audio.ts's output stage): a gain
 *     that falls off with distance, a stereo pan from the direction relative to the camera, then
 *     the voice chat bus (master × "Voice chat" volume, 0 when "Hear voice chat" is off). An
 *     analyser per voice drives the speaking ring on that player's name tag; one on your own mic
 *     drives the mic button. All of it is updated from the frame loop (`voiceFrame`, called by
 *     src/character/VoiceProximity.tsx), never through per-frame React state.
 *
 * The zustand store `useVoice` changes only on events (mic state, who has a mic on, mutes).
 */
import { create } from 'zustand';
import { netLink } from './link';
import { useNet } from './store';
import { nameTagEls } from './remotes';
import { ICE_SERVERS } from './voiceConfig';
import { SPEAKING_RMS, planListeners, planSpeakers, proximityGain, rmsLevel, stereoPan, type Point, type VoiceCandidate } from './voicePlan';
import type { IceWire, MicEventMsg, MicsMsg, SignalBody, SignalEventMsg, SignalKind } from './protocol';
import { useGame } from '../game/store';
import { audioOut } from '../game/audio';
import { exposeDebug } from '../game/debug';

/** off: no microphone; asking: waiting for the browser's permission; on: the mic is open (sending while talking). */
export type MicState = 'off' | 'asking' | 'on';

interface VoiceUi {
  mic: MicState;
  /** The last permission request was refused (the button shows it, and stays usable to retry). */
  blocked: boolean;
  /** Other players whose mic is on (from the server). */
  micOn: string[];
  /** Players this player muted (this session; ids are per room). */
  muted: string[];
  set: (patch: Partial<VoiceUi>) => void;
}

export const useVoice = create<VoiceUi>()((set) => ({ mic: 'off', blocked: false, micOn: [], muted: [], set: (patch) => set(patch) }));

/** DOM elements the frame loop writes to (the mic button's level ring). */
export const voiceEls = { mic: null as HTMLElement | null };

// ---------------------------------------------------------------- timing
/** How often the links are re-planned (ms). */
const PLAN_MS = 300;
/** New links opened per plan, so a crowd arriving doesn't start a dozen handshakes at once. */
const NEW_LINKS_PER_PLAN = 2;
/** A link that hasn't connected by then is given up (ms). */
const CONNECT_TIMEOUT_MS = 15_000;
/** Don't ask a speaker again for this long after they refused (busy) or a link failed (ms). */
const BUSY_BACKOFF_MS = 6_000;
const FAIL_BACKOFF_MS = 10_000;
/** Candidates are batched for this long before they are sent (ms). */
const ICE_BATCH_MS = 80;
/** Level smoothing per frame (peak hold that decays), and the mic button's own threshold. */
const LEVEL_DECAY = 0.86;

// ---------------------------------------------------------------- state
interface LocalMic {
  stream: MediaStream;
  track: MediaStreamTrack;
  /** performance.now() when the mic opened: push to talk only counts holds that start after it. */
  openedAt: number;
  src: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  level: number;
}

interface Link {
  /** The other player's id. */
  peer: string;
  c: number;
  /** in: I listen to them; out: I speak to them. */
  role: 'in' | 'out';
  pc: RTCPeerConnection;
  startedAt: number;
  connected: boolean;
  closed: boolean;
  /** Remote candidates that arrived before the remote description. */
  pendingIce: RTCIceCandidateInit[];
  outIce: IceWire[];
  iceTimer: number | undefined;
  // listener side: the voice
  stream: MediaStream | null;
  el: HTMLAudioElement | null;
  nodes: { src: MediaStreamAudioSourceNode; analyser: AnalyserNode; gain: GainNode; pan: StereoPannerNode | null } | null;
  buf: Float32Array<ArrayBuffer> | null;
  level: number;
  /** Highest level since the debug hook last read it. */
  peak: number;
  talking: boolean;
  tag: HTMLElement | null;
  tagLevel: number;
}

let local: LocalMic | null = null;
let askGen = 0;
let nextC = 1;
const inbound = new Map<string, Link>();
const outbound = new Map<string, Link>();
const blockedUntil = new Map<string, number>();
/** Last known positions (from the frame loop), for answering offers between plans. */
const where = new Map<string, Point & { inHub: boolean; seen: number }>();
let frameNo = 0;
const self: Point = { x: 0, z: 0, y: 0 };
let bus: GainNode | null = null;
/** The talk action (V / held mic button) as of the last frame, and when that hold began. */
let held = false;
let holdAt = 0;
let transmitting = false;
let lastPlan = 0;
let scratch: Float32Array<ArrayBuffer> | null = null;
const stats = { gumCalls: 0, opened: 0, closed: 0 };

const settings = () => useGame.getState();
const ticket = (title: string, body: string, tone: 'info' | 'warning' = 'info') => useGame.getState().pushTicket({ title, body, tone });

/** Online, in a Hub room, walking the Hub: the only place voice works. */
function inHubOnline(): boolean {
  return useNet.getState().status === 'online' && useGame.getState().screen === 'playing';
}

// ---------------------------------------------------------------- the microphone
/**
 * Open the microphone (asks the browser for permission). Only ever called from the player
 * pressing the mic button or V. Safe to call while already asking or open.
 */
export async function openMic(): Promise<void> {
  if (useVoice.getState().mic !== 'off' || !inHubOnline()) return;
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) {
    ticket('Voice chat unavailable', "This browser can't use a microphone here (it needs a secure https page).", 'warning');
    return;
  }
  const my = ++askGen;
  useVoice.getState().set({ mic: 'asking' });
  stats.gumCalls++;
  let stream: MediaStream;
  try {
    stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch (e) {
    if (my !== askGen) return;
    const name = (e as { name?: string } | null)?.name ?? '';
    const denied = name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
    useVoice.getState().set({ mic: 'off', blocked: denied });
    if (denied) ticket('Microphone blocked', 'To talk, allow the microphone for this site (the lock or mic icon by the address bar, or your browser settings), then press the mic button again. You can still hear others.', 'warning');
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') ticket('No microphone found', 'Connect a microphone, then press the mic button again.', 'warning');
    else ticket('Microphone busy', 'Another app may be using it. Close it, then press the mic button again.', 'warning');
    return;
  }
  const track = stream.getAudioTracks()[0];
  if (my !== askGen || !track || !inHubOnline()) {
    stream.getTracks().forEach((t) => t.stop());
    if (my === askGen) useVoice.getState().set({ mic: 'off' });
    return;
  }
  track.enabled = false; // nothing is sent until the player talks (push to talk) or the frame loop says so
  track.onended = () => closeMic(); // unplugged, or permission taken away
  local = { stream, track, openedAt: performance.now(), src: null, analyser: null, level: 0 };
  useVoice.getState().set({ mic: 'on', blocked: false });
  netLink.send({ t: 'mic', on: true });
  const touch = settings().touchUI;
  if (settings().micMode === 'ptt') ticket('Mic ready', touch ? 'Hold the mic button to talk to toys near you.' : 'Hold V to talk to toys near you.');
  else ticket('Mic on', `Toys near you can hear you. ${touch ? 'Tap the mic button' : 'Press V or the mic button'} to turn it off.`);
}

/** Close the microphone and every link it feeds. `tellServer` false when the server already knows (or the socket is gone). */
export function closeMic(tellServer = true) {
  askGen++;
  const was = useVoice.getState().mic;
  if (local) {
    local.track.onended = null;
    local.stream.getTracks().forEach((t) => t.stop());
    local.src?.disconnect();
    local = null;
  }
  for (const l of [...outbound.values()]) closeLink(l, tellServer);
  transmitting = false;
  if (was !== 'off') useVoice.getState().set({ mic: 'off' });
  if (tellServer && was === 'on') netLink.send({ t: 'mic', on: false });
  if (voiceEls.mic) voiceEls.mic.classList.remove('is-talking');
}

/** The talk action went down (V pressed, mic button pressed). */
function talkDown() {
  const v = useVoice.getState();
  if (v.mic === 'off') void openMic();
  else if (v.mic === 'on' && settings().micMode === 'open') closeMic();
}

/** Keyboard activation of the mic button (Enter/Space on the focused button): a press and release. */
export function micButtonActivate() {
  talkDown();
}

// ---------------------------------------------------------------- links
function newLink(peer: string, c: number, role: Link['role']): Link {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const l: Link = { peer, c, role, pc, startedAt: performance.now(), connected: false, closed: false, pendingIce: [], outIce: [], iceTimer: undefined, stream: null, el: null, nodes: null, buf: null, level: 0, peak: 0, talking: false, tag: null, tagLevel: -1 };
  pc.onicecandidate = (e) => {
    if (l.closed || !e.candidate || !e.candidate.candidate) return;
    l.outIce.push({ c: e.candidate.candidate, m: e.candidate.sdpMid ?? null, i: e.candidate.sdpMLineIndex ?? null });
    if (l.iceTimer === undefined) l.iceTimer = window.setTimeout(() => flushIce(l), ICE_BATCH_MS);
  };
  pc.onconnectionstatechange = () => {
    if (l.closed) return;
    const s = pc.connectionState;
    if (s === 'connected') l.connected = true;
    else if (s === 'failed' || s === 'closed') closeLink(l, true, FAIL_BACKOFF_MS);
  };
  (role === 'in' ? inbound : outbound).set(peer, l);
  stats.opened++;
  return l;
}

function send(l: Link, k: SignalKind, d?: string | IceWire[]) {
  const body: SignalBody = { c: l.c, s: l.role === 'out' ? 1 : 0, k, ...(d !== undefined ? { d } : {}) };
  netLink.send({ t: 'sig', to: l.peer, ...body });
}

function flushIce(l: Link) {
  l.iceTimer = undefined;
  if (l.closed) return;
  while (l.outIce.length) send(l, 'ice', l.outIce.splice(0, 8));
}

function closeLink(l: Link, tell: boolean, backoffMs = 0) {
  if (l.closed) return;
  l.closed = true;
  stats.closed++;
  if (tell) send(l, 'bye');
  window.clearTimeout(l.iceTimer);
  l.pc.onicecandidate = null;
  l.pc.onconnectionstatechange = null;
  l.pc.ontrack = null;
  try {
    l.pc.close();
  } catch {
    /* already closed */
  }
  const map = l.role === 'in' ? inbound : outbound;
  if (map.get(l.peer) === l) map.delete(l.peer);
  if (l.nodes) {
    l.nodes.src.disconnect();
    l.nodes.gain.disconnect();
    l.nodes.pan?.disconnect();
    l.nodes = null;
  }
  if (l.el) {
    l.el.pause();
    l.el.srcObject = null;
    l.el = null;
  }
  l.stream = null;
  showTalking(l, 0, false);
  if (backoffMs && l.role === 'in') blockedUntil.set(l.peer, performance.now() + backoffMs);
}

function addIce(l: Link, list: IceWire[]) {
  for (const c of list) {
    const init: RTCIceCandidateInit = { candidate: c.c, sdpMid: c.m, sdpMLineIndex: c.i };
    if (!l.pc.remoteDescription) l.pendingIce.push(init);
    else void l.pc.addIceCandidate(init).catch(() => {});
  }
}

function flushPendingIce(l: Link) {
  for (const init of l.pendingIce.splice(0)) void l.pc.addIceCandidate(init).catch(() => {});
}

/** Opus only (smaller SDP, and the codec every browser has for voice), where the browser lets us choose. */
function preferOpus(tr: RTCRtpTransceiver) {
  try {
    const caps = typeof RTCRtpReceiver !== 'undefined' ? RTCRtpReceiver.getCapabilities?.('audio') : null;
    const opus = caps?.codecs.filter((c) => /\/opus$/i.test(c.mimeType));
    if (opus?.length && typeof tr.setCodecPreferences === 'function') tr.setCodecPreferences(opus);
  } catch {
    /* keep the browser's default order */
  }
}

/** Listener: ask a speaker for their voice. */
async function openInbound(speaker: string) {
  const l = newLink(speaker, nextC++, 'in');
  const tr = l.pc.addTransceiver('audio', { direction: 'recvonly' });
  preferOpus(tr);
  l.pc.ontrack = (e) => attachVoice(l, e.streams[0] ?? new MediaStream([e.track]));
  try {
    const offer = await l.pc.createOffer();
    if (l.closed) return;
    await l.pc.setLocalDescription(offer);
    if (l.closed || !l.pc.localDescription) return;
    send(l, 'offer', l.pc.localDescription.sdp);
  } catch {
    closeLink(l, true, FAIL_BACKOFF_MS);
  }
}

/** Speaker: a listener asks for my voice. */
async function onOffer(from: string, m: SignalBody) {
  const reject = () => netLink.send({ t: 'sig', to: from, c: m.c, s: 1, k: 'bye' });
  if (!local || useVoice.getState().mic !== 'on' || !inHubOnline() || typeof m.d !== 'string') return reject();
  const keep = planListeners(self, true, [...outbound.keys(), from], where);
  if (!keep.includes(from)) return reject();
  for (const [id, l] of [...outbound]) if (!keep.includes(id)) closeLink(l, true);
  const old = outbound.get(from);
  if (old) closeLink(old, false); // a fresh offer replaces the listener's old link
  const l = newLink(from, m.c, 'out');
  try {
    await l.pc.setRemoteDescription({ type: 'offer', sdp: m.d });
    if (l.closed) return;
    const tr = l.pc.getTransceivers()[0];
    if (!tr || !local) return closeLink(l, true);
    tr.direction = 'sendonly';
    await tr.sender.replaceTrack(local.track);
    flushPendingIce(l);
    const answer = await l.pc.createAnswer();
    if (l.closed) return;
    await l.pc.setLocalDescription(answer);
    if (l.closed || !l.pc.localDescription) return;
    send(l, 'answer', l.pc.localDescription.sdp);
  } catch {
    closeLink(l, true);
  }
}

async function onAnswer(l: Link, sdp: string) {
  try {
    await l.pc.setRemoteDescription({ type: 'answer', sdp });
    flushPendingIce(l);
  } catch {
    closeLink(l, true, FAIL_BACKOFF_MS);
  }
}

// ---------------------------------------------------------------- playback
function voiceBus(): { ctx: AudioContext; bus: GainNode } | null {
  const o = audioOut();
  if (!o) return null;
  if (!bus || bus.context !== o.ctx) {
    bus = o.ctx.createGain();
    bus.connect(o.out);
    applyBus();
  }
  return { ctx: o.ctx, bus };
}

function applyBus() {
  if (!bus) return;
  const s = settings();
  bus.gain.setTargetAtTime(s.voiceHear ? s.masterVolume * s.voiceChatVolume : 0, bus.context.currentTime, 0.03);
}

function attachVoice(l: Link, stream: MediaStream) {
  if (l.closed) return;
  l.stream = stream;
  // Chrome only feeds a remote WebRTC stream into Web Audio while a media element plays it too
  // (muted, so it is heard once, through the graph).
  const el = new Audio();
  el.muted = true;
  el.srcObject = stream;
  void el.play().catch(() => {});
  l.el = el;
  buildGraph(l);
}

/** The Web Audio chain for one voice, once audio is unlocked: source → analyser, source → gain → pan → bus. */
function buildGraph(l: Link) {
  if (l.nodes || !l.stream || l.closed) return;
  const vb = voiceBus();
  if (!vb) return;
  const { ctx } = vb;
  try {
    const src = ctx.createMediaStreamSource(l.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    src.connect(analyser);
    src.connect(gain);
    if (pan) gain.connect(pan).connect(vb.bus);
    else gain.connect(vb.bus);
    l.nodes = { src, analyser, gain, pan };
    l.buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  } catch {
    /* no Web Audio for this stream: stays silent */
  }
}

function measure(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  return rmsLevel(buf);
}

/** The speaking ring on a player's name tag (plain DOM, written only when it changes visibly). */
function showTalking(l: Link, level: number, talking: boolean) {
  const tag = (l.tag?.isConnected ? l.tag : null) ?? nameTagEls.get(l.peer)?.querySelector<HTMLElement>('.voice-tag') ?? null;
  l.tag = tag;
  if (!tag) return;
  if (talking !== l.talking) tag.classList.toggle('is-talking', talking);
  l.talking = talking;
  const q = Math.round(Math.min(1, level / 0.25) * 10) / 10;
  if (q !== l.tagLevel) {
    tag.style.setProperty('--talk', String(q));
    l.tagLevel = q;
  }
}

// ---------------------------------------------------------------- the frame loop
export interface VoiceFrameInput {
  /** The local toy on the table. */
  self: Point;
  /** Everyone else in the room, where they are drawn now. */
  others: VoiceCandidate[];
  /** The camera's right-hand direction on the table (for stereo panning). */
  rightX: number;
  rightZ: number;
  /** The talk action (V, or the mic button held) is down. */
  talk: boolean;
  /** Presses of the talk action since the last frame (counted even when released within the frame). */
  presses: number;
}

/** Called every frame while the Hub is on screen (src/character/VoiceProximity.tsx). */
export function voiceFrame(f: VoiceFrameInput) {
  const now = performance.now();
  self.x = f.self.x;
  self.z = f.self.z;
  self.y = f.self.y ?? 0;
  // (objects reused frame to frame: no garbage per frame)
  const stamp = ++frameNo;
  for (const o of f.others) {
    let w = where.get(o.id);
    if (!w) where.set(o.id, (w = { x: 0, z: 0, y: 0, inHub: false, seen: 0 }));
    w.x = o.x;
    w.z = o.z;
    w.y = o.y ?? 0;
    w.inHub = o.inHub;
    w.seen = stamp;
  }
  for (const [id, w] of where) if (w.seen !== stamp) where.delete(id);

  // push to talk / toggle: one press is one toggle (Always on) or the start of a hold (push to talk)
  if (f.presses > 0) {
    holdAt = now;
    talkDown();
  }
  held = f.talk;
  const mode = settings().micMode;
  const sending = !!local && useVoice.getState().mic === 'on' && (mode === 'open' || (held && holdAt > local.openedAt));
  if (local && local.track.enabled !== sending) local.track.enabled = sending;
  transmitting = sending;

  // own level → the mic button
  if (local) {
    if (!local.analyser) {
      const vb = voiceBus();
      if (vb) {
        try {
          local.src = vb.ctx.createMediaStreamSource(local.stream);
          local.analyser = vb.ctx.createAnalyser();
          local.analyser.fftSize = 512;
          local.src.connect(local.analyser); // measured only, never played back
        } catch {
          local.analyser = null;
        }
      }
    }
    if (local.analyser) {
      const raw = sending ? measure(local.analyser, (scratch ??= new Float32Array(new ArrayBuffer(2048)))) : 0;
      local.level = Math.max(raw, local.level * LEVEL_DECAY);
    }
    const el = voiceEls.mic;
    if (el) {
      el.style.setProperty('--lvl', (Math.round(Math.min(1, local.level / 0.25) * 10) / 10).toString());
      el.classList.toggle('is-talking', sending && local.level > SPEAKING_RMS);
      el.classList.toggle('is-sending', sending);
    }
  }

  // voices: distance, direction, level
  const muted = useVoice.getState().muted;
  for (const l of inbound.values()) {
    if (!l.nodes) buildGraph(l);
    const n = l.nodes;
    if (!n || !l.buf) continue;
    const o = where.get(l.peer);
    const d = o ? Math.hypot(o.x - self.x, o.z - self.z) : Infinity;
    const t = n.gain.context.currentTime;
    n.gain.gain.setTargetAtTime(muted.includes(l.peer) ? 0 : proximityGain(d), t, 0.05);
    if (n.pan && o) n.pan.pan.setTargetAtTime(stereoPan(self, o, f.rightX, f.rightZ), t, 0.05);
    const raw = measure(n.analyser, l.buf);
    l.peak = Math.max(l.peak, raw);
    l.level = Math.max(raw, l.level * LEVEL_DECAY);
    showTalking(l, l.level, l.level > SPEAKING_RMS && !muted.includes(l.peer));
  }

  if (now - lastPlan >= PLAN_MS) {
    lastPlan = now;
    plan(f.others, now);
  }
}
/** Re-plan the links: listen to the right speakers, keep only the right listeners, give up on stuck links. */
function plan(others: VoiceCandidate[], now: number) {
  const v = useVoice.getState();
  const s = settings();
  const hearing = s.voiceHear && inHubOnline();
  const micOn = new Set(v.micOn);
  const candidates = others.map((o) => ({ ...o, micOn: micOn.has(o.id) }));
  const blocked = new Set<string>();
  for (const [id, until] of blockedUntil) {
    if (until > now) blocked.add(id);
    else blockedUntil.delete(id);
  }
  const want = planSpeakers(self, candidates, new Set(inbound.keys()), { hearing, muted: new Set(v.muted), blocked });
  for (const l of [...inbound.values()]) {
    if (!want.includes(l.peer)) closeLink(l, true);
    else if (!l.connected && now - l.startedAt > CONNECT_TIMEOUT_MS) closeLink(l, true, FAIL_BACKOFF_MS);
  }
  let fresh = 0;
  for (const id of want) {
    if (inbound.has(id) || fresh >= NEW_LINKS_PER_PLAN) continue;
    fresh++;
    void openInbound(id);
  }
  if (outbound.size) {
    const keep = planListeners(self, v.mic === 'on' && inHubOnline(), [...outbound.keys()], where);
    for (const l of [...outbound.values()]) {
      if (!keep.includes(l.peer)) closeLink(l, true);
      else if (!l.connected && now - l.startedAt > CONNECT_TIMEOUT_MS) closeLink(l, true);
    }
  }
}

// ---------------------------------------------------------------- server messages
export function onVoiceSignal(m: SignalEventMsg) {
  if (!inHubOnline()) return;
  if (m.s === 0) {
    // from a listener, about my voice going to them
    if (m.k === 'offer') return void onOffer(m.from, m);
    const l = outbound.get(m.from);
    if (!l || l.c !== m.c) return;
    if (m.k === 'ice' && Array.isArray(m.d)) addIce(l, m.d);
    else if (m.k === 'bye') closeLink(l, false);
    return;
  }
  // from a speaker, about their voice coming to me
  const l = inbound.get(m.from);
  if (!l || l.c !== m.c) return;
  if (m.k === 'answer' && typeof m.d === 'string') void onAnswer(l, m.d);
  else if (m.k === 'ice' && Array.isArray(m.d)) addIce(l, m.d);
  else if (m.k === 'bye') closeLink(l, false, BUSY_BACKOFF_MS);
}

export function onVoiceMic(m: MicEventMsg) {
  const v = useVoice.getState();
  if (m.id === useNet.getState().selfId) {
    // The server overrode us (a refused change, or it turned the mic off): it has the last word.
    if (!m.on && v.mic !== 'off') closeMic(false);
    else if (m.on && v.mic === 'off') netLink.send({ t: 'mic', on: false });
    return;
  }
  const has = v.micOn.includes(m.id);
  if (m.on && !has) v.set({ micOn: [...v.micOn, m.id] });
  if (!m.on) {
    if (has) v.set({ micOn: v.micOn.filter((id) => id !== m.id) });
    const l = inbound.get(m.id);
    if (l) closeLink(l, false);
  }
}

export function onVoiceMics(m: MicsMsg) {
  const selfId = useNet.getState().selfId;
  useVoice.getState().set({ micOn: m.on.filter((id) => id !== selfId) });
}

// ---------------------------------------------------------------- players' choices
/** Mute or unmute a player (this session). A muted player's link is closed and not asked for again. */
export function toggleMute(id: string) {
  const v = useVoice.getState();
  const muted = v.muted.includes(id) ? v.muted.filter((x) => x !== id) : [...v.muted, id];
  v.set({ muted });
  const l = inbound.get(id);
  if (l && muted.includes(id)) closeLink(l, true);
}

/** Close everything: the mic, every link, and what we knew about the room. */
function shutdown(tellServer: boolean) {
  closeMic(tellServer);
  for (const l of [...inbound.values()]) closeLink(l, tellServer);
  blockedUntil.clear();
  held = false;
}

// ---------------------------------------------------------------- install
let installed = false;
/** Wire voice chat to the game and net stores (once, from App). */
export function installVoice() {
  if (installed) return;
  installed = true;
  useNet.subscribe((s, p) => {
    if (s.status === p.status) {
      if (s.players !== p.players) {
        // Someone left: forget their mic state and mute, close their links.
        const here = new Set(s.players.map((x) => x.id));
        const v = useVoice.getState();
        if (v.micOn.some((id) => !here.has(id)) || v.muted.some((id) => !here.has(id))) v.set({ micOn: v.micOn.filter((id) => here.has(id)), muted: v.muted.filter((id) => here.has(id)) });
        for (const l of [...inbound.values(), ...outbound.values()]) if (!here.has(l.peer)) closeLink(l, false);
      }
      return;
    }
    // Joined a room, dropped, or left: start from nothing (the server turned our mic off too).
    if (p.status === 'online' || s.status === 'online') {
      shutdown(false);
      useVoice.getState().set({ micOn: [], muted: [], mic: 'off' });
    }
  });
  useGame.subscribe((s, p) => {
    // Voice is Hub-only: a trial, the Workshop, the shop or the menu closes the mic and every link.
    if (p.screen === 'playing' && s.screen !== 'playing') shutdown(useNet.getState().status === 'online');
    if (s.voiceHear !== p.voiceHear || s.voiceChatVolume !== p.voiceChatVolume || s.masterVolume !== p.masterVolume) applyBus();
  });

  // Its own key: src/game/voice.ts exposes `voice` (the voice-line log) and exposeDebug merges shallowly.
  exposeDebug({
    voiceChat: {
      state: () => ({
        mic: useVoice.getState().mic,
        blocked: useVoice.getState().blocked,
        mode: settings().micMode,
        transmitting,
        level: local?.level ?? 0,
        micOn: useVoice.getState().micOn.slice(),
        muted: useVoice.getState().muted.slice(),
        inbound: [...inbound.values()].map((l) => ({ id: l.peer, c: l.c, state: l.pc.connectionState, audio: !!l.nodes, level: l.level, gain: l.nodes?.gain.gain.value ?? 0, talking: l.talking })),
        outbound: [...outbound.values()].map((l) => ({ id: l.peer, c: l.c, state: l.pc.connectionState })),
        gumCalls: stats.gumCalls,
        opened: stats.opened,
        closed: stats.closed,
      }),
      /** Highest level heard from a player since the last call (and resets it). */
      peak: (id: string) => {
        const l = inbound.get(id);
        if (!l) return null;
        const p = l.peak;
        l.peak = 0;
        return p;
      },
      mute: (id: string) => toggleMute(id),

    },
  });
}
