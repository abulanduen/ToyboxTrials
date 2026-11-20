/**
 * Tutorial pictures: one code-built SVG per "How to play" step (see `src/minigames/tutorials.ts`),
 * plus the Hub controls on the main menu's How to play sheet.
 *
 * Adding a game: draw its pictures in `src/ui/tutorialArt/<game>.tsx` with the shared kit
 * (`kit.tsx`), export them as `{ '<game>-<step>': () => <Art>…</Art> }`, spread that object into
 * `TUTORIAL_ART` below, and reference the ids from the game's tutorial steps (`art`, and
 * `touchArt` when the touch controls look different). TypeScript rejects unknown ids, and
 * tests/unit/tutorials.test.ts checks every step has a picture that renders.
 */
import type { JSX } from 'react';
import { BLINK_ART } from './blink';
import { COPYCAT_ART } from './copycat';
import { FINDORIGINAL_ART } from './findoriginal';
import { HOOPCLASH_ART } from './hoopclash';
import { HUB_ART } from './hub';
import { INFERNO_ART } from './inferno';
import { JACKBOX_ART } from './jackbox';
import { MIDNIGHT_ART } from './midnight';
import { REDLIGHT_ART } from './redlight';
import { RHYTHM_ART } from './rhythm';
import { SIEGE_ART } from './siege';
import { SPELLBOX_ART } from './spellbox';
import { SPOTDIFF_ART } from './spotdiff';
import { TOWERTUMBLE_ART } from './towertumble';
import { TOYSQUAD_ART } from './toysquad';
import { WINDDASH_ART } from './winddash';

export const TUTORIAL_ART = {
  ...COPYCAT_ART,
  ...JACKBOX_ART,
  ...FINDORIGINAL_ART,
  ...REDLIGHT_ART,
  ...WINDDASH_ART,
  ...INFERNO_ART,
  ...MIDNIGHT_ART,
  ...RHYTHM_ART,
  ...BLINK_ART,
  ...SPELLBOX_ART,
  ...TOYSQUAD_ART,
  ...SPOTDIFF_ART,
  ...TOWERTUMBLE_ART,
  ...SIEGE_ART,
  ...HOOPCLASH_ART,
  ...HUB_ART,
} satisfies Record<string, () => JSX.Element>;

export type TutorialArtId = keyof typeof TUTORIAL_ART;

/** One tutorial picture in its rounded frame. */
export function TutorialArt({ id, className = '', testId = 'tutorial-art' }: { id: TutorialArtId; className?: string; testId?: string }) {
  const Picture = TUTORIAL_ART[id];
  return (
    <div className={`tutorial-art ${className}`} data-testid={testId} data-art={id}>
      <Picture />
    </div>
  );
}
