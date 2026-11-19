import type { BotPolicy } from '../types';
import { shuffle } from '../rng';
import { SLOT_OPTIONS, SPELLS } from './spells';
import type { SpellboxInput, SpellboxState } from './rules';
export function createSpellboxBot():BotPolicy<SpellboxState,SpellboxInput>{
  const next=new Map<string,number>(),equipped=new Set<string>();
  return{decide(s,c,_dt,rng){
    const p=s.players.find(p=>p.id===c.id);if(!p||!p.alive||s.t<(next.get(c.id)??0))return[];
    const delay=c.bot==='easy'?420:c.bot==='hard'?140:260;next.set(c.id,s.t+delay);
    if(s.phase==='draft'){
      if(p.ready)return[];
      if(!equipped.has(p.id)){
        equipped.add(p.id);
        const build:string[]=[];
        const choices=SLOT_OPTIONS.map((options,slot)=>{const spell=shuffle(rng,options.filter(id=>!build.includes(id)))[0];build.push(spell);return{type:'equip' as const,slot,spell};});
        // The draft has no deadline: bots lock in after a short, seeded look at their build so
        // their Ready markers appear one by one rather than all on the first tick.
        next.set(c.id,s.t+Math.round(700+rng()*1500));
        return choices;
      }return[{type:'ready'}];
    }
    if(s.phase!=='arena')return[];
    const enemies=s.players.filter(o=>o!==p&&o.alive).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)||a.id.localeCompare(b.id));
    const target=enemies[0];if(!target)return[];
    const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz)||1,r=Math.hypot(p.x,p.z)||1,safeRadius=s.shrink?.to??s.radius;
    const threatened=s.projectiles.some(shot=>shot.owner!==p.id&&Math.hypot(shot.x-p.x,shot.z-p.z)<6)||enemies.some(e=>e.cast&&SPELLS[e.cast.spell].effect==='nova'&&Math.hypot(e.x-p.x,e.z-p.z)<7);
    let mx=dx/d,mz=dz/d;
    if(r>safeRadius-4){mx=-p.x/r;mz=-p.z/r;}
    else if(threatened&&rng()<(c.bot==='easy'?.25:c.bot==='hard'?.9:.65)){mx=-dz/d;mz=dx/d;}
    else if(d<4){mx=-dx/d;mz=-dz/d;}
    else if(d<9){const sign=rng()<.5?-1:1;mx=-dz/d*sign;mz=dx/d*sign;}
    const inputs:SpellboxInput[]=[{type:'move',x:mx,z:mz},{type:'aim',x:dx/d,z:dz/d}];
    if(p.cast||s.t<p.nextAction||s.t<p.stunnedUntil)return inputs;
    const slots=p.build.map((id,slot)=>({id,slot,d:SPELLS[id]})).filter(o=>s.t>=p.cooldowns[o.slot]);
    // Blink: escape toward the centre when near the edge (or flying outward), otherwise jump next to
    // an enemy that is near the edge or clustered with others, so the arrival shockwave shoves them.
    const blink=slots.find(o=>o.d.effect==='blink');
    if(blink){
      const outward=(p.vx*p.x+p.vz*p.z)/r;
      if(r>safeRadius-3.5||r>safeRadius-7&&outward>4){inputs.push({type:'aim',x:-p.x/r,z:-p.z/r},{type:'cast',slot:blink.slot});return inputs;}
      const wave=blink.d.radius+s.config.bodyRadius,crowd=enemies.filter(e=>Math.hypot(e.x-target.x,e.z-target.z)<=wave*1.6).length;
      const edgy=Math.hypot(target.x,target.z)>safeRadius-6;
      if(d>4&&d<blink.d.range+2&&(crowd>=2||edgy)&&rng()<(c.bot==='easy'?.3:c.bot==='hard'?.9:.6)){inputs.push({type:'cast',slot:blink.slot});return inputs;}
    }
    const pick=slots.find(o=>o.d.effect==='shield'&&(threatened||r>safeRadius-4&&Math.hypot(p.vx,p.vz)>3))
      ??slots.find(o=>o.d.effect==='repair'&&p.damage>=30&&d>7)
      ??slots.find(o=>['cone','nova'].includes(o.d.effect)&&d<o.d.range+.4)
      ??slots.find(o=>['bolt','bomb','pull'].includes(o.d.effect)&&d<o.d.range)
      ??slots.find(o=>o.d.effect==='mine'&&d<8);
    if(pick)inputs.push({type:'cast',slot:pick.slot});return inputs;
  }};
}
