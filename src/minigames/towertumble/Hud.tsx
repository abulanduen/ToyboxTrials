/**
 * Toy Tower Tumble HUD (DOM). Re-renders ten times a second from the live rules state, never per
 * frame. Every committing action is a ≥ 56 px button: the board squares (about 44 px on a 390 px
 * phone) only select, and the sheet that opens for the selected square carries Build, Merge, Sell
 * and Close. Dragging a tower onto its twin on the board merges too.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { matchBus, pauseMatch, useMatch } from '../session';
import { unlockAudio } from '../../game/audio';
import type { MinigameSceneProps } from '../types';
import { subscribePortraits, toyPortrait, portraitCount } from '../toysquad/portraits';
import { cellName, isBuildable, isPath } from './board';
import {
  ABILITY_NAME, ABILITY_TEXT, BOSSES, BUILD_COST, BUILDER, ENEMIES, FAMILY, MAX_BUILDER, MAX_TIER, QUESTS, QUEST_ORDER, TIER_COLOURS, TOWERS, WAVES,
  isBossWave, questReward, sellValue, type QuestId,
} from './catalogue';
import {
  SPEEDS, allHumansOut, boardScore, builderCost, canBuild, cycleWatch, questProgress, towerAt, twinsOf, viewedBoard, type TdPlayer, type TdState,
} from './rules';
import { buildHere, clearTumbleInput, resetTumbleUI, submitTumbleInput, useTumbleUI, type TdPanel } from './local';
import './towertumble.css';

const tierStyle = (tier: number) => ({ '--tier': TIER_COLOURS[tier - 1] }) as CSSProperties;
interface Toast { key: number; text: string; tone: 'good' | 'bad' | 'boss' | 'info'; until: number }

function Portrait({ model }: { model: string }) {
  useSyncExternalStore(subscribePortraits, portraitCount);
  const src = toyPortrait(model);
  return <span className="td-portrait">{src && <img src={src} alt="" draggable={false} />}</span>;
}
function Coin() { return <svg className="td-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="7" fill="#EFAE45" stroke="#574D69" strokeWidth="1.5" /><circle cx="8" cy="8" r="3.5" fill="none" stroke="#574D69" strokeWidth="1.2" /></svg>; }
function Heart() { return <svg className="td-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 14 2 8.3A3.4 3.4 0 0 1 8 4a3.4 3.4 0 0 1 6 4.3Z" fill="#E76B62" stroke="#574D69" strokeWidth="1.3" /></svg>; }
function Tick() { return <svg className="td-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="m3 8.5 3.2 3L13 4.5" fill="none" stroke="#2B2433" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

/** Quest titles with this match's ordered towers filled in. */
function questTitle(s: TdState, q: QuestId) {
  if (q === 'order1') return `Own 3 × ${TOWERS[s.orders.t1].name} (tier 1)`;
  if (q === 'order2') return `Own 3 × ${TOWERS[s.orders.t2].name} (tier 2)`;
  if (q === 'order3') return `Own 3 × ${TOWERS[s.orders.t3].name} (tier 3)`;
  return QUESTS[q].title;
}

function TowerSheet({ me, cell, send }: { me: TdPlayer; cell: number; send: (i: Parameters<typeof submitTumbleInput>[0]) => void }) {
  const t = towerAt(me, cell), close = () => useTumbleUI.setState({ selected: null });
  if (!t) {
    return <section className="td-sheet" data-testid="td-sheet" aria-label={`Empty square ${cellName(cell)}`}>
      <header className="td-sheet__head"><strong>Empty square {cellName(cell)}</strong></header>
      <p className="td-sheet__lead">Build places a random tower here (usually tier 1: see the builder odds).</p>
      <div className="td-sheet__actions">
        <button className="td-primary" data-testid="td-build-here" disabled={me.gold < BUILD_COST} onClick={() => send({ type: 'build', cell })}>Build here · {BUILD_COST}<span className="td-sr"> gold</span><Coin /></button>
        <button data-testid="td-sheet-close" onClick={close}>Close</button>
      </div>
    </section>;
  }
  const d = TOWERS[t.def], f = FAMILY[d.family], twins = twinsOf(me, t);
  const dmg = Math.round(d.damage * (1 + t.auraDamage) * 10) / 10;
  return <section className="td-sheet" data-testid="td-sheet" style={tierStyle(d.tier)} aria-label={`${d.name}, tier ${d.tier}`}>
    <header className="td-sheet__head">
      <Portrait model={d.model} />
      <span className="td-sheet__title"><strong data-testid="td-sheet-name">{d.name}</strong>
        <small><b className="td-tier" data-testid="td-sheet-tier">Tier {d.tier}</b> {f.name} · {f.role}</small></span>
    </header>
    <p className="td-sheet__stats">Hit {dmg}{t.auraDamage ? ` (+${Math.round(t.auraDamage * 100)}% aura)` : ''} every {(d.cooldownMs / 1000 / (1 + t.auraSpeed)).toFixed(2)} s · reach {d.range} squares
      {d.splash ? ` · splash ${d.splash}` : ''}{d.chain ? ` · jumps to ${d.chain} more` : ''}{d.slow ? ` · slows ${Math.round(d.slow * 100)}%` : ''}
      {d.aura ? ` · aura: towers within ${d.aura} squares hit ${Math.round(d.auraDamage * 100)}% harder and ${Math.round(d.auraSpeed * 100)}% faster` : ''}</p>
    {d.abilities.length > 0 && <ul className="td-abilities">{d.abilities.map((a) => <li key={a}><b>{ABILITY_NAME[a]}:</b> {ABILITY_TEXT[a]}</li>)}</ul>}
    <small className="td-sheet__dealt">Dealt {Math.round(t.dealt)} damage · square {cellName(cell)}</small>
    <div className="td-sheet__actions">
      {d.tier >= MAX_TIER ? <span className="td-note">Tier 7: the top.</span>
        : twins.length === 0 ? <span className="td-note">No twin yet: build or merge another {d.name} to merge.</span>
          : twins.slice(0, 3).map((o) => <button key={o.id} className="td-primary" data-testid={`td-merge-${o.cell}`} onClick={() => send({ type: 'merge', from: o.cell, to: cell })}>
            Merge with twin {cellName(o.cell)}<small>→ random tier {d.tier + 1}</small></button>)}
      <button className="td-sell" data-testid="td-sell" onClick={() => { send({ type: 'sell', cell }); close(); }}>Sell +{sellValue(d.tier)}<span className="td-sr"> gold</span><Coin /></button>
      <button data-testid="td-sheet-close" onClick={close}>Close</button>
    </div>
  </section>;
}

function OddsPanel({ me, onClose }: { me: TdPlayer; onClose: () => void }) {
  return <aside className="td-panel td-odds" data-testid="td-odds" aria-label="Builder odds">
    <header className="td-panel__head"><strong>Builder odds</strong><button data-testid="td-odds-close" onClick={onClose}>Close</button></header>
    <p>Build places a random tower of the tier rolled below. A lucky merge jumps two tiers instead of one (never past tier 5). Your level is highlighted.</p>
    <table><thead><tr><th>Level</th><th>Cost</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th><th>Lucky</th></tr></thead>
      <tbody>{BUILDER.map((l) => <tr key={l.level} className={l.level === me.builder ? 'is-current' : undefined} data-testid={`td-odds-${l.level}`}>
        <td>{l.level}</td><td>{l.cost || '–'}</td><td>{l.build[0]}%</td><td>{l.build[1]}%</td><td>{l.build[2]}%</td><td>{l.lucky}%</td></tr>)}</tbody></table>
  </aside>;
}

function QuestList({ s, me }: { s: TdState; me: TdPlayer }) {
  const progress = questProgress(s, me);
  return <ol className="td-quests" data-testid="td-quests">{QUEST_ORDER.map((q) => {
    const [have, need] = progress[q], done = me.quests[q], taken = q === 'first6' && !done && s.firstSix.length > 0;
    return <li key={q} data-testid={`td-quest-${q}`} data-done={done || undefined} className={done ? 'is-done' : taken ? 'is-taken' : undefined}>
      <span className="td-quests__mark">{done ? <Tick /> : <b>{Math.min(have, need)}/{need}</b>}</span>
      <span className="td-quests__text">{questTitle(s, q)}<small>{taken ? 'Already claimed this match' : questReward(QUESTS[q])}</small></span>
    </li>; })}</ol>;
}

function PlayerList({ s, localId, watching, name, canWatch }: { s: TdState; localId: string; watching: string; name: (id: string) => string; canWatch: boolean }) {
  const rows = s.players.slice().sort((a, b) => Number(a.out) - Number(b.out) || b.cleared - a.cleared || b.lives - a.lives);
  return <ol className="td-players" data-testid="td-players">{rows.map((p) => {
    const body = <>
      <strong>{name(p.id)}{p.id === localId ? ' (you)' : ''}</strong>
      <small>{p.out ? `Out on wave ${p.outWave}` : `${p.lives} lives`} · best tier {p.maxTier || '–'} · {boardScore(p)} pts{s.firstSix.includes(p.id) ? ' · first tier 6' : ''}</small>
    </>;
    return <li key={p.id} className={`${p.out ? 'is-out' : ''}${p.id === watching ? ' is-watched' : ''}`} style={tierStyle(Math.max(1, p.maxTier))}>
      {canWatch && !p.out ? <button data-testid={`td-watch-${p.id}`} onClick={() => useTumbleUI.setState({ watching: p.id })}>{body}</button> : <div>{body}</div>}
    </li>; })}</ol>;
}

export function TumbleHud({ getState, localId, contestants }: MinigameSceneProps<TdState>) {
  const [, refresh] = useState(0);
  const ui = useTumbleUI();
  const paused = useMatch((m) => m.paused), hostPhase = useMatch((m) => m.phase);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastKey = useRef(0);
  const name = (id: string) => contestants.find((c) => c.id === id)?.name || 'Player';
  useEffect(() => {
    resetTumbleUI();
    const timer = window.setInterval(() => { refresh((n) => n + 1); setToasts((list) => (list.some((t) => t.until < performance.now()) ? list.filter((t) => t.until >= performance.now()) : list)); }, 100);
    return () => { window.clearInterval(timer); clearTumbleInput(); resetTumbleUI(); };
  }, []);
  useEffect(() => { if (paused) clearTumbleInput(); }, [paused]);
  // Notices from the rules: your quests, merges and boss rewards, boss waves, the lobby's first tier 6.
  useEffect(() => matchBus.on('event', (e) => {
    const s = getState(); if (s?.kind !== 'tower-tumble') return;
    const id = (e as { id?: string }).id, mine = id === localId, def = TOWERS[(e as { def?: string }).def ?? ''];
    const push = (text: string, tone: Toast['tone'] = 'info', ms = 3200) => setToasts((list) => [...list.slice(-3), { key: ++toastKey.current, text, tone, until: performance.now() + ms }]);
    if (e.type === 'td-quest') {
      const q = e.quest as QuestId;
      if (mine) push(`Quest done: ${questTitle(s, q)} · +${questReward(QUESTS[q])}`, 'good', 4200);
      else if (q === 'first6') push(`${name(id!)} built the lobby's first tier-6 tower`, 'info', 4200);
    } else if (e.type === 'td-merge' && mine && def) push(`${(e as { lucky?: boolean }).lucky ? 'Lucky merge! ' : 'Merged: '}${def.name} · tier ${def.tier}`, (e as { lucky?: boolean }).lucky ? 'good' : 'info');
    else if (e.type === 'td-gift' && mine && def) push(`Boss reward: ${def.name} · tier ${def.tier}`, 'good', 4200);
    else if (e.type === 'td-build' && mine && def) {
      push(`Built: ${def.name} · tier ${def.tier}`, def.tier > 1 ? 'good' : 'info', 2200);
      const cell = e.cell as number, sel = useTumbleUI.getState().selected;
      if (sel === null || sel === cell) useTumbleUI.setState({ selected: cell, cursor: cell });
    } else if (e.type === 'td-wave' && (e as { boss?: boolean }).boss) push(`Boss wave! ${BOSSES[e.wave as number]?.name ?? 'Boss'} is coming`, 'boss', 3600);
    else if (e.type === 'td-boss-down' && mine) push('Boss toppled!', 'good');
    else if (e.type === 'td-out' && mine) { push(`Knocked out on wave ${e.wave as number}. Watch the other boards.`, 'bad', 5000); useTumbleUI.setState({ selected: null, panel: null }); }
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
  const canAct = !me.out && s.phase !== 'over' && !paused && hostPhase === 'playing';
  const send = (input: Parameters<typeof submitTumbleInput>[0]) => { if (canAct || input.type === 'speed') { unlockAudio(); submitTumbleInput(input); } };
  const setPanel = (panel: TdPanel) => useTumbleUI.setState({ panel: ui.panel === panel ? null : panel });
  const seconds = Math.max(0, Math.ceil((s.phaseEnds - s.t) / 1000));
  const left = s.phase === 'wave' ? board.enemies.length + Math.max(0, s.spawns.length - board.spawnIdx) : 0;
  const cost = builderCost(me), boss = isBossWave(s.wave) ? BOSSES[s.wave] : null;
  const waveKinds = [...new Set(WAVES[Math.min(s.wave, WAVES.length) - 1].map((g) => (g.kind === 'boss' ? boss?.name ?? 'Boss' : ENEMIES[g.kind].name)))].join(', ');
  const questsDone = QUEST_ORDER.filter((q) => me.quests[q]).length;
  const flash = s.t - board.lastLeakAt < 700;
  const selected = ui.selected !== null && !me.out && (towerAt(me, ui.selected) || (isBuildable(ui.selected) && !isPath(ui.selected))) ? ui.selected : null;

  return <div className={`td-hud${me.out ? ' is-out' : ''}`} data-testid="td-hud">
    <div className="td-board-slot" aria-hidden />
    <header className={`td-bar${flash ? ' is-hit' : ''}`} data-testid="td-bar">
      <span className="td-bar__wave" data-testid="td-wave"><b>Wave {Math.min(s.wave, s.config.waves)}/{s.config.waves}</b>{boss && <i className="td-boss-tag">Boss</i>}</span>
      <span className="td-bar__phase" data-testid="td-phase">{s.phase === 'build' ? `Next wave in ${seconds} s` : s.phase === 'wave' ? `${left} left` : 'Finished'}<small>{s.phase === 'build' ? waveKinds : ''}</small></span>
      <span className="td-bar__stat" data-testid="td-gold" title="Gold"><Coin /><b>{board.gold}</b><span className="td-sr"> gold</span></span>
      <span className="td-bar__stat" data-testid="td-lives" title="Lives"><Heart /><b>{Math.max(0, board.lives)}</b><span className="td-sr"> lives</span></span>
      <span className="td-bar__stat td-bar__score" title="Score"><b>{boardScore(board)}</b> pts</span>
      {board !== me && <span className="td-bar__watch" data-testid="td-watching">Watching {name(board.id)}</span>}
    </header>

    {!me.out && <aside className={`td-side td-side--quests${ui.panel === 'quests' ? ' is-open' : ''}`} aria-label="Quests">
      <header className="td-panel__head"><strong>Quests {questsDone}/{QUEST_ORDER.length}</strong>{ui.panel === 'quests' && <button className="td-only-phone" data-testid="td-quests-close" onClick={() => setPanel(null)}>Close</button>}</header>
      <QuestList s={s} me={me} />
    </aside>}
    <aside className={`td-side td-side--players${ui.panel === 'players' || me.out ? ' is-open' : ''}`} aria-label="Players">
      <header className="td-panel__head"><strong>Players</strong>{ui.panel === 'players' && <button className="td-only-phone" data-testid="td-players-close" onClick={() => setPanel(null)}>Close</button>}</header>
      <PlayerList s={s} localId={localId} watching={board.id} name={name} canWatch={me.out} />
    </aside>

    {me.out ? <section className="td-spectate" data-testid="td-spectate" aria-label="Spectating">
      <strong>Knocked out on wave {me.outWave}. Watching {name(board.id)}{board.out ? ' (out)' : ` · wave ${s.wave} · ${board.lives} lives`}</strong>
      <div className="td-spectate__row">
        <button data-testid="td-watch-prev" aria-label="Previous board" onClick={() => useTumbleUI.setState({ watching: cycleWatch(s, board.id, -1) })}>‹ Prev</button>
        <button data-testid="td-watch-next" aria-label="Next board" onClick={() => useTumbleUI.setState({ watching: cycleWatch(s, board.id, 1) })}>Next ›</button>
        {allHumansOut(s) && SPEEDS.map((k) => <button key={k} data-testid={`td-speed-${k}`} aria-pressed={s.speed === k} onClick={() => send({ type: 'speed', speed: k })}>×{k}</button>)}
      </div>
    </section> : <section className="td-dock" data-testid="td-dock" aria-label="Build controls">
      <div className="td-dock__row">
        <button className="td-primary td-build" data-testid="td-build" disabled={!canAct || !canBuild(s, me)} onClick={() => buildHere(me)}>
          Build [B]<small>{BUILD_COST} gold · random tower</small></button>
        <button data-testid="td-builder" disabled={!canAct || cost === null || me.gold < cost} onClick={() => send({ type: 'builder' })}>
          Builder Lv {me.builder}{cost !== null ? ' ↑' : ''} [U]<small>{cost !== null ? `Lv ${me.builder + 1}: ${cost} gold` : 'Top level'}</small></button>
        <button data-testid="td-odds-open" aria-pressed={ui.panel === 'odds'} onClick={() => setPanel('odds')}>Odds<small>Lv {me.builder}: {BUILDER[me.builder - 1].build.filter(Boolean).map((n, i) => `T${i + 1} ${n}%`).join(' ')}</small></button>
        <button className="td-next" data-testid="td-next" disabled={!canAct || s.phase !== 'build' || me.ready} onClick={() => send({ type: 'ready' })}>
          {me.ready ? 'Waiting…' : 'Next wave [N]'}<small>{s.phase === 'build' ? `or in ${seconds} s` : 'Wave running'}</small></button>
      </div>
      <div className="td-dock__row td-only-phone">
        <button data-testid="td-quests-open" aria-pressed={ui.panel === 'quests'} onClick={() => setPanel('quests')}>Quests {questsDone}/{QUEST_ORDER.length}</button>
        <button data-testid="td-players-open" aria-pressed={ui.panel === 'players'} onClick={() => setPanel('players')}>Players</button>
        <span className="td-dock__level">Builder Lv {me.builder}/{MAX_BUILDER}</span>
      </div>
    </section>}

    {!me.out && selected !== null && <TowerSheet me={me} cell={selected} send={send} />}
    {ui.panel === 'odds' && <OddsPanel me={me} onClose={() => setPanel(null)} />}
    <ol className="td-toasts" aria-live="polite">{toasts.map((t) => <li key={t.key} className={`td-toast td-toast--${t.tone}`}>{t.text}</li>)}</ol>
  </div>;
}
