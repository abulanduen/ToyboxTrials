/**
 * Touch controls for movement minigames: the hub's floating joystick (bottom-left) and a Jump
 * button (bottom-right). Both feed the shared action layer, exactly like the hub's controls.
 */
import { useEffect, useState } from 'react';
import { pressVirtual, releaseVirtual } from '../../game/input';
import { unlockAudio } from '../../game/audio';
import { useGame } from '../../game/store';
import { Joystick } from '../../ui/TouchControls';

export function MoveTouch({ jump = true }: { jump?: boolean }) {
  const touch = useGame((s) => s.touchUI);
  const [down, setDown] = useState(false);
  useEffect(() => () => releaseVirtual('jump'), []);
  if (!touch) return null;
  const release = () => {
    setDown(false);
    releaseVirtual('jump');
  };
  return (
    <div className="touch-controls mv-touch">
      <Joystick />
      {jump && (
        <div className="touch-buttons">
          <button
            className={`touch-btn touch-btn--jump${down ? ' is-down' : ''}`}
            aria-label="Jump"
            data-testid="mv-jump"
            onPointerDown={(e) => {
              unlockAudio();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDown(true);
              pressVirtual('jump');
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span>Jump</span>
          </button>
        </div>
      )}
    </div>
  );
}
