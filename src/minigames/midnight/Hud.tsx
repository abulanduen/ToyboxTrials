import { useEffect, useState } from 'react';
import { pressVirtual, releaseVirtual, type Action } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { sheltered, type HungerState } from './rules';
import './midnight.css';

function DirectionPad({ action, label }: { action: Action; label: string }) {
  useEffect(() => () => releaseVirtual(action), [action]);
  return <button aria-label={label} onPointerDown={e => {
    e.preventDefault(); unlockAudio(); e.currentTarget.setPointerCapture(e.pointerId); pressVirtual(action);
  }} onPointerUp={() => releaseVirtual(action)} onPointerCancel={() => releaseVirtual(action)}
    onLostPointerCapture={() => releaseVirtual(action)} onBlur={() => releaseVirtual(action)}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressVirtual(action); } }}
    onKeyUp={() => releaseVirtual(action)}>{label}</button>;
}

export function HungerHud({ getState, localId }: MinigameSceneProps<HungerState>) {
  const [, refresh] = useState(0);
  const paused = useMatch(s => s.paused);
  useEffect(() => { const id = window.setInterval(() => refresh(n => n + 1), 100); return () => window.clearInterval(id); }, []);
  const s = getState();
  if (s?.kind !== 'midnight-hunger') return null;
  const me = s.players.find(p => p.id === localId);
  if (!me) return null;
  const night = s.phase === 'night';
  return <div className={`hunger-hud ${night ? 'hunger-night' : 'hunger-day'}`}>
    <div className="hunger-banner">
      <strong>{night ? 'NIGHT · Catch a battery' : 'DAY · Find shelter'} · {Math.ceil(Math.max(0, s.phaseEnds - s.t) / 1000)}s</strong>
      <span>{!me.alive ? 'Out of energy — watching the survivors' : night ? me.fed ? 'Recharged! Head to a corner shelter.' : `${s.batteries.filter(b => b.caughtBy === null).length} batteries left · one each` : sheltered(me) ? 'Sheltered: energy still drains slowly' : 'Exposed: sunlight drains energy fast!'}</span>
      <div className="hunger-energy" role="progressbar" aria-label="Energy" aria-valuemin={0} aria-valuemax={s.config.maxEnergy} aria-valuenow={Math.round(me.energy)}>
        <div style={{ width: `${me.energy / s.config.maxEnergy * 100}%` }} />
      </div>
      <small>{Math.ceil(me.energy)} energy · {s.players.filter(p => p.alive).length} toys left · Night {s.night}</small>
    </div>
    <div className="hunger-field" aria-label="Contender energy">
      {s.players.map(p => <span key={p.id} className={!p.alive ? 'out' : ''}>{p.id === localId ? 'You' : `Toy ${s.players.indexOf(p) + 1}`} · {Math.ceil(p.energy)}</span>)}
    </div>
    {!paused && me.alive && <div className="hunger-controls"><DirectionPad action="forward" label="Up" /><div>
      <DirectionPad action="left" label="Left" /><DirectionPad action="back" label="Down" /><DirectionPad action="right" label="Right" />
    </div></div>}
    <div className="hunger-hint">{night ? 'Touch a battery bot to catch it' : 'Roofed corners are shelters'}</div>
  </div>;
}
