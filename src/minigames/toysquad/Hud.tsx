import { useEffect, useState } from 'react';
import { useMatch } from '../session';
import { unlockAudio } from '../../game/audio';
import type { MinigameSceneProps } from '../types';
import { clearSquadInput, submitSquadInput } from './local';
import { DEPLOY_CELLS, MAX_UNITS, ROSTER, type SquadInput, type SquadState, type UnitKind } from './rules';
import './toysquad.css';

export function SquadHud({ getState, localId, contestants }: MinigameSceneProps<SquadState>) {
  const [, refresh] = useState(0); const [selected, select] = useState<number | null>(null);
  const paused = useMatch(s => s.paused); const hostPhase = useMatch(s => s.phase);
  useEffect(() => { const timer = window.setInterval(() => refresh(n => n + 1), 100); return () => { window.clearInterval(timer); clearSquadInput(); }; }, []);
  useEffect(() => { if (paused) clearSquadInput(); }, [paused]);
  const s = getState(); if (s?.kind !== 'toy-squad') return null;
  const me = s.players.find(p => p.id === localId); if (!me) return null;
  const building = s.phase === 'build'; const editable = building && !me.ready && !paused && hostPhase === 'playing';
  const unit = me.units.find(u => u.id === selected);
  const battle = s.battles.find(b => b.owner === localId);
  const send = (input: SquadInput) => { if (editable) { unlockAudio(); submitSquadInput(input); } };
  const name = (id: string) => contestants.find(c => c.id === id)?.name || 'Clockwork Squad';
  return <div className="squad-hud">
    <div className="squad-banner">
      <strong>Round {s.round}/{s.config.rounds} · {building ? 'Build your squad' : s.phase === 'battle' ? 'Auto-battle' : 'Round results'}</strong>
      <span>{Math.ceil(Math.max(0, s.phaseEnds - s.t) / 1000)}s · {me.points} points · {me.coins} coins</span>
      {!building && battle && <small>vs {name(battle.opponent)}{battle.done ? ` · ${battle.outcome} · ${battle.health} health left` : ' · watch your toys fight'}</small>}
    </div>
    {building ? <section className="squad-workbench" aria-label="Squad workshop">
      <div className="squad-shop" aria-label="Unit shop">
        {(Object.keys(ROSTER) as UnitKind[]).map(kind => {
          const def = ROSTER[kind];
          return <button key={kind} data-testid={`squad-buy-${kind}`} disabled={!editable || me.coins < def.cost || me.units.length >= MAX_UNITS} onClick={() => send({ type: 'buy', kind })}>
            <strong>{def.name} · {def.cost}c</strong><small>{def.role} · HP {def.hp} / Hit {def.damage} / Reach {def.range}</small>
          </button>;
        })}
      </div>
      <details className="squad-formation">
        <summary data-testid="squad-formation-toggle">Formation & upgrades · {me.units.length}/{MAX_UNITS} toys</summary>
        <small>Drag toys on the 8×8 board. Or select a toy here, then a square. Enemy is across the red line.</small>
        <div className="squad-grid" aria-label="Formation board">
          {Array.from({ length: DEPLOY_CELLS }, (_, cell) => {
            const here = me.units.find(u => u.cell === cell);
            return <button key={cell} data-testid={`squad-cell-${cell}`} aria-label={`Square ${cell + 1}${here ? `: ${ROSTER[here.kind].name}, level ${here.tier}` : ': empty'}`} aria-pressed={!!here && here.id === selected} disabled={!editable}
              onClick={() => { if (unit && unit.cell !== cell) send({ type: 'move', unit: unit.id, cell }); else select(here?.id ?? null); }}>
              {here ? <><strong>{ROSTER[here.kind].name}</strong><span>Level {here.tier}</span></> : <span>Empty</span>}
            </button>;
          })}
        </div>
        <div className="squad-unit-actions">
          <button disabled={!editable || !unit || unit.tier >= 3 || me.coins < 3} data-testid="squad-upgrade" onClick={() => unit && send({ type: 'upgrade', unit: unit.id })}>Upgrade · 3c</button>
          <button disabled={!editable || !unit} data-testid="squad-sell" onClick={() => { if (unit) { send({ type: 'sell', unit: unit.id }); select(null); } }}>Sell selected</button>
          <button disabled={!editable} onClick={() => select(null)}>Clear selection</button>
        </div>
      </details>
      <button className="squad-ready" disabled={!editable} data-testid="squad-ready" onClick={() => send({ type: 'ready' })}>{me.ready ? 'Ready — waiting for others' : 'Ready for battle'}</button>
      <small>Unused coins carry over. Earn {s.config.income} each round. Ready locks your squad.</small>
    </section> : <section className="squad-scoreboard" aria-label="Squad standings">
      {s.players.map(p => <span key={p.id}>{name(p.id)} · {p.points} points · {p.wins} wins</span>)}
      <small>Win 3 · Draw 1 · Loss 0 · Surviving health breaks ties</small>
    </section>}
  </div>;
}
