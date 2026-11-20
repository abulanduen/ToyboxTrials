/**
 * Lazy wrapper for the tutorial pictures (`./tutorialArt`), so the main bundle doesn't carry every
 * game's diagrams: the chunk loads the first time an intro card or the How to play sheet opens.
 * Until then an empty frame of the same shape holds the space.
 */
import { lazy, Suspense } from 'react';
import type { TutorialArtId } from './tutorialArt';

const loadArt = () => import('./tutorialArt');
const Art = lazy(() => loadArt().then((m) => ({ default: m.TutorialArt })));

/** Start fetching the pictures early (e.g. while a minigame module loads). */
export const preloadTutorialArt = () => void loadArt();

export function TutorialPicture({ id, className = '', testId }: { id: TutorialArtId; className?: string; testId?: string }) {
  return (
    <Suspense fallback={<div className={`tutorial-art ${className}`} data-testid={testId ?? 'tutorial-art'} aria-hidden />}>
      <Art id={id} className={className} testId={testId} />
    </Suspense>
  );
}
