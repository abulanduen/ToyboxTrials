import type { SquadInput } from './rules';
import { create } from 'zustand';
export const useSquadUI = create<{ selected: number | null; hovered: number | null; shopSlot: number | null }>(() => ({ selected: null, hovered: null, shopSlot: null }));
export const resetSquadUI = () => useSquadUI.setState({ selected: null, hovered: null, shopSlot: null });
let queue: SquadInput[] = [];
export function submitSquadInput(input: SquadInput) { if (queue.length < 64) queue.push(input); }
export function clearSquadInput() { queue = []; }
export function drainSquadInput() { const inputs = queue; queue = []; return inputs; }
