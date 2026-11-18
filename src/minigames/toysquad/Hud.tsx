import { useEffect, useState } from 'react';
import { useMatch } from '../session';
import { unlockAudio } from '../../game/audio';
import type { MinigameSceneProps } from '../types';
import { clearSquadInput, submitSquadInput } from './local';
import { DEPLOY_CELLS, BENCH_SIZE, boardLimit, canMerge, rerollPrice, type SquadInput, type SquadState } from './rules';
import { ABILITIES, PASSIVES, RARITY_COLOURS, ROSTER, SHOP_ODDS } from './catalogue';
import './toysquad.css';

export function SquadHud({ getState, localId, contestants }: MinigameSceneProps<SquadState>) {
  const [, refresh] = useState(0); const [selected, select] = useState<number | null>(null);
  const paused = useMatch(s => s.paused), hostPhase = useMatch(s => s.phase);
  useEffect(() => { const timer = window.setInterval(() => refresh(n => n + 1), 100); return () => { window.clearInterval(timer); clearSquadInput(); }; }, []);
  useEffect(() => { if (paused) clearSquadInput(); }, [paused]);
  const s = getState(); if (s?.kind !== 'toy-squad') return null;
  const me = s.players.find(p => p.id === localId); if (!me) return null;
  const building = s.phase === 'build', editable = building && !me.ready && !paused && hostPhase === 'playing';
  const unit = me.units.find(u => u.id === selected), partner = unit && me.units.find(other => canMerge(unit, other));
  const boardCount = me.units.filter(u => u.cell >= 0).length, benchCount = me.units.length - boardCount;
  const send = (input: SquadInput) => { if (editable) { unlockAudio(); submitSquadInput(input); } };
  const name = (id: string) => contestants.find(c => c.id === id)?.name || 'Clockwork Squad';
  const place = (cell: number) => {
    const here = me.units.find(u => u.cell === cell);
    if (unit && unit.cell !== cell) send({ type: 'move', unit: unit.id, cell }); else select(here?.id ?? null);
  };
  return <div className="squad-hud">
    <div className="squad-banner">
      <strong>Round {s.round}/{s.config.rounds} · Level {me.level} · {building ? 'Build your squad' : s.phase === 'battle' ? 'Auto-battle' : 'Round results'}</strong>
      <span>{Math.ceil(Math.max(0, s.phaseEnds - s.t) / 1000)}s · {me.points} points · {me.coins} coins · Board {boardCount}/{boardLimit(me.level)}</span>
      {!building && <small>vs {name(s.battles.find(b => b.owner === localId)?.opponent ?? '')} · {s.battles.find(b => b.owner === localId)?.outcome ?? 'Fighting'}</small>}
    </div>
    {building ? <section className="squad-workbench" aria-label="Squad workshop">
      {!!me.passiveOffers.length && <section className="squad-passive-pick" aria-label="Choose a passive">
        <strong>Round {s.round}: choose a permanent passive</strong>
        <div>{me.passiveOffers.map(id => <button key={id} data-testid={`squad-passive-${id}`} disabled={!editable} onClick={() => send({ type: 'passive', passive: id })}><strong>{PASSIVES[id].name}</strong><small>{PASSIVES[id].description}</small></button>)}</div>
      </section>}
      <div className="squad-shop" aria-label="Unit shop">
        {me.shop.map((kind, slot) => {
          const def = kind ? ROSTER[kind] : null;
          return <button key={slot} data-testid={`squad-buy-${slot}`} title={def ? `${def.name} · ${def.rarity}\nHP ${def.hp}, damage ${def.damage}, range ${def.range}\n${ABILITIES[def.ability]}` : 'Purchased — reroll or wait for next round'}
            style={def ? { borderColor: RARITY_COLOURS[def.rarity] } : undefined}
            disabled={!editable || !def || me.coins < def.cost || (boardCount >= boardLimit(me.level) && benchCount >= BENCH_SIZE)} onClick={() => send({ type: 'buy', slot })}>
            <strong>{def ? `${def.name} · ${def.cost}c` : 'Sold'}</strong><span>{def?.rarity}</span><small>{def && `HP ${def.hp} · Hit ${def.damage} · Range ${def.range}`}</small><small>{def?.role}</small>
          </button>;
        })}
      </div>
      <div className="squad-shop-actions"><button data-testid="squad-reroll" disabled={!editable || me.coins < rerollPrice(s, me)} onClick={() => send({ type: 'reroll' })}>Reroll · {rerollPrice(s, me)}c</button>
        <button className="squad-ready" disabled={!editable || !!me.passiveOffers.length} data-testid="squad-ready" onClick={() => send({ type: 'ready' })}>{me.ready ? 'Ready — waiting' : me.passiveOffers.length ? 'Choose a passive first' : 'Ready for battle'}</button>
      </div>
      <details className="squad-formation">
        <summary data-testid="squad-formation-toggle">Formation, reserves & merges · {boardCount}/{boardLimit(me.level)} deployed</summary>
        <small>Drag matching toys with equal stars together to merge. Two 1-stars → 2-star; two 2-stars → 3-star (maximum). Otherwise squares swap. New purchases go to reserves when your board is full.</small>
        <div className="squad-bench" aria-label="Reserve bench">{Array.from({ length: BENCH_SIZE }, (_, i) => {
          const cell = -i - 1, here = me.units.find(u => u.cell === cell);
          return <button key={cell} data-testid={`squad-bench-${i}`} disabled={!editable} aria-pressed={!!here && here.id === selected} onClick={() => place(cell)}>{here ? `${ROSTER[here.kind].name} · ${here.tier} stars` : `Reserve ${i + 1}`}</button>;
        })}</div>
        <div className="squad-grid" aria-label="Formation board">{Array.from({ length: DEPLOY_CELLS }, (_, cell) => {
          const here = me.units.find(u => u.cell === cell);
          return <button key={cell} data-testid={`squad-cell-${cell}`} disabled={!editable} aria-pressed={!!here && here.id === selected} onClick={() => place(cell)} aria-label={`Square ${cell + 1}${here ? `: ${ROSTER[here.kind].name}, ${here.tier} stars` : ': empty'}`}>{here ? <><strong>{ROSTER[here.kind].name}</strong><span>{here.tier} stars</span></> : 'Empty'}</button>;
        })}</div>
        {unit && <p className="squad-selection">{ROSTER[unit.kind].name} · {unit.tier} stars · {ROSTER[unit.kind].rarity} · {ROSTER[unit.kind].role}</p>}
        <div className="squad-unit-actions">
          <button data-testid="squad-merge" disabled={!editable || !unit || !partner} onClick={() => unit && partner && send({ type: 'merge', unit: partner.id, other: unit.id })}>Merge matching pair</button>
          <button data-testid="squad-reserve" disabled={!editable || !unit || unit.cell < 0 || benchCount >= BENCH_SIZE} onClick={() => unit && send({ type: 'bench', unit: unit.id })}>To reserves</button>
          <button data-testid="squad-sell" disabled={!editable || !unit} onClick={() => { if (unit) { send({ type: 'sell', unit: unit.id }); select(null); } }}>Sell selected</button>
          <button disabled={!editable} onClick={() => select(null)}>Clear selection</button>
        </div>
        <p>Level {me.level} odds — Common / Uncommon / Rare / Epic / Legendary: {SHOP_ODDS[me.level - 1].join('% / ')}%</p>
        <p>Passives: {me.passives.map(id => PASSIVES[id].name).join(', ') || 'Choose on rounds 3, 6 and 9'}</p>
      </details>
      <small>Next round: level +1, {s.config.income} coins and a fresh shop. Maximum board size 10. Unused coins carry over.</small>
    </section> : <section className="squad-scoreboard" aria-label="Squad standings">{s.players.map(p => <span key={p.id}>{name(p.id)} · {p.points} points · {p.wins} wins</span>)}<small>Win 3 · Draw 1 · Loss 0 · Surviving health breaks ties</small></section>}
  </div>;
}
