import type { SpellboxInput } from './rules';
let queue:SpellboxInput[]=[];
let aim:{x:number;z:number}|null=null;
export const setSpellboxAim=(value:typeof aim)=>{aim=value;};
export const getSpellboxAim=()=>aim;
export const queueSpellboxInput=(input:SpellboxInput)=>{if(queue.length<32)queue.push(input);};
export const drainSpellboxInput=()=>{const inputs=queue;queue=[];return inputs;};
export const clearSpellboxInput=()=>{queue=[];aim=null;};
