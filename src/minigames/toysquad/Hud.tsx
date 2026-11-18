import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { pauseMatch, useMatch } from '../session';
import { useGame } from '../../game/store';
import { unlockAudio } from '../../game/audio';
import type { MinigameSceneProps } from '../types';
import { clearSquadInput, resetSquadUI, submitSquadInput, useSquadUI } from './local';
import { boardLimit, canBuy, purchaseUpgradeTargets, rerollPrice, sellValue, type SquadInput, type SquadState } from './rules';
import { ABILITIES, PASSIVES, RARITY_COLOURS, ROSTER, type Rarity } from './catalogue';
import { TRAIT_BONUSES, type Trait } from './kits';
import { traitCounts } from './spellcraft';
import { handbookEntries, ownedCopies, ownedSummary, sortTraits, traitProgress } from './info';
import { toyPortrait } from './portraits';
import { Handbook } from './Handbook';
import { DamagePanel } from './DamagePanel';
import { BookIcon, CloseIcon, StarIcon, TRAIT_SYMBOLS, TraitIcon } from './TraitIcon';
import './toysquad.css';

const rarityStyle = (rarity: Rarity) => ({ '--rarity': RARITY_COLOURS[rarity] }) as CSSProperties;
const stars = (n: number) => Array.from({ length: n }, (_, i) => <StarIcon key={i} size={11} />);

export function SquadHud({ getState, localId, contestants }: MinigameSceneProps<SquadState>) {
  const [, refresh] = useState(0);
  const { selected, hovered, shopSlot, dragging, overShop } = useSquadUI();
  const paused = useMatch(s => s.paused), hostPhase = useMatch(s => s.phase);
  const favourites = useGame(s => s.squadFavourites);
  const [openTrait, setOpenTrait] = useState<Trait | null>(null), [handbook, setHandbook] = useState(false);
  const closeHandbook = useCallback(() => setHandbook(false), []);
  const firstPassive = useRef<HTMLButtonElement>(null);
  useEffect(() => { resetSquadUI(); const timer = window.setInterval(() => refresh(n => n + 1), 100); return () => { window.clearInterval(timer); clearSquadInput(); resetSquadUI(); }; }, []);
  useEffect(() => { if (paused) { clearSquadInput(); useSquadUI.setState({ hovered: null, shopSlot: null }); } }, [paused]);
  const s = getState(), me = s?.kind === 'toy-squad' ? s.players.find(p => p.id === localId) : undefined;
  const choosing = !!me && s?.phase === 'build' && me.passiveOffers.length > 0;
  // The passive choice is modal: it closes the other panels and takes keyboard focus.
  useEffect(() => { if (choosing) { setHandbook(false); setOpenTrait(null); firstPassive.current?.focus(); } }, [choosing]);
  const panelOpen = handbook || openTrait !== null || (s?.phase === 'build' && !choosing && selected !== null);
  // Escape closes the top panel (handbook, then trait details, then unit details) instead of pausing. The match
  // overlay's own Escape listener runs first and pauses, so this one undoes that pause in the same key press.
  // It stays attached while paused: React re-renders between the two listeners, and detaching would skip it.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation(); e.preventDefault(); pauseMatch(false);
      if (handbook) setHandbook(false); else if (openTrait !== null) setOpenTrait(null); else useSquadUI.setState({ selected: null, hovered: null });
    };
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true);
  }, [panelOpen, handbook, openTrait]);
  if (s?.kind !== 'toy-squad' || !me) return null;
  const shopKind = shopSlot !== null ? me.shop[shopSlot] : null;
  const building = s.phase === 'build', canAct = building && !me.ready && !paused && hostPhase === 'playing', editable = canAct && !choosing;
  const picked = me.units.find(u => u.id === (hovered ?? selected));
  const dragged = dragging !== null ? me.units.find(u => u.id === dragging) : undefined;
  const detail = shopKind ? ROSTER[shopKind] : picked ? ROSTER[picked.kind] : null;
  const boardCount = me.units.filter(u => u.cell >= 0).length;
  const counts = traitCounts(me.units), traits = sortTraits(counts), fight = s.battles.find(b => b.owner === localId);
  const send = (input: SquadInput) => { if (input.type === 'passive' ? canAct : editable) { unlockAudio(); submitSquadInput(input); } };
  const name = (id: string) => contestants.find(c => c.id === id)?.name || 'Clockwork Squad';
  const seconds = Math.ceil(Math.max(0, s.phaseEnds - s.t) / 1000);
  const tier = shopKind ? 1 : picked?.tier ?? 1;
  return <div className="squad-hud">
    <div className="squad-banner">
      <strong>Round {s.round}/{s.config.rounds} · Level {me.level} · {building ? 'Build your squad' : s.phase === 'battle' ? 'Auto-battle' : 'Round results'}</strong>
      <span>{seconds}s · {me.points} points · {me.coins} coins · Board {boardCount}/{boardLimit(me.level)}</span>
      {!building && <small>vs {name(fight?.opponent ?? '')} · {fight?.outcome ?? 'Fighting'}</small>}
    </div>
    <button className="squad-handbook-open" data-testid="squad-handbook-open" disabled={choosing} onClick={() => { setOpenTrait(null); setHandbook(true); }}><BookIcon /><span>Toys</span></button>
    {/* Traits of the deployed squad, at the side of the screen. Tap one for its details. */}
    {traits.length > 0 && <nav className="squad-trait-column" data-testid="squad-traits" aria-label="Squad traits">
      {traits.map(([trait, count]) => { const { rank, next } = traitProgress(count);
        return <button key={trait} data-testid={`squad-trait-${trait}`} className={rank ? 'is-active' : undefined} aria-pressed={openTrait === trait} aria-label={`${trait}: ${count} deployed${rank ? ', bonus active' : ''}. Show details`}
          onClick={() => { setHandbook(false); setOpenTrait(openTrait === trait ? null : trait); }}><TraitIcon trait={trait} size={26} /><span>{count}/{next ?? 4}</span></button>; })}
    </nav>}
    {openTrait && !choosing && !handbook && (() => { const count = counts[openTrait] ?? 0, { rank, next } = traitProgress(count);
      return <aside className="squad-panel squad-trait-detail" data-testid="squad-trait-detail" aria-label={`${openTrait} trait details`}>
        <header className="squad-panel__head"><TraitIcon trait={openTrait} size={30} /><strong>{openTrait}</strong>
          <button className="squad-close" data-testid="squad-trait-close" onClick={() => setOpenTrait(null)}><CloseIcon /> Close</button></header>
        <p><b>Bonus:</b> {TRAIT_BONUSES[openTrait]}</p>
        <p>{count} different {openTrait} toy{count === 1 ? '' : 's'} on your board. {rank === 2 ? 'Top bonus active.' : rank === 1 ? `First bonus active; ${next! - count} more for the top bonus.` : `${next! - count} more to switch it on.`} Duplicates and reserves do not count.</p>
        <p className="squad-trait-members"><b>Toys with this trait (symbol: {TRAIT_SYMBOLS[openTrait]}):</b> {handbookEntries(null, openTrait).map(id =>
          <span key={id} style={rarityStyle(ROSTER[id].rarity)} className={me.units.some(u => u.kind === id) ? 'is-owned' : undefined}>{ROSTER[id].name}</span>)}</p>
      </aside>; })()}
    {building && detail && !paused && !choosing && !handbook && !openTrait && dragging === null && <aside className="squad-panel squad-tooltip" data-testid="squad-kit" aria-label="Unit details" style={rarityStyle(detail.rarity)}>
      <header className="squad-panel__head"><strong>{detail.name}{!shopKind && picked ? <> · {stars(picked.tier)}<span className="squad-sr"> {picked.tier} stars</span></> : ''}</strong>
        {!shopKind && selected !== null && picked?.id === selected && <button className="squad-close" data-testid="squad-kit-close" onClick={() => useSquadUI.setState({ selected: null, hovered: null })}><CloseIcon /> Close</button>}</header>
      <small>{detail.rarity} · HP {detail.hp * 2 ** (tier - 1)} · Hit {detail.damage * 2 ** (tier - 1)} · Range {detail.range}</small>
      <span className="squad-trait-tags">{detail.traits.map(t => <span key={t}><TraitIcon trait={t} size={18} />{t}</span>)}</span>
      <p><b>Passive — {detail.passive.name}:</b> {detail.passive.description}</p>
      <p><b>Spell — {detail.spell.name} ({detail.spell.mana} mana):</b> {detail.spell.description}</p><small>Basic attack: {ABILITIES[detail.ability]} · Tick = 0.5s</small>
    </aside>}
    {building ? <section className="squad-workbench" data-testid="squad-workbench" aria-label="Squad workshop">
      <div className="squad-shop" data-testid="squad-shop" aria-label="Unit shop">
        {me.shop.map((kind, slot) => {
          const def = kind ? ROSTER[kind] : null, picture = kind ? toyPortrait(kind) : undefined;
          const upgrades = kind ? purchaseUpgradeTargets(me, kind) : [], owned = kind ? ownedCopies(me.units, kind) : [0, 0, 0];
          const starred = !!kind && favourites.includes(kind);
          return <button key={slot} className="squad-card" data-testid={`squad-buy-${slot}`} data-rarity={def?.rarity} data-starred={starred || undefined} title={def ? `${def.name} · ${def.rarity}\n${def.traits.join(' / ')}\nPassive: ${def.passive.name}. ${def.passive.description}\nSpell: ${def.spell.name} (${def.spell.mana} mana). ${def.spell.description}\n${ABILITIES[def.ability]}` : 'Purchased — reroll or wait for next round'}
            style={def ? rarityStyle(def.rarity) : undefined}
            onMouseEnter={() => useSquadUI.setState({ shopSlot: slot, hovered: null })} onMouseLeave={() => useSquadUI.setState({ shopSlot: null })}
            onFocus={() => useSquadUI.setState({ shopSlot: slot, hovered: null })} onBlur={() => useSquadUI.setState({ shopSlot: null })}
            disabled={!editable || !kind || !canBuy(me, kind)} onClick={() => send({ type: 'buy', slot })}>
            {def && <span className="squad-card__picture">{picture && <img src={picture} alt="" draggable={false} />}
              {starred && <span className="squad-card__star" data-testid={`squad-fav-${slot}`}><StarIcon size={18} /><span className="squad-sr">Starred</span></span>}</span>}
            <span className="squad-card__text">
              <strong>{def ? def.name : 'Sold'}</strong>
              {def && <span className="squad-card__meta"><b className="squad-card__cost">{def.cost}c</b><span className="squad-card__rarity">{def.rarity}</span>{def.traits.map(t => <TraitIcon key={t} trait={t} size={18} title />)}</span>}
              {def && <small className="squad-card__more">HP {def.hp} · Hit {def.damage} · Range {def.range}</small>}{def && <small className="squad-card__more">Passive: {def.passive.name}</small>}{def && <small className="squad-card__more">Spell: {def.spell.name} · {def.spell.mana} mana</small>}
              {owned.some(Boolean) && <small className="squad-owned" data-testid={`squad-owned-${slot}`} data-owned={ownedSummary(owned)}>Owned{owned.map((n, i) => n ? <span key={i}>{stars(i + 1)}×{n}</span> : null)}
                <span className="squad-sr"> {owned.map((n, i) => n ? `${n} at ${i + 1} star${i ? 's' : ''}` : '').filter(Boolean).join(', ')}</span></small>}
              {!!upgrades.length && <small className="squad-upgrade-label">Auto-upgrade → {upgrades.length + 1} stars</small>}
            </span>
          </button>;
        })}
      </div>
      <div className="squad-shop-actions">
        <button data-testid="squad-reroll" disabled={!editable || me.coins < rerollPrice(s, me)} onClick={() => send({ type: 'reroll' })}>Reroll [R] · {rerollPrice(s, me)}c</button>
        <button className="squad-sell" data-testid="squad-sell" disabled={!editable || !picked} title={picked ? undefined : 'Tap a toy to select it first'}
          onClick={() => { if (picked) { send({ type: 'sell', unit: picked.id }); useSquadUI.setState({ selected: null, hovered: null }); } }}>
          {picked ? <>Sell [Q] · +{sellValue(picked)}c<small>{ROSTER[picked.kind].name}</small></> : <>Sell [Q]<small>Select a toy</small></>}</button>
        <button className="squad-ready" disabled={!editable} data-testid="squad-ready" onClick={() => send({ type: 'ready' })}>{me.ready ? 'Ready — waiting' : choosing ? 'Choose a passive first' : 'Ready [E]'}</button>
      </div>
      <small className="squad-hint">Drag toys to place them; drag one here to sell it. Tap a toy to select it. Pairs merge automatically. Keys: F next toy, arrows move it, Q sell, R reroll, E ready.</small>
      {dragged && <div className={`squad-sell-drop${overShop ? ' is-over' : ''}`} data-testid="squad-sell-drop" data-over={overShop} aria-live="polite">
        <strong>{overShop ? 'Release to sell' : 'Drop here to sell'}</strong><span>{ROSTER[dragged.kind].name} · +{sellValue(dragged)} coin{sellValue(dragged) === 1 ? '' : 's'}</span>
      </div>}
    </section> : <section className="squad-scoreboard" aria-label="Squad standings">{s.players.map(p => <span key={p.id}>{name(p.id)} · {p.points} points · {p.wins} wins</span>)}<small>Win 3 · Draw 1 · Loss 0 · Surviving health breaks ties</small>
      <details className="squad-combat-kits"><summary>Unit spells & mana</summary><small>Attacks generate 20 mana; losing health generates 8 per tick. Full mana casts automatically. Silence blocks spells; stun blocks actions.</small>{fight?.fighters.filter(u => u.side === 0).map(u => <p key={u.id}><strong>{ROSTER[u.kind].name}</strong> · {u.hp > 0 ? `${u.magic.mana}/${u.magic.maxMana} mana` : 'Defeated'} · {u.magic.casts} casts · {u.magic.lastSpell || ROSTER[u.kind].spell.name}</p>)}</details>
    </section>}
    {/* Opposite the trait column: who is doing and taking the damage, during the battle and the recap after it. */}
    {!building && fight && !handbook && <DamagePanel battle={fight} t={s.t} />}
    {handbook && !choosing && <Handbook onClose={closeHandbook} />}
    {choosing && <div className="squad-modal" data-testid="squad-passive-modal" role="dialog" aria-modal="true" aria-labelledby="squad-passive-title">
      <div className="squad-modal__card">
        <strong id="squad-passive-title">Round {s.round}: choose a passive</strong>
        <p>Pick one of these three. It lasts for the rest of the run. You must choose before you can do anything else{me.passives.length ? `. You have: ${me.passives.map(id => PASSIVES[id].name).join(', ')}` : ''}.</p>
        <div className="squad-passive-options">{me.passiveOffers.map((id, i) => <button key={id} ref={i === 0 ? firstPassive : undefined} data-testid={`squad-passive-${id}`} disabled={!canAct} onClick={() => send({ type: 'passive', passive: id })}><strong>{PASSIVES[id].name}</strong><small>{PASSIVES[id].description}</small></button>)}</div>
        <small>{seconds}s left. If time runs out, the first option is taken.</small>
      </div>
    </div>}
  </div>;
}
