import type { BlinkInput } from './rules';
let queue: BlinkInput[]=[];
let aim: { x:number; z:number } | null=null;
export const setBlinkAim=(value: typeof aim)=>{aim=value;};
export const getBlinkAim=()=>aim;
export const queueBlinkInput=(input:BlinkInput)=>{if(queue.length<32)queue.push(input);};
export const drainBlinkInput=()=>{const inputs=queue;queue=[];return inputs;};
export const clearBlinkInput=()=>{queue=[];aim=null;};
