import type { BotPolicy } from '../types';
import { angleDelta, inSwing, type BlinkInput, type BlinkState } from './rules';

/** Reacts to public telegraphs, with difficulty-dependent delay and seeded decisions. */
export function createBlinkBot(): BotPolicy<BlinkState, BlinkInput> {
  const next = new Map<string,number>();
  const noticed = new Map<string,Map<string,number>>();
  return { decide(s, bot, _dt, rng) {
    const p=s.players.find(p=>p.id===bot.id);
    if (!p?.alive || s.phase!=='duel' || s.t<(next.get(p.id)??0)) return [];
    const delay=bot.bot==='easy'?420:bot.bot==='hard'?140:260;
    next.set(p.id,s.t+delay);
    const enemies=s.players.filter(e=>e.alive&&e!==p).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)||a.id.localeCompare(b.id));
    const target=enemies[0]; if(!target)return [];
    const danger=enemies.find(e=>e.attack&&s.t-e.attack.start>=delay&&inSwing(e.attack,p,s.config));
    const memory=noticed.get(p.id)??new Map<string,number>();noticed.set(p.id,memory);
    const fresh=danger?.attack && memory.get(danger.id)!==danger.attack.start;
    if(fresh&&danger.attack)memory.set(danger.id,danger.attack.start);
    if(danger && fresh && rng()<(bot.bot==='easy'?.4:bot.bot==='hard'?.9:.65)) {
      // Evaluate away/perpendicular endpoints, rather than repeatedly blinking into the wall.
      const angle=Math.atan2(p.x-danger.x,p.z-danger.z);
      const choices=[angle,angle+Math.PI/2,angle-Math.PI/2,angle+Math.PI];
      const best=choices.map(a=>({a,x:p.x+Math.sin(a)*s.config.blinkRange,z:p.z+Math.cos(a)*s.config.blinkRange}))
        .filter(c=>Math.abs(c.x)<s.config.halfSize-s.config.radius&&Math.abs(c.z)<s.config.halfSize-s.config.radius)
        .sort((a,b)=>Math.hypot(b.x-danger.x,b.z-danger.z)-Math.hypot(a.x-danger.x,a.z-danger.z))[0];
      if(best)return [{type:'aim',x:Math.sin(best.a),z:Math.cos(best.a)},{type:'blink'},{type:'move',x:0,z:0}];
    }
    if(p.attack)return [];
    const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz)||1;
    const inputs:BlinkInput[]=[{type:'move',x:d>3.7?dx/d:0,z:d>3.7?dz/d:0},{type:'aim',x:dx/d,z:dz/d}];
    if(d<4.8 && s.t>=p.nextAttack)inputs.push({type:'attack'});
    // Close large gaps sometimes; never assume a hit or read future input.
    else if(d>12 && rng()<0.18 && Math.abs(angleDelta(p.angle,Math.atan2(dx,dz)))<1)inputs.push({type:'blink'});
    return inputs;
  } };
}
