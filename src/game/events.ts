/**
 * Tiny typed event bus for one-shot scene events (UI → 3D scene, interactions → props).
 * Continuous state lives in the Zustand store; transient "something happened" signals live here,
 * which keeps React re-renders out of the frame loop.
 */
export type GameEvents = {
  'player:interact': void;
  'player:jump': void;
  'player:land': { impact: number };
  'player:eliminate': { reason: string };
  'player:respawn': void;
  'player:boost': { seconds: number };
  'prop:marble-push': { dirX: number; dirZ: number };
  'prop:jack-pop': void;
  'prop:musicbox-play': void;
  'prop:key-collected': void;
  'gate:open': { id: string };
  /** Workshop asks the turntable to show the front (paint/hats) or back (wind-up key). */
  'workshop:view': { back: boolean };
};

type Handler<T> = (payload: T) => void;

class Emitter<E extends Record<string, unknown>> {
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
