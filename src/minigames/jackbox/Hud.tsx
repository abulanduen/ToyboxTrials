/**
 * Jack-in-the-Box HUD: the category card, whose turn it is, the answer box, answers said so far,
 * and the field. The answer box sits near the top of the screen so a phone's on-screen keyboard
 * never covers it. It only takes answers while you hold the box.
 */
import { useEffect, useRef, useState } from 'react';
import { unlockAudio } from '../../game/audio';
import { matchBus } from '../session';
import { useTicker } from '../copycat/Hud';
import type { MinigameSceneProps } from '../types';
import type { JackState } from './rules';
import { submitAnswer } from './local';

interface Note {
  text: string;
  tone: 'no' | 'ok';
  v: number;
}

export function JackHud({ getState, contestants, localId }: MinigameSceneProps<JackState>) {
  useTicker(10);
  const s = getState();
  const [text, setText] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const nameOf = (id: string) => (id === localId ? 'You' : (contestants.find((c) => c.id === id)?.name ?? '?'));

  const myTurn = !!s && s.phase === 'live' && s.holder === localId;

  // Feedback on your own answers.
  useEffect(() => {
    let v = 0;
    return matchBus.on('event', (e) => {
      if (e.id !== localId) return;
      if (e.type === 'reject') {
        const msg = e.reason === 'repeat' ? `“${e.display}” was already said${e.by === localId ? ' (by you)' : ''}` : `“${e.text}” doesn't count. Try another!`;
        setNote({ text: msg, tone: 'no', v: ++v });
      } else if (e.type === 'accept') {
        setNote({ text: `${e.display}! Passed on.`, tone: 'ok', v: ++v });
        setText('');
      } else if (e.type === 'pop') {
        setText('');
      }
    });
  }, [localId]);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 1800);
    return () => window.clearTimeout(id);
  }, [note]);

  // Focus the answer box the moment the box reaches you (opens the keyboard on phones that allow it).
  useEffect(() => {
    if (myTurn) input.current?.focus({ preventScroll: true });
  }, [myTurn]);

  if (!s) return null;
  const me = s.players.find((p) => p.id === localId);
  const holderName = nameOf(s.holder);

  let banner = '';
  let tone = 'watch';
  if (s.phase === 'intro') banner = 'Winding up the box…';
  else if (s.phase === 'reveal') {
    banner = s.holder === localId ? 'You start! Think fast…' : `${holderName} starts…`;
    tone = s.holder === localId ? 'go' : 'watch';
  } else if (s.phase === 'live') {
    if (myTurn) {
      banner = 'Your turn! Answer!';
      tone = 'go';
    } else banner = me?.alive ? `${holderName} has the box…` : `Out! ${holderName} has the box…`;
    if (!me?.alive) tone = 'out';
  } else if (s.phase === 'popped') {
    const popped = s.players.find((p) => p.outRound === s.round && !p.forfeit);
    banner = popped?.id === localId ? 'POP! You’re out!' : `POP! ${popped ? nameOf(popped.id) : ''} is out!`;
    tone = popped?.id === localId ? 'out' : 'good';
  } else banner = me?.alive ? 'Last toy standing!' : 'Game over!';

  const send = () => {
    const t = text.trim();
    if (!t || !myTurn) return;
    unlockAudio();
    submitAnswer(t);
  };

  const showPrompt = s.phase !== 'intro';
  const canType = me?.alive && (s.phase === 'reveal' || s.phase === 'live');

  return (
    <div className="jb-hud">
      <div className="jb-top">
        {showPrompt && (
          <div className="jb-card" key={`cat-${s.round}`} data-testid="jb-category">
            <span className="jb-card__round">Round {s.round}</span>
            <strong>{s.category.prompt}</strong>
          </div>
        )}
        <div className={`cc-banner cc-banner--${tone} jb-banner`} key={`${s.phase}-${s.round}-${s.holder}`} data-testid="jb-banner">
          {banner}
        </div>
        {canType && (
          <form
            className={`jb-answer${myTurn ? ' on' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={input}
              data-testid="jb-input"
              type="text"
              inputMode="text"
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={48}
              placeholder={myTurn ? 'Type an answer…' : 'Wait for the box…'}
              aria-label="Your answer"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={!myTurn || !text.trim()} data-testid="jb-send">
              Crank!
            </button>
          </form>
        )}
        {note && (
          <div className={`jb-note jb-note--${note.tone}`} key={note.v} data-testid="jb-note">
            {note.text}
          </div>
        )}
      </div>

      {s.said.length > 0 && (s.phase === 'live' || s.phase === 'popped') && (
        <div className="jb-said" aria-label="Answers said this round">
          {s.said.slice(-14).map((x) => (
            <span key={x.id} className={x.by === localId ? 'me' : ''}>
              {x.display}
            </span>
          ))}
        </div>
      )}

      <div className="cc-field jb-field">
        {s.seats.map((id) => {
          const c = contestants.find((x) => x.id === id);
          const p = s.players.find((x) => x.id === id)!;
          const st = !p.alive ? 'out' : s.holder === id && (s.phase === 'live' || s.phase === 'reveal') ? 'holding' : '';
          return (
            <div key={id} className={`cc-chip ${st}${id === localId ? ' me' : ''}`}>
              <span className="cc-chip__dot" style={{ background: c?.paint.body }} />
              {nameOf(id)}
              <em>{p.answers}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}
