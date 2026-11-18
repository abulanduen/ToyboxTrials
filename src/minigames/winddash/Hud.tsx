/**
 * Wind-Up Dash HUD: a banner for what just happened to you, the clock, the progress strip (with
 * the four obstacles marked), and on touch devices the joystick and Jump button.
 */
import { useEffect, useState } from 'react';
import { matchBus } from '../session';
import { useTicker } from '../copycat/Hud';
import type { MinigameSceneProps } from '../types';
import { MoveTouch } from '../shared/MoveTouch';
import { RaceClock, RaceTrack, ordinal } from '../shared/RaceHud';
import { inJam, onRuler, progressOf, type DashState } from './rules';

export function DashHud({ getState, contestants, localId }: MinigameSceneProps<DashState>) {
  useTicker(15);
  const s = getState();
  const [place, setPlace] = useState(0);
  const [flash, setFlash] = useState<{ text: string; v: number } | null>(null);

  useEffect(() => {
    let v = 0;
    return matchBus.on('event', (e) => {
      if (e.type === 'start') setPlace(0);
      if (e.id !== localId) return;
      if (e.type === 'snap') setFlash({ text: 'Snapped!', v: ++v });
      if (e.type === 'spring') setFlash({ text: 'Boing!', v: ++v });
      if (e.type === 'finish') setPlace(e.order as number);
    });
  }, [localId]);
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1300);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (!s) return <MoveTouch />;
  const me = s.players.find((p) => p.id === localId);
  const closing = s.endAt < s.config.limitMs;
  const stuck = !!me && !me.finished && me.m.grounded && inJam(s.course, me.m.z) && !onRuler(s.course, me.m.x, me.m.z);
  const c = s.config;
  const at = (z: number) => (c.startZ - z) / (c.startZ - c.finishZ);

  let banner = 'Dash!';
  let tone = 'go';
  if (me?.finished) {
    banner = place ? `Home ${ordinal(place)}!` : 'Home!';
    tone = 'good';
  } else if (s.phase === 'intro') {
    banner = 'Ready…';
    tone = 'watch';
  } else if (s.phase === 'over') {
    banner = 'Race over!';
    tone = 'watch';
  } else if (me && me.stunMs > 0) {
    banner = 'Snapped!';
    tone = 'out';
  } else if (flash) banner = flash.text;
  else if (stuck) {
    banner = 'Sticky! Find the ruler';
    tone = 'out';
  } else if (closing) banner = 'Someone’s home! Hurry!';

  return (
    <div className="mv-hud">
      <div className="mv-top">
        <div className="mv-row">
          <div className={`cc-banner cc-banner--${tone} wd-banner`} key={banner} data-testid="wd-banner">
            {banner}
          </div>
          <RaceClock ms={s.endAt - s.t} urgent={closing} />
        </div>
        <RaceTrack
          marks={[at(s.course.rows[1].z), at(s.course.wall.z), at((s.course.jam.z0 + s.course.jam.z1) / 2), at(s.course.jaws[2].z)]}
          entries={s.players.map((p) => {
            const con = contestants.find((x) => x.id === p.id);
            return {
              id: p.id,
              name: p.id === localId ? 'You' : (con?.name ?? '?'),
              colour: con?.paint.body ?? '#fff',
              progress: progressOf(s, p),
              me: p.id === localId,
              state: p.finished ? 'done' : p.stunMs > 0 ? 'hurt' : '',
            };
          })}
        />
      </div>
      <MoveTouch />
    </div>
  );
}
