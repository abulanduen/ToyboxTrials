/**
 * DOM side of welcoming players in the Hub: Pipwick's tour card and chat card, the gate greeters'
 * speech bubble, and the Jukebox's track list (shown in the shared info panel).
 * Touch targets are ≥ 56 px and the cards sit inside the safe-area insets.
 */
import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { CHAT_LINES, PIPWICK, TOUR_CAPTIONS, TOUR_LINES, greeterSpeaker, tourLineId, type TourStopId } from '../game/voiceLines';
import { hasRecording, voiceProgress } from '../game/voice';
import { TOUR_STOPS } from '../game/tour';
import { chatChoose, greeterBubble, tourNextPressed, tourRt, tourSkipPressed, useWelcome } from '../game/welcome';
import { HUB_TRACKS, TRACK_OFF } from '../game/musicScore';
import { PALETTE } from '../game/palette';
import { gameById } from '../minigames/registry';
import { sfx, unlockAudio } from '../game/audio';
import { KeyCap, ToyButton } from './common';

/** Pipwick's portrait: a round coral tin songbird in a postman's cap. */
export function PipwickBadge({ size = 64 }: { size?: number }) {
  const P = PALETTE;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="pipwick-badge">
      <circle cx="32" cy="34" r="26" fill={P.cream} />
      <path d="M12 40 q-6 -10 4 -16" fill={P.toyBlue} />
      <ellipse cx="34" cy="40" rx="17" ry="15" fill={P.coral} />
      <ellipse cx="38" cy="44" rx="10" ry="9" fill={P.cream} />
      <circle cx="34" cy="24" r="12" fill={P.coral} />
      <path d="M45 24 l9 3 l-9 3 z" fill={P.honey} />
      <circle cx="39" cy="22" r="3.6" fill={P.white} />
      <circle cx="40.2" cy="22.3" r="1.8" fill={P.ink} />
      <ellipse cx="38" cy="29" rx="2.6" ry="1.4" fill={P.blush} />
      <rect x="23" y="9" width="19" height="6" rx="2" fill={P.inkPurple} />
      <path d="M38 14 h10 l-2 3 h-8 z" fill={P.inkPurple} />
      <circle cx="33" cy="12" r="1.6" fill={P.honey} />
      <path d="M22 40 q-5 -2 -6 -9 q7 1 9 6 z" fill={P.toyBlue} />
    </svg>
  );
}

/**
 * Which caption of a stop's line to show. With Pipwick's recording playing it follows the voice;
 * without sound (the browser hasn't allowed audio yet, or the line is still loading) it runs on the
 * recording's own schedule from when Pipwick lands, so a long line never fills the card at once.
 * Polled a few times a second; React only re-renders when the caption changes. -1 means the line
 * has no recording: show it whole. The index is kept with the stop it belongs to: on the first render
 * after the tour moves on, the old stop's index would point past the end of the new stop's captions.
 */
function useTourCaption(id: TourStopId, phase: string): number {
  const [shown, setShown] = useState<{ id: TourStopId; index: number }>({ id, index: -1 });
  useEffect(() => {
    const caps = TOUR_CAPTIONS[id];
    const at = (t: number) => {
      let i = 0;
      while (i + 1 < caps.length && t >= caps[i + 1].at) i++;
      return i;
    };
    const pick = () => {
      const line = tourLineId(id);
      if (!hasRecording(line)) return -1;
      if (phase !== 'talk') return 0;
      const v = voiceProgress(line);
      if (v.state === 'playing') return at(v.elapsed);
      if (v.state === 'ended') return caps.length - 1;
      return at(tourRt.state.t);
    };
    const update = () => {
      const index = pick();
      setShown((s) => (s.id === id && s.index === index ? s : { id, index }));
    };
    update();
    const timer = window.setInterval(update, 120);
    return () => window.clearInterval(timer);
  }, [id, phase]);
  if (shown.id === id) return shown.index;
  return hasRecording(tourLineId(id)) ? 0 : -1;
}

function TourCard() {
  const stop = useWelcome((s) => s.stop);
  const phase = useWelcome((s) => s.phase);
  const touch = useGame((s) => s.touchUI);
  const id = TOUR_STOPS[stop].id;
  const last = stop === TOUR_STOPS.length - 1;
  const caption = useTourCaption(id, phase);
  return (
    <div className="welcome-card" role="dialog" aria-label="Pipwick's tour" data-testid="tour-card" data-stop={id} data-phase={phase}>
      <div className="welcome-card__who">
        <PipwickBadge />
        <div>
          <strong>{PIPWICK.name}</strong>
          <span className="welcome-card__step">
            {stop + 1} / {TOUR_STOPS.length}
          </span>
        </div>
      </div>
      <p className={`welcome-card__text${phase === 'talk' ? '' : ' welcome-card__text--wait'}`} data-testid="tour-text">
        {caption >= 0 ? TOUR_CAPTIONS[id][caption].text : TOUR_LINES[id]}
      </p>
      <div className="welcome-card__actions">
        {!last && (
          <ToyButton tone="ink" onClick={tourSkipPressed} className="welcome-card__skip" testId="tour-skip">
            Skip tour
          </ToyButton>
        )}
        <ToyButton onClick={tourNextPressed} className="welcome-card__next" testId="tour-next">
          {last ? 'Thanks, Pipwick!' : 'Next'}
        </ToyButton>
      </div>
      {!touch && (
        <span className="welcome-card__keys">
          <KeyCap k="E" /> next{!last && <> · <KeyCap k="Esc" wide /> skip</>}
        </span>
      )}
    </div>
  );
}

function ChatCard() {
  const chat = useWelcome((s) => s.chat);
  const text = chat === 'hello' ? CHAT_LINES.hello : chat === 'bye' ? CHAT_LINES.bye : CHAT_LINES.idle[chat];
  return (
    <div className="welcome-card welcome-card--chat" role="dialog" aria-label="Talking to Pipwick" data-testid="chat-card">
      <div className="welcome-card__who">
        <PipwickBadge />
        <div>
          <strong>{PIPWICK.name}</strong>
        </div>
      </div>
      <p className="welcome-card__text" data-testid="chat-text">
        {text}
      </p>
      <div className="welcome-card__actions welcome-card__actions--three">
        <ToyButton onClick={() => chatChoose('tour')} testId="chat-tour">
          Show me round
        </ToyButton>
        <ToyButton tone="blue" onClick={() => chatChoose('more')} testId="chat-more">
          Tell me something
        </ToyButton>
        <ToyButton tone="ink" onClick={() => chatChoose('bye')} testId="chat-bye">
          Bye!
        </ToyButton>
      </div>
    </div>
  );
}

/** The talking greeter's (or the Tournament Curator's) bubble; the scene (Greeters.tsx) keeps it over their head. */
function GreeterBubble() {
  const game = useWelcome((s) => s.greeter);
  if (!game) return null;
  const g = greeterSpeaker(game);
  const accent = game === 'curator' ? PALETTE.honey : gameById(game).accent;
  return (
    <div
      className="greeter-bubble"
      ref={(el) => {
        greeterBubble.el = el;
      }}
      style={{ ['--accent' as string]: accent, opacity: 0 }}
      data-testid="greeter-bubble"
      data-game={game}
      aria-live="polite"
    >
      <strong>{g.name}</strong>
      <span>{g.line}</span>
    </div>
  );
}

/** Everything welcome-related over the Hub (mounted by the Overlay while playing). */
export function WelcomeUI() {
  const mode = useWelcome((s) => s.mode);
  return (
    <>
      <GreeterBubble />
      {mode === 'tour' && <TourCard />}
      {mode === 'chat' && <ChatCard />}
    </>
  );
}

/** The Jukebox's track list (inside the shared info panel, kind 'jukebox'). */
export function JukeboxList() {
  const current = useGame((s) => s.hubTrack);
  const musicVolume = useGame((s) => s.musicVolume);
  const choose = (id: string) => {
    unlockAudio();
    sfx.crank(HUB_TRACKS.findIndex((t) => t.style.id === id) + 1);
    useGame.getState().set({ hubTrack: id });
  };
  const items: { id: string; name: string; blurb: string }[] = [
    ...HUB_TRACKS.map((t) => ({ id: t.style.id, name: t.name, blurb: t.blurb })),
    { id: TRACK_OFF, name: 'Quiet, please', blurb: 'No music in the Hub. The trials keep theirs.' },
  ];
  return (
    <div className="jukebox" data-testid="jukebox-list">
      <ul className="jukebox__list" data-coach="jukebox-tracks">
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" className={`jukebox__track${current === it.id ? ' jukebox__track--on' : ''}`} onClick={() => choose(it.id)} data-testid={`jukebox-${it.id}`} aria-pressed={current === it.id}>
              <strong>{it.name}</strong>
              <span>{it.blurb}</span>
              {current === it.id && <em className="jukebox__now">{it.id === TRACK_OFF ? 'Chosen' : 'Now playing'}</em>}
            </button>
          </li>
        ))}
      </ul>
      {musicVolume === 0 && <p className="jukebox__hint">Music volume is at zero: turn it up in Settings to hear the jukebox.</p>}
      <p className="jukebox__note" data-coach="jukebox-note">Every track is composed by the jukebox as it plays, so it never quite repeats. Your choice is saved on this device.</p>
    </div>
  );
}
