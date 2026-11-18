/**
 * Music Box Rhythm HUD: score, combo and multiplier, accuracy, track progress, the judgement
 * pop (Perfect / Good / Miss), the field's scores, and the four lane pads.
 *
 * The pads are always there: big, full-width touch pads on phones (multi-touch, one per lane,
 * lined up under the cylinder's lanes), small key hints (A S J K) with a mouse.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/store';
import { pressVirtual, releaseVirtual } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { matchBus } from '../session';
import type { MinigameSceneProps } from '../types';
import { accuracyOf, multiplierFor, type RhythmState } from './rules';
import { getSong } from './tracks';
import { LANES } from './lanes';
import { lastLocalJudge } from './live';

/** Re-render at a modest rate (HUD only — never per frame). */
function useTicker(hz: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), 1000 / hz);
    return () => window.clearInterval(id);
  }, [hz]);
}

const JUDGE_TEXT = { perfect: 'Perfect!', good: 'Good', miss: 'Miss' } as const;

export function RhythmHud({ getState, contestants, localId }: MinigameSceneProps<RhythmState>) {
  useTicker(10);
  const touch = useGame((s) => s.touchUI);
  const judgeEl = useRef<HTMLDivElement>(null);
  const padEls = useRef<(HTMLButtonElement | null)[]>([]);

  // Judgement pop and pad flashes are written straight to the DOM (they can fire several times a second).
  useEffect(
    () =>
      matchBus.on('event', (e) => {
        if (e.id !== localId || (e.type !== 'judge' && e.type !== 'stray')) return;
        if (e.type === 'judge') {
          lastLocalJudge.judgement = e.judgement as string;
          lastLocalJudge.delta = (e.delta as number | undefined) ?? 0;
          lastLocalJudge.count++;
        }
        const pad = padEls.current[e.lane as number];
        const kind = e.type === 'stray' ? 'stray' : (e.judgement as keyof typeof JUDGE_TEXT);
        if (pad) {
          pad.dataset.flash = kind;
          pad.classList.remove('flash');
          void pad.offsetWidth; // restart the animation
          pad.classList.add('flash');
        }
        const el = judgeEl.current;
        if (!el || kind === 'stray') return;
        const delta = e.delta as number | undefined;
        const hint = kind === 'good' && delta !== undefined ? (delta < 0 ? 'early' : 'late') : kind === 'perfect' ? `+${e.points}` : '';
        el.dataset.kind = kind;
        el.firstElementChild!.textContent = JUDGE_TEXT[kind];
        el.lastElementChild!.textContent = hint;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }),
    [localId],
  );

  const s = getState();
  if (!s) return null;
  const song = getSong(s.track);
  const me = s.players.find((p) => p.id === localId);
  const multi = s.players.length > 1;
  const mult = me ? multiplierFor(me.combo) : 1;
  const progress = Math.max(0, Math.min(1, (s.t - song.leadInMs) / (song.endMs - song.leadInMs)));
  const leadIn = s.t < song.chart[0].t - 900;
  const ranked = multi ? s.players.slice().sort((a, b) => b.score - a.score) : [];

  return (
    <div className="mbr-hud">
      <div className="mbr-score" data-testid="mbr-score">
        <strong>{me?.score ?? 0}</strong>
        <span className={`mbr-combo${mult > 1 ? ' hot' : ''}`} data-testid="mbr-combo">
          <em>×{mult}</em> Combo {me?.combo ?? 0}
        </span>
        <span className="mbr-acc" data-testid="mbr-acc">
          {me ? accuracyOf(me).toFixed(1) : '100.0'}%
        </span>
      </div>

      <div className="mbr-top">
        <div className="sticker mbr-track">
          <strong>{song.title}</strong>
          <span> · {song.difficulty}</span>
        </div>
        <div className="mbr-progress" aria-label="Track progress">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        {leadIn && (
          <div className="mbr-banner" data-testid="mbr-banner">
            {touch ? 'Tap a pad as its pin meets the bright line' : 'Press A S J K as each pin meets the bright line'}
          </div>
        )}
      </div>

      <div className="mbr-judge" ref={judgeEl} data-testid="mbr-judge" aria-live="off">
        <strong />
        <span />
      </div>

      {multi && (
        <div className="mbr-field" data-testid="mbr-field">
          {ranked.map((p) => {
            const c = contestants.find((x) => x.id === p.id);
            if (!c) return null;
            return (
              <div key={p.id} className={`cc-chip mbr-chip${c.isLocal ? ' me' : ''}`}>
                <span className="cc-chip__dot" style={{ background: c.paint.body }} />
                <span className="mbr-chip__name">{c.isLocal ? 'You' : c.name}</span>
                <b>{p.score}</b>
              </div>
            );
          })}
        </div>
      )}

      <div className={`mbr-pads${touch ? ' mbr-pads--touch' : ''}`}>
        {LANES.map((lane, i) => (
          <button
            key={lane.key}
            ref={(el) => {
              padEls.current[i] = el;
            }}
            className="mbr-pad"
            style={{ ['--c' as string]: lane.color }}
            aria-label={`${lane.name} lane`}
            data-testid={`mbr-pad-${i}`}
            tabIndex={-1}
            onPointerDown={(e) => {
              unlockAudio();
              e.currentTarget.setPointerCapture(e.pointerId);
              pressVirtual(lane.action, e.timeStamp);
            }}
            onPointerUp={() => releaseVirtual(lane.action)}
            onPointerCancel={() => releaseVirtual(lane.action)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span>{touch ? lane.name : lane.key}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
