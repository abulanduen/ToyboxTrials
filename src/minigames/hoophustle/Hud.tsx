/**
 * Hoop Hustle's HUD: the clock, your points and spot value, the live standings rail, the charge
 * meter (with its gold zone: let go there and the throw is perfect), "+2!" popups, and banners
 * for the sliding hoop and the gold balls. On touch screens: the floating joystick (aim) on the
 * left and a big hold-to-throw button on the right; the button fires on pointer-down, so it works
 * while the other thumb holds the stick.
 *
 * Re-rendered by a 10 Hz timer; the charge meter is written straight to the DOM every frame.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { pressVirtual, releaseVirtual } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useGame } from '../../game/store';
import { MoveTouch } from '../shared/MoveTouch';
import { useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { VALUE_COLOURS } from './Scene';
import { assistBand, assistedThrow, canShoot, type HoopState } from './rules';
import { cancelHoopCharge, localAim, localCharge } from './local';
import './hoophustle.css';

const VALUE_NAME = ['', '1-point spot', '2-point spot', '3-point spot'];
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The banner for this moment of the match (from the rules' clock, so every client agrees). */
function bannerFor(s: HoopState): { text: string; sub: string; tone: 'warn' | 'slide' | 'gold' | 'buzz' } | null {
  const c = s.config;
  if (s.phase !== 'play') return { text: 'Buzzer!', sub: 'Shots in the air still count', tone: 'buzz' };
  if (s.t >= c.slideAt - c.slideWarnMs && s.t < c.slideAt) return { text: 'Half time! The hoop is winding up…', sub: 'It slides left and right from now on', tone: 'warn' };
  if (s.t >= c.slideAt && s.t < c.slideAt + 2600) return { text: 'The hoop slides!', sub: 'Shoot while it rests at the ends', tone: 'slide' };
  const g = c.durationMs - c.goldMs;
  if (s.t >= g && s.t < g + 3000) return { text: 'Gold ball!', sub: 'Your next shot scores double', tone: 'gold' };
  return null;
}

/** The hold-to-throw button: presses `slot1` while a finger (or the mouse) holds it. */
function ThrowButton({ gold, ready }: { gold: boolean; ready: boolean }) {
  const held = useRef<number | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => () => releaseVirtual('slot1'), []);
  const release = (e?: ReactPointerEvent<HTMLButtonElement>) => {
    if (e && held.current !== e.pointerId) return;
    held.current = null;
    setDown(false);
    releaseVirtual('slot1');
  };
  return (
    <button
      type="button"
      className={`hh-throw${down ? ' is-down' : ''}${gold ? ' is-gold' : ''}${ready ? '' : ' is-waiting'}`}
      data-testid="hh-throw"
      aria-label="Throw: hold to charge, let go to shoot"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        unlockAudio();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        held.current = e.pointerId;
        setDown(true);
        pressVirtual('slot1');
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden>
        <circle cx="20" cy="20" r="15" fill={gold ? '#EFAE45' : '#E8893F'} stroke="#2B2433" strokeWidth="2.5" />
        <path d="M5 20h30M20 5v30M9 9c6 5 6 17 0 22M31 9c-6 5-6 17 0 22" fill="none" stroke="#2B2433" strokeWidth="1.8" />
      </svg>
      <span>Throw</span>
      <small>hold · let go</small>
    </button>
  );
}

export function HoopHud({ getState: rawGet, contestants }: MinigameSceneProps<HoopState>) {
  const getState = rawGet as () => HoopState | null;
  const localId = useMatch((s) => s.localId);
  const paused = useMatch((s) => s.paused);
  const hostPhase = useMatch((s) => s.phase);
  const touch = useGame((s) => s.touchUI);
  const [, refresh] = useState(0);
  const fill = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => refresh((n) => n + 1), 100);
    let raf = 0;
    // The charge meter: every frame, straight to the DOM.
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const s = getState();
      const me = s?.kind === 'hoop-hustle' ? s.players.find((p) => p.id === useMatch.getState().localId) : undefined;
      if (!s || s.kind !== 'hoop-hustle' || !me || !meter.current || !fill.current || !zone.current) return;
      const charge = localCharge(s);
      fill.current.style.transform = `scaleX(${(charge ?? 0).toFixed(3)})`;
      const sp = s.spots[me.spot];
      const shot = canShoot(s, me) ? assistedThrow(s, sp, localAim() ?? me.yaw, charge ?? 0, s.t) : null;
      const band = assistBand(s.config, sp);
      if (shot?.perfect != null) {
        zone.current.style.display = '';
        zone.current.style.left = `${Math.max(0, shot.perfect - band) * 100}%`;
        zone.current.style.width = `${(Math.min(1, shot.perfect + band) - Math.max(0, shot.perfect - band)) * 100}%`;
      } else zone.current.style.display = 'none';
      const inZone = charge !== null && shot?.perfect != null && Math.abs(charge - shot.perfect) <= band;
      meter.current.classList.toggle('is-perfect', inZone);
      meter.current.classList.toggle('is-charging', charge !== null);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      cancelHoopCharge();
      releaseVirtual('slot1');
    };
  }, [getState]);
  useEffect(() => {
    if (paused) {
      cancelHoopCharge();
      releaseVirtual('slot1');
    }
  }, [paused]);

  const s = getState();
  if (s?.kind !== 'hoop-hustle') return null;
  const me = s.players.find((p) => p.id === localId);
  const name = (id: string) => (id === localId ? 'You' : contestants.find((c) => c.id === id)?.name ?? 'A toy');
  const active = hostPhase === 'playing' && !paused && s.phase === 'play';
  const left = s.config.durationMs - s.t;
  const banner = bannerFor(s);
  const ranked = [...s.players].sort((a, b) => b.points - a.points || b.makes - a.makes);
  const places = ranked.map((p, i) => (i > 0 && p.points === ranked[i - 1].points && p.makes === ranked[i - 1].makes ? -1 : i + 1));
  for (let i = 1; i < places.length; i++) if (places[i] < 0) places[i] = places[i - 1];
  const spot = me ? s.spots[me.move ? me.move.to : me.spot] : null;
  const made = me?.lastMake && s.t - me.lastMake.at < 1300 ? me.lastMake : null;
  const missed = me?.lastMiss && s.t - me.lastMiss.at < 900 ? me.lastMiss : null;

  return (
    <div className="hh-hud">
      <div className="hh-top" data-testid="hh-top">
        <div className={`hh-clock${left <= s.config.goldMs && s.phase === 'play' ? ' is-urgent' : ''}`} data-testid="hh-clock" aria-label="Time left">
          {clock(left)}
        </div>
        <div className="hh-score" aria-live="polite">
          <b data-testid="hh-points">{me?.points ?? 0}</b>
          <small>pts</small>
        </div>
        {spot && (
          <div className="hh-spot" style={{ ['--hh-spot' as string]: VALUE_COLOURS[spot.value] }} data-testid="hh-spot">
            <span className="hh-pips" aria-hidden>
              {Array.from({ length: spot.value }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            <span>{me?.gold ? `${VALUE_NAME[spot.value]} · gold ×2` : VALUE_NAME[spot.value]}</span>
          </div>
        )}
      </div>

      {banner && (
        <div className={`hh-banner hh-banner--${banner.tone}`} role="status" data-testid="hh-banner" data-tone={banner.tone}>
          <strong>{banner.text}</strong>
          <span>{banner.sub}</span>
        </div>
      )}

      {made && (
        <div key={made.at} className={`hh-pop${made.gold ? ' is-gold' : ''}`} data-testid="hh-pop">
          +{made.points}!{made.gold && <small>Gold!</small>}
        </div>
      )}
      {!made && missed && (
        <div key={missed.at} className="hh-pop is-miss" data-testid="hh-miss">
          {missed.kind === 'short' ? 'Short!' : 'Long!'}
        </div>
      )}
      {me?.move && <div className="hh-moving">Hop to a {VALUE_NAME[s.spots[me.move.to].value]}</div>}

      <ol className="hh-rail" data-testid="hh-rail" aria-label="Standings">
        {ranked.map((p, i) => {
          const fresh = p.lastMake && s.t - p.lastMake.at < 1300;
          return (
            <li key={p.id} className={`${p.id === localId ? 'is-you' : ''}${fresh ? ' is-fresh' : ''}`} data-testid={`hh-rail-${p.id}`}>
              <span className="hh-rail__rank">{places[i]}</span>
              <span className="hh-rail__name">{name(p.id)}</span>
              <span className={`hh-rail__plus${fresh && p.lastMake!.gold ? ' is-gold' : ''}`}>{fresh ? `+${p.lastMake!.points}` : ''}</span>
              <b className="hh-rail__pts">{p.points}</b>
            </li>
          );
        })}
      </ol>

      {me && active && (
        <div className={`hh-meter${touch ? ' hh-meter--touch' : ''}`} ref={meter} data-testid="hh-meter" aria-hidden>
          <div className="hh-meter__bar">
            <div className="hh-meter__zone" ref={zone} />
            <div className="hh-meter__fill" ref={fill} />
          </div>
          <span className="hh-meter__label">{me.holding ? (me.gold ? 'Gold ball · let go in the gold zone' : 'Let go in the gold zone') : me.move ? 'Hopping…' : 'Next ball…'}</span>
        </div>
      )}

      {active && touch && (
        <>
          <div className="hh-stick">
            <MoveTouch jump={false} />
          </div>
          <div className="hh-actions">
            <ThrowButton gold={!!me?.gold} ready={!!me && canShoot(s, me)} />
          </div>
        </>
      )}
      {active && !touch && <div className="hh-hint">A / D or mouse: aim · hold Space, E or click: charge · let go: throw</div>}
    </div>
  );
}
