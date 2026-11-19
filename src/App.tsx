import { useEffect } from 'react';
import { PlayroomScene } from './scene/PlayroomScene';
import { Overlay } from './ui/Overlay';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installInput } from './game/input';
import { unlockAudio } from './game/audio';
import { useGame, type Screen } from './game/store';
import { installNet, joinOnline } from './net/client';
import { useNet } from './net/store';
import { normalizeRoomCode } from './net/protocol';

/** Shareable deep links: #play and #workshop open straight onto a screen. */
const HASH: Record<Screen, string> = { menu: '', playing: '#play', workshop: '#workshop', minigame: '#play' };
/** `#room=K7MQX` (a shared private-room link): the room code, or null. */
function roomFromHash(): string | null {
  const m = /^#room=([^&]+)$/i.exec(window.location.hash);
  return m ? normalizeRoomCode(decodeURIComponent(m[1])) : null;
}
/** Follow a room link: show the online sheet (for progress and errors) and join. */
function joinFromHash(): boolean {
  if (!/^#room=/i.test(window.location.hash)) return false;
  const code = roomFromHash();
  const net = useNet.getState();
  net.set({ sheetOpen: true, error: null });
  if (code) void joinOnline({ kind: 'code', code });
  else net.set({ error: 'That room link is missing its code. Ask for the link again.' });
  return true;
}
/** The address bar while in a private room: its share link, so a reload rejoins. */
function hashFor(screen: Screen): string {
  const room = useNet.getState().room;
  if (room?.kind === 'private' && room.code && screen !== 'menu') return `#room=${room.code}`;
  return screen === 'workshop' && useGame.getState().workshopMode === 'shop' ? '#shop' : HASH[screen];
}
function screenFromHash(): Screen | null {
  const h = window.location.hash;
  return h === '#play' ? 'playing' : h === '#workshop' || h === '#shop' ? 'workshop' : h === '' || h === '#' ? 'menu' : null;
}
/** Open the Workshop screen in the panel the hash asks for (#shop is the Odds & Ends shop). */
function openWorkshopFromHash() {
  if (window.location.hash === '#shop') useGame.getState().openShop();
  else useGame.getState().openWorkshop();
}

/**
 * Prototype shell. In the full game this becomes the router between
 * Main Menu → Playroom hub → Minigame → Results (see docs/02-technical-plan.md).
 */
export function App() {
  useEffect(() => {
    installNet();
    const initial = screenFromHash();
    if (initial === 'workshop') openWorkshopFromHash();
    else if (initial && initial !== 'menu') useGame.getState().goTo(initial);
    else joinFromHash();
    const syncHash = (screen: Screen) => {
      const url = window.location.pathname + window.location.search + hashFor(screen);
      if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(null, '', url);
    };
    const offStore = useGame.subscribe((s, p) => {
      if (s.screen === p.screen && s.workshopMode === p.workshopMode) return;
      syncHash(s.screen);
    });
    const offNet = useNet.subscribe((s, p) => {
      if (s.room !== p.room) syncHash(useGame.getState().screen);
    });
    const onHash = () => {
      if (joinFromHash()) return;
      const sc = screenFromHash();
      if (sc && sc !== useGame.getState().screen) (sc === 'workshop' ? openWorkshopFromHash() : useGame.getState().goTo(sc));
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      offStore();
      offNet();
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
