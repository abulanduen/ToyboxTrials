/**
 * Hoop Clash HUD: the scoreboard (Red – Blue, the game clock, the half, the shot clock), your team,
 * who has the ball, announcements (jump ball, baskets, violations, halftime, overtime), your shot's
 * charge meter, and on touch screens the joystick plus a hold-to-shoot button (Steal / Grab when
 * you don't have the ball) and a Pass button that work with two thumbs. The results card adds the
 * team totals and every toy's points.
 *
 * The HUD re-renders a few times a second on a timer; the charge meter is moved in a rAF loop
 * through a ref. Nothing here changes per frame through React state.
 */
import { useEffect, useRef, useState } from 'react';
import { pressVirtual, releaseVirtual, tapVirtual } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useGame } from '../../game/store';
import { gameById } from '../registry';
import { matchBus, useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { MoveTouch } from '../shared/MoveTouch';
import { tapButton } from '../shared/tapButton';
import { TEAMS } from './court';
import { CHARGE_MS, type HoopState } from './rules';
import { arcState, TEAM_COLOURS } from './Scene';
import './hoopclash.css';

const clockText = (ms: number) => {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const periodText = (p: number) => (p === 1 ? '1st half' : p === 2 ? '2nd half' : 'Overtime');

interface Banner {
  big: string;
  small?: string;
  team?: number;
  at: number;
}

export function HoopHud({ getState: rawState, localId, contestants }: MinigameSceneProps<HoopState>) {
  const getState = () => {
    const s = rawState() as HoopState | null;
    return s && s.kind === 'hoop-clash' ? s : null;
  };
  const [, refresh] = useState(0);
  const touch = useGame((s) => s.touchUI);
  const paused = useMatch((s) => s.paused);
  const hostPhase = useMatch((s) => s.phase);
  const [banner, setBanner] = useState<Banner | null>(null);
  const meter = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const [shootDown, setShootDown] = useState(false);
  const title = gameById('hoop-clash').title;

  useEffect(() => {
    const id = window.setInterval(() => refresh((n) => n + 1), 100);
    return () => {
      window.clearInterval(id);
      releaseVirtual('interact');
    };
  }, []);
  useEffect(() => {
    if (paused) {
      releaseVirtual('interact');
      setShootDown(false);
    }
  }, [paused]);

  // The charge meter follows your charge every frame (a ref, not React state).
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = getState();
      const me = s?.players.find((p) => p.id === localId);
      const on = !!me && me.charge >= 0 && s!.ball.holder === me.id;
      if (meter.current) meter.current.style.display = on ? '' : 'none';
      if (on && fill.current) {
        fill.current.style.transform = `scaleX(${Math.min(1, me!.charge / CHARGE_MS).toFixed(3)})`;
        meter.current!.classList.toggle('is-gold', arcState.gold);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const name = (id: string | null | undefined) => {
    if (!id) return null;
    if (id === localId) return 'You';
    return contestants.find((c) => c.id === id)?.name ?? getState()?.players.find((p) => p.id === id)?.name ?? null;
  };

  // Announcements from the rules' events.
  useEffect(
    () =>
      matchBus.on('event', (e) => {
        const now = performance.now();
        const show = (big: string, small?: string, team?: number) => setBanner({ big, small, team, at: now });
        switch (e.type) {
          case 'jumpball':
            show('Jump ball!', e.period === 3 ? 'Overtime: next basket wins' : 'Snatch it out of the air');
            break;
          case 'score': {
            const who = name(e.by as string | null);
            show(`+${e.pts}${e.pts === 3 ? '!' : ''}`, `${TEAMS[e.team as number]}${who ? ` · ${who === 'You' ? 'your basket' : who}` : ''}`, e.team as number);
            break;
          }
          case 'violation':
            show('Shot clock!', `${TEAMS[1 - (e.team as number)]} ball`, 1 - (e.team as number));
            break;
          case 'out':
            show('Out of bounds', `${TEAMS[1 - (e.team as number)]} ball`, 1 - (e.team as number));
            break;
          case 'half':
            show('Halftime', 'Switch ends');
            break;
          case 'overtime':
            show('Overtime!', 'Next basket wins');
            break;
          case 'steal':
            if (e.by === localId) show('Stolen!', 'Nice swipe');
            else if (e.from === localId) show('Stolen!', `${name(e.by as string) ?? 'They'} took it`);
            break;
          case 'block':
            show('Blocked!', `${name(e.by as string) ?? 'Someone'} snatched the shot`);
            break;
          case 'final': {
            const w = e.winner as number;
            const sc = e.score as number[];
            show(w < 0 ? 'Tied!' : `${TEAMS[w]} wins!`, `${sc[0]} – ${sc[1]}`, w < 0 ? undefined : w);
            break;
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localId],
  );

  const s = getState();
  if (!s) return null;
  const me = s.players.find((p) => p.id === localId);
  const holder = s.players.find((p) => p.id === s.ball.holder);
  const live = !paused && hostPhase === 'playing';
  const iHold = !!me && holder === me;
  const inbounding = s.phase === 'inbound' && s.inbound?.by === localId;
  const showBanner = banner && performance.now() - banner.at < 2000 ? banner : null;

  let ballLine: { text: string; team?: number };
  if (s.phase === 'jump') ballLine = { text: 'Jump ball' };
  else if (s.phase === 'half') ballLine = { text: 'Halftime' };
  else if (s.phase === 'final' || s.phase === 'over') ballLine = { text: 'Full time' };
  else if (s.phase === 'inbound' || (s.phase === 'dead' && s.inbound)) ballLine = { text: `${TEAMS[s.inbound!.team]} inbounds`, team: s.inbound!.team };
  else if (holder) ballLine = { text: holder === me ? 'You have the ball' : `${name(holder.id)} #${holder.num} has it`, team: holder.team };
  else ballLine = { text: s.shot ? 'Shot up!' : 'Loose ball' };

  const verb = inbounding ? 'Pass in' : iHold ? 'Shoot' : holder && me && holder.team !== me.team ? 'Steal' : 'Grab';
  const shootHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      unlockAudio();
      e.currentTarget.setPointerCapture(e.pointerId);
      setShootDown(true);
      pressVirtual('interact');
    },
    onPointerUp: () => {
      setShootDown(false);
      releaseVirtual('interact');
    },
    onPointerCancel: () => {
      setShootDown(false);
      releaseVirtual('interact');
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return (
    <div className="hc-hud" data-testid="hc-hud">
      <div className="hc-board" data-testid="hc-scoreboard" aria-label={`${TEAMS[0]} ${s.score[0]}, ${TEAMS[1]} ${s.score[1]}`}>
        <div className="hc-team hc-team--red" style={{ background: TEAM_COLOURS[0] }}>
          <span>{TEAMS[0]}</span>
          <strong data-testid="hc-score-red">{s.score[0]}</strong>
        </div>
        <div className="hc-clock">
          <strong data-testid="hc-clock">{clockText(s.clock)}</strong>
          <span>{periodText(s.period)}</span>
          <em className={s.shotClock <= 5000 && s.poss !== null && s.phase === 'live' ? 'is-low' : ''} data-testid="hc-shotclock" title="Shot clock">
            {s.poss === null ? '–' : Math.ceil(s.shotClock / 1000)}
          </em>
        </div>
        <div className="hc-team hc-team--blue" style={{ background: TEAM_COLOURS[1] }}>
          <strong data-testid="hc-score-blue">{s.score[1]}</strong>
          <span>{TEAMS[1]}</span>
        </div>
      </div>
      <div className="hc-ball" data-testid="hc-ball">
        <i style={{ background: ballLine.team === undefined ? '#E8893F' : TEAM_COLOURS[ballLine.team] }} />
        {ballLine.text}
      </div>
      {me && (
        <div className="hc-you" data-testid="hc-you" style={{ borderColor: TEAM_COLOURS[me.team] }}>
          <i style={{ background: TEAM_COLOURS[me.team] }}>{me.num}</i>
          <span>
            You play for <strong style={{ color: TEAM_COLOURS[me.team] }}>{TEAMS[me.team]}</strong>
            <small>{s.teamSize} v {s.teamSize}</small>
          </span>
        </div>
      )}
      {showBanner && (
        <div className="hc-banner" key={showBanner.at} data-testid="hc-banner" role="status" aria-live="polite" style={showBanner.team === undefined ? undefined : { borderColor: TEAM_COLOURS[showBanner.team] }}>
          <strong style={showBanner.team === undefined ? undefined : { color: TEAM_COLOURS[showBanner.team] }}>{showBanner.big}</strong>
          {showBanner.small && <span>{showBanner.small}</span>}
        </div>
      )}
      {inbounding && <div className="hc-tip" data-testid="hc-inbound-tip">Your inbound: face a teammate and pass {touch ? '(Pass)' : '(Q, E or right click)'}</div>}
      <div className="hc-meter" ref={meter} style={{ display: 'none' }} data-testid="hc-meter" aria-hidden>
        <div ref={fill} />
        <span>{touch ? 'Let go to shoot' : 'Let go to shoot · gold arc goes in'}</span>
      </div>
      {touch && live && me && (
        <>
          <div className="hc-stick">
            <MoveTouch jump={false} />
          </div>
          <div className="hc-actions">
            <button className="hc-btn hc-btn--pass" data-testid="hc-pass" aria-label={iHold || inbounding ? 'Pass' : 'Call for the ball'} {...tapButton(() => {
              unlockAudio();
              tapVirtual('slot1');
            })}>
              <span>{iHold || inbounding ? 'Pass' : 'Call'}</span>
            </button>
            <button className={`hc-btn hc-btn--shoot${shootDown ? ' is-down' : ''}`} data-testid="hc-shoot" aria-label={verb} {...shootHandlers}>
              <span>{verb}</span>
            </button>
          </div>
        </>
      )}
      {!touch && <div className="hc-hint">{title}: W A S D move · Shift sprint · hold E, Space or click to shoot · Q or right click to pass</div>}
    </div>
  );
}

/** The results card's extra: the final score and every toy's points, by team. */
export function HoopResults({ getState: rawState, localId, contestants }: MinigameSceneProps<HoopState>) {
  const s = rawState() as HoopState | null;
  if (!s || s.kind !== 'hoop-clash') return null;
  const name = (id: string) => (id === localId ? 'You' : contestants.find((c) => c.id === id)?.name ?? s.players.find((p) => p.id === id)?.name ?? id);
  const verdict = s.winner === 'tie' ? 'Tied after overtime' : s.winner === null ? '' : `${TEAMS[s.winner]} wins${s.period === 3 ? ' in overtime' : ''}`;
  return (
    <div className="hc-results" data-testid="hc-results">
      <p className="hc-results__score">
        <span style={{ color: TEAM_COLOURS[0] }}>{TEAMS[0]} {s.score[0]}</span> – <span style={{ color: TEAM_COLOURS[1] }}>{s.score[1]} {TEAMS[1]}</span>
        {verdict && <small>{verdict}</small>}
      </p>
      <div className="hc-results__teams">
        {([0, 1] as const).map((t) => (
          <ul key={t} style={{ borderColor: TEAM_COLOURS[t] }} data-testid={`hc-results-${t === 0 ? 'red' : 'blue'}`}>
            {s.players
              .filter((p) => p.team === t)
              .sort((a, b) => b.pts - a.pts)
              .map((p) => (
                <li key={p.id} className={p.id === localId ? 'me' : ''}>
                  <i style={{ background: TEAM_COLOURS[t] }}>{p.num}</i>
                  <span>{name(p.id)}</span>
                  <strong>{p.pts}</strong>
                </li>
              ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
