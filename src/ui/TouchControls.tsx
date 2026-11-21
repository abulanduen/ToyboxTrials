/**
 * On-screen touch controls for the hub, styled as toy parts.
 *
 * Left zone  : floating joystick (felt pad + wooden knob). Push to the rim to run.
 * Right side : JUMP (always) and an INTERACT button that appears with a prompt.
 * Elsewhere  : drag on the scene to look around (handled by PlayerController).
 *
 * Everything feeds the shared action layer in src/game/input.ts, so gameplay code is
 * device-agnostic. Minigames declare their own touch layout (see src/minigames/types.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { pressVirtual, releaseVirtual, setStick, tapVirtual, type Action } from '../game/input';
import { unlockAudio } from '../game/audio';
import { useGame } from '../game/store';
import { GearIcon } from './icons';
import { TouchEmotes } from './OnlineUI';
import { useHoldToShoot } from '../minigames/shared/holdToShoot';

const STICK_RADIUS = 52; // px the knob can travel

/**
 * `zone`: `thumb` (default) is the hub's bottom-left thumb zone, where the stick rests visibly.
 * `half` makes the whole bottom half of the screen the zone: the stick appears under the finger
 * wherever it lands, drags from there, and hides again on release. Buttons painted above the zone
 * (later in the DOM) still take their own taps.
 */
export function Joystick({ zone: mode = 'thumb' }: { zone?: 'thumb' | 'half' }) {
  const zone = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const [engaged, setEngaged] = useState(false);

  const place = (ox: number, oy: number) => {
    const z = zone.current!.getBoundingClientRect();
    base.current!.style.left = `${ox - z.left}px`;
    base.current!.style.top = `${oy - z.top}px`;
  };
  const moveKnob = (dx: number, dy: number) => {
    if (!knob.current) return;
    knob.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };
  const reset = () => {
    active.current = null;
    setStick(0, 0);
    moveKnob(0, 0);
    if (base.current) {
      base.current.style.left = '';
      base.current.style.top = '';
    }
    setEngaged(false);
  };

  // On unmount only release the stick: refs are already detached, so never touch the DOM here.
  useEffect(() => () => setStick(0, 0), []);

  return (
    <div
      ref={zone}
      className={`touch-stick-zone${mode === 'half' ? ' touch-stick-zone--half' : ''}`}
      data-zone={mode}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (active.current) return;
        unlockAudio();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
        place(e.clientX, e.clientY);
        setEngaged(true);
      }}
      onPointerMove={(e) => {
        const a = active.current;
        if (!a || a.id !== e.pointerId) return;
        let dx = e.clientX - a.ox;
        let dy = e.clientY - a.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) {
          dx = (dx / d) * STICK_RADIUS;
          dy = (dy / d) * STICK_RADIUS;
        }
        moveKnob(dx, dy);
        // Small dead-zone so resting thumbs don't creep; magnitude rescaled to 0..1 beyond it.
        const m = Math.min(1, d / STICK_RADIUS);
        const mag = m < 0.12 ? 0 : (m - 0.12) / 0.88;
        const cd = Math.hypot(dx, dy); // length after clamping, for the unit direction
        if (cd < 1e-3 || mag === 0) setStick(0, 0);
        else setStick((dx / cd) * mag, (-dy / cd) * mag); // screen-up = forward
      }}
      onPointerUp={(e) => active.current?.id === e.pointerId && reset()}
      onPointerCancel={(e) => active.current?.id === e.pointerId && reset()}
    >
      <div ref={base} className={`touch-stick${engaged ? ' touch-stick--on' : ''}${mode === 'half' ? ' touch-stick--float' : ''}`} aria-hidden>
        <div className="touch-stick__ring" />
        <div ref={knob} className="touch-stick__knob" />
      </div>
    </div>
  );
}

function HoldButton({ action, className, label, children }: { action: Action; className: string; label: string; children: React.ReactNode }) {
  const [down, setDown] = useState(false);
  const release = () => {
    setDown(false);
    releaseVirtual(action);
  };
  // The button can vanish under a thumb (Interact's prompt goes when a kicked marble rolls away):
  // let go of the action then, or it stays held and the next press is never seen.
  useEffect(() => () => releaseVirtual(action), [action]);
  return (
    <button
      className={`${className}${down ? ' is-down' : ''}`}
      aria-label={label}
      onPointerDown={(e) => {
        unlockAudio();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDown(true);
        pressVirtual(action);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/**
 * Interact: held like the other buttons (holding it with the basketball winds the throw meter back
 * and forth; letting go throws), and sliding the finger off it cancels a throw (the shared
 * hold-to-shoot button, src/minigames/shared/holdToShoot.ts).
 */
function InteractButton({ label, children }: { label: string; children: React.ReactNode }) {
  const { props, down, cancelled } = useHoldToShoot('interact');
  return (
    <button className={`touch-btn touch-btn--interact${down ? ' is-down' : ''}${cancelled ? ' is-cancelled' : ''}`} aria-label={label} {...props}>
      {children}
    </button>
  );
}

export function TouchControls() {
  const prompt = useGame((s) => s.prompt);
  const togglePause = useGame((s) => s.togglePause);
  return (
    <div className="touch-controls">
      <Joystick />
      <div className="touch-buttons">
        {prompt && (
          <InteractButton label={`${prompt.verb} ${prompt.label}`}>
            {/* "Repaint at" → "Repaint": the full phrase is on the prompt pill */}
            <span className="touch-btn__verb">{prompt.verb.split(' ')[0]}</span>
          </InteractButton>
        )}
        <HoldButton action="jump" className="touch-btn touch-btn--jump" label="Jump">
          <span>Jump</span>
        </HoldButton>
      </div>
      <TouchEmotes />
      <button
        className="touch-pause"
        aria-label="Pause"
        onClick={() => {
          unlockAudio();
          togglePause(true);
        }}
      >
        <GearIcon size={26} color="#2B2433" />
      </button>
    </div>
  );
}

/** Tapping the prompt pill itself also interacts (big, obvious target on phones). */
export function tapInteract() {
  tapVirtual('interact');
}
