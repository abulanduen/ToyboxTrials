import type { SquadInput, SquadPlayer } from './rules';
import { create } from 'zustand';
/** Local-only UI state. `dragging` is the unit being dragged in 3D; `overShop` is true while that drag is over the shop (sell) strip. */
export interface SquadUI { selected: number | null; hovered: number | null; shopSlot: number | null; dragging: number | null; overShop: boolean }
const blank: SquadUI = { selected: null, hovered: null, shopSlot: null, dragging: null, overShop: false };
export const useSquadUI = create<SquadUI>(() => ({ ...blank }));
export const resetSquadUI = () => useSquadUI.setState({ ...blank });
let queue: SquadInput[] = [];
export function submitSquadInput(input: SquadInput) { if (queue.length < 64) queue.push(input); }
export function clearSquadInput() { queue = []; }
export function drainSquadInput() { const inputs = queue; queue = []; return inputs; }
/** The local player's live state, refreshed by the scene each frame so keyboard shortcuts can see the squad. Read-only. */
let localPlayer: SquadPlayer | null = null;
export const setLocalPlayer = (p: SquadPlayer | null) => { localPlayer = p; };
export const getLocalPlayer = () => localPlayer;
