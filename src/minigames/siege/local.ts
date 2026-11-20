/**
 * Local-only glue for Toybox Siege: the HUD queues card choices, class picks and spectator
 * commands here, and `readLocalInput` hands them to the rules on the next fixed step.
 */
import type { SiegeInput } from './rules';

let queue: SiegeInput[] = [];
export const queueSiegeInput = (input: SiegeInput) => { if (queue.length < 32) queue.push(input); };
export const drainSiegeInput = () => { const out = queue; queue = []; return out; };
export const clearSiegeInput = () => { queue = []; };
