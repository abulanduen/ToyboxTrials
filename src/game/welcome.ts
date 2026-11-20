/**
 * Welcoming players to the Hub: Pipwick's first-visit tour, chatting with Pipwick afterwards, and
 * the gate greeters' bubbles. Glue between the pure tour machine (tour.ts), the voice lines
 * (voice.ts, voiceLines.ts), the persisted store (`tourSeen`) and the scene/UI.
 *
 * The React side reads `useWelcome` (changes only when a phase or line changes); per-frame values
 * (camera glide, Pipwick's flight) live in the plain `tourRt` object.
 */
import * as THREE from 'three';
import { create } from 'zustand';
import { useGame } from './store';
import { tourFlag } from './tourFlag';
import { speak, stopVoice, voiceProgress } from './voice';
import { CHAT_LINES, GREETERS, chatLineId, tourLineId } from './voiceLines';
import { TOUR_STOPS, arcPoint, cameraLift, flyTime, tourNext, tourSkip, tourStart, tourStep, type TourState, type Vec3 } from './tour';
import { clearInput } from './input';
import { exposeDebug } from './debug';
import { events } from './events';
import type { MinigameId } from '../minigames/ids';

export type WelcomeMode = 'tour' | 'chat' | null;

interface WelcomeStore {
  mode: WelcomeMode;
  /** Tour: current stop and phase. */
  stop: number;
  phase: TourState['phase'];
  /** Chat: which line Pipwick is saying ('hello', 'bye' or an idle line index). */
  chat: 'hello' | 'bye' | number;
  /** The gate whose greeter is talking to the player (bubble shown), or null. */
  greeter: MinigameId | null;
}

export const useWelcome = create<WelcomeStore>()(() => ({ mode: null, stop: 0, phase: 'fly', chat: 'hello', greeter: null }));

/** Per-frame tour state (no React). */
/** With a recording, the tour moves on this long after a line ends (s). Not after the last stop. */
export const AFTER_LINE_S = 0.9;

export const tourRt = {
  /** Move on by itself when a stop's recording ends (tests can turn it off through ?debug). */
  auto: true,
  /** Seconds since the current stop's line ended. */
  endedFor: 0,
  state: tourStart(),
  /** Camera pose the current glide starts from (captured from the live camera at the tour's start). */
  fromCam: [0, 30, 70] as Vec3,
  fromLook: [0, 0, 0] as Vec3,
  /** Set when the tour starts: the camera's pose is captured on the next frame. */
  capture: false,
  /** The camera's current pose (written each frame while the tour drives it). */
  cam: new THREE.Vector3(),
  look: new THREE.Vector3(),
  /** Seconds the player has been in the Hub this visit (auto-start waits for the camera to settle). */
  inHub: 0,
  /** A tour asked for from the main menu: start it as soon as the Hub is ready. */
  pending: false,
  /** Next / Skip pressed on the keyboard this frame (handled on the next tour step). */
  next: false,
  skip: false,
  /** Seconds since the last idle chat line (cycles through them). */
  idleIdx: 0,
};

function setFlags(mode: WelcomeMode) {
  tourFlag.active = mode !== null;
  tourFlag.camera = mode === 'tour';
  if (mode) clearInput();
}

/** Start the tour (first visit, the main menu's How to play, or asking Pipwick). */
export function startTour() {
  tourRt.state = tourStart();
  tourRt.capture = true;
  tourRt.next = tourRt.skip = false;
  tourRt.pending = false;
  useWelcome.setState({ mode: 'tour', stop: 0, phase: 'fly', greeter: null });
  setFlags('tour');
}

function finishTour() {
  stopVoice();
  useWelcome.setState({ mode: null, phase: 'done' });
  setFlags(null);
  if (!useGame.getState().tourSeen) useGame.getState().set({ tourSeen: true });
}

/** UI: Next. */
export function tourNextPressed() {
  tourRt.next = true;
}
/** UI: Skip tour (also Esc). Skipping counts as seen. */
export function tourSkipPressed() {
  tourRt.skip = true;
}

/** Main menu → How to play → "Take the Hub tour": go to the Hub and start it there. */
export function requestTour() {
  tourRt.pending = true;
  useGame.getState().goTo('playing');
}

// ---------------------------------------------------------------- chatting with Pipwick

export function pipwickTalk() {
  useWelcome.setState({ mode: 'chat', chat: 'hello', greeter: null });
  setFlags('chat');
  speak(chatLineId('hello'));
}
events.on('pipwick:talk', pipwickTalk);

/** Chat choices: take the tour again, hear another remark, or say goodbye. */
export function chatChoose(choice: 'tour' | 'more' | 'bye') {
  if (choice === 'tour') {
    startTour();
    return;
  }
  if (choice === 'more') {
    const i = tourRt.idleIdx++ % CHAT_LINES.idle.length;
    useWelcome.setState({ chat: i });
    speak(chatLineId(i));
    return;
  }
  speak(chatLineId('bye'));
  useWelcome.setState({ mode: null, chat: 'bye' });
  setFlags(null);
}

// ---------------------------------------------------------------- the frame loop

/** Called every frame by the Hub scene (src/scene/Pipwick.tsx). */
export function stepWelcome(dt: number) {
  const g = useGame.getState();
  const w = useWelcome.getState();
  if (g.screen !== 'playing') {
    tourRt.inHub = 0;
    if (w.mode) {
      // left the Hub mid-tour (an online lobby starting, a deep link): stop without marking it seen
      stopVoice();
      useWelcome.setState({ mode: null });
      setFlags(null);
    }
    return;
  }
  tourRt.inHub += dt;
  if (!w.mode) {
    const free = g.ready && !g.paused && !g.panel && tourRt.inHub > 1.2;
    if (free && (tourRt.pending || !g.tourSeen)) startTour();
    tourRt.next = tourRt.skip = false;
    return;
  }
  if (w.mode !== 'tour') return;

  let s = tourRt.state;
  const before = s;
  if (tourRt.skip) s = tourSkip(s);
  else if (tourRt.next) s = tourNext(s);
  tourRt.next = tourRt.skip = false;
  // With a recording, move on shortly after Pipwick finishes the line (the last stop waits for the player).
  if (s === before && s.phase === 'talk' && tourRt.auto && s.stop < TOUR_STOPS.length - 1) {
    if (voiceProgress(tourLineId(TOUR_STOPS[s.stop].id)).state === 'ended') {
      tourRt.endedFor += dt;
      if (tourRt.endedFor >= AFTER_LINE_S) s = tourNext(s);
    } else tourRt.endedFor = 0;
  }
  if (s !== before) tourRt.endedFor = 0;
  s = tourStep(s, s === before ? dt : 0);
  if (s.phase === 'done') {
    tourRt.state = s;
    finishTour();
    return;
  }
  if (s.stop !== before.stop || (s.phase === 'fly' && before.phase !== 'fly')) {
    // a new flight: glide from wherever the camera is now
    tourRt.fromCam = [tourRt.cam.x, tourRt.cam.y, tourRt.cam.z];
    tourRt.fromLook = [tourRt.look.x, tourRt.look.y, tourRt.look.z];
  }
  if (s.phase === 'talk' && before.phase !== 'talk') speak(tourLineId(TOUR_STOPS[s.stop].id));
  if (s.phase === 'fly' && before.phase === 'talk') stopVoice();
  tourRt.state = s;
  if (s.stop !== w.stop || s.phase !== w.phase) useWelcome.setState({ stop: s.stop, phase: s.phase });
}

/**
 * The tour's camera, called by the player controller while `tourFlag.camera` is set. Glides along
 * a raised arc to each stop, then drifts very slightly while Pipwick talks.
 */
export function tourCamera(camera: THREE.PerspectiveCamera) {
  if (tourRt.capture) {
    tourRt.capture = false;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    tourRt.cam.copy(camera.position);
    tourRt.look.copy(camera.position).addScaledVector(dir, 14);
    tourRt.fromCam = [camera.position.x, camera.position.y, camera.position.z];
    tourRt.fromLook = [tourRt.look.x, tourRt.look.y, tourRt.look.z];
  }
  const s = tourRt.state;
  const stop = TOUR_STOPS[Math.min(s.stop, TOUR_STOPS.length - 1)];
  if (s.phase === 'fly') {
    const k = Math.min(1, s.t / flyTime(s.stop));
    const lift = cameraLift(tourRt.fromCam, stop.cam);
    tourRt.cam.set(...arcPoint(tourRt.fromCam, stop.cam, k, lift));
    tourRt.look.set(...arcPoint(tourRt.fromLook, stop.look, k, lift * 0.35));
  } else {
    const drift = Math.sin(s.t * 0.35) * 0.6;
    tourRt.cam.set(stop.cam[0] + drift, stop.cam[1] + Math.sin(s.t * 0.27) * 0.25, stop.cam[2]);
    tourRt.look.set(...stop.look);
  }
  camera.position.copy(tourRt.cam);
  // Aim a little below the subject so it sits in the upper part of the screen, above the tour
  // card along the bottom (more so in portrait, where the card is taller).
  const dist = tourRt.cam.distanceTo(tourRt.look);
  camera.lookAt(tourRt.look.x, tourRt.look.y - dist * (camera.aspect < 1 ? 0.26 : 0.13), tourRt.look.z);
}

/** The greeter speech bubble's DOM element (set by WelcomeUI); the scene moves it each frame. */
export const greeterBubble = { el: null as HTMLElement | null };

/** Greeter speech bubbles: the scene reports which gate's greeter the player is near. */
const lastGreet = new Map<MinigameId, number>();
export function setGreeter(game: MinigameId | null, now: number) {
  if (useWelcome.getState().greeter === game) return;
  useWelcome.setState({ greeter: game });
  if (!game) return;
  // speak when the player walks up, but not again for a while if they hover around the gate
  if (now - (lastGreet.get(game) ?? -Infinity) > 25) speak(GREETERS[game].id);
  lastGreet.set(game, now);
}

exposeDebug({
  welcome: {
    state: () => ({ ...useWelcome.getState(), t: tourRt.state.t, flag: { ...tourFlag }, tourSeen: useGame.getState().tourSeen }),
    next: tourNextPressed,
    skip: tourSkipPressed,
    start: startTour,
    autoAdvance: (on: boolean) => {
      tourRt.auto = on;
    },
  },
});
