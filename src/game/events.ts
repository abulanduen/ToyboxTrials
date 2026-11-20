/**
 * Tiny typed event bus for one-shot scene events (UI → 3D scene, interactions → props).
 * Continuous state lives in the Zustand store; transient "something happened" signals live here,
 * which keeps React re-renders out of the frame loop.
 */
import type { EmoteId } from './emotes';

export type GameEvents = {
  'player:interact': void;
  'player:jump': void;
  'player:land': { impact: number };
  'player:eliminate': { reason: string };
  'player:respawn': void;
  'player:boost': { seconds: number };
  /** The local toy started an emote (the online client forwards it to the room). */
  'player:emote': { id: EmoteId };
  /** Put the local toy here (online: the room's spawn spot on joining). */
  'player:teleport': { x: number; z: number; yaw: number };
  'prop:marble-push': { dirX: number; dirZ: number };
  'prop:jack-pop': void;
  /** The jack pops to slap a Who Am I? card on someone (online): the same pop, no ambush. */
  'prop:jack-card': void;
  'prop:musicbox-play': void;
  'prop:key-collected': void;
  /** The player talked to Pipwick, the welcome mascot (src/game/welcome.ts). */
  'pipwick:talk': void;
  /** Someone cranked the Hub jukebox (it plays a little flourish). */
  'prop:jukebox-crank': void;
  'gate:open': { id: string };
  /** The hub TV beside the Scoreboard changes channel. */
  'tv:next': void;
  /** Workshop/shop: play a gesture on the local toy as a preview (not sent online). */
  'toy:preview-gesture': { id: EmoteId };
  /** Workshop asks the turntable to show the front (paint/hats) or back (wind-up key). */
  'workshop:view': { back: boolean };
};

type Handler<T> = (payload: T) => void;

export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(type: K, ...payload: E[K] extends void ? [] : [E[K]]): void {
    this.map.get(type)?.forEach((fn) => (fn as Handler<E[K]>)(payload[0] as E[K]));
  }
}

export const events = new Emitter<GameEvents>();
