/**
 * Toy Tower Tumble HUD (DOM). Re-renders ten times a second from the live rules state, never per
 * frame. Every committing action is a ≥ 56 px button: the board squares (small on a phone) only
 * select, and the sheet that opens for the selected square carries Build, Merge, Sell and Close.
 * The sheet (and the mouse's hover tip) floats beside its square, clamped inside the safe area: it
 * never moves the board or the columns. With a mouse, clicking or dragging onto a same-tier partner
 * merges too; on touch only the sheet's Merge button merges (a tap just selects the pair).
 *
 * Looking at a board that is not yours to change (someone else's from the player rail, or the seat
 * an online spectator follows) is the same HUD read-only: that board's gold, lives, quests, towers
 * (tap one for its sheet), builder level and odds, and a Board panel with its towers by tier and
 * by family; every action is off until you are back on your own board.
 *
 * Layout on every screen: quests on the left, the shared player rail on the right (tap a player to
 * view their board, read-only), the board centred between them (drag to look around, pinch or
 * wheel to zoom), the bar on top and the build dock at the bottom (phone landscape: right).
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { matchBus, pauseMatch, useMatch } from '../session';
import { unlockAudio } from '../../game/audio';
import { PALETTE } from '../../game/palette';
import { useGame } from '../../game/store';
import type { MinigameSceneProps } from '../types';
import { subscribePortraits, toyPortrait, portraitCount } from '../toysquad/portraits';
import { PlayerRail, SpectateOffer, WatchBanner, type RailEntry } from '../shared/PlayerRail';
import { StatusLegend } from '../shared/StatusIcon';
import { placePopover } from '../shared/popover';
import { cellName, isBuildable, isPath } from './board';
import {
  ABILITY_NAME, ABILITY_TEXT, BOSSES, BUILD_COST, BUILDER, DAMAGE_CHECK, ENEMIES, FAMILY, FAMILIES, MAX_BUILDER, MAX_TIER, QUESTS, QUEST_ORDER, TIER_COLOURS, TOWERS, WAVES,
  isBossWave, questReward, sellValue, type QuestId,
} from './catalogue';
import {
  SPEEDS, allHumansOut, boardScore, builderCost, canBuild, cycleWatch, inCheck, questProgress, stillGoing, towerAt, twinsOf, viewedBoard, watchable,
  type TdPlayer, type TdState,
} from './rules';
import { buildHere, clearTumbleInput, resetTumbleUI, submitTumbleInput, useTumbleUI, type TdPanel } from './local';
import { tumbleScreen, tumbleView } from './camera';
import { boardSummary } from './info';
import { TUMBLE_STATUSES } from './status';
import './towertumble.css';

const tierStyle = (tier: number) => ({ '--tier': TIER_COLOURS[tier - 1] }) as CSSProperties;
interface Toast { key: number; text: string; tone: 'good' | 'bad' | 'boss' | 'info'; until: number }
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

function Portrait({ model }: { model: string }) {
  useSyncExternalStore(subscribePortraits, portraitCount);
  const src = toyPortrait(model);
  return <span className="td-portrait">{src && <img src={src} alt="" draggable={false} />}</span>;
}
function Coin() { return <svg className="td-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="7" fill="#EFAE45" stroke="#574D69" strokeWidth="1.5" /><circle cx="8" cy="8" r="3.5" fill="none" stroke="#574D69" strokeWidth="1.2" /></svg>; }
function Heart() { return <svg className="td-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 14 2 8.3A3.4 3.4 0 0 1 8 4a3.4 3.4 0 0 1 6 4.3Z" fill="#E76B62" stroke="#574D69" strokeWidth="1.3" /></svg>; }
function Tick() { return <svg className="td-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="m3 8.5 3.2 3L13 4.5" fill="none" stroke="#2B2433" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
/** A gold price in the top bar's coin style (same font and size as the bar's gold and lives). */
function Cost({ gold, testId }: { gold: number; testId?: string }) {
  return <span className="td-cost" data-testid={testId}><Coin /><b>{gold}</b><span className="td-sr"> gold</span></span>;
}

/** Quest titles with this match's ordered towers filled in. */
function questTitle(s: TdState, q: QuestId) {
  if (q === 'order1') return `Own 3 × ${TOWERS[s.orders.t1].name} (tier 1)`;
  if (q === 'order2') return `Own 3 × ${TOWERS[s.orders.t2].name} (tier 2)`;
  if (q === 'order3') return `Own 3 × ${TOWERS[s.orders.t3].name} (tier 3)`;
  return QUESTS[q].title;
}
/** A tier tile: "T2" on the tier's colour, with dots for "one of each family" quests. */
function TierTile({ tier, label, dots }: { tier: number; label?: string; dots?: boolean }) {
  return <svg className="td-tier-tile" width="40" height="40" viewBox="0 0 40 40" aria-hidden>
    <rect x="2" y="2" width="36" height="36" rx="8" fill={TIER_COLOURS[tier - 1]} stroke={PALETTE.inkPurple} strokeWidth="2.5" />
    <text x="20" y={dots ? 21 : 26} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="600" fontSize="15" fill={PALETTE.ink}>{label ?? `T${tier}`}</text>
    {dots && FAMILIES.map((f, i) => <circle key={f} cx={9 + i * 5.5} cy="31" r="2.3" fill={PALETTE.white} stroke={PALETTE.ink} strokeWidth="1" />)}
  </svg>;
}
/** The quest's picture: the ordered tower itself, or a tier tile for "any tower of tier N" quests. */
function QuestArt({ s, q }: { s: TdState; q: QuestId }) {
  const order = q === 'order1' ? s.orders.t1 : q === 'order2' ? s.orders.t2 : q === 'order3' ? s.orders.t3 : null;
  if (order) { const d = TOWERS[order]; return <span className="td-quest-art" style={tierStyle(d.tier)} data-testid={`td-quest-art-${q}`} data-model={d.model}><Portrait model={d.model} /></span>; }
  return <span className="td-quest-art" data-testid={`td-quest-art-${q}`}>{
    q === 'collect5' ? <TierTile tier={1} label="T1" dots /> : q === 'triple2' ? <TierTile tier={2} label="3×T2" /> : q === 'album' ? <TierTile tier={3} label="T3+" dots />
      : q === 'first6' ? <TierTile tier={6} label="1st" /> : <svg className="td-tier-tile" width="40" height="40" viewBox="0 0 40 40" aria-hidden><rect x="2" y="2" width="36" height="36" rx="8" fill={PALETTE.sage} stroke={PALETTE.inkPurple} strokeWidth="2.5" /><path d="M20 31 9.5 21a6 6 0 0 1 10.5-7.2A6 6 0 0 1 30.5 21Z" fill={PALETTE.coral} stroke={PALETTE.ink} strokeWidth="1.8" /></svg>
  }</span>;
}

/**
 * Float `ref` beside `cell`'s square on screen, inside the board's own space (`.td-board-slot`: the
 * safe area less the bar, the quest column, the player rail and the dock, so those stay reachable),
 * never over the square if there is room. Runs after every render (the HUD re-renders ten times a
 * second), so it follows the board when it is panned or zoomed. Absolutely positioned: nothing moves.
 */
function useFloatAt(ref: RefObject<HTMLElement | null>, cell: number | null) {
  useLayoutEffect(() => {
    const el = ref.current, hud = el?.closest('.td-hud'), slot = hud?.querySelector('.td-board-slot');
    const anchor = cell === null ? null : tumbleScreen.cellRect?.(cell);
    if (!el || !hud || !slot || !anchor) return;
    const h = hud.getBoundingClientRect(), b = slot.getBoundingClientRect();
    el.style.maxWidth = `${Math.floor(b.width)}px`; el.style.maxHeight = `${Math.floor(b.height)}px`;
    const at = placePopover(anchor, el.offsetWidth, el.offsetHeight, { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, 10);
    el.style.left = `${at.left - h.left}px`; el.style.top = `${at.top - h.top}px`; el.dataset.side = at.side;
  });
}

function TowerFacts({ p, cell }: { p: TdPlayer; cell: number }) {
  const t = towerAt(p, cell)!, d = TOWERS[t.def], f = FAMILY[d.family];
  const dmg = Math.round(d.damage * (1 + t.auraDamage) * 10) / 10;
  return <>
    <header className="td-sheet__head">
      <Portrait model={d.model} />
      <span className="td-sheet__title"><strong data-testid="td-sheet-name">{d.name}</strong>
        <small><b className="td-tier" data-testid="td-sheet-tier">Tier {d.tier}</b> {f.name} · {f.role}</small></span>
    </header>
    <p className="td-sheet__stats">Hit {dmg}{t.auraDamage ? ` (+${Math.round(t.auraDamage * 100)}% aura)` : ''} every {(d.cooldownMs / 1000 / (1 + t.auraSpeed)).toFixed(2)} s · reach {d.range} squares
      {d.splash ? ` · splash ${d.splash}` : ''}{d.chain ? ` · jumps to ${d.chain} more` : ''}{d.slow ? ` · slows ${Math.round(d.slow * 100)}%` : ''}
      {d.aura ? ` · aura: towers within ${d.aura} squares hit ${Math.round(d.auraDamage * 100)}% harder and ${Math.round(d.auraSpeed * 100)}% faster` : ''}</p>
    {d.abilities.length > 0 && <ul className="td-abilities">{d.abilities.map((a) => <li key={a}><b>{ABILITY_NAME[a]}:</b> {ABILITY_TEXT[a]}</li>)}</ul>}
    <small className="td-sheet__dealt">Dealt {fmt(t.dealt)} damage · square {cellName(cell)}</small>
  </>;
}

/**
 * The selected square's sheet, floating beside it. On your own board it carries the actions; on a
 * board you are only looking at (`owner` names whose) it is read-only: the facts and Close.
 * `pair` (touch) is the tower selected before this one: its Merge button comes first.
 */
function TowerSheet({ p, cell, send, owner, pair }: { p: TdPlayer; cell: number; send: (i: Parameters<typeof submitTumbleInput>[0]) => void; owner?: string; pair: number | null }) {
  const ref = useRef<HTMLElement>(null);
  useFloatAt(ref, cell);
  const t = towerAt(p, cell), close = () => useTumbleUI.setState({ selected: null, pair: null });
  if (!t) {
    return <section ref={ref} className="td-sheet" data-testid="td-sheet" aria-label={`Empty square ${cellName(cell)}`}>
      <header className="td-sheet__head"><strong>Empty square {cellName(cell)}</strong></header>
      <p className="td-sheet__lead">Build places a random tower here (usually tier 1: see the builder odds).</p>
      <div className="td-sheet__actions">
        <button className="td-primary" data-testid="td-build-here" disabled={p.gold < BUILD_COST} onClick={() => send({ type: 'build', cell })}>Build here <Cost gold={BUILD_COST} /></button>
        <button data-testid="td-sheet-close" onClick={close}>Close</button>
      </div>
    </section>;
  }
  const d = TOWERS[t.def], twins = twinsOf(p, t).sort((a, b) => Number(b.cell === pair) - Number(a.cell === pair));
  return <section ref={ref} className={`td-sheet${owner ? ' is-readonly' : ''}`} data-testid="td-sheet" data-readonly={owner ? true : undefined} style={tierStyle(d.tier)} aria-label={`${d.name}, tier ${d.tier}${owner ? `, on ${owner} board` : ''}`}>
    {owner && <small className="td-sheet__owner" data-testid="td-sheet-owner">{owner} board · read-only</small>}
    <TowerFacts p={p} cell={cell} />
    <div className="td-sheet__actions">
      {owner ? null : d.tier >= MAX_TIER ? <span className="td-note">Tier 7: the top.</span>
        : twins.length === 0 ? <span className="td-note">No partner yet: any other tier {d.tier} tower can merge.</span>
          : twins.slice(0, 3).map((o) => <button key={o.id} className={`td-primary${o.cell === pair ? ' is-pair' : ''}`} data-testid={`td-merge-${o.cell}`} onClick={() => { send({ type: 'merge', from: o.cell, to: cell }); useTumbleUI.setState({ pair: null }); }}>
            Merge tier {d.tier} {o.cell === pair ? 'with' : 'at'} {cellName(o.cell)}<small>→ random tier {d.tier + 1} · shortcut M</small></button>)}
      {!owner && <button className="td-sell" data-testid="td-sell" onClick={() => { send({ type: 'sell', cell }); close(); }}>Sell +<Cost gold={sellValue(d.tier)} /></button>}
      <button data-testid="td-sheet-close" onClick={close}>Close</button>
    </div>
  </section>;
}

/** A mouse resting on a tower: its facts, floating beside it (no buttons; click for the sheet). */
function TowerTip({ p, cell }: { p: TdPlayer; cell: number }) {
  const ref = useRef<HTMLElement>(null);
  useFloatAt(ref, cell);
  const d = TOWERS[towerAt(p, cell)!.def];
  return <aside ref={ref} className="td-sheet td-tip" data-testid="td-tip" style={tierStyle(d.tier)} aria-hidden><TowerFacts p={p} cell={cell} /></aside>;
}

/**
 * Everything on one board, read-only: gold, lives, builder and odds, towers by tier, the tower
 * families (the game's traits), gifts waiting and the quests. Opened from the dock.
 */
function BoardPanel({ s, p, who, onClose }: { s: TdState; p: TdPlayer; who: string; onClose: () => void }) {
  const sum = boardSummary(p), odds = BUILDER[p.builder - 1];
  const done = QUEST_ORDER.filter((q) => p.quests[q]).length;
  return <aside className="td-panel td-odds td-board-panel" data-testid="td-board-panel" aria-label={`${who}: board details`}>
    <header className="td-panel__head"><strong>{who}</strong><button data-testid="td-board-close" onClick={onClose}>Close</button></header>
    <dl className="td-board-stats" data-testid="td-board-stats">
      <div><dt>Gold</dt><dd><Coin /> <span data-testid="td-board-gold">{p.gold}</span></dd></div>
      <div><dt>Lives</dt><dd><Heart /> {Math.max(0, p.lives)}</dd></div>
      <div><dt>Score</dt><dd>{boardScore(p)}</dd></div>
      <div><dt>Waves</dt><dd>{p.out ? `out on ${p.outWave}` : p.cleared}</dd></div>
      <div><dt>Best tier</dt><dd>{p.maxTier || '–'}</dd></div>
      <div><dt>Merges</dt><dd>{p.merges}{p.luckyMerges ? ` (${p.luckyMerges} lucky)` : ''}</dd></div>
    </dl>
    <p className="td-board-builder" data-testid="td-board-builder"><b>Builder {p.builder}/{MAX_BUILDER}</b> · builds {odds.build.map((n, i) => (n ? `T${i + 1} ${n}%` : '')).filter(Boolean).join(' ')} · lucky merge {odds.lucky}%</p>
    <h3>Families <small>(towers · best tier)</small></h3>
    <ul className="td-board-families" data-testid="td-board-families">{sum.families.map((f) => <li key={f.family} data-family={f.family} data-count={f.count} className={f.count ? undefined : 'is-none'} style={f.best ? tierStyle(f.best) : undefined}>
      <b>{FAMILY[f.family].name}</b><small>{FAMILY[f.family].role}</small><span>{f.count} · {f.best ? `T${f.best}` : '–'}</span></li>)}</ul>
    <h3>Towers <small>({sum.towers} on the board{p.gifts.length ? `, ${p.gifts.length} free waiting for a square` : ''})</small></h3>
    {sum.tiers.length === 0 ? <p className="td-note">No towers yet.</p> : <ol className="td-board-towers" data-testid="td-board-towers">{sum.tiers.map((g) => <li key={g.tier} style={tierStyle(g.tier)}>
      <b className="td-tier">T{g.tier}</b><span>{g.towers.map((t) => <span key={t.def} className="td-board-tower" data-def={t.def}><Portrait model={TOWERS[t.def].model} />{TOWERS[t.def].name}{t.count > 1 ? ` ×${t.count}` : ''}</span>)}</span></li>)}</ol>}
    <h3>Quests <small>({done}/{QUEST_ORDER.length} done)</small></h3>
    <div data-testid="td-board-quests"><QuestList s={s} me={p} /></div>
  </aside>;
}

function OddsPanel({ me, who, onClose }: { me: TdPlayer; who?: string; onClose: () => void }) {
  return <aside className="td-panel td-odds" data-testid="td-odds" aria-label="Builder odds">
    <header className="td-panel__head"><strong>Builder odds{who ? ` · ${who}` : ''}</strong><button data-testid="td-odds-close" onClick={onClose}>Close</button></header>
    <p>Build places a random tower of the tier rolled below. A lucky merge jumps two tiers instead of one (never past tier 5). {who ? `${who}'s level (${me.builder}) is highlighted.` : 'Your level is highlighted.'}</p>
    <table><thead><tr><th>Level</th><th>Cost</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th><th>Lucky</th></tr></thead>
      <tbody>{BUILDER.map((l) => <tr key={l.level} className={l.level === me.builder ? 'is-current' : undefined} data-testid={`td-odds-${l.level}`}>
        <td>{l.level}</td><td>{l.cost || '–'}</td><td>{l.build[0]}%</td><td>{l.build[1]}%</td><td>{l.build[2]}%</td><td>{l.lucky}%</td></tr>)}</tbody></table>
    <p className="td-odds__key"><b>Badges over enemies:</b></p>
    <StatusLegend kinds={TUMBLE_STATUSES} />
  </aside>;
}

function QuestList({ s, me }: { s: TdState; me: TdPlayer }) {
  const progress = questProgress(s, me);
  return <ol className="td-quests" data-testid="td-quests">{QUEST_ORDER.map((q) => {
    const [have, need] = progress[q], done = me.quests[q], taken = q === 'first6' && !done && s.firstSix.length > 0;
    return <li key={q} data-testid={`td-quest-${q}`} data-done={done || undefined} className={done ? 'is-done' : taken ? 'is-taken' : undefined}>
      <QuestArt s={s} q={q} />
      <span className="td-quests__text">{questTitle(s, q)}<small>{taken ? 'Already claimed this match' : questReward(QUESTS[q])}</small></span>
      <span className="td-quests__mark">{done ? <Tick /> : <b>{Math.min(have, need)}/{need}</b>}</span>
    </li>; })}</ol>;
}

/** The rail's rows: standings normally; during the damage check, a damage leaderboard. */
function railEntries(s: TdState, name: (id: string) => string): RailEntry[] {
  const check = inCheck(s);
  const rows = s.players.slice().sort(check
    ? (a, b) => Number(a.out) - Number(b.out) || b.checkDamage - a.checkDamage
    : (a, b) => Number(a.out) - Number(b.out) || b.cleared - a.cleared || b.lives - a.lives || boardScore(b) - boardScore(a));
  return rows.map((p) => ({
    id: p.id, name: name(p.id), out: p.out, accent: TIER_COLOURS[Math.max(1, p.maxTier) - 1],
    stat: check && !p.out ? fmt(p.checkDamage) : p.out ? '–' : String(Math.max(0, p.lives)),
    statLabel: check && !p.out ? 'damage' : p.out ? 'out' : 'lives',
    detail: p.out ? `Out on wave ${p.outWave}` : `Best tier ${p.maxTier || '–'} · ${boardScore(p)} pts${s.firstSix.includes(p.id) ? ' · first tier 6' : ''}`,
    busy: stillGoing(s, p), busyLabel: check ? 'damage check still crossing' : `still fighting wave ${s.wave}`,
  }));
}

export function TumbleHud({ getState, localId, contestants }: MinigameSceneProps<TdState>) {
  const [, refresh] = useState(0);
  const ui = useTumbleUI();
  const paused = useMatch((m) => m.paused), hostPhase = useMatch((m) => m.phase);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastKey = useRef(0);
  // Damage per second on the damage check, from the viewed board's total (sampled by the HUD timer).
  const rate = useRef<{ board: string; samples: [number, number][] }>({ board: '', samples: [] });
  const name = (id: string) => contestants.find((c) => c.id === id)?.name || 'Player';
  useEffect(() => {
    resetTumbleUI();
    const timer = window.setInterval(() => { refresh((n) => n + 1); setToasts((list) => (list.some((t) => t.until < performance.now()) ? list.filter((t) => t.until >= performance.now()) : list)); }, 100);
    return () => { window.clearInterval(timer); clearTumbleInput(); resetTumbleUI(); };
  }, []);
  useEffect(() => { if (paused) clearTumbleInput(); }, [paused]);
  // Notices from the rules: your quests, merges and free towers, round rewards, boss waves, the lobby's first tier 6.
  useEffect(() => matchBus.on('event', (e) => {
    const s = getState(); if (s?.kind !== 'tower-tumble') return;
    const id = (e as { id?: string }).id, mine = id === localId, def = TOWERS[(e as { def?: string }).def ?? ''];
    const push = (text: string, tone: Toast['tone'] = 'info', ms = 3200) => setToasts((list) => [...list.slice(-3), { key: ++toastKey.current, text, tone, until: performance.now() + ms }]);
    if (e.type === 'td-quest') {
      const q = e.quest as QuestId;
      if (mine) push(`Quest done: ${questTitle(s, q)} · +${questReward(QUESTS[q])}`, 'good', 4200);
      else if (q === 'first6') push(`${name(id!)} built the lobby's first tier-6 tower`, 'info', 4200);
    } else if (e.type === 'td-merge' && mine && def) {
      push(`${(e as { lucky?: boolean }).lucky ? 'Lucky merge! ' : 'Merged: '}${def.name} · tier ${def.tier}`, (e as { lucky?: boolean }).lucky ? 'good' : 'info');
      const cell = e.cell as number;
      useTumbleUI.setState({ selected: cell, cursor: cell });
    }
    else if (e.type === 'td-gift' && mine && def) push(`Free tower: ${def.name} · tier ${def.tier}`, 'good', 4200);
    else if (e.type === 'td-build' && mine && def) {
      push(`Built: ${def.name} · tier ${def.tier}`, def.tier > 1 ? 'good' : 'info', 2200);
      const cell = e.cell as number, sel = useTumbleUI.getState().selected;
      if (sel === null || sel === cell) useTumbleUI.setState({ selected: cell, cursor: cell });
    } else if (e.type === 'td-board-clear' && mine) push(`Wave ${e.wave as number} cleared: +${e.gold as number} gold`, 'good', 2600);
    else if (e.type === 'td-wave' && (e as { check?: boolean }).check) push(`Damage check! ${DAMAGE_CHECK.name} costs no lives: hit it as hard as you can`, 'boss', 4200);
    else if (e.type === 'td-wave' && (e as { boss?: boolean }).boss) push(`Boss wave! ${BOSSES[e.wave as number]?.name ?? 'Boss'} is coming`, 'boss', 3600);
    else if (e.type === 'td-cleared' && (e.wave as number) === s.config.waves && s.config.damageCheck) push(`All ${s.config.waves} waves done! ${Math.round(s.config.checkPrepMs / 1000)} s to get ready for the damage check`, 'good', 5000);
    else if (e.type === 'td-check-done' && mine) push(`Damage check: ${fmt(e.damage as number)} damage`, 'good', 5000);
    else if (e.type === 'td-boss-down' && mine) push('Boss toppled!', 'good');
    else if (e.type === 'td-out' && mine) { push(`Knocked out on wave ${e.wave as number}`, 'bad', 4000); useTumbleUI.setState({ selected: null, panel: null, offer: 'open' }); }
    else if (e.type === 'td-builder' && mine) push(`Builder level ${e.level as number}: better odds`, 'good');
  }), [getState, localId]);

  const s = getState(), me = s?.kind === 'tower-tumble' ? s.players.find((p) => p.id === localId) : undefined;
  const panelOpen = ui.panel !== null || ui.selected !== null;
  // Escape closes the top panel or sheet instead of pausing (the overlay's listener pauses first; undo it).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation(); e.preventDefault(); pauseMatch(false);
      if (useTumbleUI.getState().panel) useTumbleUI.setState({ panel: null }); else useTumbleUI.setState({ selected: null });
    };
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true);
  }, [panelOpen]);
  if (s?.kind !== 'tower-tumble' || !me) return null;

  const watchingId = viewedBoard(s, localId, ui.watching), board = s.players.find((p) => p.id === watchingId) ?? me;
  const viewing = board !== me;
  // An online spectator follows a seat: its board, read-only (the host never sends a spectator's input).
  const spectator = !contestants.find((c) => c.id === localId)?.isLocal;
  const readOnly = viewing || spectator, who = name(board.id);
  const canAct = !readOnly && !me.out && s.phase !== 'over' && !paused && hostPhase === 'playing';
  const send = (input: Parameters<typeof submitTumbleInput>[0]) => { if (canAct || input.type === 'speed') { unlockAudio(); submitTumbleInput(input); } };
  const setPanel = (panel: TdPanel) => useTumbleUI.setState({ panel: ui.panel === panel ? null : panel });
  const view = (id: string) => useTumbleUI.setState({ watching: id === localId ? null : id, selected: null, pair: null, hover: null, panel: ui.panel === 'quests' ? null : ui.panel });
  const seconds = Math.max(0, Math.ceil((s.phaseEnds - s.t) / 1000));
  const check = inCheck(s);
  const left = s.phase === 'wave' ? board.enemies.length + Math.max(0, s.spawns.length - board.spawnIdx) : 0;
  const cost = builderCost(me), boss = !check && isBossWave(s.wave) ? BOSSES[s.wave] : null;
  const waveKinds = check ? DAMAGE_CHECK.name : [...new Set(WAVES[Math.min(s.wave, WAVES.length) - 1].map((g) => (g.kind === 'boss' ? boss?.name ?? 'Boss' : ENEMIES[g.kind].name)))].join(', ');
  const questsDone = QUEST_ORDER.filter((q) => board.quests[q]).length;
  const flash = s.t - board.lastLeakAt < 700;
  // Your own board: a tower or an empty felt square (the action sheet). A board you only look at: a tower (read-only).
  const looking = readOnly || me.out;
  const selected = ui.selected === null ? null : looking ? (towerAt(board, ui.selected) ? ui.selected : null)
    : towerAt(me, ui.selected) || (isBuildable(ui.selected) && !isPath(ui.selected)) ? ui.selected : null;
  const touch = useGame.getState().touchUI;
  const hover = !touch && ui.hover !== null && ui.hover !== selected && ui.dragging === null && towerAt(board, ui.hover) ? ui.hover : null;
  const showQuests = !me.out || viewing;
  // Damage per second on the viewed board over the last second or so.
  const r = rate.current;
  if (r.board !== board.id) { r.board = board.id; r.samples = []; }
  if (check && s.phase === 'wave') { if (!r.samples.length || s.t > r.samples[r.samples.length - 1][0]) r.samples.push([s.t, board.checkDamage]); while (r.samples.length > 2 && s.t - r.samples[0][0] > 1500) r.samples.shift(); }
  const dps = r.samples.length > 1 ? (r.samples[r.samples.length - 1][1] - r.samples[0][1]) / Math.max(0.1, (r.samples[r.samples.length - 1][0] - r.samples[0][0]) / 1000) : 0;
  const phaseText = s.phase === 'over' ? 'Finished'
    : check ? (s.phase === 'build' ? `Damage check in ${seconds} s` : board.waveDone ? 'Damage check done' : 'Damage check')
      : s.phase === 'build' ? `Next wave in ${seconds} s` : board.waveDone ? 'Cleared! Waiting for the others' : `${left} left`;
  const offer = me.out && ui.offer !== 'closed' && s.phase !== 'over';
  const others = watchable(s).filter((id) => id !== localId);

  return <div className={`td-hud${me.out ? ' is-out' : ''}${showQuests ? '' : ' no-quests'}${readOnly ? ' is-viewing' : ''}`} data-testid="td-hud" data-viewing={readOnly ? board.id : undefined}>
    <div className="td-board-slot" aria-hidden />
    <header className={`td-bar${flash ? ' is-hit' : ''}${check ? ' is-check' : ''}`} data-testid="td-bar">
      <span className="td-bar__wave" data-testid="td-wave"><b>{check ? 'Bonus' : `Wave ${Math.min(s.wave, s.config.waves)}/${s.config.waves}`}</b>{boss && <i className="td-boss-tag">Boss</i>}</span>
      <span className="td-bar__phase" data-testid="td-phase">{phaseText}<small>{s.phase === 'build' ? waveKinds : ''}</small></span>
      {check && s.phase !== 'build' ? <span className="td-bar__stat td-bar__check" data-testid="td-check-damage" title="Damage dealt to the damage check">
        <b>{fmt(board.checkDamage)}</b> damage<small>{board.waveDone ? 'final' : `${fmt(dps)}/s`}</small></span> : <>
        <span className="td-bar__stat" data-testid="td-gold" title="Gold"><Coin /><b>{board.gold}</b><span className="td-sr"> gold</span></span>
        <span className="td-bar__stat" data-testid="td-lives" title="Lives"><Heart /><b>{Math.max(0, board.lives)}</b><span className="td-sr"> lives</span></span>
        <span className="td-bar__stat td-bar__score" title="Score"><b>{boardScore(board)}</b> pts</span></>}
    </header>

    {showQuests && <aside className={`td-side td-side--quests${ui.panel === 'quests' ? ' is-open' : ''}`} aria-label={readOnly ? `${who}'s quests` : 'Quests'} data-testid="td-quest-column" data-owner={board.id}>
      <header className="td-panel__head"><strong>Quests {questsDone}/{QUEST_ORDER.length}{readOnly && <small className="td-side__owner"> · {who}</small>}</strong>
        {ui.panel === 'quests' && <button className="td-quests-close" data-testid="td-quests-close" onClick={() => setPanel(null)}>Close</button>}</header>
      <QuestList s={s} me={board} />
      {/* Phones: the column is a strip of quest pictures; tapping it opens the full list. */}
      <button className="td-quests-open" data-testid="td-quests-open" aria-label={`Quests ${questsDone} of ${QUEST_ORDER.length} done. Show the list`} aria-pressed={ui.panel === 'quests'} onClick={() => setPanel('quests')} />
      <div className="td-quests-key"><StatusLegend kinds={TUMBLE_STATUSES} /></div>
    </aside>}
    <PlayerRail className="td-rail" title={check ? 'Damage' : 'Players'} label={check ? 'Damage check leaderboard' : 'Players: view a board'}
      entries={railEntries(s, name)} localId={localId} viewing={board.id} onView={view} ranked={check} />

    {viewing && <WatchBanner className="td-watch" name={name(board.id)} onBack={() => view(localId)}>
      {me.out && others.length > 1 && <>
        <button data-testid="td-watch-prev" aria-label="Previous board" onClick={() => view(cycleWatch(s, board.id, -1))}>‹</button>
        <button data-testid="td-watch-next" aria-label="Next board" onClick={() => view(cycleWatch(s, board.id, 1))}>›</button></>}
    </WatchBanner>}
    {tumbleView.changed && <button className="td-view-reset" data-testid="td-view-reset" onClick={() => tumbleView.reset()}>Reset view</button>}

    {me.out ? <section className="td-spectate" data-testid="td-spectate" aria-label="Knocked out">
      <strong>Knocked out on wave {me.outWave}{viewing ? '' : '. Tap a player to watch their board.'}</strong>
      <div className="td-spectate__row">
        {!viewing && others.length > 0 && <button data-testid="td-watch-others" onClick={() => view(others[0])}>Watch other players</button>}
        <button data-testid="td-view-board" aria-pressed={ui.panel === 'board'} onClick={() => setPanel('board')}>Board<small>{board.towers.length} towers</small></button>
        {allHumansOut(s) && SPEEDS.map((k) => <button key={k} data-testid={`td-speed-${k}`} aria-pressed={s.speed === k} onClick={() => send({ type: 'speed', speed: k })}>×{k}</button>)}
      </div>
    </section> : readOnly ? <section className="td-dock td-dock--view" data-testid="td-dock" aria-label={`${who}'s board, read-only`}>
      {/* Looking, not touching: the same dock, showing that board's builder, odds and progress. */}
      <div className="td-dock__row">
        <button className="td-primary" data-testid="td-view-board" aria-pressed={ui.panel === 'board'} onClick={() => setPanel('board')}>Board<small>{board.towers.length} towers · best T{board.maxTier || '–'}</small></button>
        <span className="td-dock__info" data-testid="td-view-builder">Builder {board.builder}/{MAX_BUILDER}<small>{board.gifts.length ? `${board.gifts.length} free waiting` : `${board.merges} merges`}</small></span>
        <button data-testid="td-odds-open" aria-pressed={ui.panel === 'odds'} onClick={() => setPanel('odds')}>Odds<small>Lv {board.builder}: {BUILDER[board.builder - 1].build.filter(Boolean).map((n, i) => `T${i + 1} ${n}%`).join(' ')}</small></button>
        <span className="td-dock__info" data-testid="td-view-status">{board.out ? 'Out' : s.phase === 'build' ? (board.ready ? 'Ready' : 'Building') : board.waveDone ? 'Cleared' : 'Fighting'}<small>{board.out ? `on wave ${board.outWave}` : `${board.cleared} waves cleared`}</small></span>
      </div>
    </section> : <section className="td-dock" data-testid="td-dock" aria-label="Build controls">
      <div className="td-dock__row">
        <button className="td-primary td-build" data-testid="td-build" disabled={!canAct || !canBuild(s, me)} onClick={() => buildHere(me)}>
          <span>Build <kbd>B</kbd></span><Cost gold={BUILD_COST} testId="td-build-cost" /></button>
        <button data-testid="td-builder" disabled={!canAct || cost === null || me.gold < cost} onClick={() => send({ type: 'builder' })}>
          <span>Builder {me.builder}{cost !== null ? `→${me.builder + 1}` : "/6"} <kbd>U</kbd></span>{cost !== null ? <Cost gold={cost} testId="td-builder-cost" /> : <small>Top level</small>}</button>
        <button data-testid="td-odds-open" aria-pressed={ui.panel === 'odds'} onClick={() => setPanel('odds')}>Odds<small>Lv {me.builder}/{MAX_BUILDER}: {BUILDER[me.builder - 1].build.filter(Boolean).map((n, i) => `T${i + 1} ${n}%`).join(' ')}</small></button>
        <button className="td-next" data-testid="td-next" disabled={!canAct || s.phase !== 'build' || me.ready} onClick={() => send({ type: 'ready' })}>
          {me.ready ? 'Waiting…' : <span>Next wave <kbd>N</kbd></span>}<small>{s.phase === 'build' ? `or in ${seconds} s` : me.waveDone ? 'Others still going' : 'Wave running'}</small></button>
      </div>
    </section>}

    {selected !== null && <TowerSheet p={looking ? board : me} cell={selected} send={send} owner={looking ? (board === me && !spectator ? 'Your' : `${who}'s`) : undefined} pair={looking ? null : ui.pair} />}
    {hover !== null && <TowerTip p={board} cell={hover} />}
    {ui.panel === 'odds' && <OddsPanel me={readOnly ? board : me} who={readOnly ? who : undefined} onClose={() => setPanel(null)} />}
    {ui.panel === 'board' && <BoardPanel s={s} p={board} who={readOnly ? `${who}'s board` : 'Your board'} onClose={() => setPanel(null)} />}
    {offer && <SpectateOffer title={`Knocked out on wave ${me.outWave}`} body={others.length ? 'Your towers stay on your board. Watch the others play on, or stay here.' : 'Nobody else is still in.'}
      onWatch={() => { useTumbleUI.setState({ offer: 'closed' }); if (others.length) view(others[0]); }} onDismiss={() => useTumbleUI.setState({ offer: 'closed' })} />}
    <ol className="td-toasts" aria-live="polite">{toasts.map((t) => <li key={t.key} className={`td-toast td-toast--${t.tone}`}>{t.text}</li>)}</ol>
  </div>;
}
