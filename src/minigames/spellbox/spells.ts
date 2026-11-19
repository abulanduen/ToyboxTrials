import { PALETTE } from '../../game/palette';
export const SPELL_IDS=['pop-rocket','spring-fan','marble-burst','bubble-ward','ribbon-tether','pinwheel-storm','repair-stitches','button-mine','blink'] as const;
export type SpellId=typeof SPELL_IDS[number];
export interface Spell { name:string; effect:'bolt'|'cone'|'bomb'|'shield'|'pull'|'nova'|'repair'|'mine'|'blink'; damage:number; force:number; range:number; radius:number; speed:number; cooldown:number; windup:number; colour:string; description:string }
export const SPELLS:Record<SpellId,Spell>={
  'pop-rocket':{name:'Pop Rocket',effect:'bolt',damage:14,force:9,range:30,radius:.5,speed:22,cooldown:1300,windup:180,colour:PALETTE.coral,description:'A fast, single-target rocket. Build damage from a distance.'},
  'spring-fan':{name:'Spring Fan',effect:'cone',damage:8,force:13,range:6,radius:0,speed:0,cooldown:2400,windup:420,colour:PALETTE.honey,description:'A broad 120° fan with strong knockback. Catch several toys near an edge.'},
  'marble-burst':{name:'Marble Burst',effect:'bomb',damage:10,force:10,range:26,radius:3.5,speed:16,cooldown:3000,windup:320,colour:PALETTE.toyBlue,description:'A travelling marble that explodes on contact or at maximum range.'},
  'bubble-ward':{name:'Bubble Ward',effect:'shield',damage:0,force:0,range:0,radius:1.7,speed:0,cooldown:5000,windup:0,colour:PALETTE.sage,description:'For 1.2s, reduce incoming damage and knockback by 65%. Keep your footing.'},
  'ribbon-tether':{name:'Ribbon Tether',effect:'pull',damage:6,force:8,range:25,radius:.4,speed:24,cooldown:3400,windup:240,colour:PALETTE.inkPurple,description:'A narrow ribbon shot pulls its target toward the caster. Pull enemies into your blasts.'},
  'pinwheel-storm':{name:'Pinwheel Storm',effect:'nova',damage:12,force:16,range:5.5,radius:5.5,speed:0,cooldown:4400,windup:650,colour:PALETTE.coral,description:'A clearly marked blast around you. Long wind-up, powerful radial knockback.'},
  'repair-stitches':{name:'Repair Stitches',effect:'repair',damage:0,force:0,range:0,radius:1.5,speed:0,cooldown:6500,windup:450,colour:PALETTE.sage,description:'Remove 20 damage. This lowers future knockback but does not cancel existing momentum.'},
  'button-mine':{name:'Button Mine',effect:'mine',damage:16,force:17,range:3.5,radius:3,speed:0,cooldown:3800,windup:300,colour:PALETTE.brass,description:'Place an aimed mine. Arms in 0.6s, lasts 6s; at most two per owner.'},
  // Blink: `range` is the teleport distance and `radius` the arrival shockwave (see BLINK below).
  'blink':{name:'Blink',effect:'blink',damage:5,force:11,range:7,radius:3.2,speed:0,cooldown:4200,windup:120,colour:PALETTE.toyBlue,description:'Zip 7 cm the way you aim, then a shockwave around you shoves nearby toys outward.'},
};
/** Blink tuning (provisional). Landing stays this far inside the live edge, beyond the body radius. */
export const BLINK={edgeMargin:.6,momentumKept:.4} as const;
/** Draft card stat line, e.g. "14 damage · 9 push · 1.3s cooldown · 0.18s cast". */
export function spellStats(id:SpellId):string{
  const d=SPELLS[id],timing=`${d.cooldown/1000}s cooldown · ${d.windup/1000}s cast`;
  if(d.effect==='blink')return `${d.range} cm blink · ${d.damage} damage · ${d.force} push wave · ${timing}`;
  return `${d.damage>0?`${d.damage} damage · ${d.force} ${d.effect==='pull'?'pull':'push'} · `:''}${timing}`;
}
export const DEFAULT_BUILD:SpellId[]=['pop-rocket','spring-fan','bubble-ward'];
/**
 * Three choices per button, nine spells, each on exactly one button. Blink (mobility) took the R
 * slot Button Mine used to share with E, so every button still offers exactly three.
 */
export const SLOT_OPTIONS:readonly (readonly SpellId[])[]=[
  ['pop-rocket','marble-burst','ribbon-tether'],
  ['spring-fan','pinwheel-storm','button-mine'],
  ['bubble-ward','repair-stitches','blink'],
];
