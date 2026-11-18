import { useEffect, useState } from 'react';
import { useMatch } from '../session';
import { unlockAudio } from '../../game/audio';
import type { MinigameSceneProps } from '../types';
import { clearSquadInput, resetSquadUI, submitSquadInput, useSquadUI } from './local';
import { DEPLOY_CELLS, BENCH_SIZE, boardLimit, canBuy, purchaseUpgradeTargets, rerollPrice, type SquadInput, type SquadState } from './rules';
import { ABILITIES, PASSIVES, RARITY_COLOURS, ROSTER, SHOP_ODDS } from './catalogue';
import { TRAIT_BONUSES, type Trait } from './kits';
import { traitCounts } from './spellcraft';
import './toysquad.css';

export function SquadHud({ getState, localId, contestants }: MinigameSceneProps<SquadState>) {
  const [, refresh] = useState(0);
  const { selected, hovered, shopSlot } = useSquadUI();
  const select = (selected: number | null) => useSquadUI.setState({ selected });
  const paused = useMatch(s => s.paused), hostPhase = useMatch(s => s.phase);
  useEffect(() => { resetSquadUI(); const timer = window.setInterval(() => refresh(n => n + 1), 100); return () => { window.clearInterval(timer); clearSquadInput(); resetSquadUI(); }; }, []);
  useEffect(() => { if (paused) { clearSquadInput(); useSquadUI.setState({ hovered: null, shopSlot: null }); } }, [paused]);
  const s = getState(); if (s?.kind !== 'toy-squad') return null;
  const me = s.players.find(p => p.id === localId); if (!me) return null;
  const shopKind = shopSlot !== null ? me.shop[shopSlot] : null;
  const building = s.phase === 'build', editable = building && !me.ready && !paused && hostPhase === 'playing';
  const unit = me.units.find(u => u.id === selected);
  const inspected = me.units.find(u => u.id === (hovered ?? selected));
  const detail = shopKind ? ROSTER[shopKind] : inspected ? ROSTER[inspected.kind] : null;
  const boardCount = me.units.filter(u => u.cell >= 0).length, benchCount = me.units.length - boardCount;
  const traits = traitCounts(me.units), fight = s.battles.find(b => b.owner === localId);
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
    {building && detail && !paused && <aside className="squad-tooltip" data-testid="squad-kit" aria-label="Unit details">
      <strong>{detail.name}{!shopKind && inspected ? ` · ${inspected.tier} stars` : ''}</strong><small>{detail.rarity} · {detail.traits.join(' / ')} · HP {detail.hp * 2 ** ((shopKind ? 1 : inspected?.tier ?? 1) - 1)} · Hit {detail.damage * 2 ** ((shopKind ? 1 : inspected?.tier ?? 1) - 1)} · Range {detail.range}</small>
      <p><b>Passive — {detail.passive.name}:</b> {detail.passive.description}</p>
      <p><b>Spell — {detail.spell.name} ({detail.spell.mana} mana):</b> {detail.spell.description}</p><small>Basic attack: {ABILITIES[detail.ability]} · Tick = 0.5s</small>
    </aside>}
    {building ? <section className="squad-workbench" aria-label="Squad workshop">
      {!!me.passiveOffers.length && <section className="squad-passive-pick" aria-label="Choose a passive">
        <strong>Round {s.round}: choose a permanent passive</strong>
        <div>{me.passiveOffers.map(id => <button key={id} data-testid={`squad-passive-${id}`} disabled={!editable} onClick={() => send({ type: 'passive', passive: id })}><strong>{PASSIVES[id].name}</strong><small>{PASSIVES[id].description}</small></button>)}</div>
      </section>}
      <div className="squad-shop" aria-label="Unit shop">
        {me.shop.map((kind, slot) => {
          const def = kind ? ROSTER[kind] : null;
          const upgrades = kind ? purchaseUpgradeTargets(me, kind) : [];
          return <button key={slot} data-testid={`squad-buy-${slot}`} title={def ? `${def.name} · ${def.rarity}\n${def.traits.join(' / ')}\nPassive: ${def.passive.name}. ${def.passive.description}\nSpell: ${def.spell.name} (${def.spell.mana} mana). ${def.spell.description}\n${ABILITIES[def.ability]}` : 'Purchased — reroll or wait for next round'}
            style={def ? { borderColor: RARITY_COLOURS[def.rarity] } : undefined}
            onMouseEnter={() => useSquadUI.setState({ shopSlot: slot, hovered: null })} onMouseLeave={() => useSquadUI.setState({ shopSlot: null })}
            onFocus={() => useSquadUI.setState({ shopSlot: slot, hovered: null })} onBlur={() => useSquadUI.setState({ shopSlot: null })}
            disabled={!editable || !kind || !canBuy(me, kind)} onClick={() => send({ type: 'buy', slot })}>
            <strong>{def ? `${def.name} · ${def.cost}c` : 'Sold'}</strong><span>{def?.rarity} · {def?.traits.join(' / ')}</span><small>{def && `HP ${def.hp} · Hit ${def.damage} · Range ${def.range}`}</small><small>{def && `Passive: ${def.passive.name}`}</small><small>{def && `Spell: ${def.spell.name} · ${def.spell.mana} mana`}</small>{!!upgrades.length && <small className="squad-upgrade-label">Auto-upgrade → {upgrades.length + 1} stars</small>}
          </button>;
        })}
      </div>
      <div className="squad-shop-actions"><button data-testid="squad-reroll" disabled={!editable || me.coins < rerollPrice(s, me)} onClick={() => send({ type: 'reroll' })}>Reroll [R] · {rerollPrice(s, me)}c</button>
        <button className="squad-ready" disabled={!editable || !!me.passiveOffers.length} data-testid="squad-ready" onClick={() => send({ type: 'ready' })}>{me.ready ? 'Ready — waiting' : me.passiveOffers.length ? 'Choose a passive first' : 'Ready [E]'}</button>
      </div>
      <details className="squad-formation">
        <summary data-testid="squad-formation-toggle">Formation & traits · {boardCount}/{boardLimit(me.level)} deployed</summary>
        <small>Pairs merge automatically, including reserves. Two 1-stars → 2-star; two 2-stars → 3-star. Gold highlights show upgrade recipients. Drag to place or use these squares. Reserves sit below your board.</small>
        <div className="squad-grid" aria-label="Formation board">{Array.from({ length: DEPLOY_CELLS }, (_, cell) => {
          const here = me.units.find(u => u.cell === cell);
          return <button key={cell} data-testid={`squad-cell-${cell}`} disabled={!editable} aria-pressed={!!here && here.id === selected} onMouseEnter={() => useSquadUI.setState({ hovered: here?.id ?? null, shopSlot: null })} onMouseLeave={() => useSquadUI.setState({ hovered: null })} onFocus={() => useSquadUI.setState({ hovered: here?.id ?? null, shopSlot: null })} onBlur={() => useSquadUI.setState({ hovered: null })} onClick={() => place(cell)} aria-label={`Square ${cell + 1}${here ? `: ${ROSTER[here.kind].name}, ${here.tier} stars` : ': empty'}`}>{here ? <><strong>{ROSTER[here.kind].name}</strong><span>{here.tier} stars</span></> : 'Empty'}</button>;
        })}</div>
        <div className="squad-bench" aria-label="Reserve bench">{Array.from({ length: BENCH_SIZE }, (_, i) => {
          const cell = -i - 1, here = me.units.find(u => u.cell === cell);
          return <button key={cell} data-testid={`squad-bench-${i}`} disabled={!editable} aria-pressed={!!here && here.id === selected} onMouseEnter={() => useSquadUI.setState({ hovered: here?.id ?? null, shopSlot: null })} onMouseLeave={() => useSquadUI.setState({ hovered: null })} onFocus={() => useSquadUI.setState({ hovered: here?.id ?? null, shopSlot: null })} onBlur={() => useSquadUI.setState({ hovered: null })} onClick={() => place(cell)}>{here ? `${ROSTER[here.kind].name} · ${here.tier} stars` : `Reserve ${i + 1}`}</button>;
        })}</div>
        <div className="squad-unit-actions">
          <button data-testid="squad-reserve" disabled={!editable || !unit || unit.cell < 0 || benchCount >= BENCH_SIZE} onClick={() => unit && send({ type: 'bench', unit: unit.id })}>To reserves</button>
          <button data-testid="squad-sell" disabled={!editable || !unit} onClick={() => { if (unit) { send({ type: 'sell', unit: unit.id }); select(null); } }}>Sell selected [Q]</button>
          <button disabled={!editable} onClick={() => select(null)}>Clear selection</button>
        </div>
        <p>Level {me.level} odds — Common / Uncommon / Rare / Epic / Legendary: {SHOP_ODDS[me.level - 1].join('% / ')}%</p>
        <p>Passives: {me.passives.map(id => PASSIVES[id].name).join(', ') || 'Choose on rounds 3, 6 and 9'}</p>
        <div className="squad-traits" data-testid="squad-traits">{(Object.entries(traits) as [Trait, number][]).map(([trait, count]) => <p key={trait}><strong>{trait} {count}/{count >= 4 ? 4 : count >= 2 ? 4 : 2}{count >= 2 ? ' · active' : ''}</strong> — {TRAIT_BONUSES[trait]}</p>)}<small>Bonuses affect matching toys. Count distinct deployed kinds; duplicates and reserves do not add trait counts.</small></div>
      </details>
      <small>Q: sell hovered/selected toy · R: reroll · E: ready · Hover for details; tap a toy on touch. Pairs auto-merge. Gold: upgrade from shop.</small>
    </section> : <section className="squad-scoreboard" aria-label="Squad standings">{s.players.map(p => <span key={p.id}>{name(p.id)} · {p.points} points · {p.wins} wins</span>)}<small>Win 3 · Draw 1 · Loss 0 · Surviving health breaks ties</small>
      <details className="squad-combat-kits"><summary>Unit spells & mana</summary><small>Attacks generate 20 mana; losing health generates 8 per tick. Full mana casts automatically. Silence blocks spells; stun blocks actions.</small>{fight?.fighters.filter(u => u.side === 0).map(u => <p key={u.id}><strong>{ROSTER[u.kind].name}</strong> · {u.hp > 0 ? `${u.magic.mana}/${u.magic.maxMana} mana` : 'Defeated'} · {u.magic.casts} casts · {u.magic.lastSpell || ROSTER[u.kind].spell.name}</p>)}</details>
    </section>}
  </div>;
}
