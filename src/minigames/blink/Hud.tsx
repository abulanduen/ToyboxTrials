import { useEffect, useState } from 'react';
import { pressVirtual, releaseVirtual, tapVirtual, type Action } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { clearBlinkInput } from './local';
import type { BlinkState } from './rules';
import './blink.css';

const directions:Action[]=['forward','back','left','right'];
function MoveButton({action,label}:{action:Action;label:string}) {
  useEffect(()=>()=>releaseVirtual(action),[action]);
  return <button aria-label={label} onPointerDown={e=>{e.preventDefault();unlockAudio();e.currentTarget.setPointerCapture(e.pointerId);pressVirtual(action);}}
    onPointerUp={()=>releaseVirtual(action)} onPointerCancel={()=>releaseVirtual(action)} onLostPointerCapture={()=>releaseVirtual(action)} onBlur={()=>releaseVirtual(action)}
    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();if(!e.repeat)pressVirtual(action);}}} onKeyUp={()=>releaseVirtual(action)}>{label}</button>;
}
export function BlinkHud({getState,localId,contestants}:MinigameSceneProps<BlinkState>) {
  const [,refresh]=useState(0); const paused=useMatch(s=>s.paused),hostPhase=useMatch(s=>s.phase);
  useEffect(()=>{const timer=window.setInterval(()=>refresh(n=>n+1),80);return()=>{window.clearInterval(timer);clearBlinkInput();directions.forEach(releaseVirtual);};},[]);
  useEffect(()=>{if(paused){clearBlinkInput();directions.forEach(releaseVirtual);}},[paused]);
  const s=getState();if(s?.kind!=='blink-duel')return null;
  const me=s.players.find(p=>p.id===localId);if(!me)return null;
  const active=me.alive&&s.phase==='duel'&&!paused&&hostPhase==='playing';
  const busy=!!me.attack||s.t<me.nextAttack;
  const attackProgress=me.attack?Math.min(1,(s.t-me.attack.start)/s.config.windupMs):0;
  const action=(a:Action)=>{if(active){unlockAudio();tapVirtual(a);}};
  return <div className="blink-hud">
    <div className="blink-banner" aria-live="polite">
      <strong>{s.phase!=='duel'?'Duel finished':!me.alive?'You’re out · Watching':me.attack?'WINDING UP · Blink to cancel':'BLINK DUEL · One hit, one elimination'}</strong>
      <span>{s.players.filter(p=>p.alive).length} toys standing · {Math.ceil(Math.max(0,s.config.durationMs-s.t)/1000)}s · {me.kills} hits</span>
      <div className="blink-charge" role="progressbar" aria-label="Sword wind-up" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(attackProgress*100)}><div style={{width:`${attackProgress*100}%`}}/></div>
      <small>{me.attack?'Your striped cone is locked until the swing lands.':s.t<me.nextAttack?'Sword recovering; blinking is still available.':'Space: blink · J / click: attack · WASD / arrows: move'}</small>
    </div>
    <div className="blink-roster" aria-label="Duel standings">{s.players.map(p=><span key={p.id} className={p.alive?'':'out'}>{p.id===localId?'You':contestants.find(c=>c.id===p.id)?.name} · {p.alive?'In':'Out'}</span>)}</div>
    {active&&<div className="blink-move" aria-label="Movement"><MoveButton action="forward" label="Up"/><div><MoveButton action="left" label="Left"/><MoveButton action="back" label="Down"/><MoveButton action="right" label="Right"/></div></div>}
    {active&&<div className="blink-actions" onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();}}><button data-testid="blink-attack" disabled={busy} onClick={()=>action('slot2')}>Swing [J]</button><button data-testid="blink-blink" onClick={()=>action('slot1')}>Blink [Space]<small>No cooldown</small></button></div>}
    <div className="blink-hint">{me.alive?'Tap arena / mouse to aim. Striped cones warn of a strike. Blink out before they fill.':'Watch the remaining toys. Dead toys cannot attack or block.'}</div>
  </div>;
}
