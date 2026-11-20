/**
 * Proximity voice chat UI (online Hub only): the mic button at the top right of the HUD, the mic
 * mark on other players' name tags, and the Voice chat section of the pause menu (who has a mic
 * on, per-player mute, turning your own mic off). The talking rings are written by the frame loop
 * (src/net/voiceChat.ts) as CSS variables and classes, never through React state.
 */
import { useEffect, useRef } from 'react';
import { PALETTE } from '../game/palette';
import { useGame } from '../game/store';
import { holdVirtual } from '../game/input';
import { unlockAudio } from '../game/audio';
import { useNet } from '../net/store';
import { remotes } from '../net/remotes';
import { player } from '../game/player';
import { closeMic, micButtonActivate, openMic, toggleMute, useVoice, voiceEls } from '../net/voiceChat';
import { ToyButton } from './common';

/** A code-drawn microphone: capsule, cradle and stand; `off` adds a slash. */
export function MicIcon({ size = 28, off = false, color = PALETTE.ink }: { size?: number; off?: boolean; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="mic-icon">
      <rect x="17" y="5" width="14" height="24" rx="7" fill={color} />
      <path d="M11 22a13 13 0 0 0 26 0" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M24 35v7M16 42h16" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      {off && <path d="M9 7l30 34" stroke={PALETTE.cream} strokeWidth="7" strokeLinecap="round" />}
      {off && <path d="M9 7l30 34" stroke={PALETTE.coral} strokeWidth="3.6" strokeLinecap="round" />}
    </svg>
  );
}

/**
 * The mic button. Push to talk: hold it (or V) to talk. Always on: tap it (or V) to switch the mic
 * on and off. The first press is the only thing that ever asks for the microphone.
 */
export function VoiceMicButton() {
  const online = useNet((s) => s.status === 'online');
  const mic = useVoice((s) => s.mic);
  const blocked = useVoice((s) => s.blocked);
  const mode = useGame((s) => s.micMode);
  const touch = useGame((s) => s.touchUI);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    voiceEls.mic = ref.current;
    return () => {
      if (voiceEls.mic === ref.current) voiceEls.mic = null;
      holdVirtual('talk', false);
    };
  }, [online]);
  if (!online) return null;
  const release = () => holdVirtual('talk', false);
  const ptt = mode === 'ptt';
  const label =
    mic === 'off' ? (blocked ? 'Microphone blocked: press to try again' : 'Turn on voice chat (asks for your microphone)') : mic === 'asking' ? 'Waiting for microphone permission' : ptt ? `Hold to talk${touch ? '' : ' (or hold V)'}` : 'Mic on: press to turn it off';
  return (
    <button
      ref={ref}
      className={`voice-mic voice-mic--${mic}${blocked && mic === 'off' ? ' voice-mic--blocked' : ''}${ptt ? ' voice-mic--ptt' : ''}`}
      data-testid="voice-mic"
      data-mic={mic}
      aria-label={label}
      title={label}
      aria-pressed={mic === 'on'}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        unlockAudio();
        e.currentTarget.setPointerCapture(e.pointerId);
        holdVirtual('talk', true);
        // Ask inside the press itself (some browsers only show the prompt for a user gesture).
        if (useVoice.getState().mic === 'off') void openMic();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onClick={(e) => {
        if (e.detail === 0) micButtonActivate(); // keyboard (Enter/Space); pointers went through the hold above
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="voice-mic__ring" aria-hidden />
      <MicIcon size={30} off={mic === 'off'} color={mic === 'on' ? PALETTE.ink : PALETTE.inkPurple} />
      {!touch && ptt && <kbd className="voice-mic__key">V</kbd>}
    </button>
  );
}

/** The voice mark on a player's name tag: a mic when theirs is on, a ring while they talk, a slash when muted. */
export function VoiceTagMark({ id }: { id: string }) {
  const on = useVoice((s) => s.micOn.includes(id));
  const muted = useVoice((s) => s.muted.includes(id));
  return (
    <span className={`voice-tag${on ? ' voice-tag--on' : ''}${muted ? ' voice-tag--muted' : ''}`} data-voice={on ? (muted ? 'muted' : 'on') : 'off'} style={on || muted ? undefined : { display: 'none' }}>
      <span className="voice-tag__ring" />
      <MicIcon size={14} off={muted} color={PALETTE.ink} />
    </span>
  );
}

/** Pause menu: voice chat players (nearest first) with Mute, and your own mic. */
export function PauseVoice() {
  const online = useNet((s) => s.status === 'online');
  const players = useNet((s) => s.players);
  const selfId = useNet((s) => s.selfId);
  const mic = useVoice((s) => s.mic);
  const micOn = useVoice((s) => s.micOn);
  const muted = useVoice((s) => s.muted);
  const hear = useGame((s) => s.voiceHear);
  if (!online) return null;
  const dist = (id: string) => {
    const at = remotes.get(id)?.buf.latest();
    return at ? Math.hypot(at.x - player.pos.x, at.z - player.pos.z) : Infinity;
  };
  const others = players.filter((p) => p.id !== selfId && (micOn.includes(p.id) || muted.includes(p.id))).sort((a, b) => dist(a.id) - dist(b.id));
  return (
    <div className="pause__voice" data-testid="pause-voice">
      <div className="pause__voice-head">
        <span>
          <strong>Voice chat</strong> · {hear ? 'you hear toys near you whose mic is on' : 'hearing is off (Settings)'}
        </span>
        {mic === 'on' && (
          <ToyButton tone="ink" onClick={() => closeMic()} testId="voice-mic-off">
            Turn my mic off
          </ToyButton>
        )}
      </div>
      {others.length === 0 ? (
        <p className="pause__voice-none">Nobody here has their mic on.</p>
      ) : (
        <ul className="pause__voice-list">
          {others.map((p) => {
            const isMuted = muted.includes(p.id);
            return (
              <li key={p.id} className="pause__voice-row">
                <MicIcon size={20} off={isMuted || !micOn.includes(p.id)} />
                <span className="pause__voice-name">{p.name}</span>
                <button className={`pause__voice-mute${isMuted ? ' is-on' : ''}`} data-testid={`voice-mute-${p.id}`} aria-pressed={isMuted} onClick={() => toggleMute(p.id)}>
                  {isMuted ? 'Unmute' : 'Mute'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="pause__voice-note">Voice goes straight between players' browsers (the server only introduces them), so they see each other's network address. Nothing is recorded.</p>
    </div>
  );
}
