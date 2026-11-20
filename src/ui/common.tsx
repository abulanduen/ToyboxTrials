/** Shared toy-world UI building blocks used by every screen. */
import { onlineAvailable } from '../net/client';
import { useEffect, useRef } from 'react';
import { useGame, type Quality } from '../game/store';
import { sfx, unlockAudio } from '../game/audio';

export type Tone = 'honey' | 'coral' | 'blue' | 'sage' | 'ink';

export function ToyButton({
  children,
  onClick,
  tone = 'honey',
  autoFocus,
  disabled,
  className = '',
  testId,
  armDelay = 0,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: Tone;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  testId?: string;
  /** Ignore activation for this many ms after mounting (tap-through protection for screens that
   *  pop up under a player's finger, e.g. results appearing while they're still tapping pads). */
  armDelay?: number;
  /** `submit` inside a form (sign-in), so Enter and password managers work. */
  type?: 'button' | 'submit';
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mountedAt = useRef(performance.now());
  const pressedHere = useRef(false);
  // Focus for keyboard players without scrolling the panel (native autoFocus scrolls short
  // phone-landscape panels to the bottom and hides their titles).
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <button
      ref={ref}
      type={type}
      data-testid={testId}
      className={`toy-btn toy-btn--${tone} ${className}`}
      disabled={disabled}
      onMouseEnter={() => sfx.tick()}
      onPointerDown={() => {
        pressedHere.current = true;
      }}
      onClick={(e) => {
        // Tap-through guard: a pointer click only counts if the press also began on this button.
        // Otherwise a finger still held down from the previous screen (e.g. a long press on Play)
        // would "click" whatever pops up under it when lifted. Keyboard clicks have detail 0.
        const fromPointer = e.detail > 0;
        const began = pressedHere.current;
        pressedHere.current = false;
        if (armDelay && fromPointer && !began) return;
        if (performance.now() - mountedAt.current < armDelay) return;
        unlockAudio();
        sfx.click();
        onClick();
      }}
    >
      <span>{children}</span>
    </button>
  );
}

export function KeyCap({ k, wide }: { k: string; wide?: boolean }) {
  return <kbd className={`keycap${wide ? ' keycap--wide' : ''}`}>{k}</kbd>;
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, testId }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; testId?: string }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} onPointerUp={() => sfx.tick()} data-testid={testId} />
    </label>
  );
}

/** The settings form, shared by the pause menu and the main-menu Settings sheet. */
export function SettingsForm() {
  const s = useGame();
  return (
    <div className="pause__grid">
      <Slider label="Master volume" value={s.masterVolume} onChange={(v) => s.set({ masterVolume: v })} />
      <Slider label="Effects volume" value={s.sfxVolume} onChange={(v) => s.set({ sfxVolume: v })} />
      <Slider label="Music volume" value={s.musicVolume} onChange={(v) => s.set({ musicVolume: v })} testId="setting-music" />
      <Slider label="Voice volume" value={s.voiceVolume} onChange={(v) => s.set({ voiceVolume: v })} testId="setting-voice" />
      <Slider label={s.touchUI ? 'Look sensitivity' : 'Mouse sensitivity'} value={s.mouseSensitivity} min={0.4} max={2} step={0.1} onChange={(v) => s.set({ mouseSensitivity: v })} />
      <div className="setting">
        <span>Visual quality</span>
        <div className="segmented">
          {(['low', 'balanced', 'high'] as Quality[]).map((q) => (
            <button
              key={q}
              className={s.quality === q ? 'on' : ''}
              onClick={() => {
                sfx.click();
                // A tier picked by hand starts from scratch: the guard's step-downs were for the old one.
                s.set({ quality: q, perfStep: 0 });
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      <label className="setting setting--check">
        <input type="checkbox" checked={s.invertY} onChange={(e) => s.set({ invertY: e.target.checked })} />
        <span>Invert camera Y</span>
      </label>
      <label className="setting setting--check">
        <input type="checkbox" checked={s.autoQuality} onChange={(e) => s.set({ autoQuality: e.target.checked, ...(e.target.checked ? {} : { perfStep: 0 }) })} data-testid="setting-auto-quality" />
        <span>Lower quality automatically if the game runs slowly</span>
      </label>
      <label className="setting setting--check">
        <input type="checkbox" checked={s.showFps} onChange={(e) => s.set({ showFps: e.target.checked })} />
        <span>Show frame rate</span>
      </label>
      <label className="setting setting--check">
        <input type="checkbox" checked={s.tutorials} onChange={(e) => s.set({ tutorials: e.target.checked })} data-testid="setting-tutorials" />
        <span>Game tutorials</span>
      </label>
      {onlineAvailable() && (
        <label className="setting setting--check">
          <input type="checkbox" checked={s.autoOnline} onChange={(e) => s.set({ autoOnline: e.target.checked })} data-testid="setting-auto-online" />
          <span>Join the online Hub automatically</span>
        </label>
      )}
      {onlineAvailable() && (
        <>
          <label className="setting setting--check">
            <input type="checkbox" checked={s.textChat} onChange={(e) => s.set({ textChat: e.target.checked })} data-testid="setting-text-chat" />
            <span>Text chat (online Hub)</span>
          </label>
          {/* Proximity voice chat (src/net/voiceChat.ts): hearing on by default, the mic only on request. */}
          <label className="setting setting--check">
            <input type="checkbox" checked={s.voiceHear} onChange={(e) => s.set({ voiceHear: e.target.checked })} data-testid="setting-voice-hear" />
            <span>Hear voice chat</span>
          </label>
          <Slider label="Voice chat volume" value={s.voiceChatVolume} onChange={(v) => s.set({ voiceChatVolume: v })} testId="setting-voice-chat" />
          <div className="setting">
            <span>Mic mode</span>
            <div className="segmented" data-testid="setting-mic-mode">
              {(['ptt', 'open'] as const).map((m) => (
                <button
                  key={m}
                  className={s.micMode === m ? 'on' : ''}
                  data-mode={m}
                  aria-pressed={s.micMode === m}
                  onClick={() => {
                    sfx.click();
                    s.set({ micMode: m });
                  }}
                >
                  {m === 'ptt' ? (s.touchUI ? 'Push to talk' : 'Push to talk (V)') : 'Always on'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Cardboard sheet with masking tape — the standard modal container. */
export function CardboardSheet({ title, icon, children, className = '', onBackdrop }: { title: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; className?: string; onBackdrop?: () => void }) {
  return (
    <div className="modal-layer" onPointerDown={(e) => onBackdrop && e.target === e.currentTarget && onBackdrop()}>
      <div className={`cardboard-panel ${className}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="tape tape--l" />
        <div className="tape tape--r" />
        <h2>
          {icon}
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
