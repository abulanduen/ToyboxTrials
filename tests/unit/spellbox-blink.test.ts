import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { seededRng } from '../../src/minigames/rng';
import { blinkLanding, knockbackMultiplier, spellboxRules, type SpellboxInput, type SpellboxState } from '../../src/minigames/spellbox/rules';
import { BLINK, SPELLS, spellStats } from '../../src/minigames/spellbox/spells';
import { createSpellboxBot } from '../../src/minigames/spellbox/bot';

const people:Contestant[]=Array.from({length:8},(_,i)=>({id:`p${i}`,name:`Mage ${i}`,paint:PAINT_JOBS[i%5],hat:'none',keySkin:'classic',isLocal:i===0,bot:'normal'}));
const B=SPELLS.blink;
/** A two-or-more player arena with p0 holding Blink on R (slot 2), facing +x, everyone else parked far away. */
function arena(n=2){
  const s=spellboxRules.init(people.slice(0,n),321);
  spellboxRules.step(s,Object.fromEntries(s.players.map(p=>[p.id,[{type:'ready'} as SpellboxInput]])),10);
  spellboxRules.step(s,{},s.config.countdownMs);expect(s.phase).toBe('arena');
  s.players[0].build[2]='blink';Object.assign(s.players[0],{x:0,z:0,angle:Math.PI/2});
  s.players.slice(1).forEach((p,i)=>Object.assign(p,{x:-12+i*3,z:-8,angle:0}));
  spellboxRules.drainEvents(s);return s;
}
const limit=(s:SpellboxState)=>s.radius-s.config.bodyRadius-BLINK.edgeMargin;
const blinkNow=(s:SpellboxState,angle=Math.PI/2)=>{s.players[0].angle=angle;spellboxRules.step(s,{p0:[{type:'cast',slot:2}]},10);spellboxRules.step(s,{},B.windup);};

describe('Spellbox Blink',()=>{
  it('is a short-cast, cooldown spell with a stat line for the draft card',()=>{
    expect(B.effect).toBe('blink');expect(B.windup).toBeGreaterThan(0);expect(B.windup).toBeLessThanOrEqual(200);
    expect(B.cooldown).toBeGreaterThanOrEqual(3000);expect(B.damage).toBeGreaterThan(0);expect(B.damage).toBeLessThan(SPELLS['pop-rocket'].damage);
    expect(spellStats('blink')).toBe('7 cm blink · 5 damage · 11 push wave · 4.2s cooldown · 0.12s cast');
    expect(spellStats('pop-rocket')).toBe('14 damage · 9 push · 1.3s cooldown · 0.18s cast');
  });
  it('teleports the full distance in the aim direction after its short cast',()=>{
    const s=arena();s.players[0].angle=Math.PI/2;spellboxRules.step(s,{p0:[{type:'cast',slot:2}]},10);
    expect(s.players[0].x).toBe(0);spellboxRules.step(s,{},B.windup-10);expect(s.players[0].x).toBe(0);
    spellboxRules.step(s,{},10);expect(s.players[0].x).toBeCloseTo(B.range,6);expect(s.players[0].z).toBeCloseTo(0,6);
    const events=spellboxRules.drainEvents(s);
    expect(events.find(e=>e.type==='spellbox-blink')).toMatchObject({id:'p0',fromX:0,fromZ:0});
    expect(events.find(e=>e.type==='spellbox-cast')).toEqual({type:'spellbox-cast',id:'p0',spell:'blink'});
    expect(s.effects.map(e=>e.kind)).toEqual(expect.arrayContaining(['depart','trail','wave']));
    const trail=s.effects.find(e=>e.kind==='trail')!;expect(trail.tx).toBeCloseTo(B.range);expect([trail.x,trail.z]).toEqual([0,0]);
  });
  it('never lands outside the live ring: clamps to the edge minus a margin, and pulls inward when aimed out from the rim',()=>{
    const s=arena();Object.assign(s.players[0],{x:10,z:0});blinkNow(s);
    expect(s.players[0].x).toBeCloseTo(limit(s),6);expect(s.players[0].alive).toBe(true);
    const rim=arena();Object.assign(rim.players[0],{x:14.2,z:0});blinkNow(rim);
    expect(rim.players[0].x).toBeCloseTo(limit(rim),6);expect(rim.players[0].alive).toBe(true);
    // The rule follows the live radius while the ring is contracting.
    const shrinking=arena();shrinking.radius=11;Object.assign(shrinking.players[1],{x:-5,z:-5});Object.assign(shrinking.players[0],{x:0,z:5});blinkNow(shrinking,0);
    expect(Math.hypot(shrinking.players[0].x,shrinking.players[0].z)).toBeCloseTo(limit(shrinking),6);
  });
  it('lands within range, inside the ring and clear of other toys from any start and aim (seeded sweep)',()=>{
    const rng=seededRng(99);
    for(let i=0;i<400;i++){
      const s=arena(4),p=s.players[0],a=rng()*Math.PI*2,r=Math.sqrt(rng())*(s.radius-.01);
      Object.assign(p,{x:Math.sin(a)*r,z:Math.cos(a)*r});
      s.players.slice(1).forEach(o=>{const b=rng()*Math.PI*2,q=Math.sqrt(rng())*(s.radius-1.2);Object.assign(o,{x:Math.sin(b)*q,z:Math.cos(b)*q});});
      if(s.players.some((o,j)=>s.players.some((q,k)=>k>j&&Math.hypot(o.x-q.x,o.z-q.z)<2.1)))continue;
      const aim=rng()*Math.PI*2,start={x:p.x,z:p.z},to=blinkLanding(s,p,Math.sin(aim),Math.cos(aim));
      const fromEdge=Math.hypot(start.x,start.z)>limit(s);
      expect(Math.hypot(to.x,to.z)).toBeLessThanOrEqual(Math.max(limit(s),Math.hypot(start.x,start.z))+1e-9);
      if(!fromEdge)expect(Math.hypot(to.x-start.x,to.z-start.z)).toBeLessThanOrEqual(B.range+1e-9);
      expect(Math.hypot(to.x,to.z)).toBeLessThan(s.radius);
      for(const o of s.players.slice(1))expect(Math.hypot(to.x-o.x,to.z-o.z)).toBeGreaterThanOrEqual(2*s.config.bodyRadius-1e-9);
    }
  });
  it('stops beside a toy in its path instead of landing inside it',()=>{
    const s=arena();Object.assign(s.players[1],{x:6,z:0});blinkNow(s);
    expect(s.players[0].x).toBeLessThanOrEqual(6-2*s.config.bodyRadius+1e-9);expect(s.players[0].x).toBeGreaterThan(3);
  });
  it('releases a shockwave that pushes nearby toys outward, scaled by their damage, never the caster',()=>{
    const run=(damage:number)=>{const s=arena(3);Object.assign(s.players[1],{x:B.range+2.5,z:0,damage});Object.assign(s.players[2],{x:B.range,z:-3,damage});blinkNow(s);return s;};
    const low=run(0),high=run(120);
    const [lo,hi]=[low.players[1],high.players[1]];
    expect(lo.damage).toBe(B.damage);expect(hi.damage).toBe(120+B.damage);
    expect(lo.vx).toBeGreaterThan(0);expect(Math.abs(lo.vz)).toBeLessThan(1e-9); // straight out from the landing point
    expect(low.players[2].vz).toBeLessThan(0); // the other side is pushed the other way
    const ratio=Math.hypot(hi.vx,hi.vz)/Math.hypot(lo.vx,lo.vz);
    expect(ratio).toBeCloseTo(knockbackMultiplier(125)/knockbackMultiplier(5),1);
    expect(low.players[0].damage).toBe(0);expect(low.players[0].hits).toBe(2);
    // Out of reach: nothing.
    const far=arena();Object.assign(far.players[1],{x:B.range+B.radius+far.config.bodyRadius+.3,z:0});blinkNow(far);expect(far.players[1].damage).toBe(0);
  });
  it('is mitigated by Bubble Ward like any other hit, and keeps only part of the caster momentum',()=>{
    const s=arena();Object.assign(s.players[1],{x:B.range+2.5,z:0,shieldUntil:1e9});blinkNow(s);expect(s.players[1].damage).toBeCloseTo(B.damage*.35);
    const moving=arena();Object.assign(moving.players[0],{vx:0,vz:-10});moving.players[0].angle=Math.PI/2;spellboxRules.step(moving,{p0:[{type:'cast',slot:2}]},10);
    const before=moving.players[0].vz;spellboxRules.step(moving,{},B.windup);expect(moving.players[0].vz).toBeGreaterThan(before*BLINK.momentumKept*1.01);expect(moving.players[0].vz).toBeLessThan(0);
  });
  it('respects its cooldown and the shared casting rules',()=>{
    const s=arena();blinkNow(s);const x=s.players[0].x,ready=s.players[0].cooldowns[2];
    expect(ready-(s.t-B.windup)).toBe(B.cooldown);
    s.players[0].angle=-Math.PI/2;spellboxRules.step(s,{p0:[{type:'cast',slot:2}]},10);spellboxRules.step(s,{},500);expect(s.players[0].x).toBeCloseTo(x);
    spellboxRules.step(s,{},ready-s.t);spellboxRules.step(s,{p0:[{type:'cast',slot:2}]},10);spellboxRules.step(s,{},B.windup);expect(s.players[0].x).toBeCloseTo(x-B.range);
    // A hit during the cast interrupts it (and the cooldown is spent), as for every other spell.
    const hit=arena();spellboxRules.step(hit,{p0:[{type:'cast',slot:2}]},10);
    hit.projectiles.push({id:900,owner:'p1',spell:'pop-rocket',x:0,z:-1.5,dx:0,dz:1,remaining:5,sourceX:0,sourceZ:-6});spellboxRules.step(hit,{},B.windup);
    expect(hit.players[0].x).toBeCloseTo(0,0);expect(hit.players[0].casts).toBe(0);expect(hit.players[0].cooldowns[2]).toBeGreaterThan(hit.t);
  });
  it('is deterministic and partition-independent',()=>{
    const make=()=>{const s=arena(4);Object.assign(s.players[1],{x:8,z:1,damage:40});Object.assign(s.players[2],{x:9,z:-1.5});s.players[0].angle=Math.PI/2;spellboxRules.step(s,{p0:[{type:'cast',slot:2}]},10);return s;};
    const a=make(),b=make();spellboxRules.step(a,{},1500);for(const n of[1,9,110,3,377,1000])spellboxRules.step(b,{},n);
    expect(a).toEqual(b);expect(a.players[1].damage).toBe(45);
  });
  it('bots use it sensibly: escaping the edge toward the centre, and shoving enemies near the edge',()=>{
    const bot=createSpellboxBot(),rng=seededRng(5),c={...people[0],bot:'hard' as const};
    const edge=arena();Object.assign(edge.players[0],{x:0,z:13.4,cooldowns:[1e9,1e9,0]});edge.players[1].x=0;edge.players[1].z=-5;
    const before=Math.hypot(edge.players[0].x,edge.players[0].z);
    spellboxRules.step(edge,{p0:bot.decide(edge,c,10,rng)},10);spellboxRules.step(edge,{},B.windup);
    expect(Math.hypot(edge.players[0].x,edge.players[0].z)).toBeLessThan(before-B.range+.01);expect(edge.players[0].casts).toBe(1);
    // An enemy near the edge within reach: blink beside it and let the shockwave push it out.
    const shove=arena(),bot2=createSpellboxBot();Object.assign(shove.players[0],{x:4,z:0,cooldowns:[1e9,1e9,0]});Object.assign(shove.players[1],{x:11,z:0});
    let fired=false;for(let i=0;i<20&&!fired;i++){spellboxRules.step(shove,{p0:bot2.decide(shove,c,10,rng)},10);fired=shove.players[0].cast?.spell==='blink'||shove.players[0].casts>0;}
    expect(fired).toBe(true);spellboxRules.step(shove,{},B.windup+10);expect(shove.players[1].damage).toBe(B.damage);expect(shove.players[1].vx).toBeGreaterThan(0);
  });
  it('appears in seeded all-bot matches and keeps them repeatable',()=>{
    const run=()=>{
      const s=spellboxRules.init(people,77),bot=createSpellboxBot(),rngs=people.map((_,i)=>seededRng(i+500));let blinks=0;
      spellboxRules.step(s,Object.fromEntries(s.players.map(p=>[p.id,[{type:'equip',slot:2,spell:'blink'} as SpellboxInput]])),10);
      while(!spellboxRules.isOver(s)){spellboxRules.step(s,Object.fromEntries(people.map((c,i)=>[c.id,bot.decide(s,c,20,rngs[i]).filter(x=>x.type!=='equip')])),20);blinks+=spellboxRules.drainEvents(s).filter(e=>e.type==='spellbox-blink').length;}
      return{s,blinks};
    };
    const a=run(),b=run();expect(a.s).toEqual(b.s);expect(a.blinks).toBeGreaterThan(3);expect(a.s.players.filter(p=>!p.alive).length).toBeGreaterThan(0);
  });
});
