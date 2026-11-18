import type { MatchEvent, RulesCore } from '../types';
import { seededRng, shuffle } from '../rng';
import { rankByKey } from '../scoring';
import { DEFAULT_BUILD, SLOT_OPTIONS, SPELLS, type SpellId } from './spells';

export interface SpellboxConfig { radius:number; bodyRadius:number; speed:number; drag:number; damageScale:number; maxVelocity:number; draftMs:number; durationMs:number; endingMs:number; hitstunMs:number; shrinkWarningMs:number; shrinkMs:number }
export const DEFAULT_CONFIG:SpellboxConfig={radius:15,bodyRadius:1.05,speed:8.5,drag:2.4,damageScale:70,maxVelocity:40,draftMs:20000,durationMs:90000,endingMs:1400,hitstunMs:180,shrinkWarningMs:10000,shrinkMs:3000};
/** The configured radius remains the two-player baseline; larger bands grow arena area. */
export function arenaRadius(players:number,base=DEFAULT_CONFIG.radius){return base*(players>=8?2.6:players>=6?2.2:players>=4?1.8:players>=3?1.4:1);}
export interface ArenaShrink { from:number;to:number;startsAt:number;endsAt:number;lastSecond:number }
export type SpellboxInput={type:'move'|'aim';x:number;z:number}|{type:'equip';slot:number;spell:SpellId}|{type:'cast';slot:number}|{type:'ready'};
export interface Cast {spell:SpellId;slot:number;angle:number;start:number;until:number}
export interface Mage {
  id:string;x:number;z:number;vx:number;vz:number;angle:number;moveX:number;moveZ:number;alive:boolean;outAt:number;damage:number;
  build:SpellId[];ready:boolean;cooldowns:number[];nextAction:number;cast:Cast|null;shieldUntil:number;stunnedUntil:number;casts:number;hits:number;lastHit:number;
}
export interface Projectile {id:number;owner:string;spell:SpellId;x:number;z:number;dx:number;dz:number;remaining:number;sourceX:number;sourceZ:number}
export interface Mine {id:number;owner:string;x:number;z:number;armAt:number;expireAt:number}
export interface Effect {id:number;spell:SpellId;kind:'cast'|'hit'|'shield'|'repair'|'out';x:number;z:number;radius:number;at:number}
export interface SpellboxState {kind:'spellbox-showdown';seed:number;config:SpellboxConfig;radius:number;shrink:ArenaShrink|null;phase:'draft'|'arena'|'ending'|'over';t:number;remainder:number;arenaAt:number;finishAt:number;nextId:number;players:Mage[];projectiles:Projectile[];mines:Mine[];effects:Effect[];pending:Record<string,SpellboxInput[]>;events:MatchEvent[]}
interface Hit {source:string;target:Mage;damage:number;force:number;dx:number;dz:number;spell:SpellId}
const TICK=10,dt=TICK/1000;
const normalize=(x:number,z:number)=>{const d=Math.hypot(x,z);return d>1?{x:x/d,z:z/d}:{x,z};};
const validSlot=(n:number)=>Number.isInteger(n)&&n>=0&&n<3;
export const knockbackMultiplier=(damage:number,scale=DEFAULT_CONFIG.damageScale)=>1+damage/scale;
export function segmentHit(x:number,z:number,tx:number,tz:number,cx:number,cz:number,radius:number):number|null {
  const dx=tx-x,dz=tz-z,ox=x-cx,oz=z-cz,a=dx*dx+dz*dz,c=ox*ox+oz*oz-radius*radius;
  if(c<=0)return 0;if(a<1e-12)return null;
  const b=2*(ox*dx+oz*dz),disc=b*b-4*a*c;if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
export function coneHit(source:Pick<Mage,'x'|'z'>,angle:number,target:Pick<Mage,'x'|'z'>,range:number,radius:number) {
  const x=target.x-source.x,z=target.z-source.z,d=Math.hypot(x,z),a=Math.abs(Math.atan2(Math.sin(Math.atan2(x,z)-angle),Math.cos(Math.atan2(x,z)-angle)));
  if(a<=Math.PI/3)return d-range<=radius;
  const side=a-Math.PI/3,along=d*Math.cos(side),across=d*Math.sin(side);return Math.hypot(along-Math.max(0,Math.min(range,along)),across)<=radius;
}
function effect(s:SpellboxState,spell:SpellId,kind:Effect['kind'],x:number,z:number,radius:number) {
  s.effects.push({id:s.nextId++,spell,kind,x,z,radius,at:s.t});s.effects=s.effects.slice(-64);
}
function startArena(s:SpellboxState) {
  s.phase='arena';s.arenaAt=s.t;for(const p of s.players){p.ready=true;p.moveX=p.moveZ=0;}
  s.events.push({type:'spellbox-start'});
}
function end(s:SpellboxState) {s.phase='ending';s.finishAt=s.t;s.shrink=null;for(const p of s.players){p.cast=null;p.moveX=p.moveZ=0;}s.projectiles=[];s.mines=[];s.events.push({type:'spellbox-finish'});}
function scheduleShrink(s:SpellboxState){
  const living=s.players.filter(p=>p.alive).length;if(living<2)return;
  const target=arenaRadius(living,s.config.radius);
  if(target>=s.radius-1e-8)return;
  // A newly smaller advertised target gets its own full warning. During a transition, finish
  // the announced boundary first; any further reduction receives a fresh countdown afterwards.
  if(s.shrink&&(s.t>=s.shrink.startsAt||target>=s.shrink.to-1e-8))return;
  const startsAt=s.t+s.config.shrinkWarningMs;
  s.shrink={from:s.radius,to:target,startsAt,endsAt:startsAt+s.config.shrinkMs,lastSecond:Math.ceil(s.config.shrinkWarningMs/1000)};
  s.events.push({type:'spellbox-shrink-warning',radius:target});
}
function updateArena(s:SpellboxState){
  const shrink=s.shrink;if(!shrink)return;
  const second=Math.max(0,Math.ceil((shrink.startsAt-s.t)/1000));
  if(second!==shrink.lastSecond){shrink.lastSecond=second;s.events.push({type:'spellbox-shrink-tick',seconds:second});}
  if(s.t<shrink.startsAt)return;
  const progress=Math.min(1,(s.t-shrink.startsAt)/s.config.shrinkMs);
  s.radius=shrink.from+(shrink.to-shrink.from)*progress;
  if(s.t>=shrink.endsAt){s.radius=shrink.to;s.shrink=null;s.events.push({type:'spellbox-shrunk',radius:s.radius});}
  s.mines=s.mines.filter(m=>Math.hypot(m.x,m.z)<=s.radius);
}
function splash(s:SpellboxState,hits:Hit[],owner:string,spell:SpellId,x:number,z:number,radius:number) {
  const def=SPELLS[spell];effect(s,spell,'hit',x,z,radius);
  for(const target of s.players)if(target.alive&&target.id!==owner&&Math.hypot(target.x-x,target.z-z)<=radius+s.config.bodyRadius){
    const dx=target.x-x,dz=target.z-z,d=Math.hypot(dx,dz)||1;
    hits.push({source:owner,target,damage:def.damage,force:def.force,dx:d===1&&dx===0&&dz===0?1:dx/d,dz:dz/d,spell});
  }
}
function release(s:SpellboxState,p:Mage,hits:Hit[]) {
  const cast=p.cast!;p.cast=null;const d=SPELLS[cast.spell],dx=Math.sin(cast.angle),dz=Math.cos(cast.angle);
  p.casts++;s.events.push({type:'spellbox-cast',id:p.id,spell:cast.spell});effect(s,cast.spell,'cast',p.x,p.z,Math.max(1,d.radius));
  if(d.effect==='shield'){p.shieldUntil=s.t+1200;effect(s,cast.spell,'shield',p.x,p.z,1.7);}
  else if(d.effect==='repair'){p.damage=Math.max(0,p.damage-20);effect(s,cast.spell,'repair',p.x,p.z,1.5);}
  else if(d.effect==='nova')splash(s,hits,p.id,cast.spell,p.x,p.z,d.range);
  else if(d.effect==='cone'){
    for(const target of s.players)if(target.alive&&target!==p&&coneHit(p,cast.angle,target,d.range,s.config.bodyRadius))hits.push({source:p.id,target,damage:d.damage,force:d.force,dx,dz,spell:cast.spell});
    effect(s,cast.spell,'hit',p.x+dx*3,p.z+dz*3,3);
  }else if(d.effect==='mine'){
    const owner=s.mines.filter(m=>m.owner===p.id);if(owner.length>=2)s.mines=s.mines.filter(m=>m.id!==owner[0].id);
    let x=p.x+dx*d.range,z=p.z+dz*d.range;const distance=Math.hypot(x,z),limit=s.radius-.5;if(distance>limit){x=x/distance*limit;z=z/distance*limit;}
    s.mines.push({id:s.nextId++,owner:p.id,x,z,armAt:s.t+600,expireAt:s.t+6000});
  }else if(s.projectiles.length<64)s.projectiles.push({id:s.nextId++,owner:p.id,spell:cast.spell,x:p.x,z:p.z,dx,dz,remaining:d.range,sourceX:p.x,sourceZ:p.z});
}
function commands(s:SpellboxState,p:Mage) {
  const inputs=s.pending[p.id]??[];s.pending[p.id]=[];
  for(const input of inputs){
    if(s.phase==='draft'){
      if(p.ready)continue;
      if(input.type==='ready')p.ready=true;
      if(input.type==='equip'&&validSlot(input.slot)&&SLOT_OPTIONS[input.slot].includes(input.spell)){
        const other=p.build.indexOf(input.spell),old=p.build[input.slot];p.build[input.slot]=input.spell;
        if(other>=0&&other!==input.slot)p.build[other]=SLOT_OPTIONS[other].includes(old)?old:SLOT_OPTIONS[other].find(id=>!p.build.includes(id))!;
      }
      continue;
    }
    if(s.phase!=='arena'||!p.alive)continue;
    if(input.type==='move'||input.type==='aim'){
      if(!Number.isFinite(input.x)||!Number.isFinite(input.z))continue;
      const v=normalize(input.x,input.z);if(input.type==='move'){p.moveX=v.x;p.moveZ=v.z;}
      if(Math.hypot(v.x,v.z)>.01)p.angle=Math.atan2(v.x,v.z);
    }else if(input.type==='cast'&&validSlot(input.slot)&&!p.cast&&s.t>=p.cooldowns[input.slot]&&s.t>=p.nextAction&&s.t>=p.stunnedUntil){
      const spell=p.build[input.slot],d=SPELLS[spell];p.cast={spell,slot:input.slot,angle:p.angle,start:s.t,until:s.t+Math.max(TICK,d.windup)};
      p.cooldowns[input.slot]=s.t+d.cooldown;p.nextAction=s.t+150;s.events.push({type:'spellbox-windup',id:p.id,spell});
    }
  }
}
function tick(s:SpellboxState) {
  s.t+=TICK;s.effects=s.effects.filter(e=>s.t-e.at<550);
  if(s.phase==='ending'){if(s.t>=s.finishAt+s.config.endingMs)s.phase='over';return;}
  for(const p of s.players)commands(s,p);
  if(s.phase==='draft'){if(s.players.every(p=>p.ready)||s.t>=s.config.draftMs)startArena(s);return;}
  scheduleShrink(s);updateArena(s);
  const hits:Hit[]=[];
  for(const p of s.players)if(p.alive&&p.cast&&p.cast.until<=s.t)release(s,p,hits);
  const next:Projectile[]=[];
  for(const shot of s.projectiles){
    const d=SPELLS[shot.spell],step=Math.min(shot.remaining,d.speed*dt),tx=shot.x+shot.dx*step,tz=shot.z+shot.dz*step;
    const contacts=s.players.filter(p=>p.alive&&p.id!==shot.owner).map(p=>({p,t:segmentHit(shot.x,shot.z,tx,tz,p.x,p.z,s.config.bodyRadius+(d.effect==='bomb'?.65:d.radius))})).filter((c):c is {p:Mage;t:number}=>c.t!==null).sort((a,b)=>a.t-b.t||a.p.id.localeCompare(b.p.id));
    const contact=contacts[0];
    if(contact){
      shot.x+=(tx-shot.x)*contact.t;shot.z+=(tz-shot.z)*contact.t;
      if(d.effect==='bomb')splash(s,hits,shot.owner,shot.spell,shot.x,shot.z,d.radius);
      else {
        let dx=shot.dx,dz=shot.dz;
        if(d.effect==='pull'){const source=s.players.find(p=>p.id===shot.owner);dx=(source?.x??shot.sourceX)-contact.p.x;dz=(source?.z??shot.sourceZ)-contact.p.z;const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;}
        hits.push({source:shot.owner,target:contact.p,damage:d.damage,force:d.force,dx,dz,spell:shot.spell});effect(s,shot.spell,'hit',shot.x,shot.z,1.3);
      }
    }else{
      shot.x=tx;shot.z=tz;shot.remaining-=step;
      if(shot.remaining<=1e-6||Math.hypot(tx,tz)>s.radius+2){if(d.effect==='bomb')splash(s,hits,shot.owner,shot.spell,tx,tz,d.radius);}
      else next.push(shot);
    }
  }
  s.projectiles=next;
  s.mines=s.mines.filter(m=>{
    if(s.t>=m.expireAt)return false;
    if(s.t>=m.armAt&&s.players.some(p=>p.alive&&p.id!==m.owner&&Math.hypot(p.x-m.x,p.z-m.z)<=SPELLS['button-mine'].radius+s.config.bodyRadius)){splash(s,hits,m.owner,'button-mine',m.x,m.z,3);return false;}return true;
  });
  // All damage and impulses use the same post-hit damage total, avoiding source-order advantage.
  for(const p of s.players)if(p.alive){
    const batch=hits.filter(h=>h.target===p);if(!batch.length)continue;
    const protection=p.shieldUntil>s.t?.35:1,damage=batch.reduce((n,h)=>n+h.damage*protection,0);p.damage=Math.min(300,p.damage+damage);
    const scale=knockbackMultiplier(p.damage,s.config.damageScale);
    for(const h of batch){p.vx+=h.dx*h.force*scale*protection;p.vz+=h.dz*h.force*scale*protection;const source=s.players.find(o=>o.id===h.source);if(source)source.hits++;}
    const velocity=Math.hypot(p.vx,p.vz);if(velocity>s.config.maxVelocity){p.vx=p.vx/velocity*s.config.maxVelocity;p.vz=p.vz/velocity*s.config.maxVelocity;}
    p.stunnedUntil=s.t+s.config.hitstunMs;p.lastHit=s.t;p.cast=null;s.events.push({type:'spellbox-hit',id:p.id});
  }
  const offset=Math.floor(s.t/TICK)%s.players.length,order=[...s.players.slice(offset),...s.players.slice(0,offset)];
  for(const p of order)if(p.alive){
    const control=p.cast||s.t<p.stunnedUntil?0:s.config.speed;
    const x=p.x+(p.moveX*control+p.vx)*dt,z=p.z+(p.moveZ*control+p.vz)*dt;
    const free=(x:number,z:number)=>s.players.every(o=>o===p||!o.alive||Math.hypot(x-o.x,z-o.z)>=s.config.bodyRadius*2-1e-8);
    if(free(x,z)){p.x=x;p.z=z;}else if(free(x,p.z))p.x=x;else if(free(p.x,z))p.z=z;else {p.vx*=.6;p.vz*=.6;}
    const decay=Math.exp(-s.config.drag*dt);p.vx*=decay;p.vz*=decay;
  }
  for(const p of s.players)if(p.alive&&Math.hypot(p.x,p.z)>s.radius){p.alive=false;p.outAt=s.t;p.cast=null;p.moveX=p.moveZ=0;effect(s,'pop-rocket','out',p.x,p.z,2);s.events.push({type:'eliminated',id:p.id});}
  if(s.players.filter(p=>p.alive).length<=1||s.t-s.arenaAt>=s.config.durationMs)end(s);else scheduleShrink(s);
}
export const spellboxRules:RulesCore<SpellboxState,SpellboxInput,SpellboxConfig>={
  init(contestants,seed,config){
    const cfg={...DEFAULT_CONFIG,...config};if(contestants.length<2||contestants.length>8||new Set(contestants.map(c=>c.id)).size!==contestants.length||Object.values(cfg).some(n=>!Number.isFinite(n)||n<=0)||cfg.bodyRadius>=cfg.radius/4||[cfg.draftMs,cfg.durationMs,cfg.endingMs,cfg.hitstunMs,cfg.shrinkWarningMs,cfg.shrinkMs].some(n=>n%TICK!==0)||cfg.maxVelocity*dt>cfg.bodyRadius)throw new Error('Invalid Spellbox configuration.');
    const rng=seededRng(seed),slots=shuffle(rng,contestants.map((_,i)=>i)),rotation=rng()*Math.PI*2;
    const radius=arenaRadius(contestants.length,cfg.radius);
    return {kind:'spellbox-showdown',seed,config:cfg,radius,shrink:null,phase:'draft',t:0,remainder:0,arenaAt:-1,finishAt:-1,nextId:1,projectiles:[],mines:[],effects:[],pending:{},events:[],players:contestants.map((c,i)=>{
      const a=rotation+slots[i]*Math.PI*2/contestants.length;return{id:c.id,x:Math.sin(a)*radius*.58,z:Math.cos(a)*radius*.58,vx:0,vz:0,angle:a+Math.PI,moveX:0,moveZ:0,alive:true,outAt:-1,damage:0,build:[...DEFAULT_BUILD],ready:false,cooldowns:[0,0,0],nextAction:0,cast:null,shieldUntil:0,stunnedUntil:0,casts:0,hits:0,lastHit:-1};
    })};
  },
  step(s,inputs,dtMs){
    if(s.phase==='over'||!Number.isFinite(dtMs)||dtMs<=0)return s;
    if(s.phase==='draft'||s.phase==='arena')for(const p of s.players){const q=s.pending[p.id]??=[];q.push(...(inputs[p.id]??[]).slice(0,Math.max(0,64-q.length)));}
    s.remainder+=dtMs;while(s.remainder+1e-8>=TICK){s.remainder-=TICK;tick(s);if(spellboxRules.isOver(s))break;}return s;
  },
  isOver:s=>s.phase==='over',
  result(s){const end=s.finishAt<0?s.t:s.finishAt,ordered=[...s.players].sort((a,b)=>Number(b.alive)-Number(a.alive)||b.outAt-a.outAt);return{durationMs:Math.max(0,end-s.arenaAt),placements:rankByKey(ordered.map(p=>({contestantId:p.id,eliminated:!p.alive,score:Math.floor(Math.max(0,(p.alive?end:p.outAt)-s.arenaAt)/1000),key:p.alive?'survivor':`out:${p.outAt}`}))),stats:{casts:s.players.reduce((n,p)=>n+p.casts,0),ringouts:s.players.filter(p=>!p.alive).length}};},
  drainEvents(s){const events=s.events;s.events=[];return events;},
};
