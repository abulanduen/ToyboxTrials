import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import './ui/styles.css';
import { App } from './App';
import { reloadForNewVersion } from './game/staleBuild';

// Vite reports a chunk it couldn't preload (usually: a newer version was deployed while this page
// was open). Reload onto the new version instead of failing; staleBuild limits it to once a minute.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
