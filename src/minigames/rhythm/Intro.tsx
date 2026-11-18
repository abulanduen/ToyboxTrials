/**
 * Music Box Rhythm — options on the intro card: the track (practice only) and the latency
 * calibration (a ± stepper, plus a "tap to the beat" test that measures it).
 *
 * The offset is "how late my taps arrive compared with the music I hear": it bundles audio
 * output latency, input latency and the player's own habit, and is subtracted from every press
 * before judging. It is stored with the other persisted settings.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/store';
import { pressStamp } from '../../game/input';
import { music, sfx, unlockAudio } from '../../game/audio';
import { TRACKS } from './tracks';
import { OFFSET_MAX, OFFSET_MIN, clampOffset, useRhythmPrefs } from './live';
import { TAP_TEST, offsetFromTaps } from './timing';


const fmt = (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${Math.abs(ms)} ms`;

export function RhythmIntro({ practice }: { practice: boolean }) {
  const track = useRhythmPrefs((s) => s.track);
  const setTrack = useRhythmPrefs((s) => s.setTrack);
  const offset = useGame((s) => s.rhythmOffsetMs);
  const setOffset = (ms: number) => useGame.getState().set({ rhythmOffsetMs: clampOffset(ms) });
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState('');

  return (
    <div className="intro-options mbr-intro">
      {practice ? (
        <div className="mbr-tracks" role="radiogroup" aria-label="Track">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={track === t.id}
              className={`mbr-trackcard${track === t.id ? ' on' : ''}`}
              data-testid={`mbr-track-${t.id}`}
              onClick={() => (sfx.click(), setTrack(t.id))}
            >
              <strong>{t.title}</strong>
              <span>
                <span className={`mbr-diff mbr-diff--${t.difficulty}`}>{t.difficulty}</span> {t.bpm} bpm
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mbr-note">The track is drawn with the trial. Everyone plays the same one.</p>
      )}

      <div className="setting mbr-offset">
        <span>Timing offset</span>
        <div className="mbr-stepper">
          <button aria-label="Earlier" data-testid="mbr-offset-down" disabled={offset <= OFFSET_MIN} onClick={() => (sfx.tick(), setNote(''), setOffset(offset - 5))}>
            −
          </button>
          <output data-testid="mbr-offset">{fmt(offset)}</output>
          <button aria-label="Later" data-testid="mbr-offset-up" disabled={offset >= OFFSET_MAX} onClick={() => (sfx.tick(), setNote(''), setOffset(offset + 5))}>
            +
          </button>
          <button className="mbr-test" data-testid="mbr-taptest" onClick={() => (setNote(''), setTesting(true))} disabled={testing}>
            Tap test
          </button>
        </div>
      </div>
      {testing ? (
        <TapTest
          onDone={(ms, taps) => {
            setTesting(false);
            if (ms === null) setNote(`Only ${taps} tap${taps === 1 ? '' : 's'} landed on the beat. Try again.`);
            else {
              setOffset(ms);
              setNote(`Set to ${fmt(ms)} from your taps.`);
            }
          }}
        />
      ) : (
        <p className="mbr-note" data-testid="mbr-offset-note">
          {note || 'Hits keep reading "late"? Raise the offset, or run the tap test.'}
        </p>
      )}
    </div>
  );
}

/** Twelve ticks: listen to four, tap along with eight. Works without sound (follow the dot). */
function TapTest({ onDone }: { onDone: (offsetMs: number | null, taps: number) => void }) {
  const dot = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const taps = useRef<number[]>([]);
  const t0 = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;
  const tap = (eventTime?: number) => {
    taps.current.push(pressStamp(eventTime));
    dot.current?.classList.add('tapped');
    window.setTimeout(() => dot.current?.classList.remove('tapped'), 90);
  };

  useEffect(() => {
    unlockAudio();
    taps.current = [];
    let raf = 0;
    let scheduled = false;
    const start = performance.now() + 700;
    t0.current = start;
    const total = TAP_TEST.listenBeats + TAP_TEST.tapBeats;
    const schedule = () => {
      // The context may still be resuming on the first frames after the gesture.
      const at = music.now();
      if (at === null) return;
      scheduled = true;
      music.setActive(true);
      const now = performance.now();
      for (let i = 0; i < total; i++) {
        const when = at + (start + i * TAP_TEST.beatMs - now) / 1000;
        if (when > at) music.tick(when, i % 4 === 0);
      }
    };
    const loop = () => {
      const t = performance.now() - start;
      if (!scheduled && t < 0) schedule();
      const beat = Math.floor(t / TAP_TEST.beatMs);
      const phase = t < 0 ? 1 : (t % TAP_TEST.beatMs) / TAP_TEST.beatMs;
      if (dot.current) dot.current.style.transform = `scale(${1 + 0.55 * Math.max(0, 1 - phase * 3.2)})`;
      if (label.current) {
        label.current.textContent =
          t < 0 ? 'Get ready…' : beat < TAP_TEST.listenBeats ? `Listen… ${TAP_TEST.listenBeats - beat}` : beat < total ? `Tap along! ${total - beat}` : 'Done';
      }
      if (t > total * TAP_TEST.beatMs + 250) {
        done.current(offsetFromTaps(taps.current, start), taps.current.filter((x) => x >= start + (TAP_TEST.listenBeats - 0.5) * TAP_TEST.beatMs).length);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Any lane key or Space taps; keep them away from the Start button while the test runs.
    const onKey = (e: KeyboardEvent) => {
      if (!['Space', 'Enter', 'KeyA', 'KeyS', 'KeyJ', 'KeyK'].includes(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) tap(e.timeStamp);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      if (scheduled) music.setActive(false);
    };
  }, []);

  return (
    <div className="mbr-taptest">
      <button
        className="mbr-tapbtn"
        data-testid="mbr-tap"
        onPointerDown={(e) => {
          e.preventDefault();
          tap(e.timeStamp);
        }}
      >
        <span className="mbr-tapdot" ref={dot} />
        <span ref={label}>Get ready…</span>
      </button>
      <p className="mbr-note">Tap here (or press Space) in time with the ticks{music.now() === null ? ' — no sound yet, so follow the dot' : ''}.</p>
    </div>
  );
}
