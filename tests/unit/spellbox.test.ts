import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { seededRng } from '../../src/minigames/rng';
import { spellboxRules, arenaRadius, segmentHit, coneHit, knockbackMultiplier, type SpellboxState, type SpellboxInput } from '../../src/minigames/spellbox/rules';
import { SLOT_OPTIONS, SPELLS, SPELL_IDS, type SpellId } from '../../src/minigames/spellbox/spells';
import { createSpellboxBot } from '../../src/minigames/spellbox/bot';
const people:Contestant[]=Array.from({length:8},(_,i)=>({id:`p${i}`,name:`Mage ${i}`,paint:PAINT_JOBS[i%5],hat:'none',keySkin:'classic',isLocal:i===0,bot:'normal'}));
const fresh=(n=2)=>spellboxRules.init(people.slice(0,n),123);
const send=(s:SpellboxState,id:string,inputs:SpellboxInput[],dt=10)=>spellboxRules.step(s,{[id]:inputs},dt);
const readyAll=(s:SpellboxState)=>spellboxRules.step(s,Object.fromEntries(s.players.map(p=>[p.id,[{type:'ready'} as SpellboxInput]])),10);
function arena(n=2){const s=fresh(n);readyAll(s);spellboxRules.step(s,{},s.config.countdownMs);expect(s.phase).toBe('arena');Object.assign(s.players[0],{x:-3,z:0,angle:Math.PI/2});Object.assign(s.players[1],{x:3,z:0,angle:-Math.PI/2});return s;}
function equip(s:SpellboxState,id:SpellId){s.players[0].build[0]=id;}
function cast(s:SpellboxState){send(s,'p0',[{type:'cast',slot:0}]);}
function hit(s:SpellboxState){for(let i=0;i<180&&s.players[1].lastHit<0;i++)spellboxRules.step(s,{},10);expect(s.players[1].lastHit).toBeGreaterThanOrEqual(0);}
describe('Spellbox Showdown',()=>{
  it('has nine distinct spell kits with valid data and repeatable 2–8 player spawns',()=>{
    expect(SPELL_IDS).toHaveLength(9);expect(new Set(SPELL_IDS.map(id=>SPELLS[id].name)).size).toBe(9);
    for(let n=2;n<=8;n++){const s=fresh(n);expect(fresh(n)).toEqual(s);for(const p of s.players){expect(Math.hypot(p.x,p.z)).toBeLessThan(s.radius-s.config.bodyRadius);expect(p.build).toHaveLength(3);}}
    expect(spellboxRules.init(people,456).players).not.toEqual(fresh(8).players);
    for(const id of SPELL_IDS){expect(SPELLS[id].cooldown).toBeGreaterThan(0);expect(SPELLS[id].description.length).toBeGreaterThan(30);}
    expect(()=>fresh(1)).toThrow();expect(()=>spellboxRules.init([people[0],people[0]],1)).toThrow();expect(()=>spellboxRules.init(people,1,{drag:NaN})).toThrow();expect(()=>spellboxRules.init(people,1,{countdownMs:11})).toThrow();
  });
  it('offers exactly three legal choices per button, rejects cross-slot picks and locks Ready',()=>{
    const s=fresh(),p=s.players[0],other=[...s.players[1].build];
    expect(SLOT_OPTIONS.map(options=>new Set(options).size)).toEqual([3,3,3]);
    send(s,'p0',[{type:'equip',slot:1,spell:'pop-rocket'}]);expect(p.build).toEqual(['pop-rocket','spring-fan','bubble-ward']);
    send(s,'p0',[{type:'equip',slot:0,spell:'marble-burst'}]);
    send(s,'p0',[{type:'equip',slot:2,spell:'repair-stitches'},{type:'equip',slot:3,spell:'button-mine'},{type:'equip',slot:0,spell:'nope' as SpellId}]);
    expect(p.build).toEqual(['marble-burst','spring-fan','repair-stitches']);expect(s.players[1].build).toEqual(other);
    send(s,'p0',[{type:'ready'},{type:'equip',slot:0,spell:'pop-rocket'}]);expect(p.build[0]).toBe('marble-burst');expect(s.phase).toBe('draft');
    send(s,'p1',[{type:'ready'}]);expect(s.phase).toBe('draft');expect(s.fightAt).toBeGreaterThan(s.t);send(s,'p0',[{type:'equip',slot:0,spell:'pop-rocket'}]);expect(p.build[0]).toBe('marble-burst');
    spellboxRules.step(s,{},s.config.countdownMs);expect(s.phase).toBe('arena');send(s,'p0',[{type:'equip',slot:0,spell:'pop-rocket'}]);expect(p.build[0]).toBe('marble-burst');
  });
  it('puts each of the nine spells on exactly one button, Blink on R, and rejects off-button picks',()=>{
    expect(SLOT_OPTIONS.flat().sort()).toEqual([...SPELL_IDS].sort());expect(SLOT_OPTIONS[2]).toContain('blink');
    const s=fresh(),p=s.players[0];send(s,'p0',[{type:'equip',slot:1,spell:'button-mine'},{type:'equip',slot:2,spell:'blink'}]);
    expect(p.build).toEqual(['pop-rocket','button-mine','blink']);
    send(s,'p0',[{type:'equip',slot:2,spell:'button-mine'},{type:'equip',slot:0,spell:'blink'}]);expect(p.build).toEqual(['pop-rocket','button-mine','blink']);
    p.build.forEach((id,slot)=>expect(SLOT_OPTIONS[slot]).toContain(id));expect(new Set(p.build).size).toBe(3);
  });
  it('uses the requested population bands, preserving the old two-player size',()=>{
    expect([2,3,4,5,6,7,8].map(n=>arenaRadius(n))).toEqual([15,21,27,27,33,33,39]);
    for(let n=2;n<=8;n++)expect(fresh(n).radius).toBe(arenaRadius(n));
    expect(fresh(8).radius**2/fresh(2).radius**2).toBeCloseTo(6.76);
  });
  it('waits the full ten seconds, then contracts smoothly over three seconds',()=>{
    const s=arena(8);s.players[7].alive=false;s.players[7].outAt=s.t;spellboxRules.step(s,{},10);
    const warning=structuredClone(s.shrink!);expect(warning.to).toBe(33);expect(warning.startsAt-s.t).toBe(10000);
    spellboxRules.step(s,{},9990);expect(s.radius).toBe(39);spellboxRules.step(s,{},10);expect(s.radius).toBe(39);
    spellboxRules.step(s,{},1500);expect(s.radius).toBe(36);spellboxRules.step(s,{},1500);expect(s.radius).toBe(33);expect(s.shrink).toBeNull();
    const events=spellboxRules.drainEvents(s);expect(events.filter(e=>e.type==='spellbox-shrink-warning')).toHaveLength(1);expect(events.filter(e=>e.type==='spellbox-shrink-tick').map(e=>e.seconds)).toEqual([9,8,7,6,5,4,3,2,1,0]);
  });
  it('does not reset the warning within a band, but fully warns a newly smaller target',()=>{
    const s=arena(8);s.players[7].alive=false;spellboxRules.step(s,{},10);const first=s.shrink!.startsAt;
    s.players[6].alive=false;spellboxRules.step(s,{},1000);expect(s.shrink!.startsAt).toBe(first);
    s.players[5].alive=false;spellboxRules.step(s,{},10);expect(s.shrink!.to).toBe(27);expect(s.shrink!.startsAt-s.t).toBe(10000);
    spellboxRules.step(s,{},10010);s.players[4].alive=false;s.players[3].alive=false;spellboxRules.step(s,{},10);
    expect(s.shrink!.to).toBe(27); // Finish the already-moving boundary first.
    const remaining=s.shrink!.endsAt-s.t;spellboxRules.step(s,{},remaining);expect(s.radius).toBe(27);expect(s.shrink!.to).toBe(21);expect(s.shrink!.startsAt-s.t).toBe(10000);
  });
  it('eliminates outside the moving edge, removes unsupported mines and cancels a finished match warning',()=>{
    const s=arena(8);s.players[7].alive=false;Object.assign(s.players[0],{x:38,z:0});s.mines.push({id:99,owner:'p1',x:38,z:0,armAt:1e9,expireAt:1e9});
    spellboxRules.step(s,{},10530);expect(s.players[0].alive).toBe(false);expect(s.radius).toBeLessThan(38);expect(s.mines).toHaveLength(0);
    s.players.slice(2).forEach(p=>{p.alive=false;});spellboxRules.step(s,{},10);expect(s.phase).toBe('ending');expect(s.shrink).toBeNull();
  });
  it('keeps shrink timing deterministic across step partitions and inert while time is stopped',()=>{
    const a=arena(8);a.players[7].alive=false;spellboxRules.step(a,{},10);const b=structuredClone(a),copy=structuredClone(a);
    spellboxRules.step(a,{},0);spellboxRules.step(a,{},NaN);expect(a).toEqual(copy);
    spellboxRules.step(a,{},13000);for(const n of[3,7,40,9950,3000])spellboxRules.step(b,{},n);expect(a).toEqual(b);
  });
  it('never ends the draft while anyone is still choosing, however long they take',()=>{
    const s=fresh(3),position=[s.players[0].x,s.players[0].z];
    send(s,'p1',[{type:'ready'}]);send(s,'p2',[{type:'ready'}]);
    send(s,'p0',[{type:'move',x:1,z:0},{type:'cast',slot:0}],10*60*1000);
    expect(s.phase).toBe('draft');expect(s.fightAt).toBe(-1);expect(s.players[0].ready).toBe(false);
    expect([s.players[0].x,s.players[0].z]).toEqual(position);expect(s.players[0].casts).toBe(0);
    expect(spellboxRules.drainEvents(s).filter(e=>e.type.startsWith('spellbox-'))).toEqual([]);
    send(s,'p0',[{type:'equip',slot:0,spell:'ribbon-tether'}]);expect(s.players[0].build[0]).toBe('ribbon-tether');
  });
  it('starts a three-second fight countdown only once every player has locked in, then excludes it from score',()=>{
    const s=fresh(3);spellboxRules.step(s,{},5000);send(s,'p0',[{type:'ready'}]);send(s,'p1',[{type:'ready'}]);
    expect(s.fightAt).toBe(-1);spellboxRules.drainEvents(s);
    send(s,'p2',[{type:'ready'}]);const lockedAt=s.t;expect(s.fightAt).toBe(lockedAt+3000);expect(s.phase).toBe('draft');
    spellboxRules.step(s,{},2990);expect(s.phase).toBe('draft');
    spellboxRules.step(s,{},10);expect(s.phase).toBe('arena');expect(s.arenaAt).toBe(lockedAt+3000);
    const events=spellboxRules.drainEvents(s);
    expect(events.filter(e=>e.type==='spellbox-countdown').map(e=>e.seconds)).toEqual([3,2,1]);
    expect(events.at(-1)).toEqual({type:'spellbox-start'});
    spellboxRules.step(s,{},91400);expect(s.phase).toBe('over');expect(spellboxRules.result(s).durationMs).toBe(90000);
  });
  it('keeps Ready as a lock: builds cannot change or un-ready during the countdown, which is never cancelled',()=>{
    const s=fresh(),p=s.players[0];send(s,'p0',[{type:'equip',slot:2,spell:'repair-stitches'}]);readyAll(s);const fightAt=s.fightAt;
    send(s,'p0',[{type:'equip',slot:2,spell:'bubble-ward'},{type:'equip',slot:0,spell:'marble-burst'},{type:'ready'},{type:'move',x:1,z:0},{type:'cast',slot:0}],1000);
    expect(p.build).toEqual(['pop-rocket','spring-fan','repair-stitches']);expect(p.ready).toBe(true);expect(s.fightAt).toBe(fightAt);expect(p.casts).toBe(0);expect(p.moveX).toBe(0);
    spellboxRules.step(s,{},fightAt-s.t);expect(s.phase).toBe('arena');expect(p.build).toEqual(['pop-rocket','spring-fan','repair-stitches']);
    // The countdown is simulation time, so partitioned steps (and a frozen host) give the same start.
    const a=fresh(),b=fresh();readyAll(a);readyAll(b);spellboxRules.step(a,{},0);spellboxRules.step(a,{},2999);for(const n of[1,7,993,1000,998])spellboxRules.step(b,{},n);expect(a).toEqual(b);
  });
  it('lets bots lock in quickly, one by one, without a deadline pushing them',()=>{
    const s=fresh(8),bot=createSpellboxBot(),rngs=people.map((_,i)=>seededRng(i+7)),bots=people.slice(1);const readyAt=new Map<string,number>();
    while(s.t<20000&&!s.players.slice(1).every(p=>p.ready)){spellboxRules.step(s,Object.fromEntries(bots.map((c,i)=>[c.id,bot.decide(s,c,20,rngs[i+1])])),20);for(const p of s.players)if(p.ready&&!readyAt.has(p.id))readyAt.set(p.id,s.t);}
    expect(readyAt.size).toBe(7);expect(Math.max(...readyAt.values())).toBeLessThanOrEqual(3500);expect(new Set(readyAt.values()).size).toBeGreaterThan(1);
    expect(s.players[0].ready).toBe(false);spellboxRules.step(s,{},60000);expect(s.phase).toBe('draft');expect(s.fightAt).toBe(-1);
  });
  it('enforces wind-up, per-spell cooldowns, a global action gap and interrupt-on-hit',()=>{
    const s=arena();cast(s);const castAt=s.players[0].cooldowns[0];send(s,'p0',[{type:'cast',slot:0},{type:'cast',slot:1}],100);
    expect(s.players[0].casts).toBe(0);expect(s.players[0].cooldowns[0]).toBe(castAt);spellboxRules.step(s,{},100);expect(s.players[0].casts).toBe(1);
    send(s,'p0',[{type:'cast',slot:0}]);expect(s.players[0].cast).toBeNull();send(s,'p0',[{type:'cast',slot:1}]);expect(s.players[0].cast?.spell).toBe('spring-fan');
    const interrupted=arena();equip(interrupted,'pinwheel-storm');cast(interrupted);interrupted.projectiles.push({id:999,owner:'p1',spell:'pop-rocket',x:-2,z:0,dx:-1,dz:0,remaining:10,sourceX:3,sourceZ:0});spellboxRules.step(interrupted,{},10);
    expect(interrupted.players[0].cast).toBeNull();expect(interrupted.players[0].damage).toBe(14);expect(interrupted.players[0].cooldowns[0]).toBeGreaterThan(interrupted.t);
  });
  it('lands rockets, caps accumulated damage and increases knockback with damage instead of HP death',()=>{
    const low=arena(),high=arena();high.players[1].damage=100;cast(low);cast(high);hit(low);hit(high);
    expect(low.players[1].damage).toBe(14);expect(high.players[1].vx).toBeGreaterThan(low.players[1].vx*2);expect(knockbackMultiplier(140)).toBe(3);
    const max=arena();max.players[1].damage=300;spellboxRules.step(max,{},10);expect(max.players[1].alive).toBe(true);cast(max);hit(max);expect(max.players[1].damage).toBe(300);expect(max.players[1].alive).toBe(true);
  });
  it('uses swept projectile contact, hits the nearest body and never hits the owner',()=>{
    expect(segmentHit(-10,0,10,0,0,0,1)).toBeCloseTo(.45);expect(segmentHit(-10,4,10,4,0,0,1)).toBeNull();expect(segmentHit(0,0,0,0,0,0,1)).toBe(0);
    const s=arena(3);Object.assign(s.players[2],{x:7,z:0});cast(s);hit(s);expect(s.players[0].damage).toBe(0);expect(s.players[2].damage).toBe(0);
  });
  it('bursts a marble over multiple enemies with no self-damage',()=>{
    const s=arena(3);Object.assign(s.players[2],{x:3,z:2.2});equip(s,'marble-burst');cast(s);hit(s);
    expect(s.players[1].damage).toBe(10);expect(s.players[2].damage).toBe(10);expect(s.players[0].damage).toBe(0);expect(s.effects.some(e=>e.radius===3.5)).toBe(true);
  });
  it('pushes a spring cone forward, ignores enemies behind, and respects its exact corner',()=>{
    const s=arena(3);Object.assign(s.players[2],{x:-6,z:0});equip(s,'spring-fan');cast(s);hit(s);expect(s.players[1].damage).toBe(8);expect(s.players[1].vx).toBeGreaterThan(0);expect(s.players[2].damage).toBe(0);
    const a=Math.PI/3+.16;expect(coneHit({x:0,z:0},0,{x:Math.sin(a)*7,z:Math.cos(a)*7},6,1.05)).toBe(false);
  });
  it('pulls ribbon targets toward the caster, opposite an ordinary push',()=>{
    const s=arena();equip(s,'ribbon-tether');cast(s);hit(s);expect(s.players[1].damage).toBe(6);expect(s.players[1].vx).toBeLessThan(0);
  });
  it('mitigates damage AND force with Bubble Ward, and lets it expire',()=>{
    const plain=arena(),ward=arena();send(ward,'p1',[{type:'cast',slot:2}],20);cast(ward);cast(plain);hit(ward);hit(plain);
    expect(ward.players[1].damage).toBeCloseTo(4.9);expect(ward.players[1].vx).toBeLessThan(plain.players[1].vx*.4);expect(ward.players[1].shieldUntil).toBeGreaterThan(ward.t);
    spellboxRules.step(ward,{},1500);expect(ward.players[1].shieldUntil).toBeLessThan(ward.t);
  });
  it('repairs damage without cancelling existing knockback momentum or resurrecting a toy',()=>{
    const s=arena();equip(s,'repair-stitches');s.players[0].damage=80;s.players[0].vx=1;cast(s);spellboxRules.step(s,{},450);
    expect(s.players[0].damage).toBe(60);expect(s.players[0].vx).toBeGreaterThan(0);s.players[0].alive=false;s.players[0].outAt=s.t;send(s,'p0',[{type:'cast',slot:0}],500);expect(s.players[0].alive).toBe(false);
  });
  it('telegraphs and releases a radial storm, pushing targets in opposite directions',()=>{
    const s=arena(3);Object.assign(s.players[0],{x:0,z:0});Object.assign(s.players[1],{x:4,z:0});Object.assign(s.players[2],{x:-4,z:0});equip(s,'pinwheel-storm');cast(s);spellboxRules.step(s,{},630);
    expect(s.players[1].damage).toBe(0);spellboxRules.step(s,{},20);expect(s.players[1].damage).toBe(12);expect(s.players[2].damage).toBe(12);expect(s.players[1].vx).toBeGreaterThan(0);expect(s.players[2].vx).toBeLessThan(0);
  });
  it('arms mines after a delay, excludes owners, expires them and caps them at two per owner',()=>{
    const s=arena();equip(s,'button-mine');Object.assign(s.players[1],{x:10,z:0});cast(s);spellboxRules.step(s,{},300);expect(s.mines).toHaveLength(1);const mine=s.mines[0];
    Object.assign(s.players[1],{x:mine.x,z:mine.z});spellboxRules.step(s,{},580);expect(s.players[1].damage).toBe(0);spellboxRules.step(s,{},20);expect(s.players[1].damage).toBe(16);expect(s.players[0].damage).toBe(0);expect(s.mines).toHaveLength(0);
    const cap=arena();equip(cap,'button-mine');Object.assign(cap.players[1],{x:-10,z:0});
    for(let i=0;i<3;i++){cap.players[0].cooldowns[0]=0;cast(cap);spellboxRules.step(cap,{},310);}expect(cap.mines).toHaveLength(2);spellboxRules.step(cap,{},7000);expect(cap.mines).toHaveLength(0);
  });
  it('keeps bodies solid, ignores corpses, normalizes movement and rejects invalid vectors',()=>{
    const s=arena();send(s,'p0',[{type:'move',x:1,z:0}],1000);expect(s.players[0].x).toBeLessThan(.91);
    const diag=arena();Object.assign(diag.players[1],{x:-12,z:0});const start={x:diag.players[0].x,z:diag.players[0].z};send(diag,'p0',[{type:'move',x:10,z:10},{type:'aim',x:NaN,z:Infinity}],1000);expect(Math.hypot(diag.players[0].x-start.x,diag.players[0].z-start.z)).toBeCloseTo(8.5);expect(Number.isFinite(diag.players[0].angle)).toBe(true);
    const dead=arena(3);Object.assign(dead.players[1],{alive:false,outAt:dead.t});Object.assign(dead.players[2],{x:0,z:10});send(dead,'p0',[{type:'move',x:1,z:0}],1000);expect(dead.players[0].x).toBeCloseTo(5.5);
  });
  it('eliminates by crossing the edge, gives simultaneous ring-outs shared place and disables dead inputs',()=>{
    const s=arena();Object.assign(s.players[0],{x:14.9,z:0,vx:20});Object.assign(s.players[1],{x:-14.9,z:0,vx:-20});spellboxRules.step(s,{},10);expect(s.players.every(p=>!p.alive)).toBe(true);expect(s.phase).toBe('ending');expect(spellboxRules.result(s).placements.map(p=>p.place)).toEqual([1,1]);
    const before={...s.players[0]};send(s,'p0',[{type:'move',x:1,z:0},{type:'cast',slot:0}],10);expect(s.players[0]).toEqual(before);spellboxRules.step(s,{},1400);expect(s.phase).toBe('over');
  });
  it('applies simultaneous opposing hits without source-order bias and bounds velocities',()=>{
    const run=(reverse:boolean)=>{const s=arena(3);Object.assign(s.players[0],{x:0,z:0,damage:100});Object.assign(s.players[1],{x:-5,z:0});Object.assign(s.players[2],{x:5,z:0});s.projectiles=[{id:90,owner:'p1',spell:'pop-rocket',x:-1.5,z:0,dx:1,dz:0,remaining:10,sourceX:-5,sourceZ:0},{id:91,owner:'p2',spell:'pop-rocket',x:1.5,z:0,dx:-1,dz:0,remaining:10,sourceX:5,sourceZ:0}];if(reverse)s.projectiles.reverse();spellboxRules.step(s,{},10);return s.players[0];};
    const a=run(false),b=run(true);expect(a.damage).toBe(128);expect(a.vx).toBeCloseTo(0);expect(b).toEqual(a);
  });
  it('is partition-independent, drains events and bounds pending input',()=>{
    const a=arena(),b=arena();cast(a);cast(b);spellboxRules.step(a,{},1230);for(const n of[3,7,50,100,1000,70])spellboxRules.step(b,{},n);expect(a).toEqual(b);
    expect(spellboxRules.drainEvents(a).length).toBeGreaterThan(0);expect(spellboxRules.drainEvents(a)).toEqual([]);const copy=structuredClone(a);spellboxRules.step(a,{},NaN);spellboxRules.step(a,{},-1);expect(a).toEqual(copy);
    const flood=arena();send(flood,'p0',Array.from({length:200},()=>({type:'cast',slot:0})),1);expect(flood.pending.p0).toHaveLength(64);
  });
  it('runs repeatable bot matches with varied builds, actual damage and natural ring-outs',()=>{
    const run=()=>{const s=fresh(8),bot=createSpellboxBot(),rngs=people.map((_,i)=>seededRng(i+123));while(!spellboxRules.isOver(s)){spellboxRules.step(s,Object.fromEntries(people.map((c,i)=>[c.id,bot.decide(s,c,20,rngs[i])])),20);spellboxRules.drainEvents(s);}return s;};
    const a=run(),b=run();expect(a).toEqual(b);expect(new Set(a.players.map(p=>p.build.join(','))).size).toBeGreaterThan(1);expect(a.players.filter(p=>!p.alive).length).toBeGreaterThan(0);expect(a.players.some(p=>p.damage>0)).toBe(true);expect(a.projectiles.length).toBeLessThanOrEqual(64);expect(a.effects.length).toBeLessThanOrEqual(64);
  });
});
