/**
 * Toybox Siege HUD (DOM). Refreshes ten times a second from the live state; never per frame.
 * Cards (class pick, level-up, treasure, revive) are centred over a blurred, dimmed board like
 * Spellbox's draft card. Touch: the shared floating joystick anywhere in the bottom half, one big
 * skill button on the right; every target is at least 56 px.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { unlockAudio } from '../../game/audio';
import { useGame } from '../../game/store';
import { MoveTouch } from '../shared/MoveTouch';
import { useMatch } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import {
  BIGS, BOSS_AT, CLASSES, CLASS_IDS, ELITE_SCHEDULE, HORN, MAX_LEVEL, PASSIVES, WEAPONS, evolutionHint, overtime, reviveCost, sendBlock, sendTarget,
  viewedBoard, viewedPlayer, type ClassId, type EvoHint, type Option, type SiegePlayer, type SiegeState,
} from './rules';
import { CLASS_COLOUR, PASSIVE_COLOUR, WEAPON_COLOUR } from './look';
import { SiegeIcon, type SiegeIconId } from './icons';
import { clearSiegeInput, queueSiegeInput } from './local';
import './siege.css';

const clock = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const BLOCK_TEXT = { self: 'That is you', out: 'Already out', cooldown: 'You sent one recently', protected: 'Just received one', full: 'Has two already' } as const;
const statusText = (p: SiegePlayer) => ({ picking: 'Choosing', alive: 'In', downed: 'Down!', ghost: p.inArena ? 'Knocked out' : 'Ghost', prep: p.victoryAt >= 0 ? 'Boss slain!' : 'Ready', arena: 'Fighting' })[p.status];

/** Level pips: `level` filled; `next` (if given) is the pip this card adds, highlighted. */
function Pips({ level, next, evolved }: { level: number; next?: number; evolved?: boolean }) {
  return <span className={`siege-pips${evolved ? ' evolved' : ''}`} aria-hidden="true">
    {Array.from({ length: MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? 'on' : next !== undefined && i < next ? 'next' : ''} />)}
  </span>;
}
function Chip({ icon, colour, title, level, evolved }: { icon: SiegeIconId; colour: string; title: string; level: number; evolved?: boolean }) {
  return <li className="siege-chip" title={title} aria-label={`${title}, ${evolved ? 'evolved' : `level ${level} of ${MAX_LEVEL}`}`}>
    <b style={{ background: colour }}><SiegeIcon id={evolved ? 'evolve' : icon} size={18} /></b><Pips level={level} evolved={evolved} />
  </li>;
}

interface Card { title: string; body: string; tag: string; colour: string; icon: SiegeIconId; from?: number; to?: number }
/** Describe an upgrade card. */
function describe(o: Option, p: SiegePlayer): Card {
  switch (o.kind) {
    case 'weapon': {
      const d = WEAPONS[o.id];
      return { title: d.name, tag: o.level === 1 ? 'New weapon' : 'Weapon upgrade', body: o.level === 1 ? d.blurb : d.levelText[o.level - 1], colour: WEAPON_COLOUR[o.id], icon: o.id, from: o.level - 1, to: o.level };
    }
    case 'passive': return { title: PASSIVES[o.id].name, tag: o.level === 1 ? 'New passive' : 'Passive upgrade', body: PASSIVES[o.id].perLevel, colour: PASSIVE_COLOUR[o.id], icon: o.id, from: o.level - 1, to: o.level };
    case 'horn': return { title: HORN.name, tag: o.level === 1 ? 'Active skill' : 'Active skill upgrade', body: `${HORN.blurb} Cooldown ${HORN.cooldowns[o.level - 1] / 1000} s.`, colour: '#C8973A', icon: 'horn', from: o.level - 1, to: o.level };
    case 'evolve': { const d = WEAPONS[o.id]; return { title: d.evolvedName, tag: `Evolution of ${d.name}`, body: d.evolvedBlurb, colour: WEAPON_COLOUR[o.id], icon: 'evolve' }; }
    case 'bundle': return { title: 'Treasure', tag: 'Open the chest', body: o.items.map((it) => `${it.kind === 'weapon' ? WEAPONS[it.id].name : PASSIVES[it.id].name} +1`).join(' · '), colour: '#EFAE45', icon: 'chest' };
    case 'heal': return { title: 'Oil and polish', tag: 'Everything is maxed', body: `Full health and 50 points. (${Math.round(p.hp)} health now.)`, colour: '#89B78A', icon: 'heal' };
    case 'send': return { title: 'Send an elite', tag: 'Skip the treasure', body: 'Give up this chest and send an elite to a rival’s board instead.', colour: '#E76B62', icon: 'send' };
  }
}

/** The "secret upgrade" badge: what this card does towards a weapon's evolution. */
function hintText(h: EvoHint): { text: string; strong: boolean } {
  const w = WEAPONS[h.weapon];
  switch (h.kind) {
    case 'evolve': return { text: `Secret upgrade: ${w.name} becomes ${w.evolvedName}`, strong: true };
    case 'ready': return { text: `Unlocks the secret upgrade: the next chest evolves ${w.name} into ${w.evolvedName}`, strong: true };
    case 'pair': return { text: `Secret upgrade pair: ${w.name} + ${PASSIVES[w.partner].name}. ${w.name} needs ${h.levelsLeft} more level${h.levelsLeft === 1 ? '' : 's'}`, strong: false };
    case 'needs': return { text: `Max level. Add ${PASSIVES[w.partner].name} for its secret upgrade (${w.evolvedName})`, strong: false };
  }
}

function TargetPicker({ s, me, names, chosen, onPick }: { s: SiegeState; me: SiegePlayer; names: (id: string) => string; chosen: string | null; onPick: (id: string | null) => void }) {
  const auto = sendTarget(s, me, null);
  return <div className="siege-targets" role="group" aria-label="Send the elite to">
    <span className="siege-targets-label">Send to</span>
    <button aria-pressed={chosen === null} onClick={() => onPick(null)} data-testid="siege-target-leader" disabled={!auto}>Leader{auto ? ` (${names(auto.id)})` : ''}</button>
    {s.players.filter((q) => q !== me).map((q) => {
      const why = sendBlock(s, me, q);
      return <button key={q.id} aria-pressed={chosen === q.id} disabled={!!why} onClick={() => onPick(q.id)} data-testid={`siege-target-${q.id}`}>
        {names(q.id)}<small>{why ? BLOCK_TEXT[why] : `${q.points} pts`}</small>
      </button>;
    })}
  </div>;
}

export function SiegeHud({ getState, localId, contestants }: MinigameSceneProps<SiegeState>) {
  const [, refresh] = useState(0);
  const [pickTarget, setPickTarget] = useState<string | null>(null);
  /** The out-popup was dismissed (stay on your own board); keyed by what put you out, so a new knockout asks again. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  const paused = useMatch((s) => s.paused), hostPhase = useMatch((s) => s.phase);
  const touch = useGame((s) => s.touchUI);
  useEffect(() => { const id = window.setInterval(() => refresh((n) => n + 1), 100); return () => { window.clearInterval(id); clearSiegeInput(); }; }, []);
  const s = getState();
  if (!s || s.kind !== 'toybox-siege') return null;
  const me = s.players.find((p) => p.id === localId);
  if (!me) return null;
  const active = !paused && hostPhase === 'playing';
  const send = (input: Parameters<typeof queueSiegeInput>[0]) => { if (active) { unlockAudio(); queueSiegeInput(input); } };
  const who = (id: string) => contestants.find((c: Contestant) => c.id === id);
  const names = (id: string) => (id === localId ? 'You' : who(id)?.name ?? id);
  const viewed = viewedPlayer(s, localId) ?? me;
  const board = viewedBoard(s, viewed);
  const arena = s.phase === 'arena';
  const out = me.status === 'ghost';
  const watchingOthers = viewed.id !== me.id;

  // ---------------- class pick (untimed, no countdown before it)
  if (s.phase === 'pick') {
    return <div className="siege-hud">
      <div className="siege-backdrop" data-testid="siege-class-backdrop">
        <section className="siege-card siege-classes" aria-label="Choose your class" data-testid="siege-class-card">
          <header><strong>Toybox Siege · Choose your toy</strong><span>{me.cls ? `Ready! Waiting for ${s.players.filter((p) => !p.cls).length} more…` : 'No time limit. Five minutes of swarm, an elite every minute, the boss at 4:00, then the arena.'}</span></header>
          <div className="siege-options siege-options--3">
            {CLASS_IDS.map((id: ClassId) => {
              const c = CLASSES[id];
              return <button key={id} data-testid={`siege-class-${id}`} disabled={!active || !!me.cls} aria-pressed={me.cls === id} onClick={() => send({ type: 'class', cls: id })} style={{ '--accent': CLASS_COLOUR[id] } as CSSProperties}>
                <i className="siege-mark"><SiegeIcon id={c.weapon} size={26} /></i>
                <strong>{c.name}</strong><em>{c.role}</em><small>{c.blurb}</small>
                <span>Starts with {WEAPONS[c.weapon].name} · {c.hp} health</span>
              </button>;
            })}
          </div>
          <ul className="siege-lockins" aria-label="Who has picked">{s.players.map((p) => <li key={p.id} className={p.cls ? 'ready' : ''}>{names(p.id)}<small>{p.cls ? CLASSES[p.cls].name : 'Choosing'}</small></li>)}</ul>
        </section>
      </div>
    </div>;
  }

  const card = (me.status === 'alive' || me.status === 'prep') && me.choice ? me.choice : null;
  const downed = me.status === 'downed';
  const cost = reviveCost(s.runT);
  const prepLeft = Math.max(0, me.prepUntil - s.runT);
  const stillFighting = s.players.filter((p) => p.status === 'alive' || p.status === 'downed').length;
  const arenaBy = s.config.durationMs + s.config.prepMs;

  // Top line under the clock.
  const nextElite = ELITE_SCHEDULE.find((e) => e.at > s.runT);
  const next = arena ? (overtime(s.arenaT) > 1 ? `Overtime! Damage ×${overtime(s.arenaT).toFixed(1)}` : 'Arena: last toy standing wins')
    : s.phase !== 'run' ? ''
    : me.status === 'prep' ? (prepLeft > 0 ? `Arena in ${Math.ceil(prepLeft / 1000)} s or later` : 'Waiting for the arena')
    : nextElite ? `${BIGS[nextElite.elite].name} at ${clock(nextElite.at)}` : s.runT < BOSS_AT ? `The boss at ${clock(BOSS_AT)}` : s.runT < s.config.durationMs ? `The arena at ${clock(s.config.durationMs)} at the latest` : 'The arena opens soon';
  const boss = !arena && board.bigs.find((g) => g.on && g.type === 'baron');
  const ally = arena && s.arena ? s.arena.bigs.find((g) => g.on && g.from === me.id) : undefined;
  const incoming = !arena && viewed.incoming.length ? viewed.incoming[0] : null;
  // The Rally Horn: sends elites during the run, summons the Baron in the arena.
  const hornMode = me.horn ? (arena ? (me.status === 'arena' ? 'summon' : null) : me.status === 'alive' && !card ? 'send' : null) : null;
  const hornLeft = !me.horn ? 0 : hornMode === 'summon' ? me.horn.readyAt - s.arenaT : Math.max(me.horn.readyAt, me.sendReadyAt) - s.runT;
  const hornTarget = hornMode === 'send' ? sendTarget(s, me, null) : undefined;
  const fighters = s.players.filter((p) => p.status === 'arena').length;
  const showPopup = out && !watchingOthers && dismissed !== `${me.inArena ? 'arena' : 'run'}`;
  const canWatch = out || (me.status === 'prep' && !card);
  const stickOn = !paused && touch && !card && !downed && (me.status === 'alive' || me.status === 'arena' || me.status === 'prep' || (out && watchingOthers));

  return <div className="siege-hud">
    {/* First, so every HUD button paints above the bottom-half joystick zone. */}
    {stickOn && <MoveTouch jump={false} zone="half" />}

    <div className="siege-top" aria-live="off">
      <div className="siege-clock" aria-label={arena ? `Arena ${clock(s.arenaT)}` : `${clock(s.runT)} of ${clock(s.config.durationMs)}`}><strong data-testid="siege-clock">{arena ? clock(s.arenaT) : clock(Math.min(s.runT, s.config.durationMs))}</strong><small>{next}</small></div>
      <div className="siege-bars">
        <div className="siege-bar siege-bar--hp" aria-label={`Health ${Math.ceil(viewed.hp)} of ${viewed.stat.maxHp}`}><i style={{ width: `${(100 * viewed.hp) / viewed.stat.maxHp}%` }} /><span>{Math.ceil(viewed.hp)} / {viewed.stat.maxHp}</span></div>
        <div className="siege-bar siege-bar--xp" aria-label={`Level ${viewed.level}`}><i style={{ width: `${(100 * viewed.xp) / viewed.xpNext}%` }} /><span data-testid="siege-level">Lv {viewed.level}</span></div>
      </div>
      <div className="siege-score"><strong>{viewed.points}</strong><small>pts · {arena ? `${viewed.arenaKOs} arena KOs` : `${viewed.kills} KOs`}</small></div>
    </div>

    <ul className="siege-items" aria-label={watchingOthers ? `${names(viewed.id)}'s kit` : 'Your kit'} data-testid="siege-items">
      {viewed.weapons.map((w) => <Chip key={w.id} icon={w.id} colour={WEAPON_COLOUR[w.id]} title={w.evolved ? WEAPONS[w.id].evolvedName : WEAPONS[w.id].name} level={w.level} evolved={w.evolved} />)}
      {viewed.passives.map((x) => <Chip key={x.id} icon={x.id} colour={PASSIVE_COLOUR[x.id]} title={PASSIVES[x.id].name} level={x.level} />)}
    </ul>

    <ol className="siege-players" aria-label="Rivals">
      {s.players.map((p) => {
        const isMe = p.id === localId, aim = hornMode === 'send' && !isMe && (me.target ?? hornTarget?.id) === p.id;
        const watchable = canWatch && !isMe && (!arena || p.status === 'arena');
        return <li key={p.id} className={`siege-row siege-row--${p.status}${p.victoryAt >= 0 ? ' siege-row--slayer' : ''}${viewed.id === p.id ? ' watching' : ''}${aim ? ' aimed' : ''}`}>
          <button disabled={isMe || !active || (canWatch ? !watchable : arena)} onClick={() => canWatch ? send({ type: 'watch', dir: 1, id: p.id }) : send({ type: 'target', id: me.target === p.id ? null : p.id })} aria-label={`${names(p.id)}: ${statusText(p)}, level ${p.level}`} data-testid={`siege-row-${p.id}`}>
            <i style={{ background: p.cls ? CLASS_COLOUR[p.cls] : '#A8998A' }} />
            <span className="siege-name">{names(p.id)}</span>
            <span className="siege-row-meta">{statusText(p)} · Lv {p.level}{p.incoming.length && !arena ? ' · elite incoming!' : ''}</span>
            {p.status === 'arena' && <span className="siege-row-hp"><b style={{ width: `${(100 * p.hp) / p.stat.maxHp}%` }} /></span>}
          </button>
        </li>;
      })}
    </ol>

    {boss && <div className="siege-boss" data-testid="siege-boss"><strong>{BIGS.baron.name}</strong><div className="siege-bar siege-bar--boss"><i style={{ width: `${(100 * boss.hp) / boss.maxHp}%` }} /></div></div>}
    {ally && <div className="siege-boss siege-boss--ally" data-testid="siege-ally"><strong>Your {BIGS.baron.name.replace(/^The /, '')}</strong><div className="siege-bar siege-bar--boss"><i style={{ width: `${(100 * ally.hp) / ally.maxHp}%` }} /></div></div>}
    {incoming && <div className="siege-alert" role="status" data-testid="siege-incoming"><strong>Elite incoming from {names(incoming.from)}!</strong><span>Arrives in {Math.max(0, Math.ceil((incoming.at - s.runT) / 1000))} s</span></div>}

    {/* The prep window: after the boss (three chests) or at 5:00. */}
    {me.status === 'prep' && !card && <div className="siege-banner" role="status" data-testid="siege-prep">
      <SiegeIcon id={me.victoryAt >= 0 ? 'chest' : 'arena'} size={30} />
      <div>
        <strong>{me.victoryAt >= 0 ? 'Boss defeated! The swarm is gone.' : 'Time’s up! The swarm retreats.'}</strong>
        <span>{prepLeft > 0 ? `Take your upgrades: the arena opens in ${Math.ceil(prepLeft / 1000)} s or later.`
          : stillFighting ? `Ready. ${stillFighting} rival${stillFighting === 1 ? ' is' : 's are'} still fighting; the arena opens by ${clock(arenaBy)}.` : 'Ready. The arena is about to open.'}</span>
      </div>
      {prepLeft <= 0 && stillFighting > 0 && (watchingOthers
        ? <button onClick={() => send({ type: 'spectate', on: false })} data-testid="siege-watch-back" disabled={!active}>My board</button>
        : <button onClick={() => send({ type: 'spectate', on: true })} data-testid="siege-watch-open" disabled={!active}>Watch rivals</button>)}
    </div>}

    {/* Out for good: stay on your own board, with the choice to watch the others. */}
    {showPopup && <div className="siege-popup" role="dialog" aria-modal="false" aria-labelledby="siege-out-title" data-testid="siege-out-popup">
      <strong id="siege-out-title">{me.inArena ? 'Knocked out of the arena' : 'Wound down for good'}</strong>
      <span>{me.inArena ? `${fighters} toy${fighters === 1 ? '' : 's'} still fighting.` : 'Your run is over. The others are still holding out.'}</span>
      <div>
        <button autoFocus onClick={() => send({ type: 'spectate', on: true })} data-testid="siege-watch-others" disabled={!active}>Watch other players{!touch && <kbd>Space</kbd>}</button>
        <button onClick={() => setDismissed(me.inArena ? 'arena' : 'run')} data-testid="siege-out-dismiss">Stay here</button>
      </div>
    </div>}
    {out && !watchingOthers && !showPopup && <button className="siege-watch-mini" onClick={() => send({ type: 'spectate', on: true })} data-testid="siege-watch-open" disabled={!active}>Watch other players</button>}
    {canWatch && watchingOthers && <div className="siege-spectate" data-testid="siege-spectate">
      <strong>{out ? (me.inArena ? 'Knocked out' : 'You are a ghost') : 'Waiting for the arena'}</strong>
      <span>Watching {names(viewed.id)}{arena ? ' in the arena' : '’s board'} · {s.players.filter((p) => p.status === 'ghost').length} out</span>
      <div>
        <button onClick={() => send({ type: 'watch', dir: -1 })} data-testid="siege-watch-prev" disabled={!active}>‹ Prev</button>
        <button onClick={() => send({ type: 'watch', dir: 1 })} data-testid="siege-watch-next" disabled={!active}>Next ›</button>
        {me.watching && (!arena || me.inArena) && <button onClick={() => send({ type: 'spectate', on: false })} data-testid="siege-watch-back" disabled={!active}>Mine</button>}
      </div>
    </div>}

    {hornMode && <button className="siege-skill" data-testid="siege-skill" disabled={!active || hornLeft > 0 || (hornMode === 'send' ? !hornTarget : !!ally)} onClick={() => send({ type: 'skill' })}>
      <SiegeIcon id="horn" size={22} />
      <strong>{HORN.name}</strong>
      <small>{hornMode === 'summon' ? (ally ? 'The Baron fights for you' : hornLeft > 0 ? `${Math.ceil(hornLeft / 1000)} s` : 'Summon the Baron!')
        : hornLeft > 0 ? `${Math.ceil(hornLeft / 1000)} s` : hornTarget ? `Send elite → ${names(hornTarget.id)}` : 'No target'}</small>
      {!touch && <kbd>Space</kbd>}
    </button>}

    {card && <div className="siege-backdrop" data-testid="siege-card-backdrop">
      <section className="siege-card" aria-label={card.kind === 'level' ? 'Level up' : 'Treasure'} data-testid={card.kind === 'level' ? 'siege-levelup' : 'siege-treasure'}>
        <header><strong>{card.kind === 'level' ? `Level ${me.level - me.pendingLevels + 1}! Choose an upgrade` : me.status === 'prep' ? 'The boss’s treasure!' : 'Treasure chest!'}</strong>
          <span>{me.status === 'prep' ? `Nothing can hurt you now. ${prepLeft > 0 ? `${Math.ceil(prepLeft / 1000)} s to choose before the arena.` : 'Choose quickly: the arena is waiting.'}`
            : card.kind === 'level' ? 'Your board waits while you choose; the clock does not.' : 'Open it, or skip it to send an elite to a rival.'}</span></header>
        <div className={`siege-options siege-options--${card.options.length}`}>
          {card.options.map((o, i) => {
            const d = describe(o, me), blocked = o.kind === 'send' ? !sendTarget(s, me, pickTarget) : false;
            const hint = evolutionHint(me, o), h = hint && hintText(hint);
            const max = o.kind === 'horn' ? 3 : MAX_LEVEL;
            return <button key={i} data-testid={`siege-option-${i}`} data-kind={o.kind} data-hint={hint?.kind ?? ''} disabled={!active || blocked} onClick={() => send({ type: 'choose', index: i, target: o.kind === 'send' ? pickTarget : undefined })} style={{ '--accent': d.colour } as CSSProperties}>
              <i className="siege-mark"><SiegeIcon id={d.icon} size={28} /></i><em>{d.tag}</em><strong>{d.title}</strong>
              {d.to !== undefined && <span className="siege-level" data-testid={`siege-option-${i}-level`}>
                {d.from ? <>Lv {d.from} <b aria-label="to">→</b> {d.to}</> : <>New · Lv 1</>}
                {o.kind !== 'horn' ? <Pips level={d.from ?? 0} next={d.to} /> : <small> of {max}</small>}
              </span>}
              <small>{d.body}</small>
              {h && <span className={`siege-secret${h.strong ? ' siege-secret--ready' : ''}`} data-testid={`siege-option-${i}-secret`}><SiegeIcon id="evolve" size={16} />{h.text}</span>}
              {o.kind === 'send' && blocked && <span>{s.runT < me.sendReadyAt ? `You can send again in ${Math.ceil((me.sendReadyAt - s.runT) / 1000)} s` : 'No rival can take one right now'}</span>}
              {!touch && <kbd>{i + 1}</kbd>}
            </button>;
          })}
        </div>
        {card.kind === 'treasure' && card.options.some((o) => o.kind === 'send') && <TargetPicker s={s} me={me} names={names} chosen={pickTarget} onPick={setPickTarget} />}
      </section>
    </div>}

    {downed && <div className="siege-backdrop" data-testid="siege-downed">
      <section className="siege-card siege-revive" aria-label="Knocked down">
        <header><strong>Wound down!</strong><span>Revive once by spending points, or stop here (you can then watch the others).</span></header>
        <div className="siege-options siege-options--2">
          <button data-testid="siege-revive" disabled={!active || me.points < cost} onClick={() => send({ type: 'revive' })} style={{ '--accent': '#EFAE45' } as CSSProperties}>
            <i className="siege-mark">↻</i><strong>Revive · {cost} pts</strong><small>Back up with 60% health and a shockwave. You have {me.points} points.</small>{!touch && <kbd>Space</kbd>}
          </button>
          <button data-testid="siege-giveup" disabled={!active} onClick={() => send({ type: 'giveup' })} style={{ '--accent': '#A8998A' } as CSSProperties}>
            <i className="siege-mark">…</i><strong>Stay down</strong><small>Your run ends here. {Math.max(0, Math.ceil((s.config.reviveWindowMs - (s.runT - me.downedAt)) / 1000))} s to decide.</small>
          </button>
        </div>
      </section>
    </div>}

    {!touch && !card && !downed && !showPopup && <div className="siege-hint">{
      canWatch && watchingOthers ? 'Q / E or the buttons: change board · WASD drifts your ghost'
        : arena ? `WASD / arrows move · weapons hit rivals on their own${me.horn ? ' · Space: summon the Baron' : ''}`
        : me.status === 'prep' ? 'WASD / arrows move · gems and chests fly to you'
        : 'WASD / arrows move · weapons fire on their own · 1–4 pick a card · Space: Rally Horn · click a rival to aim it'}</div>}
    {arena && me.status === 'arena' && s.arenaT < 4000 && <div className="siege-arena-call" role="status" data-testid="siege-arena-call">
      <strong>The arena!</strong><span>{fighters} toys, every build. Last toy standing wins.</span>
    </div>}
  </div>;
}
