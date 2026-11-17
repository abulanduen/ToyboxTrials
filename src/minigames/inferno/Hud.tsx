import { useEffect, useState } from 'react';
import { pressVirtual, releaseVirtual, type Action } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import type { InfernoState } from './rules';
import './inferno.css';

function Pad({ action, label, disabled = false }: { action: Action; label: string; disabled?: boolean }) {
  useEffect(() => () => releaseVirtual(action), [action]);
  return <button disabled={disabled} aria-label={label} onPointerDown={e => {
    e.preventDefault(); unlockAudio(); e.currentTarget.setPointerCapture(e.pointerId); pressVirtual(action);
  }} onPointerUp={() => releaseVirtual(action)} onPointerCancel={() => releaseVirtual(action)}
    onLostPointerCapture={() => releaseVirtual(action)}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressVirtual(action); } }}
    onKeyUp={() => releaseVirtual(action)} onBlur={() => releaseVirtual(action)}>{label}</button>;
}

export function InfernoHud({ getState, localId }: MinigameSceneProps<InfernoState>) {
  const [, refresh] = useState(0);
  const paused = useMatch(s => s.paused);
  useEffect(() => { const id = window.setInterval(() => refresh(n => n + 1), 100); return () => window.clearInterval(id); }, []);
  const s = getState();
  if (!s) return null;
  const me = s.players.find(p => p.id === localId)!;
  const prep = s.phase === 'prepare';
  const seconds = Math.ceil(Math.max(0, (prep ? s.config.prepMs : s.config.prepMs + s.config.huntMs) - s.t) / 1000);
  return <div className="inferno-hud">
    <div className="inferno-banner">
      <strong>{prep ? `Build your shelter · ${seconds}s` : `The furnace is loose · ${seconds}s`}</strong>
      <span>{!me.alive ? 'You are out — watching the survivors' : prep ? 'Break blocks. Place your one wall.' : 'Stay out of reach. Break open rival shelters.'}</span>
      <small>{s.players.filter(p => p.alive).length} toys left · Wall: {me.wallUsed ? 'placed' : prep ? '1 available' : 'expired'}</small>
    </div>
    {!paused && me.alive && <div className="inferno-controls">
      <div className="inferno-directions"><Pad action="forward" label="Up" /><div><Pad action="left" label="Left" /><Pad action="back" label="Down" /><Pad action="right" label="Right" /></div></div>
      <div className="inferno-actions"><Pad action="slot1" label="Break" /><Pad action="slot2" label="Build wall" disabled={!prep || me.wallUsed} /></div>
    </div>}
  </div>;
}
