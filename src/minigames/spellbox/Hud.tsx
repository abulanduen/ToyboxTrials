import { useEffect, useState } from 'react';
import { releaseVirtual, tapVirtual, type Action } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { clearSpellboxInput, queueSpellboxInput } from './local';
import { SLOT_OPTIONS, SPELLS, spellStats } from './spells';
import type { SpellboxState } from './rules';
import { SpellIcon } from './SpellIcon';
import { MoveTouch } from '../shared/MoveTouch';
import { tapButton } from '../shared/tapButton';
import './spellbox.css';
const directions:Action[]=['forward','back','left','right'];
export function SpellboxHud({getState,localId,contestants}:MinigameSceneProps<SpellboxState>){
  const[,refresh]=useState(0),[slot,select]=useState(0);const paused=useMatch(s=>s.paused),hostPhase=useMatch(s=>s.phase);
  useEffect(()=>{const timer=window.setInterval(()=>refresh(n=>n+1),80);return()=>{window.clearInterval(timer);clearSpellboxInput();directions.forEach(releaseVirtual);};},[]);
  useEffect(()=>{if(paused){clearSpellboxInput();directions.forEach(releaseVirtual);}},[paused]);
  const s=getState();if(s?.kind!=='spellbox-showdown')return null;const me=s.players.find(p=>p.id===localId);if(!me)return null;
  const active=!paused&&hostPhase==='playing',draft=s.phase==='draft',editable=active&&draft&&!me.ready,playing=active&&s.phase==='arena'&&me.alive;
  const send=(input:Parameters<typeof queueSpellboxInput>[0])=>{if(active){unlockAudio();queueSpellboxInput(input);}};
  const name=(id:string)=>id===localId?'You':contestants.find(c=>c.id===id)?.name??id;
  const waiting=s.players.filter(p=>!p.ready).length,counting=draft&&s.fightAt>=0,fightIn=Math.max(1,Math.ceil((s.fightAt-s.t)/1000));
  return<div className="spellbox-hud">
    {!draft&&<div className="spellbox-banner" aria-live="polite"><strong>{s.phase!=='arena'?'Showdown finished':!me.alive?'Ring-out · Watching the survivors':'SPELLBOX SHOWDOWN'}</strong>
      <span>{`${s.players.filter(p=>p.alive).length} toys in · ${Math.ceil(Math.max(0,s.config.durationMs-(s.t-s.arenaAt))/1000)}s`}</span>
      <strong className="spellbox-damage">{Math.round(me.damage)}% damage{me.shieldUntil>s.t?' · Warded':''}</strong>
      <small>{me.cast?`Casting ${SPELLS[me.cast.spell].name}…`:me.alive?'More damage = stronger knockback. Stay inside the ring.':'Eliminated by ring-out.'}</small>
    </div>}
    {!draft&&s.shrink&&<div className="spellbox-shrink" data-testid="spellbox-shrink" role="status"><strong>{s.t<s.shrink.startsAt?`ARENA SHRINKS IN ${Math.ceil((s.shrink.startsAt-s.t)/1000)}s`:'ARENA SHRINKING'}</strong><span>Move inside the dashed ring · Target diameter {Math.round(s.shrink.to*2)} cm</span></div>}
    {/* The draft: one card that always fits on screen. Only the offer grid may shrink (and, as a last resort on a tiny
        screen, scroll inside itself); the header, the three buttons and Lock build never leave view. */}
    {draft?<div className="spellbox-draft-backdrop" data-testid="spellbox-draft-backdrop"><section className="spellbox-draft" data-testid="spellbox-draft" aria-label="Choose spell build">
      <header className="spellbox-draft-head">
        <strong>{counting?'Everyone is locked in':'Choose your three spells'}</strong>
        {counting
          ?<span className="spellbox-fight-in" data-testid="spellbox-countdown" role="status" aria-live="assertive">Fight in {fightIn}…</span>
          :<span role="status" aria-live="polite">{me.ready?`Locked in · Waiting for ${waiting} more`:'No time limit · Locking in is final'}</span>}
      </header>
      <div className="spellbox-build">{me.build.map((id,i)=><button key={i} data-testid={`spellbox-slot-${i}`} disabled={!editable} aria-pressed={i===slot} onClick={()=>select(i)}><SpellIcon spell={id}/><span><small>{['Q','E','R'][i]}<span className="spellbox-key-extra">{[' / left click',' / right click',''][i]}</span></small><strong>{SPELLS[id].name}</strong></span></button>)}</div>
      <p className="spellbox-draft-label">{['Q · Ranged','E · Area','R · Utility and movement'][slot]}: pick one</p>
      <div className="spellbox-catalogue" data-testid="spellbox-catalogue">{SLOT_OPTIONS[slot].map(id=>{const d=SPELLS[id],other=me.build.indexOf(id);return<button key={id} data-testid={`spellbox-equip-${id}`} disabled={!editable} aria-pressed={me.build[slot]===id} onClick={()=>send({type:'equip',slot,spell:id})} style={{borderColor:d.colour}} title={`${d.name}: ${d.description}\n${spellStats(id)}`}><SpellIcon spell={id}/><strong>{d.name}</strong><small className="spellbox-spell-text">{d.description}</small><span className="spellbox-spell-stats" data-testid={`spellbox-stats-${id}`}>{spellStats(id)}</span>{other>=0&&other!==slot&&<small className="spellbox-spell-move">Moves from {['Q','E','R'][other]}</small>}</button>;})}</div>
      <div className="spellbox-draft-footer">
        <ul className="spellbox-lockins" data-testid="spellbox-lockins" aria-label="Who has locked in">{s.players.map(p=><li key={p.id} data-testid={`spellbox-lockin-${p.id}`} className={p.ready?'ready':''}><span aria-hidden className="spellbox-lockin-dot"/><span className="spellbox-lockin-name">{name(p.id)}</span><small className="spellbox-lockin-state">{p.ready?'Locked in':'Choosing'}</small></li>)}</ul>
        <button data-testid="spellbox-ready" disabled={!editable} onClick={()=>send({type:'ready'})}>{me.ready?'Locked in':'Lock build'}</button>
      </div>
    </section></div>:<>
      <div className="spellbox-roster" aria-label="Contender damage">{s.players.map(p=><span key={p.id} className={p.alive?'':'out'}>{p.id===localId?'You':contestants.find(c=>c.id===p.id)?.name} · {p.alive?`${Math.round(p.damage)}%`:'Out'}</span>)}</div>
      {playing&&<div className="spellbox-stick"><MoveTouch jump={false}/></div>}
      {playing&&<div className="spellbox-casts" onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();}}>{me.build.map((id,i)=>{const d=SPELLS[id],left=Math.max(0,me.cooldowns[i]-s.t);return<button key={i} data-testid={`spellbox-cast-${i}`} disabled={left>0||!!me.cast||s.t<me.stunnedUntil||s.t<me.nextAction} {...tapButton(()=>{unlockAudio();tapVirtual((`slot${i+1}`) as Action);})} style={{borderColor:d.colour}} title={`${['Q / left click','E / right click','R'][i]}: ${d.name}. ${d.description}`}><SpellIcon spell={id}/><span className="spellbox-cast-copy"><strong>{['Q','E','R'][i]} · {d.name}</strong><small>{left>0?`${(left/1000).toFixed(1)}s`:'Ready'}</small></span></button>;})}</div>}
    </>}
  </div>;
}
