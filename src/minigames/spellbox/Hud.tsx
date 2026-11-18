import { useEffect, useState } from 'react';
import { pressVirtual, releaseVirtual, tapVirtual, type Action } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { clearSpellboxInput, queueSpellboxInput } from './local';
import { SPELL_IDS, SPELLS } from './spells';
import type { SpellboxState } from './rules';
import './spellbox.css';
const directions:Action[]=['forward','back','left','right'];
function MoveButton({action,label}:{action:Action;label:string}){
  useEffect(()=>()=>releaseVirtual(action),[action]);
  return<button aria-label={label} onPointerDown={e=>{e.preventDefault();unlockAudio();e.currentTarget.setPointerCapture(e.pointerId);pressVirtual(action);}} onPointerUp={()=>releaseVirtual(action)} onPointerCancel={()=>releaseVirtual(action)} onLostPointerCapture={()=>releaseVirtual(action)} onBlur={()=>releaseVirtual(action)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();if(!e.repeat)pressVirtual(action);}}} onKeyUp={()=>releaseVirtual(action)}>{label}</button>;
}
export function SpellboxHud({getState,localId,contestants}:MinigameSceneProps<SpellboxState>){
  const[,refresh]=useState(0),[slot,select]=useState(0);const paused=useMatch(s=>s.paused),hostPhase=useMatch(s=>s.phase);
  useEffect(()=>{const timer=window.setInterval(()=>refresh(n=>n+1),80);return()=>{window.clearInterval(timer);clearSpellboxInput();directions.forEach(releaseVirtual);};},[]);
  useEffect(()=>{if(paused){clearSpellboxInput();directions.forEach(releaseVirtual);}},[paused]);
  const s=getState();if(s?.kind!=='spellbox-showdown')return null;const me=s.players.find(p=>p.id===localId);if(!me)return null;
  const active=!paused&&hostPhase==='playing',draft=s.phase==='draft',editable=active&&draft&&!me.ready,playing=active&&s.phase==='arena'&&me.alive;
  const send=(input:Parameters<typeof queueSpellboxInput>[0])=>{if(active){unlockAudio();queueSpellboxInput(input);}};
  return<div className="spellbox-hud">
    <div className="spellbox-banner" aria-live="polite"><strong>{draft?'SPELLBOX · Choose your three spells':s.phase!=='arena'?'Showdown finished':!me.alive?'Ring-out · Watching the survivors':'SPELLBOX SHOWDOWN'}</strong>
      <span>{draft?`${Math.ceil(Math.max(0,s.config.draftMs-s.t)/1000)}s to choose · ${me.ready?'Ready':'Pick a slot, then a spell'}`:`${s.players.filter(p=>p.alive).length} toys in · ${Math.ceil(Math.max(0,s.config.durationMs-(s.t-s.arenaAt))/1000)}s`}</span>
      {!draft&&<strong className="spellbox-damage">{Math.round(me.damage)}% damage{me.shieldUntil>s.t?' · Warded':''}</strong>}
      {!draft&&<small>{me.cast?`Casting ${SPELLS[me.cast.spell].name}…`:me.alive?'More damage = stronger knockback. Stay inside the ring.':'Eliminated by ring-out.'}</small>}
    </div>
    {draft?<section className="spellbox-draft" aria-label="Choose spell build">
      <div className="spellbox-build">{me.build.map((id,i)=><button key={i} data-testid={`spellbox-slot-${i}`} disabled={!editable} aria-pressed={i===slot} onClick={()=>select(i)}><small>{['Q / click','E','R'][i]}</small><strong>{SPELLS[id].name}</strong></button>)}</div>
      <div className="spellbox-catalogue">{SPELL_IDS.map(id=>{const d=SPELLS[id];return<button key={id} data-testid={`spellbox-equip-${id}`} disabled={!editable} aria-pressed={me.build[slot]===id} onClick={()=>send({type:'equip',slot,spell:id})} style={{borderColor:d.colour}}><strong>{d.name}</strong><small>{d.description}</small><span>{d.damage>0?`${d.damage} damage · ${d.force} ${d.effect==='pull'?'pull':'push'} · `:''}{d.cooldown/1000}s cooldown · {d.windup/1000}s cast</span></button>;})}</div>
      <div className="spellbox-draft-footer"><small>Three distinct spells. Picking an equipped spell swaps slots. Deadline keeps your current build.</small><button data-testid="spellbox-ready" disabled={!editable} onClick={()=>send({type:'ready'})}>{me.ready?'Ready — waiting':'Lock build & fight'}</button></div>
    </section>:<>
      <div className="spellbox-roster" aria-label="Contender damage">{s.players.map(p=><span key={p.id} className={p.alive?'':'out'}>{p.id===localId?'You':contestants.find(c=>c.id===p.id)?.name} · {p.alive?`${Math.round(p.damage)}%`:'Out'}</span>)}</div>
      {playing&&<div className="spellbox-move" aria-label="Movement"><MoveButton action="forward" label="Up"/><div><MoveButton action="left" label="Left"/><MoveButton action="back" label="Down"/><MoveButton action="right" label="Right"/></div></div>}
      {playing&&<div className="spellbox-casts" onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();}}>{me.build.map((id,i)=>{const d=SPELLS[id],left=Math.max(0,me.cooldowns[i]-s.t);return<button key={i} data-testid={`spellbox-cast-${i}`} disabled={left>0||!!me.cast||s.t<me.stunnedUntil||s.t<me.nextAction} onClick={()=>{unlockAudio();tapVirtual((`slot${i+1}`) as Action);}} style={{borderColor:d.colour}}><strong>{['Q','E','R'][i]} · {d.name}</strong><small>{left>0?`${(left/1000).toFixed(1)}s`:'Ready'}</small></button>;})}</div>}
      <div className="spellbox-hint">WASD / arrows · Mouse or tap to aim · Q / E / R cast · Click casts slot Q</div>
    </>}
  </div>;
}
