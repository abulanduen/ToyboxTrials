import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { seededRng } from '../../src/minigames/rng';
import { blinkRules, DEFAULT_CONFIG, freePosition, inSwing, type BlinkInput, type BlinkState } from '../../src/minigames/blink/rules';
import { createBlinkBot } from '../../src/minigames/blink/bot';
const people:Contestant[]=Array.from({length:8},(_,i)=>({id:`p${i}`,name:`Toy ${i}`,paint:PAINT_JOBS[i%5],hat:'none',keySkin:'classic',isLocal:i===0,bot:'normal'}));
const fresh=(n=2)=>blinkRules.init(people.slice(0,n),123);
const step=(s:BlinkState,id:string,inputs:BlinkInput[],dt=10)=>blinkRules.step(s,{[id]:inputs},dt);
function duel() {
  const s=fresh();Object.assign(s.players[0],{x:0,z:0,angle:0,aimX:0,aimZ:1});Object.assign(s.players[1],{x:0,z:4,angle:Math.PI,aimX:0,aimZ:-1});return s;
}
describe('Blink Duel',()=>{
  it('seeds distinct, legal 2–8 player spawns and rejects invalid configuration',()=>{
    for(let n=2;n<=8;n++){const s=fresh(n);expect(fresh(n)).toEqual(s);for(const p of s.players)expect(freePosition(s,p,p.x,p.z)).toBe(true);}
    expect(blinkRules.init(people,456).players).not.toEqual(fresh(8).players);
    expect(()=>fresh(1)).toThrow();expect(()=>blinkRules.init([people[0],people[0]],1)).toThrow();
    expect(()=>blinkRules.init(people,1,{radius:8})).toThrow();expect(()=>blinkRules.init(people,1,{windupMs:951})).toThrow();
    expect(()=>blinkRules.init(people,1,{speed:Infinity})).toThrow();
  });
  it('uses no blink cooldown: consecutive commands teleport repeatedly within the same tick',()=>{
    const s=duel();s.players[1].x=12;
    step(s,'p0',[{type:'aim',x:1,z:0},{type:'blink'},{type:'blink'}]);
    expect(s.players[0].blinks).toBe(2);expect(s.players[0].x).toBeCloseTo(14.95);expect(s.players[0].lastBlink?.at).toBe(10);
    step(s,'p0',[{type:'aim',x:-1,z:0},{type:'blink'}]);expect(s.players[0].blinks).toBe(3);expect(s.players[0].x).toBeCloseTo(6.95);
  });
  it('clamps endpoints, crosses bodies, and backs away from an occupied endpoint without overlap',()=>{
    const s=duel();Object.assign(s.players[1],{x:0,z:8});step(s,'p0',[{type:'blink'}]);
    expect(s.players[0].z).toBeCloseTo(5.875);expect(freePosition(s,s.players[0],0,s.players[0].z)).toBe(true);
    const cross=duel();step(cross,'p0',[{type:'blink'}]);expect(cross.players[0].z).toBe(8);
    cross.players[0].z=14.95;step(cross,'p0',[{type:'blink'}]);expect(cross.players[0].blinks).toBe(1);
  });
  it('caps diagonal movement, rejects nonfinite aim and stays inside the arena',()=>{
    const s=duel();s.players[1].x=12;step(s,'p0',[{type:'move',x:10,z:10},{type:'aim',x:NaN,z:1}],1000);
    expect(Math.hypot(s.players[0].x,s.players[0].z)).toBeCloseTo(8);
    expect(Number.isFinite(s.players[0].angle)).toBe(true);
    s.players[1].z=-12;step(s,'p0',[{type:'move',x:1,z:0}],10000);expect(s.players[0].x).toBeCloseTo(14.95);
  });
  it('keeps living bodies solid, removes corpse collisions and never tunnels through another toy',()=>{
    const s=duel();step(s,'p0',[{type:'move',x:0,z:1}],2000);
    expect(s.players[0].z).toBeLessThan(1.91);expect(freePosition(s,s.players[0],s.players[0].x,s.players[0].z)).toBe(true);
    // Keep a third survivor so the corpse test is independent of last-survivor ending.
    const three=fresh(3);Object.assign(three.players[0],{x:0,z:0});Object.assign(three.players[1],{x:0,z:4,alive:false,outAt:0});
    step(three,'p0',[{type:'move',x:0,z:1}],1000);expect(three.players[0].z).toBeCloseTo(8);
  });
  it('telegraphs the entire wind-up, locks origin/facing and eliminates with one hit at the deadline',()=>{
    const s=duel();step(s,'p0',[{type:'attack'}]);const swing={...s.players[0].attack!};
    step(s,'p0',[{type:'move',x:1,z:0},{type:'aim',x:1,z:0}],940);
    expect(s.players.every(p=>p.alive)).toBe(true);expect(s.players[0].attack).toEqual(swing);expect(s.players[0].x).toBe(0);expect(s.players[0].angle).toBe(0);
    blinkRules.step(s,{},10);expect(s.players[1].alive).toBe(false);expect(s.players[0].kills).toBe(1);expect(s.phase).toBe('ending');
    expect(s.players[1].outAt).toBe(960);expect(s.players[0].lastStrike?.at).toBe(960);
    blinkRules.step(s,{},1200);expect(blinkRules.isOver(s)).toBe(true);expect(blinkRules.result(s).placements.map(p=>p.place)).toEqual([1,2]);
  });
  it('lets a defender blink away on the strike tick and never hits behind the attacker',()=>{
    const s=duel();step(s,'p0',[{type:'attack'}],950);step(s,'p1',[{type:'aim',x:1,z:0},{type:'blink'}]);
    expect(s.players[1].alive).toBe(true);
    expect(inSwing({x:0,z:0,angle:0},{x:0,z:-4},DEFAULT_CONFIG)).toBe(false);
    expect(inSwing({x:0,z:0,angle:0},{x:0,z:7},DEFAULT_CONFIG)).toBe(false);
    expect(inSwing({x:0,z:0,angle:0},{x:0,z:5.9},DEFAULT_CONFIG)).toBe(true);
    const a=DEFAULT_CONFIG.halfAngle+.16;
    expect(inSwing({x:0,z:0,angle:0},{x:Math.sin(a)*6.5,z:Math.cos(a)*6.5},DEFAULT_CONFIG)).toBe(false); // Outside the rounded corner.
    expect(inSwing({x:0,z:0,angle:0},{x:Math.sin(a)*4,z:Math.cos(a)*4},DEFAULT_CONFIG)).toBe(true); // Body overlaps a side edge.
  });
  it('lets a winding attacker choose a different blink direction, cancels the swing and preserves recovery',()=>{
    const s=duel();step(s,'p0',[{type:'attack'}],400);
    step(s,'p0',[{type:'aim',x:-1,z:0},{type:'blink'},{type:'attack'}]);
    expect(s.players[0].x).toBe(-8);expect(s.players[0].attack).toBeNull();expect(s.players[0].nextAttack).toBe(760);
    step(s,'p0',[{type:'blink'}]);expect(s.players[0].blinks).toBe(2);expect(s.players[0].nextAttack).toBe(760);
    step(s,'p0',[{type:'attack'}],1000);expect(s.players[1].alive).toBe(true);
  });
  it('resolves simultaneous lethal swings without iteration-order winners',()=>{
    for(const reverse of [false,true]){
      const s=duel();if(reverse)s.players.reverse();blinkRules.step(s,{p0:[{type:'attack'}],p1:[{type:'attack'}]},960);
      expect(s.players.every(p=>!p.alive)).toBe(true);expect(s.players.map(p=>p.kills)).toEqual([1,1]);
      expect(blinkRules.result(s).placements.map(p=>p.place)).toEqual([1,1]);
    }
  });
  it('can hit several targets in the arc and ignores eliminated players and their commands',()=>{
    const s=fresh(4);Object.assign(s.players[0],{x:0,z:0,angle:0});Object.assign(s.players[1],{x:-2,z:4});Object.assign(s.players[2],{x:2,z:4});Object.assign(s.players[3],{x:0,z:-8});
    step(s,'p0',[{type:'attack'}],960);expect(s.players[0].kills).toBe(2);expect(s.players[3].alive).toBe(true);
    const before={...s.players[1]};step(s,'p1',[{type:'blink'},{type:'attack'},{type:'move',x:1,z:1}],100);
    expect(s.players[1]).toEqual(before);
  });
  it('does not bypass attack recovery by mashing attack or blinking',()=>{
    const s=duel();s.players[1].x=12;step(s,'p0',[{type:'attack'},{type:'attack'}],960);
    expect(s.players[0].nextAttack).toBe(1310);step(s,'p0',[{type:'blink'},{type:'attack'}]);expect(s.players[0].attack).toBeNull();
    blinkRules.step(s,{},340);step(s,'p0',[{type:'attack'}]);expect(s.players[0].attack).not.toBeNull();
  });
  it('ties timeout survivors and ranks earlier eliminations lower, independent of kills',()=>{
    const s=fresh(4);s.players[2].alive=false;s.players[2].outAt=20;s.players[3].alive=false;s.players[3].outAt=10;s.players[3].kills=99;
    blinkRules.step(s,{},91200);expect(s.phase).toBe('over');expect(blinkRules.result(s).placements.map(p=>p.place)).toEqual([1,1,3,4]);expect(blinkRules.result(s).durationMs).toBe(90000);
  });
  it('uses fixed ticks across partitions, drains events, ignores invalid time and bounds pending input',()=>{
    const a=duel(),b=duel();a.players[1].x=b.players[1].x=12;
    step(a,'p0',[{type:'move',x:1,z:0},{type:'attack'}],1230);
    step(b,'p0',[{type:'move',x:1,z:0},{type:'attack'}],3);for(const dt of [7,51,99,1000,70])blinkRules.step(b,{},dt);
    expect(b).toEqual(a);expect(blinkRules.drainEvents(a).length).toBeGreaterThan(0);expect(blinkRules.drainEvents(a)).toEqual([]);
    const copy=structuredClone(a);blinkRules.step(a,{},NaN);blinkRules.step(a,{},-1);expect(a).toEqual(copy);
    const flood=duel();step(flood,'p0',Array.from({length:1000},()=>({type:'blink'})),1);expect(flood.pending.p0).toHaveLength(64);
  });
  it('runs repeatable bot duels and produces actual eliminations',()=>{
    const run=()=>{
      const s=fresh(8),bot=createBlinkBot(),rngs=people.map((_,i)=>seededRng(50+i));
      while(!blinkRules.isOver(s)){
        const inputs=Object.fromEntries(people.map((c,i)=>[c.id,bot.decide(s,c,20,rngs[i])]));blinkRules.step(s,inputs,20);blinkRules.drainEvents(s);
        for(const p of s.players)if(p.alive)expect(freePosition(s,p,p.x,p.z)).toBe(true);
      }
      return {players:s.players,result:blinkRules.result(s)};
    };
    const a=run();expect(run()).toEqual(a);expect(a.players.filter(p=>!p.alive).length).toBeGreaterThan(0);
  });
});
