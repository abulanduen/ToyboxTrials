/**
 * Toy Squad HUD (DOM), re-rendered ten times a second. Your own board: traits at the left, the shop
 * dock (with the coin purse) at the bottom, the player rail at the right. Looking at someone else's
 * board from the rail, or following a seat as an online spectator, is the same HUD read-only: their
 * traits, level, coins, passives and toys (tap one for its kit) in place of the shop, and no action
 * is accepted until you are back on your own board. Their shop stays private.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { followBoard, pauseMatch, useMatch } from '../session';
import { useGame } from '../../game/store';
import { unlockAudio } from '../../game/audio';
import type { MinigameSceneProps } from '../types';
import { clearSquadInput, resetSquadUI, submitSquadInput, useSquadUI, viewedSquad } from './local';
import { boardLimit, canBuy, purchaseUpgradeTargets, rerollPrice, sellValue, standings, type SquadInput, type SquadState } from './rules';
import { ABILITIES, PASSIVES, RARITY_COLOURS, ROSTER, type Rarity } from './catalogue';
import { TRAIT_BONUSES, type Trait } from './kits';
import { traitCounts } from './spellcraft';
import { SQUAD_STATUSES, handbookEntries, ownedCopies, ownedSummary, sortTraits, traitProgress } from './info';
import { PlayerRail, WatchBanner, type RailEntry } from '../shared/PlayerRail';
import { StatusLegend } from '../shared/StatusIcon';
import { toyPortrait } from './portraits';
import { Handbook } from './Handbook';
import { DamagePanel } from './DamagePanel';
import { BookIcon, CloseIcon, StarIcon, TRAIT_SYMBOLS, TraitIcon, ZoomIcon } from './TraitIcon';
import { SQUAD_ZOOM, squadView, zoomSquad } from './camera';
import { CogIcon } from '../../ui/itemIcons';
import './toysquad.css';

const rarityStyle = (rarity: Rarity) => ({ '--rarity': RARITY_COLOURS[rarity] }) as CSSProperties;
const stars = (n: number) => Array.from({ length: n }, (_, i) => <StarIcon key={i} size={11} />);
const coinText = (n: number) => `${n} coin${n === 1 ? '' : 's'}`;
/** A coin amount with the game's coin mark (the brass cog used for every price in Toybox Trials). */
function Coins({ value, testId, size = 16, sign = '', className = '' }: { value: number; testId?: string; size?: number; sign?: string; className?: string }) {
  return <span className={`squad-coins ${className}`} data-testid={testId} data-value={value}><CogIcon size={size} /><b>{sign}{value}</b><span className="squad-sr"> {value === 1 ? 'coin' : 'coins'}</span></span>;
}

export function SquadHud({ getState, localId, contestants }: MinigameSceneProps<SquadState>) {
  const [, refresh] = useState(0);
  const { selected, hovered, shopSlot, dragging, overShop, watching } = useSquadUI();
  const paused = useMatch(s => s.paused), hostPhase = useMatch(s => s.phase);
  const favourites = useGame(s => s.squadFavourites);
  const [openTrait, setOpenTrait] = useState<Trait | null>(null), [handbook, setHandbook] = useState(false);
  const closeHandbook = useCallback(() => setHandbook(false), []);
  const firstPassive = useRef<HTMLButtonElement>(null);
  useEffect(() => { resetSquadUI(); const timer = window.setInterval(() => refresh(n => n + 1), 100); return () => { window.clearInterval(timer); clearSquadInput(); resetSquadUI(); followBoard(null); }; }, []);
  useEffect(() => { if (paused) { clearSquadInput(); useSquadUI.setState({ hovered: null, shopSlot: null }); } }, [paused]);
  const s = getState(), me = s?.kind === 'toy-squad' ? s.players.find(p => p.id === localId) : undefined;
  // An online spectator follows a seat: its board, read-only (the host never sends a spectator's input).
  const spectator = !contestants.find(c => c.id === localId)?.isLocal;
  const choosing = !spectator && !!me && s?.phase === 'build' && me.passiveOffers.length > 0;
  // The passive choice is modal: it brings you back to your own board, closes the other panels and takes keyboard focus.
  useEffect(() => { if (choosing) { setHandbook(false); setOpenTrait(null); useSquadUI.setState({ watching: null, selected: null, hovered: null }); followBoard(null); firstPassive.current?.focus(); } }, [choosing]);
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
  // The player rail: anyone's board, read-only. Their battle (online: sent once you pick them) shows in the damage overview.
  const viewId = viewedSquad(s.players, localId, watching), viewing = viewId !== localId, shownFight = s.battles.find(b => b.owner === viewId);
  const shown = s.players.find(p => p.id === viewId) ?? me, readOnly = viewing || spectator;
  const name = (id: string) => contestants.find(c => c.id === id)?.name || 'Clockwork Squad';
  const who = name(shown.id);
  const shopKind = !readOnly && shopSlot !== null ? me.shop[shopSlot] : null;
  const building = s.phase === 'build', canAct = !readOnly && building && !me.ready && !paused && hostPhase === 'playing', editable = canAct && !choosing;
  // The toy whose kit shows: hovered or selected, on whichever board is on show.
  const picked = shown.units.find(u => u.id === (hovered ?? selected));
  const dragged = dragging !== null ? me.units.find(u => u.id === dragging) : undefined;
  const detail = shopKind ? ROSTER[shopKind] : picked ? ROSTER[picked.kind] : null;
  const boardCount = shown.units.filter(u => u.cell >= 0).length;
  const counts = traitCounts(shown.units), traits = sortTraits(counts), fight = s.battles.find(b => b.owner === shown.id);
  const view = (id: string) => { const other = id === localId ? null : id; useSquadUI.setState({ watching: other, selected: null, hovered: null, shopSlot: null }); followBoard(other); };
  const send = (input: SquadInput) => { if (input.type === 'passive' ? canAct : editable) { unlockAudio(); submitSquadInput(input); } };
  const rail: RailEntry[] = standings(s).map(p => ({
    id: p.id, name: name(p.id), stat: String(p.points), statLabel: 'pts', detail: `${p.wins} win${p.wins === 1 ? '' : 's'} · ${p.health} health kept`,
    result: p.last, busy: building && !p.ready, busyLabel: 'still building',
  }));
  const seconds = Math.ceil(Math.max(0, s.phaseEnds - s.t) / 1000);
  const tier = shopKind ? 1 : picked?.tier ?? 1;
  return <div className={`squad-hud${building ? ' is-building' : ''}${readOnly ? ' is-viewing' : ''}`} data-viewing={readOnly ? shown.id : undefined}>
    {/* The right-hand column: the standings, then the board zoom right under them (phones in landscape: zoom at the top left). */}
    <div className="squad-side">
      <PlayerRail className="squad-rail" title="Standings" label="Standings: view a player's board" entries={rail} localId={localId} viewing={viewId} onView={view} ranked />
      {/* Board zoom (also the mouse wheel, + / − and pinch; drag the table to look around once zoomed in). */}
      <div className="squad-zoom" role="group" aria-label="Board zoom" data-testid="squad-zoom" data-zoom={squadView.zoom.toFixed(2)}>
        <button data-testid="squad-zoom-in" aria-label="Zoom in" title="Zoom in (+, mouse wheel or pinch)" disabled={choosing || squadView.zoom >= SQUAD_ZOOM.max - 1e-3} onClick={() => zoomSquad(SQUAD_ZOOM.step)}><ZoomIcon dir="in" /></button>
        <button data-testid="squad-zoom-out" aria-label="Zoom out" title="Zoom out (−, mouse wheel or pinch)" disabled={choosing || squadView.zoom <= SQUAD_ZOOM.min + 1e-3} onClick={() => zoomSquad(1 / SQUAD_ZOOM.step)}><ZoomIcon dir="out" /></button>
      </div>
    </div>
    {viewing && <WatchBanner className="squad-watch" name={name(viewId)} onBack={() => view(localId)} />}
    <div className="squad-banner" data-testid="squad-banner">
      <strong>Round {s.round}/{s.config.rounds} · Level {shown.level} · {readOnly ? `${who}'s squad` : building ? 'Build your squad' : s.phase === 'battle' ? 'Auto-battle' : 'Round results'}</strong>
      <span className="squad-banner__line">{seconds}s · {shown.points} points · <Coins value={shown.coins} testId="squad-banner-coins" /> · Board {boardCount}/{boardLimit(shown.level)}</span>
      {readOnly && <small data-testid="squad-banner-passives" data-passives={shown.passives.join()}>Passives: {shown.passives.length ? shown.passives.map(id => PASSIVES[id].name).join(', ') : 'none yet'}</small>}
      {!building && <small>vs {name(fight?.opponent ?? '')} · {fight?.outcome ?? 'Fighting'}</small>}
    </div>
    <button className="squad-handbook-open" data-testid="squad-handbook-open" disabled={choosing} onClick={() => { setOpenTrait(null); setHandbook(true); }}><BookIcon /><span>Toys</span></button>
    {/* Traits of the deployed squad, at the side of the screen. Tap one for its details. */}
    {traits.length > 0 && <nav className="squad-trait-column" data-testid="squad-traits" data-owner={shown.id} aria-label={readOnly ? `${who}'s traits` : "Squad traits"}>
      {traits.map(([trait, count]) => { const { rank, next } = traitProgress(count);
        return <button key={trait} data-testid={`squad-trait-${trait}`} className={rank ? 'is-active' : undefined} aria-pressed={openTrait === trait} aria-label={`${trait}: ${count} deployed${rank ? ', bonus active' : ''}. Show details`}
          onClick={() => { setHandbook(false); setOpenTrait(openTrait === trait ? null : trait); }}><TraitIcon trait={trait} size={26} /><span>{count}/{next ?? 4}</span></button>; })}
    </nav>}
    {openTrait && !choosing && !handbook && (() => { const count = counts[openTrait] ?? 0, { rank, next } = traitProgress(count);
      return <aside className="squad-panel squad-trait-detail" data-testid="squad-trait-detail" aria-label={`${openTrait} trait details`}>
        <header className="squad-panel__head"><TraitIcon trait={openTrait} size={30} /><strong>{openTrait}</strong>
          <button className="squad-close" data-testid="squad-trait-close" onClick={() => setOpenTrait(null)}><CloseIcon /> Close</button></header>
        <p><b>Bonus:</b> {TRAIT_BONUSES[openTrait]}</p>
        <p>{count} different {openTrait} toy{count === 1 ? '' : 's'} on {readOnly ? `${who}'s` : 'your'} board. {rank === 2 ? 'Top bonus active.' : rank === 1 ? `First bonus active; ${next! - count} more for the top bonus.` : `${next! - count} more to switch it on.`} Duplicates and reserves do not count.</p>
        <p className="squad-trait-members"><b>Toys with this trait (symbol: {TRAIT_SYMBOLS[openTrait]}):</b> {handbookEntries(null, openTrait).map(id =>
          <span key={id} style={rarityStyle(ROSTER[id].rarity)} className={shown.units.some(u => u.kind === id) ? 'is-owned' : undefined}>{ROSTER[id].name}</span>)}</p>
      </aside>; })()}
    {(building || readOnly) && detail && !paused && !choosing && !handbook && !openTrait && dragging === null && <aside className="squad-panel squad-tooltip" data-testid="squad-kit" aria-label={readOnly ? `Unit details, ${who}'s squad` : 'Unit details'} style={rarityStyle(detail.rarity)}>
      <header className="squad-panel__head"><strong>{detail.name}{!shopKind && picked ? <> · {stars(picked.tier)}<span className="squad-sr"> {picked.tier} stars</span></> : ''}</strong>
        {!shopKind && selected !== null && picked?.id === selected && <button className="squad-close" data-testid="squad-kit-close" onClick={() => useSquadUI.setState({ selected: null, hovered: null })}><CloseIcon /> Close</button>}</header>
      {readOnly && <small className="squad-kit__owner">{who}'s {picked && picked.cell < 0 ? 'reserves' : 'board'} · read-only</small>}
      <small>{detail.rarity} · HP {detail.hp * 2 ** (tier - 1)} · Hit {detail.damage * 2 ** (tier - 1)} · Range {detail.range}</small>
      <span className="squad-trait-tags">{detail.traits.map(t => <span key={t}><TraitIcon trait={t} size={18} />{t}</span>)}</span>
      <p><b>Passive — {detail.passive.name}:</b> {detail.passive.description}</p>
      <p><b>Spell — {detail.spell.name} ({detail.spell.mana} mana):</b> {detail.spell.description}</p><small>Basic attack: {ABILITIES[detail.ability]} · Tick = 0.5s</small>
    </aside>}
    {building && readOnly ? <section className="squad-workbench squad-viewbench" data-testid="squad-viewbench" aria-label={`${who}'s squad, read-only`}>
      {/* Someone else's build, in the shop dock's place: level, coins, passives and every toy. Their shop is private. */}
      <header className="squad-viewbench__head">
        <strong>{who}</strong>
        <span>Level {shown.level} · Board {boardCount}/{boardLimit(shown.level)} · {shown.ready ? 'Ready' : 'Building'}</span>
        <Coins value={shown.coins} testId="squad-view-coins" size={22} className="squad-purse" />
      </header>
      <div className="squad-viewbench__passives" data-testid="squad-view-passives"><b>Passives</b>
        {shown.passives.length ? shown.passives.map(id => <span key={id} className="squad-passive-chip" title={PASSIVES[id].description}><strong>{PASSIVES[id].name}</strong><small>{PASSIVES[id].description}</small></span>)
          : <small>None yet (chosen on rounds 3, 6 and 9)</small>}</div>
      <ol className="squad-viewbench__units" data-testid="squad-view-units">{shown.units.slice().sort((a, b) => Number(a.cell < 0) - Number(b.cell < 0) || Math.abs(a.cell) - Math.abs(b.cell)).map(u => {
        const def = ROSTER[u.kind], picture = toyPortrait(u.kind);
        return <li key={u.id}><button data-testid={`squad-view-unit-${u.id}`} data-kind={u.kind} data-tier={u.tier} aria-pressed={selected === u.id} style={rarityStyle(def.rarity)}
          onClick={() => useSquadUI.setState({ selected: selected === u.id ? null : u.id, hovered: null })}>
          <span className="squad-card__picture">{picture && <img src={picture} alt="" draggable={false} />}</span>
          <span className="squad-viewbench__unit"><strong>{def.name}</strong><span>{stars(u.tier)}<span className="squad-sr"> {u.tier} stars</span></span>
            <small>{u.cell < 0 ? 'Reserve' : 'Board'}</small></span></button></li>; })}
        {!shown.units.length && <li className="squad-viewbench__empty">No toys yet.</li>}</ol>
      <small className="squad-hint">Read-only: their shop is private. Tap a toy for its kit; Back to my board to play.</small>
    </section> : building ? <section className="squad-workbench" data-testid="squad-workbench" aria-label="Squad workshop">
      <div className="squad-shop" data-testid="squad-shop" aria-label="Unit shop">
        {me.shop.map((kind, slot) => {
          const def = kind ? ROSTER[kind] : null, picture = kind ? toyPortrait(kind) : undefined;
          const upgrades = kind ? purchaseUpgradeTargets(me, kind) : [], owned = kind ? ownedCopies(me.units, kind) : [0, 0, 0];
          const starred = !!kind && favourites.includes(kind);
          return <button key={slot} className="squad-card" data-testid={`squad-buy-${slot}`} data-rarity={def?.rarity} data-starred={starred || undefined} title={def ? `${def.name} · ${def.rarity} · ${coinText(def.cost)}\n${def.traits.join(' / ')}\nPassive: ${def.passive.name}. ${def.passive.description}\nSpell: ${def.spell.name} (${def.spell.mana} mana). ${def.spell.description}\n${ABILITIES[def.ability]}` : 'Purchased — reroll or wait for next round'}
            style={def ? rarityStyle(def.rarity) : undefined}
            onMouseEnter={() => useSquadUI.setState({ shopSlot: slot, hovered: null })} onMouseLeave={() => useSquadUI.setState({ shopSlot: null })}
            onFocus={() => useSquadUI.setState({ shopSlot: slot, hovered: null })} onBlur={() => useSquadUI.setState({ shopSlot: null })}
            disabled={!editable || !kind || !canBuy(me, kind)} onClick={() => send({ type: 'buy', slot })}>
            {def && <span className="squad-card__picture">{picture && <img src={picture} alt="" draggable={false} />}
              {starred && <span className="squad-card__star" data-testid={`squad-fav-${slot}`}><StarIcon size={18} /><span className="squad-sr">Starred</span></span>}</span>}
            <span className="squad-card__text">
              <strong>{def ? def.name : 'Sold'}</strong>
              {def && <span className="squad-card__meta"><Coins value={def.cost} size={14} className="squad-card__cost" /><span className="squad-card__rarity">{def.rarity}</span>{def.traits.map(t => <TraitIcon key={t} trait={t} size={18} title />)}</span>}
              {def && <small className="squad-card__more">HP {def.hp} · Hit {def.damage} · Range {def.range}</small>}{def && <small className="squad-card__more">Passive: {def.passive.name}</small>}{def && <small className="squad-card__more">Spell: {def.spell.name} · {def.spell.mana} mana</small>}
              {owned.some(Boolean) && <small className="squad-owned" data-testid={`squad-owned-${slot}`} data-owned={ownedSummary(owned)}>Owned{owned.map((n, i) => n ? <span key={i}>{stars(i + 1)}×{n}</span> : null)}
                <span className="squad-sr"> {owned.map((n, i) => n ? `${n} at ${i + 1} star${i ? 's' : ''}` : '').filter(Boolean).join(', ')}</span></small>}
              {!!upgrades.length && <small className="squad-upgrade-label"><span className="squad-upgrade-label__full">Auto-upgrade → {upgrades.length + 1} stars</span>
                <span className="squad-upgrade-label__short">Merge → {upgrades.length + 1}<StarIcon size={10} /><span className="squad-sr"> stars</span></span></small>}
            </span>
          </button>;
        })}
      </div>
      <div className="squad-shop-actions">
        <Coins value={me.coins} testId="squad-coins" size={26} className="squad-purse" />
        <button data-testid="squad-reroll" disabled={!editable || me.coins < rerollPrice(s, me)} onClick={() => send({ type: 'reroll' })}>Reroll [R] · <Coins value={rerollPrice(s, me)} size={15} /></button>
        <button className="squad-sell" data-testid="squad-sell" disabled={!editable || !picked} title={picked ? undefined : 'Tap a toy to select it first'}
          onClick={() => { if (picked) { send({ type: 'sell', unit: picked.id }); useSquadUI.setState({ selected: null, hovered: null }); } }}>
          {picked ? <>Sell [Q] · <Coins value={sellValue(picked)} sign="+" size={15} /><small>{ROSTER[picked.kind].name}</small></> : <>Sell [Q]<small>Select a toy</small></>}</button>
        <button className="squad-ready" disabled={!editable} data-testid="squad-ready" onClick={() => send({ type: 'ready' })}>{me.ready ? 'Ready — waiting' : choosing ? 'Choose a passive first' : 'Ready [E]'}</button>
      </div>
      <small className="squad-hint">Drag toys to place them; drag one here to sell it. Tap a toy to select it. Pairs merge automatically. Keys: F next toy, arrows move it, Q sell, R reroll, E ready.</small>
      {dragged && <div className={`squad-sell-drop${overShop ? ' is-over' : ''}`} data-testid="squad-sell-drop" data-over={overShop} aria-live="polite">
        <strong>{overShop ? 'Release to sell' : 'Drop here to sell'}</strong><span>{ROSTER[dragged.kind].name} · <Coins value={sellValue(dragged)} sign="+" size={18} /></span>
      </div>}
    </section> : <details className="squad-combat-kits" data-testid="squad-combat-kits"><summary>Spells, mana & badges</summary>
      <small>Win 3 · Draw 1 · Loss 0 · Surviving health breaks ties. Attacks generate 20 mana; losing health generates 8 per tick. Full mana casts automatically. Silence blocks spells; stun blocks actions.</small>
      <StatusLegend kinds={SQUAD_STATUSES} />
      {shownFight?.fighters.filter(u => u.side === 0).map(u => <p key={u.id}><strong>{ROSTER[u.kind].name}</strong> · {u.hp > 0 ? `${u.magic.mana}/${u.magic.maxMana} mana` : 'Defeated'} · {u.magic.casts} casts · {u.magic.lastSpell || ROSTER[u.kind].spell.name}</p>)}</details>}
    {/* Beside the rail: who is doing and taking the damage, during the battle and the recap after it (the viewed board's battle). */}
    {!building && shownFight && !handbook && <DamagePanel key={shownFight.owner} battle={shownFight} t={s.t} />}
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
