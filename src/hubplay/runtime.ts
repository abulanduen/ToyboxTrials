/**
 * Hub play in the browser: the shared marble and the basketball.
 *
 * Offline the browser is the authority: it steps the same pure physics as the online server
 * (src/game/hubPlaySim.ts) with the local toy as the only body. Online (a Hub room) the server is
 * the authority: this module buffers the `hp` part of each snapshot and draws the marble and ball
 * INTERP_DELAY_MS behind the newest one, blending between snapshots with their velocities (so a
 * thrown ball follows its arc between 15 Hz snapshots). Your own actions are sent as intent
 * (`kick`, `ball`); your own throw is drawn at once from a local prediction with the same physics
 * and handed back to the server's ball once it lands. Events (goals, baskets, bounces) play sounds,
 * celebrations and tickets.
 *
 * Plain objects only: the frame loop (src/scene/HubPlay.tsx) reads `view` every frame; the HUD
 * store changes only on events.
 */
import { BALL, HOOP, MARBLE, NETS, PITCH_AREA, TEAMS, rollFloorAt } from '../game/hubPlay';
import {
  BALL_GRAVITY,
  GRAB_REACH,
  KICK_REACH,
  STEP,
  createHubPlay,
  dropBall,
  grabBall,
  heldPoint,
  kickMarble,
  solveShot,
  stepHubPlay,
  throwBall,
  yawToHoop,
  type HubPlayState,
  type PlayBody,
  type PlayEvent,
} from '../game/hubPlaySim';
import { INTERP_DELAY_MS, type HubPlayWire, type PlayEventWire } from '../net/protocol';
import { netLink } from '../net/link';
import { useNet } from '../net/store';
import { remotes } from '../net/remotes';
import type { NetSample } from '../net/interp';
import { player } from '../game/player';
import { playHubCue, type HubCue } from '../game/audio';
import { useGame } from '../game/store';
import { PALETTE } from '../game/palette';
import { exposeDebug } from '../game/debug';
import { useHubPlay } from './store';

/** Charge time to full power (ms) while the throw button is held. */
export const CHARGE_MS = 1100;
/** The aim bends to the hoop when it is this close (cm) and within this angle of your facing. */
const ASSIST_RANGE = 40;
const ASSIST_ANGLE = 0.75;
/** Your own throw is drawn from a local prediction for at most this long (ms). */
const PREDICT_MS = 2600;
/** Blend from the predicted ball back to the server's (ms). */
const BLEND_MS = 300;

interface Snap {
  t: number;
  m: HubPlayWire['m'];
  n: 0 | 1;
  b: HubPlayWire['b'];
  h: string | null;
}

/** What the scene draws this frame. */
export const view = {
  marble: { x: MARBLE.home.x, y: MARBLE.r, z: MARBLE.home.z, vx: 0, vz: 0, inNet: false },
  ball: { x: BALL.spot.x, y: BALL.r, z: BALL.spot.z, held: false, holder: null as string | null },
};

/** When the last goal went into each net and the last basket dropped (performance.now()), for the nets' wobble. */
export const fxClock = { goalAt: { w: -1e9, e: -1e9 } as Record<'w' | 'e', number>, hoopAt: -1e9 };

/** Celebrations for the scene to play (goal at a net, basket at the rim). */
/** Confetti bursts for the scene (HubPlay's Confetti): goals, baskets, and a Who Am I? card guessed (src/net/chat.ts). */
export const fxQueue: { kind: 'goal' | 'hoop' | 'card'; x: number; y: number; z: number; color: string }[] = [];

const rt = {
  mode: 'local' as 'local' | 'remote',
  local: createHubPlay(),
  acc: 0,
  buf: [] as Snap[],
  /** Your throw, drawn ahead of the server (online). */
  pred: null as { s: HubPlayState; at: number; acc: number } | null,
  blend: null as { x: number; y: number; z: number; at: number } | null,
  pendingGrab: 0,
  thrownAt: -1e9,
  charge: null as { t0: number } | null,
  lastPushAt: 0,
  score: [0, 0] as [number, number],
  hoops: 0,
  events: 0,
};

const LOCAL_ID = 'me';
export const selfId = () => (rt.mode === 'remote' ? (useNet.getState().selfId ?? LOCAL_ID) : LOCAL_ID);
const selfBody = (): PlayBody => ({ id: selfId(), x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw });
const inHub = () => useGame.getState().screen === 'playing' && !player.eliminated;

// ---------------------------------------------------------------- the local world (offline)
function localBodies(): PlayBody[] {
  return inHub() ? [selfBody()] : [];
}

/** Step the offline world by real time `dt` (s), in fixed steps. */
function stepLocal(dt: number) {
  rt.acc = Math.min(rt.acc + dt, 0.25);
  const ev: PlayEvent[] = [];
  const bodies = localBodies();
  // holding the ball but not in the hub (a trial, the Workshop): keep it in your hands
  const keep = !bodies.length && rt.local.ball.holder === LOCAL_ID ? [{ ...selfBody(), id: LOCAL_ID }] : bodies;
  while (rt.acc >= STEP) {
    stepHubPlay(rt.local, keep, ev);
    rt.acc -= STEP;
  }
  for (const e of ev) onEvent(e, false);
  const s = rt.local;
  const m = s.marble;
  Object.assign(view.marble, { x: m.x, z: m.z, y: rollFloorAt(m.x, m.z) + MARBLE.r, vx: m.vx, vz: m.vz, inNet: !!m.inNet });
  const b = s.ball;
  Object.assign(view.ball, { x: b.x, y: b.y, z: b.z, held: !!b.holder, holder: b.holder });
  setScore(s.score, s.hoops);
}

// ---------------------------------------------------------------- the server's world (online)
/** A snapshot's hub play state (client.ts). */
export function onHubPlaySnap(now: number, hp: HubPlayWire) {
  if (rt.mode !== 'remote') return;
  const last = rt.buf[rt.buf.length - 1];
  if (last && now <= last.t) return;
  rt.buf.push({ t: now, m: hp.m, n: hp.n, b: hp.b, h: hp.h });
  if (rt.buf.length > 40) rt.buf.splice(0, rt.buf.length - 40);
  setScore(hp.s, hp.k);
  // someone else has the ball (a rebound), or it was put back: stop drawing our prediction
  if (rt.pred && hp.h && hp.h !== selfId()) endPrediction();
  if (hp.h === selfId()) rt.pendingGrab = 0;
}

/** Hub play events from the server (client.ts): played INTERP_DELAY_MS later, in step with the drawing. */
export function onHubPlayEvents(list: PlayEventWire[]) {
  if (rt.mode !== 'remote') return;
  const me = selfId();
  for (const w of list) {
    // our own kicks, throws and pick-ups were heard when we pressed
    if ((w.k === 'kick' || w.k === 'throw' || w.k === 'grab') && w.by === me) continue;
    if (w.k === 'reset') endPrediction();
    const e = wireToEvent(w);
    if (e) window.setTimeout(() => onEvent(e, true), INTERP_DELAY_MS);
  }
}

function wireToEvent(w: PlayEventWire): PlayEvent | null {
  switch (w.k) {
    case 'goal':
      return w.net ? { k: 'goal', net: w.net, by: w.by ?? null, score: w.score ?? rt.score } : null;
    case 'hoop':
      return { k: 'hoop', by: w.by ?? null, total: w.total ?? rt.hoops };
    case 'kick':
    case 'throw':
      return w.by ? { k: w.k, by: w.by, p: w.p ?? 1 } : null;
    case 'grab':
    case 'drop':
      return w.by ? { k: w.k, by: w.by } : null;
    case 'rim':
    case 'board':
    case 'bounce':
    case 'wall':
      return { k: w.k, v: w.v ?? 10 };
    case 'reset':
      return { k: 'reset' };
  }
}

const tmpSample: NetSample = { t: 0, x: 0, y: 0, z: 0, yaw: 0, speed: 0, grounded: true };
/** Where a remote toy is drawn now (for the ball in its hands). */
function remoteBody(id: string): PlayBody | null {
  const r = remotes.get(id);
  const now = netLink.serverTime();
  if (!r || now === null) return null;
  const s = r.buf.sample(now - INTERP_DELAY_MS, tmpSample);
  return s ? { id, x: s.x, y: s.y, z: s.z, yaw: s.yaw } : null;
}

/** Cubic Hermite between two samples with their velocities (exact for a ballistic arc). */
function hermite(p0: number, v0: number, p1: number, v1: number, dt: number, k: number) {
  const k2 = k * k;
  const k3 = k2 * k;
  return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * v0 * dt + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * v1 * dt;
}

function sampleRemote() {
  const now = netLink.serverTime();
  const buf = rt.buf;
  if (now === null || !buf.length) return;
  const T = now - INTERP_DELAY_MS;
  let a = buf[0];
  let b: Snap | null = null;
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i].t <= T) {
      a = buf[i];
      b = buf[i + 1] ?? null;
      break;
    }
  }
  if (T < buf[0].t) b = null;
  const vm = view.marble;
  const vb = view.ball;
  if (b) {
    const dt = (b.t - a.t) / 1000;
    const k = Math.max(0, Math.min(1, (T - a.t) / (b.t - a.t)));
    // marble: a jump the velocities can't explain (put back after a goal) is drawn as a jump
    const mJump = Math.hypot(b.m[0] - a.m[0], b.m[1] - a.m[1]) > (Math.hypot(a.m[2], a.m[3]) + Math.hypot(b.m[2], b.m[3])) * dt + 3;
    if (mJump) {
      const s = k < 0.5 ? a : b;
      Object.assign(vm, { x: s.m[0], z: s.m[1], vx: s.m[2], vz: s.m[3] });
    } else {
      vm.x = hermite(a.m[0], a.m[2], b.m[0], b.m[2], dt, k);
      vm.z = hermite(a.m[1], a.m[3], b.m[1], b.m[3], dt, k);
      vm.vx = a.m[2] + (b.m[2] - a.m[2]) * k;
      vm.vz = a.m[3] + (b.m[3] - a.m[3]) * k;
    }
    vm.inNet = (k < 0.5 ? a.n : b.n) === 1;
    const hold = k < 0.5 ? a.h : b.h;
    const bJump = Math.hypot(b.b[0] - a.b[0], b.b[1] - a.b[1], b.b[2] - a.b[2]) > (Math.hypot(a.b[3], a.b[4], a.b[5]) + Math.hypot(b.b[3], b.b[4], b.b[5])) * dt + 3;
    if (a.h || b.h || bJump) {
      const s = k < 0.5 ? a : b;
      Object.assign(vb, { x: s.b[0], y: s.b[1], z: s.b[2] });
    } else {
      vb.x = hermite(a.b[0], a.b[3], b.b[0], b.b[3], dt, k);
      vb.y = hermite(a.b[1], a.b[4], b.b[1], b.b[4], dt, k);
      vb.z = hermite(a.b[2], a.b[5], b.b[2], b.b[5], dt, k);
    }
    vb.holder = hold;
  } else {
    // past the newest snapshot: carry on a little (at most 120 ms), then hold
    const ahead = Math.max(0, Math.min(0.12, (T - a.t) / 1000));
    Object.assign(vm, { x: a.m[0] + a.m[2] * ahead, z: a.m[1] + a.m[3] * ahead, vx: a.m[2], vz: a.m[3], inNet: a.n === 1 });
    const fly = a.h ? 0 : ahead;
    Object.assign(vb, { x: a.b[0] + a.b[3] * fly, y: a.b[1] + a.b[4] * fly - 0.5 * BALL_GRAVITY * fly * fly, z: a.b[2] + a.b[5] * fly, holder: a.h });
  }
  vm.y = rollFloorAt(vm.x, vm.z) + MARBLE.r;
  vb.y = Math.max(vb.y, rollFloorAt(vb.x, vb.z) + BALL.r);
  vb.held = !!vb.holder;
  if (vb.holder && vb.holder !== selfId()) {
    const body = remoteBody(vb.holder);
    if (body) Object.assign(vb, heldPoint(body));
  }
}

function endPrediction() {
  if (!rt.pred) return;
  const b = rt.pred.s.ball;
  rt.blend = { x: b.x, y: b.y, z: b.z, at: performance.now() };
  rt.pred = null;
}

function stepRemote(dt: number) {
  sampleRemote();
  const vb = view.ball;
  const me = selfId();
  // your own ball: in your hands as soon as you pick it up, and until the server has your throw
  if (iHold()) {
    Object.assign(vb, heldPoint(selfBody()), { held: true, holder: me });
    return;
  }
  if (rt.pred) {
    const p = rt.pred;
    p.acc = Math.min(p.acc + dt, 0.25);
    const ev: PlayEvent[] = [];
    while (p.acc >= STEP) {
      stepHubPlay(p.s, [], ev);
      p.acc -= STEP;
    }
    const b = p.s.ball;
    Object.assign(vb, { x: b.x, y: b.y, z: b.z, held: false, holder: null });
    const resting = b.vx === 0 && b.vz === 0 && Math.abs(b.vy) < 1e-9;
    if (resting || performance.now() - p.at > PREDICT_MS) endPrediction();
    return;
  }
  if (rt.blend) {
    const k = (performance.now() - rt.blend.at) / BLEND_MS;
    if (k >= 1 || vb.held) rt.blend = null;
    else {
      const e = 1 - (1 - k) * (1 - k);
      vb.x = rt.blend.x + (vb.x - rt.blend.x) * e;
      vb.y = rt.blend.y + (vb.y - rt.blend.y) * e;
      vb.z = rt.blend.z + (vb.z - rt.blend.z) * e;
    }
  }
}

// ---------------------------------------------------------------- per frame (HubPlay.tsx)
export function stepHubPlayView(dt: number) {
  if (rt.mode === 'local') stepLocal(dt);
  else stepRemote(dt);
  const ui = useHubPlay.getState();
  const holding = iHold();
  const p = player.pos;
  const near = p.x > PITCH_AREA.minX && p.x < PITCH_AREA.maxX && p.z > PITCH_AREA.minZ && p.z < PITCH_AREA.maxZ;
  if (holding !== ui.holding || near !== ui.nearPitch) ui.set({ holding, nearPitch: near });
  if (!holding) rt.charge = null;
}

// ---------------------------------------------------------------- your actions
/** You hold the ball (confirmed by the server, or just picked up and not refused yet). */
export function iHold(): boolean {
  const me = selfId();
  if (rt.mode === 'local') return rt.local.ball.holder === me;
  const now = performance.now();
  const newest = rt.buf[rt.buf.length - 1];
  if (rt.pendingGrab && now - rt.pendingGrab < 800 && (!newest || !newest.h || newest.h === me)) return true;
  if (now - rt.thrownAt < 1200) return false;
  return !!newest && newest.h === me;
}

/** Is the ball free to pick up (nobody holding it)? */
export function ballFree(): boolean {
  return !view.ball.held && !iHold();
}

/** Kick (power 1) or push the marble along (dx, dz). Returns false if it's out of reach. */
export function kick(dx: number, dz: number, power = 1): boolean {
  const body = selfBody();
  if (Math.hypot(view.marble.x - body.x, view.marble.z - body.z) > KICK_REACH + 0.3 || view.marble.inNet) return false;
  if (rt.mode === 'local') {
    const ev: PlayEvent[] = [];
    if (!kickMarble(rt.local, body, dx, dz, power, 0.3, ev)) return false;
    for (const e of ev) onEvent(e, false);
    return true;
  }
  const l = Math.hypot(dx, dz) || 1;
  netLink.send({ t: 'kick', dx: dx / l, dz: dz / l, p: Math.max(0, Math.min(1, power)) });
  cue(power > 0.7 ? 'kick' : 'push', view.marble, 1);
  return true;
}

/** Walking into the marble pushes it (called by the scene at most every PUSH_EVERY_MS while you press into it). */
export const PUSH_EVERY_MS = 200;
export function pushMarble(dx: number, dz: number, power: number) {
  const now = performance.now();
  if (now - rt.lastPushAt < PUSH_EVERY_MS) return;
  rt.lastPushAt = now;
  kick(dx, dz, power);
}

export function grab(): boolean {
  const body = selfBody();
  if (!ballFree() || Math.hypot(view.ball.x - body.x, view.ball.z - body.z) > GRAB_REACH + 0.3) return false;
  if (rt.mode === 'local') {
    const ev: PlayEvent[] = [];
    if (!grabBall(rt.local, body, 0.3, ev)) return false;
    for (const e of ev) onEvent(e, false);
  } else {
    netLink.send({ t: 'ball', a: 'grab' });
    rt.pendingGrab = performance.now();
    rt.pred = null;
    rt.blend = null;
    cue('grab', view.ball, 1);
  }
  useHubPlay.getState().set({ holding: true });
  return true;
}

/** Start charging a throw (the throw button went down). */
export function startCharge() {
  if (iHold() && !rt.charge) rt.charge = { t0: performance.now() };
}
export function cancelCharge() {
  rt.charge = null;
}
/** Charge 0..1, or null when not charging. */
export function chargePower(): number | null {
  return rt.charge ? Math.min(1, (performance.now() - rt.charge.t0) / CHARGE_MS) : null;
}

/** The facing a throw goes in: yours, bent onto the hoop when it is close and roughly ahead. */
export function aimYaw(): number {
  const p = player.pos;
  const dx = HOOP.rim.x - p.x;
  const dz = HOOP.rim.z - p.z;
  if (Math.hypot(dx, dz) < ASSIST_RANGE) {
    const want = yawToHoop(p.x, p.z);
    const d = Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw));
    if (Math.abs(d) < ASSIST_ANGLE) return want;
  }
  return player.yaw;
}

/** Let go: throw with the charged power (the throw button came up). */
export function releaseCharge() {
  const p = chargePower();
  rt.charge = null;
  if (p === null) return;
  throwNow(aimYaw(), p);
}

export function throwNow(yaw: number, power: number): boolean {
  if (!iHold()) return false;
  const body = { ...selfBody(), yaw };
  if (rt.mode === 'local') {
    const ev: PlayEvent[] = [];
    if (!throwBall(rt.local, body, yaw, power, ev)) return false;
    for (const e of ev) onEvent(e, false);
  } else {
    netLink.send({ t: 'ball', a: 'throw', yaw, p: power });
    rt.thrownAt = performance.now();
    rt.pendingGrab = 0;
    const s = createHubPlay();
    s.ball.holder = body.id;
    throwBall(s, body, yaw, power);
    rt.pred = { s, at: performance.now(), acc: 0 };
    rt.blend = null;
    cue('throw', body, 1);
  }
  useHubPlay.getState().set({ holding: false });
  return true;
}

// ---------------------------------------------------------------- events → sounds, celebrations, tickets
function cue(c: HubCue, at: { x: number; z: number }, loud: number, reach = 70) {
  const d = Math.hypot(at.x - player.pos.x, at.z - player.pos.z);
  const v = Math.max(0, 1 - d / reach) * loud;
  if (useGame.getState().screen === 'playing' && v > 0.02) playHubCue(c, v);
}

function nameOf(id: string | null): string | null {
  if (!id) return null;
  if (id === selfId()) return 'You';
  return useNet.getState().players.find((p) => p.id === id)?.name ?? null;
}

function setScore(score: readonly number[], hoops: number) {
  if (score[0] === rt.score[0] && score[1] === rt.score[1] && hoops === rt.hoops) return;
  rt.score = [score[0], score[1]];
  rt.hoops = hoops;
  useHubPlay.getState().set({ score: [score[0], score[1]], hoops });
}

function onEvent(e: PlayEvent, remote: boolean) {
  rt.events++;
  const g = useGame.getState();
  switch (e.k) {
    case 'kick':
      cue(e.p > 0.7 ? 'kick' : 'push', view.marble, 1);
      break;
    case 'wall':
      cue('clack', view.marble, Math.min(1, e.v / 25));
      break;
    case 'goal': {
      const n = NETS.find((x) => x.id === e.net)!;
      fxQueue.push({ kind: 'goal', x: n.mouthX - n.dir * 1.5, y: 2, z: n.z, color: n.scorer === 0 ? PALETTE.coral : PALETTE.toyBlue });
      fxClock.goalAt[n.id] = performance.now();
      cue('goal', { x: n.mouthX, z: n.z }, 1, 160);
      if (!remote) setScore(e.score, rt.hoops);
      const who = nameOf(e.by);
      const near = useHubPlay.getState().nearPitch;
      if (g.screen === 'playing' && (near || e.by === selfId())) {
        g.pushTicket({ title: `Goal for ${TEAMS[n.scorer]}!`, body: `${TEAMS[0]} ${e.score[0]} – ${e.score[1]} ${TEAMS[1]}${who ? ` · ${who === 'You' ? 'your kick' : `kicked in by ${who}`}` : ''}`, tone: 'reward' });
      }
      break;
    }
    case 'hoop': {
      fxQueue.push({ kind: 'hoop', x: HOOP.rim.x, y: HOOP.rim.y, z: HOOP.rim.z, color: PALETTE.honey });
      fxClock.hoopAt = performance.now();
      cue('swish', HOOP.rim, 1, 120);
      if (!remote) setScore(rt.score, e.total);
      if (e.by === selfId()) {
        const mine = useHubPlay.getState().mine + 1;
        useHubPlay.getState().set({ mine });
        if (g.screen === 'playing') g.pushTicket({ title: 'Swish!', body: `${mine === 1 ? 'Your first basket' : `${mine} baskets for you`} · ${e.total} in the Hub`, tone: 'reward' });
      }
      break;
    }
    case 'rim':
      cue('rim', view.ball, Math.min(1, e.v / 30));
      break;
    case 'board':
      cue('board', view.ball, Math.min(1, e.v / 30));
      break;
    case 'bounce':
      cue('bounce', view.ball, Math.min(1, e.v / 40));
      break;
    case 'grab':
      cue('grab', view.ball, 0.8);
      break;
    case 'throw':
      cue('throw', view.ball, 0.8);
      break;
    case 'drop':
    case 'reset':
      break;
  }
}

// ---------------------------------------------------------------- online / offline
/** The net client joined a room (true) or left it (false). */
export function setHubPlayOnline(on: boolean) {
  if (on === (rt.mode === 'remote')) {
    if (on) rt.buf.length = 0; // a new room (or a resume): start from its snapshots
    return;
  }
  if (on) {
    rt.mode = 'remote';
    rt.buf.length = 0;
    rt.pred = null;
    rt.blend = null;
    rt.pendingGrab = 0;
    rt.charge = null;
    return;
  }
  // Back offline: carry on locally from where the room had things (the room's ball is let go).
  const s = createHubPlay();
  const last = rt.buf[rt.buf.length - 1];
  if (last) {
    Object.assign(s.marble, { x: last.m[0], z: last.m[1], vx: last.m[2], vz: last.m[3] });
    if (last.n) Object.assign(s.marble, { vx: 0, vz: 0 });
    if (!last.h) Object.assign(s.ball, { x: last.b[0], y: last.b[1], z: last.b[2], vx: last.b[3], vy: last.b[4], vz: last.b[5] });
  }
  s.score = [rt.score[0], rt.score[1]];
  s.hoops = rt.hoops;
  rt.local = s;
  rt.mode = 'local';
  rt.acc = 0;
  rt.buf.length = 0;
  rt.pred = null;
  rt.blend = null;
  rt.charge = null;
  useHubPlay.getState().set({ holding: false });
}

// Going into a trial (or the Workshop) offline with the ball: it drops where you stood.
useGame.subscribe((s, p) => {
  if (s.screen !== p.screen && s.screen !== 'playing' && rt.mode === 'local' && rt.local.ball.holder === LOCAL_ID) {
    dropBall(rt.local, LOCAL_ID, selfBody());
    useHubPlay.getState().set({ holding: false });
  }
});

function ballResting(): boolean {
  if (rt.mode === 'local') {
    const b = rt.local.ball;
    return !b.holder && b.vx === 0 && b.vy === 0 && b.vz === 0;
  }
  const n = rt.buf[rt.buf.length - 1];
  return !!n && !n.h && n.b[3] === 0 && n.b[4] === 0 && n.b[5] === 0 && !rt.pred;
}

// ?debug only (tests): read the state, act through the same paths as the controls.
exposeDebug({
  hubplay: {
    mode: () => rt.mode,
    state: () => ({
      mode: rt.mode,
      marble: { ...view.marble },
      ball: { ...view.ball },
      holding: iHold(),
      score: [...rt.score],
      hoops: rt.hoops,
      mine: useHubPlay.getState().mine,
      events: rt.events,
      charge: chargePower(),
      newest: rt.buf.length ? { ...rt.buf[rt.buf.length - 1] } : null,
      /** The ball lies still (not held, not moving), in the authority's state. */
      ballRest: ballResting(),
    }),
    kick: (dx: number, dz: number, p = 1) => kick(dx, dz, p),
    grab: () => grab(),
    throw: (yaw: number, p: number) => throwNow(yaw, p),
    /** Power that sinks a throw from where you stand, facing the hoop (null if none). */
    solve: () => {
      const b = selfBody();
      const yaw = yawToHoop(b.x, b.z);
      return { yaw, power: solveShot({ ...b, yaw }, yaw) };
    },
    /** Put the marble at (x, z): offline at once; online only on a test server (MATCH_DEBUG=1). */
    place: (x: number, z: number) => {
      if (rt.mode === 'local') Object.assign(rt.local.marble, { x, z, vx: 0, vz: 0, inNet: null });
      else netLink.send({ t: 'hpdebug', x, z });
    },
  },
});
