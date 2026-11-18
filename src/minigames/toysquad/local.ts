import type { SquadInput } from './rules';
let queue: SquadInput[] = [];
export function submitSquadInput(input: SquadInput) { if (queue.length < 64) queue.push(input); }
export function clearSquadInput() { queue = []; }
export function drainSquadInput() { const inputs = queue; queue = []; return inputs; }
