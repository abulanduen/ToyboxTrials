/** Shared toy-world UI building blocks used by every screen. */
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
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mountedAt = useRef(performance.now());
  // Focus for keyboard players without scrolling the panel (native autoFocus scrolls short
  // phone-landscape panels to the bottom and hides their titles).
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <button
      ref={ref}
      data-testid={testId}
      className={`toy-btn toy-btn--${tone} ${className}`}
      disabled={disabled}
      onMouseEnter={() => sfx.tick()}
      onClick={() => {
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

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} onPointerUp={() => sfx.tick()} />
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
                s.set({ quality: q });
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
        <input type="checkbox" checked={s.showFps} onChange={(e) => s.set({ showFps: e.target.checked })} />
        <span>Show frame rate</span>
      </label>
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
