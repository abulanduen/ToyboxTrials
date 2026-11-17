/** Copycat Conductor HUD: phase banner, sequence pips, timer, contestant strip, touch pads. */
import { useEffect, useState } from 'react';
import { useGame } from '../../game/store';
import { pressVirtual, releaseVirtual, type Action } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import type { MinigameSceneProps } from '../types';
import { inputDeadline, lengthFor, type CopycatState } from './rules';
import { INSTRUMENTS } from './Scene';

const SLOT_ACTION: Action[] = ['slot1', 'slot2', 'slot3', 'slot4'];

/** Re-render at a modest rate (HUD only — never per frame). */
export function useTicker(hz = 12) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), 1000 / hz);
    return () => window.clearInterval(id);
  }, [hz]);
}

export function CopycatHud({ getState, contestants, localId }: MinigameSceneProps<CopycatState>) {
  useTicker(12);
  const touch = useGame((s) => s.touchUI);
  const s = getState();
  if (!s) return null;
  const me = s.players.find((p) => p.id === localId);
  const len = lengthFor(s);
  const multi = s.players.length > 1;

  let banner = '';
  let tone = 'watch';
  if (s.phase === 'intro') banner = 'The bandleader takes a bow…';
  else if (s.phase === 'demo') banner = 'Watch closely…';
  else if (s.phase === 'turn') {
    banner = me?.alive ? 'Your turn!' : 'Their turn…';
    tone = 'go';
  } else if (s.phase === 'input') {
    if (!me?.alive) banner = 'Out! Watching the others…';
    else if (me.finished) banner = multi ? 'Nailed it! Waiting for the others…' : 'Nailed it!';
    else banner = 'Repeat it!';
    tone = me?.alive ? (me.finished ? 'good' : 'go') : 'out';
  } else if (s.phase === 'judge') {
    banner = me?.alive ? (multi ? 'Round clear!' : 'Round clear! One note longer…') : 'Out!';
    tone = me?.alive ? 'good' : 'out';
  } else banner = 'Curtain!';

  // Pips: demo shows how many notes have played; input shows your progress.
  const lit = s.phase === 'demo' ? s.demoIndex : me ? me.progress : 0;
  const showColours = s.phase !== 'demo'; // don't give away the sequence colours during the demo
  const timeFrac = s.phase === 'input' && me?.alive && !me.finished ? Math.max(0, 1 - s.phaseT / inputDeadline(s)) : 0;

  return (
    <div className="cc-hud">
      <div className="cc-top">
        <div className="cc-round sticker">
          Round <strong>{s.round}</strong>
          <span>· {len} notes</span>
        </div>
        <div className={`cc-banner cc-banner--${tone}`} key={`${s.phase}-${s.round}`}>
          {banner}
        </div>
        <div className="cc-pips" aria-label={`${lit} of ${len}`}>
          {Array.from({ length: len }, (_, i) => {
            const on = i < lit;
            const colour = showColours && on ? INSTRUMENTS[s.sequence[i]].color : undefined;
            return <span key={i} className={`cc-pip${on ? ' on' : ''}`} style={colour ? { background: colour } : undefined} />;
          })}
        </div>
        <div className="cc-timer" style={{ opacity: timeFrac > 0 ? 1 : 0 }}>
          <div style={{ width: `${timeFrac * 100}%` }} />
        </div>
      </div>

      {multi && (
        <div className="cc-field">
          {contestants.map((c) => {
            const p = s.players.find((x) => x.id === c.id);
            const st = !p ? '' : !p.alive ? 'out' : p.finished ? 'done' : '';
            return (
              <div key={c.id} className={`cc-chip ${st}${c.isLocal ? ' me' : ''}`}>
                <span className="cc-chip__dot" style={{ background: c.paint.body }} />
                {c.isLocal ? 'You' : c.name}
              </div>
            );
          })}
        </div>
      )}

      {touch && (
        <div className="cc-pads">
          {INSTRUMENTS.map((ins, i) => (
            <button
              key={ins.key}
              className="cc-pad"
              style={{ ['--c' as string]: ins.color }}
              aria-label={ins.name}
              onPointerDown={(e) => {
                unlockAudio();
                e.currentTarget.setPointerCapture(e.pointerId);
                pressVirtual(SLOT_ACTION[i]);
              }}
              onPointerUp={() => releaseVirtual(SLOT_ACTION[i])}
              onPointerCancel={() => releaseVirtual(SLOT_ACTION[i])}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="cc-pad__name">{ins.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
