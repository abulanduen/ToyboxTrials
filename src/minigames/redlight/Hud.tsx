/**
 * Red Light, Green Light HUD: the signal (also shown by the Signalman and the rail lamps, but
 * never by colour alone — the word changes too), the clock, a progress strip for the whole field,
 * and on touch devices the joystick and Jump button.
 */
import { useEffect, useState } from 'react';
import { matchBus } from '../session';
import { useTicker } from '../copycat/Hud';
import type { MinigameSceneProps } from '../types';
import { MoveTouch } from '../shared/MoveTouch';
import { RaceClock, RaceTrack, ordinal } from '../shared/RaceHud';
import { progressOf, type RlglState } from './rules';

export function RlglHud({ getState, contestants, localId }: MinigameSceneProps<RlglState>) {
  useTicker(15);
  const s = getState();
  const [note, setNote] = useState<{ text: string; v: number } | null>(null);
  const [place, setPlace] = useState(0);

  useEffect(() => {
    let v = 0;
    return matchBus.on('event', (e) => {
      if (e.type === 'go' && e.first) setPlace(0); // a new race
      if (e.id !== localId) return;
      if (e.type === 'caught') setNote({ text: 'Caught moving on STOP! You’re out.', v: ++v });
      if (e.type === 'finish') setPlace(e.order as number);
    });
  }, [localId]);
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 2200);
    return () => window.clearTimeout(id);
  }, [note]);

  if (!s) return <MoveTouch />;
  const me = s.players.find((p) => p.id === localId);
  const closing = s.endAt < s.config.limitMs;

  let signal = 'STOP!';
  let tone: 'go' | 'warn' | 'stop' | 'done' = 'stop';
  if (me?.finished) {
    signal = place ? `Home ${ordinal(place)}!` : 'Home!';
    tone = 'done';
  } else if (me?.out) signal = 'Out!';
  else if (s.phase === 'intro') signal = 'Ready…';
  else if (s.phase === 'go') {
    signal = 'GO!';
    tone = 'go';
  } else if (s.phase === 'warn') {
    signal = 'It’s turning…';
    tone = 'warn';
  } else if (s.phase === 'stop') signal = 'STOP!';
  else signal = 'Race over!';

  return (
    <div className="mv-hud">
      <div className="mv-top">
        <div className="mv-row">
          <div className={`rl-signal rl-signal--${tone}`} data-testid="rl-signal" data-phase={s.phase} key={`${tone}-${signal}`}>
            <span className="rl-signal__lamp" aria-hidden />
            {signal}
          </div>
          <RaceClock ms={s.endAt - s.t} urgent={closing} />
        </div>
        <RaceTrack
          entries={s.players.map((p) => {
            const c = contestants.find((x) => x.id === p.id);
            return {
              id: p.id,
              name: p.id === localId ? 'You' : (c?.name ?? '?'),
              colour: c?.paint.body ?? '#fff',
              progress: progressOf(s, p),
              me: p.id === localId,
              state: p.finished ? 'done' : p.out ? 'hurt' : '',
            };
          })}
        />
        {note && (
          <div className="jb-note jb-note--no mv-note" key={note.v} data-testid="rl-note">
            {note.text}
          </div>
        )}
        {closing && !me?.finished && s.phase !== 'over' && <div className="mv-note mv-note--hurry">Someone’s home! Hurry!</div>}
      </div>
      <MoveTouch />
    </div>
  );
}
