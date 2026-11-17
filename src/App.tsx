import { useEffect } from 'react';
import { PlayroomScene } from './scene/PlayroomScene';
import { Overlay } from './ui/Overlay';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installInput } from './game/input';
import { unlockAudio } from './game/audio';
import { useGame, type Screen } from './game/store';

/** Shareable deep links: #play and #workshop open straight onto a screen. */
const HASH: Record<Screen, string> = { menu: '', playing: '#play', workshop: '#workshop', minigame: '#play' };
function screenFromHash(): Screen | null {
  const h = window.location.hash;
  return h === '#play' ? 'playing' : h === '#workshop' ? 'workshop' : h === '' || h === '#' ? 'menu' : null;
}

/**
 * Prototype shell. In the full game this becomes the router between
 * Main Menu → Playroom hub → Minigame → Results (see docs/02-technical-plan.md).
 */
export function App() {
  useEffect(() => {
    const initial = screenFromHash();
    if (initial === 'workshop') useGame.getState().openWorkshop();
    else if (initial && initial !== 'menu') useGame.getState().goTo(initial);
    const offStore = useGame.subscribe((s, p) => {
      if (s.screen === p.screen) return;
      const url = window.location.pathname + window.location.search + HASH[s.screen];
      window.history.replaceState(null, '', url);
    });
    const onHash = () => {
      const sc = screenFromHash();
      if (sc && sc !== useGame.getState().screen) (sc === 'workshop' ? useGame.getState().openWorkshop() : useGame.getState().goTo(sc));
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      offStore();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

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
      <ErrorBoundary>
        <PlayroomScene />
        <Overlay />
      </ErrorBoundary>
    </div>
  );
}
