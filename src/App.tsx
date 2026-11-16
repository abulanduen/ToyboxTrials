import { useEffect } from 'react';
import { PlayroomScene } from './scene/PlayroomScene';
import { Overlay } from './ui/Overlay';
import { installInput } from './game/input';
import { unlockAudio } from './game/audio';

/**
 * Prototype shell. In the full game this becomes the router between
 * Main Menu → Playroom hub → Minigame → Results (see docs/02-technical-plan.md).
 */
export function App() {
  useEffect(() => {
    installInput();
    // Browsers only allow audio after a user gesture.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  return (
    <div className="app">
      <PlayroomScene />
      <Overlay />
    </div>
  );
}
