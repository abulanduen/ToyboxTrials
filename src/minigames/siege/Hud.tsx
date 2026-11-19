/**
 * Toybox Siege HUD (DOM). Refreshes ten times a second from the live state; never per frame.
 * Cards (class pick, level-up, treasure, revive) are centred over a blurred, dimmed board like
 * Spellbox's draft card. Touch: the shared floating joystick on the left, one big skill button
 * on the right; every target is at least 56 px.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { unlockAudio } from '../../game/audio';
import { useGame } from '../../game/store';
import { MoveTouch } from '../shared/MoveTouch';
import { useMatch } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import {
  BIGS, BOSS_AT, CLASSES, CLASS_IDS, ELITE_SCHEDULE, HORN, MAX_LEVEL, PASSIVES, WEAPONS, reviveCost, sendBlock, sendTarget,
  viewedPlayer, type ClassId, type Option, type SiegePlayer, type SiegeState,
} from './rules';
import { CLASS_COLOUR, PASSIVE_COLOUR, PASSIVE_MARK, WEAPON_COLOUR, WEAPON_MARK } from './look';
import { clearSiegeInput, queueSiegeInput } from './local';
import './siege.css';

const clock = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const BLOCK_TEXT = { self: 'That is you', out: 'Already out', cooldown: 'You sent one recently', protected: 'Just received one', full: 'Has two already' } as const;
const STATUS_TEXT = { picking: 'Choosing', alive: 'In', downed: 'Down!', ghost: 'Ghost', victor: 'Won!' } as const;

function Pips({ level, evolved }: { level: number; evolved?: boolean }) {
  return <span className={`siege-pips${evolved ? ' evolved' : ''}`} aria-label={evolved ? 'Evolved' : `Level ${level} of ${MAX_LEVEL}`}>
    {Array.from({ length: MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}
  </span>;
}
function Chip({ mark, colour, title, level, evolved }: { mark: string; colour: string; title: string; level: number; evolved?: boolean }) {
  return <li className="siege-chip" title={title}><b style={{ background: colour }}>{mark}</b><Pips level={level} evolved={evolved} /></li>;
}

/** Describe an upgrade card. */
function describe(o: Option, p: SiegePlayer): { title: string; body: string; tag: string; colour: string; mark: string } {
  switch (o.kind) {
    case 'weapon': {
      const d = WEAPONS[o.id];
      return { title: d.name, tag: o.level === 1 ? 'New weapon' : `Weapon · level ${o.level}`, body: o.level === 1 ? d.blurb : d.levelText[o.level - 1], colour: WEAPON_COLOUR[o.id], mark: WEAPON_MARK[o.id] };
    }
    case 'passive': return { title: PASSIVES[o.id].name, tag: o.level === 1 ? 'New passive' : `Passive · level ${o.level}`, body: PASSIVES[o.id].perLevel, colour: PASSIVE_COLOUR[o.id], mark: PASSIVE_MARK[o.id] };
    case 'horn': return { title: HORN.name, tag: o.level === 1 ? 'Active skill' : `Active skill · level ${o.level}`, body: `${HORN.blurb} Cooldown ${HORN.cooldowns[o.level - 1] / 1000} s.`, colour: '#C8973A', mark: 'Rh' };
    case 'evolve': { const d = WEAPONS[o.id]; return { title: d.evolvedName, tag: `Evolution of ${d.name}`, body: d.evolvedBlurb, colour: WEAPON_COLOUR[o.id], mark: '★' }; }
    case 'bundle': return { title: 'Treasure', tag: 'Open the chest', body: o.items.map((it) => `${it.kind === 'weapon' ? WEAPONS[it.id].name : PASSIVES[it.id].name} +1`).join(' · '), colour: '#EFAE45', mark: '+1' };
    case 'heal': return { title: 'Oil and polish', tag: 'Everything is maxed', body: `Full health and 50 points. (${Math.round(p.hp)} health now.)`, colour: '#89B78A', mark: '+' };
    case 'send': return { title: 'Send an elite', tag: 'Skip the treasure', body: 'Give up this chest and send an elite to a rival’s board instead.', colour: '#E76B62', mark: '!' };
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
  const spectating = me.status === 'ghost' || me.status === 'victor';
  const left = s.config.durationMs - s.runT;
  const nextElite = ELITE_SCHEDULE.find((e) => e.at > s.runT);
  const next = s.phase !== 'run' ? '' : nextElite ? `${BIGS[nextElite.elite].name} at ${clock(nextElite.at)}` : s.runT < BOSS_AT ? `The boss at ${clock(BOSS_AT)}` : 'The boss is here';
  const boss = viewed.board.bigs.find((g) => g.on && g.type === 'baron');
  const incoming = viewed.incoming.length ? viewed.incoming[0] : null;
  const hornLeft = me.horn ? Math.max(me.horn.readyAt, me.sendReadyAt) - s.runT : 0;
  const hornTarget = me.horn ? sendTarget(s, me, null) : undefined;

  // ---------------- class pick (untimed)
  if (s.phase === 'pick') {
    return <div className="siege-hud">
      <div className="siege-backdrop" data-testid="siege-class-backdrop">
        <section className="siege-card siege-classes" aria-label="Choose your class" data-testid="siege-class-card">
          <header><strong>Toybox Siege · Choose your toy</strong><span>{me.cls ? `Ready! Waiting for ${s.players.filter((p) => !p.cls).length} more…` : 'No time limit. Five minutes of swarm, an elite every minute, the boss at 4:00.'}</span></header>
          <div className="siege-options siege-options--3">
            {CLASS_IDS.map((id: ClassId) => {
              const c = CLASSES[id];
              return <button key={id} data-testid={`siege-class-${id}`} disabled={!active || !!me.cls} aria-pressed={me.cls === id} onClick={() => send({ type: 'class', cls: id })} style={{ '--accent': CLASS_COLOUR[id] } as CSSProperties}>
                <i className="siege-mark">{c.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</i>
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

  const card = me.status === 'alive' && me.choice ? me.choice : null;
  const downed = me.status === 'downed';
  const cost = reviveCost(s.runT);

  return <div className="siege-hud">
    <div className="siege-top" aria-live="off">
      <div className="siege-clock" aria-label={`${clock(s.runT)} of ${clock(s.config.durationMs)}, ${clock(left)} left`}><strong data-testid="siege-clock">{clock(s.runT)}</strong><small>{next}</small></div>
      <div className="siege-bars">
        <div className="siege-bar siege-bar--hp" aria-label={`Health ${Math.ceil(viewed.hp)} of ${viewed.stat.maxHp}`}><i style={{ width: `${(100 * viewed.hp) / viewed.stat.maxHp}%` }} /><span>{Math.ceil(viewed.hp)} / {viewed.stat.maxHp}</span></div>
        <div className="siege-bar siege-bar--xp" aria-label={`Level ${viewed.level}`}><i style={{ width: `${(100 * viewed.xp) / viewed.xpNext}%` }} /><span data-testid="siege-level">Lv {viewed.level}</span></div>
      </div>
      <div className="siege-score"><strong>{viewed.points}</strong><small>pts · {viewed.kills} KOs</small></div>
    </div>

    <ul className="siege-items" aria-label={spectating ? `${names(viewed.id)}'s kit` : 'Your kit'}>
      {viewed.weapons.map((w) => <Chip key={w.id} mark={WEAPON_MARK[w.id]} colour={WEAPON_COLOUR[w.id]} title={w.evolved ? WEAPONS[w.id].evolvedName : WEAPONS[w.id].name} level={w.level} evolved={w.evolved} />)}
      {viewed.passives.map((x) => <Chip key={x.id} mark={PASSIVE_MARK[x.id]} colour={PASSIVE_COLOUR[x.id]} title={PASSIVES[x.id].name} level={x.level} />)}
    </ul>

    <ol className="siege-players" aria-label="Rivals">
      {s.players.map((p) => {
        const isMe = p.id === localId, aim = !isMe && me.horn && (me.target ?? hornTarget?.id) === p.id;
        return <li key={p.id} className={`siege-row siege-row--${p.status}${viewed.id === p.id ? ' watching' : ''}${aim ? ' aimed' : ''}`}>
          <button disabled={isMe || !active} onClick={() => spectating ? send({ type: 'watch', dir: 1, id: p.id }) : send({ type: 'target', id: me.target === p.id ? null : p.id })} aria-label={`${names(p.id)}: ${STATUS_TEXT[p.status]}, level ${p.level}`} data-testid={`siege-row-${p.id}`}>
            <i style={{ background: p.cls ? CLASS_COLOUR[p.cls] : '#A8998A' }} />
            <span className="siege-name">{names(p.id)}</span>
            <span className="siege-row-meta">{STATUS_TEXT[p.status]} · Lv {p.level}{p.incoming.length ? ' · elite incoming!' : ''}</span>
          </button>
        </li>;
      })}
    </ol>

    {boss && <div className="siege-boss" data-testid="siege-boss"><strong>{BIGS.baron.name}</strong><div className="siege-bar siege-bar--boss"><i style={{ width: `${(100 * boss.hp) / boss.maxHp}%` }} /></div></div>}
    {incoming && <div className="siege-alert" role="status" data-testid="siege-incoming"><strong>Elite incoming from {names(incoming.from)}!</strong><span>Arrives in {Math.max(0, Math.ceil((incoming.at - s.runT) / 1000))} s</span></div>}
    {spectating && <div className="siege-spectate" data-testid="siege-spectate">
      <strong>{me.status === 'victor' ? 'Boss defeated! You won the siege.' : 'You are a ghost'}</strong>
      <span>Watching {viewed.id === localId ? 'your board' : `${names(viewed.id)}’s board`} · {s.players.filter((p) => p.status === 'ghost').length} ghost{s.players.filter((p) => p.status === 'ghost').length === 1 ? '' : 's'}</span>
      <div><button onClick={() => send({ type: 'watch', dir: -1 })} data-testid="siege-watch-prev" disabled={!active}>‹ Prev</button><button onClick={() => send({ type: 'watch', dir: 1 })} data-testid="siege-watch-next" disabled={!active}>Next ›</button></div>
    </div>}

    {me.horn && me.status === 'alive' && !card && <button className="siege-skill" data-testid="siege-skill" disabled={!active || hornLeft > 0 || !hornTarget} onClick={() => send({ type: 'skill' })}>
      <strong>{HORN.name}</strong><small>{hornLeft > 0 ? `${Math.ceil(hornLeft / 1000)} s` : hornTarget ? `Send elite → ${names(hornTarget.id)}` : 'No target'}</small>{!touch && <kbd>Space</kbd>}
    </button>}
    {!paused && touch && (me.status === 'alive' || me.status === 'ghost') && !card && <MoveTouch jump={false} />}

    {card && <div className="siege-backdrop" data-testid="siege-card-backdrop">
      <section className="siege-card" aria-label={card.kind === 'level' ? 'Level up' : 'Treasure'} data-testid={card.kind === 'level' ? 'siege-levelup' : 'siege-treasure'}>
        <header><strong>{card.kind === 'level' ? `Level ${me.level - me.pendingLevels + 1}! Choose an upgrade` : 'Treasure chest!'}</strong>
          <span>{card.kind === 'level' ? 'Your board waits while you choose; the clock does not.' : 'Open it, or skip it to send an elite to a rival.'}</span></header>
        <div className={`siege-options siege-options--${card.options.length}`}>
          {card.options.map((o, i) => {
            const d = describe(o, me), blocked = o.kind === 'send' ? !sendTarget(s, me, pickTarget) : false;
            return <button key={i} data-testid={`siege-option-${i}`} data-kind={o.kind} disabled={!active || blocked} onClick={() => send({ type: 'choose', index: i, target: o.kind === 'send' ? pickTarget : undefined })} style={{ '--accent': d.colour } as CSSProperties}>
              <i className="siege-mark">{d.mark}</i><em>{d.tag}</em><strong>{d.title}</strong><small>{d.body}</small>
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
        <header><strong>Wound down!</strong><span>Revive once by spending points, or become a ghost and watch the others.</span></header>
        <div className="siege-options siege-options--2">
          <button data-testid="siege-revive" disabled={!active || me.points < cost} onClick={() => send({ type: 'revive' })} style={{ '--accent': '#EFAE45' } as CSSProperties}>
            <i className="siege-mark">↻</i><strong>Revive · {cost} pts</strong><small>Back up with 60% health and a shockwave. You have {me.points} points.</small>{!touch && <kbd>Space</kbd>}
          </button>
          <button data-testid="siege-giveup" disabled={!active} onClick={() => send({ type: 'giveup' })} style={{ '--accent': '#A8998A' } as CSSProperties}>
            <i className="siege-mark">…</i><strong>Become a ghost</strong><small>Inspect the other boards. {Math.max(0, Math.ceil((s.config.reviveWindowMs - (s.runT - me.downedAt)) / 1000))} s to decide.</small>
          </button>
        </div>
      </section>
    </div>}

    {!touch && !card && !downed && <div className="siege-hint">{spectating ? 'Q / E or the buttons: change board · WASD drifts your ghost' : 'WASD / arrows move · weapons fire on their own · 1–4 pick a card · Space: Rally Horn · click a rival to aim it'}</div>}
  </div>;
}
