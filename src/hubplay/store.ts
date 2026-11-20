/**
 * What the HUD shows about hub play: the pitch score, baskets, whether you're holding the ball.
 * Changes only on events (a goal, a basket, picking up, walking onto the pitch), never per frame:
 * positions live in plain objects (runtime.ts).
 */
import { create } from 'zustand';

export interface HubPlayUi {
  /** Goals [Coral, Blue] (the room's, online). */
  score: [number, number];
  /** Baskets scored by everyone (the room's, online) and by you this session. */
  hoops: number;
  mine: number;
  /** You hold the basketball. */
  holding: boolean;
  /** You're on the pitch / by the hoop (the score chip shows). */
  nearPitch: boolean;
  set: (patch: Partial<HubPlayUi>) => void;
}

export const useHubPlay = create<HubPlayUi>()((set) => ({
  score: [0, 0],
  hoops: 0,
  mine: 0,
  holding: false,
  nearPitch: false,
  set: (patch) => set(patch),
}));

/**
 * The throw meter's fill element, written by the frame loop (style only, no React state): the
 * HUD registers it, the scene sets its width while you charge a throw.
 */
export const meter = { el: null as HTMLElement | null, wrap: null as HTMLElement | null };
