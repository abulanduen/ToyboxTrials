/** Music Box Rhythm module (lazy-loaded by the registry). */
import { SLOT_BINDINGS, getPressTimes } from '../../game/input';
import { useGame } from '../../game/store';
import { exposeDebug } from '../../game/debug';
import type { MinigameModule } from '../types';
import { getMatchState, useMatch } from '../session';
import { rhythmRules, type RhythmInput, type RhythmState } from './rules';
import { createRhythmBot } from './bot';
import { pressesToInputs, resetSongClock, syncSongClock } from './timing';
import { songClock, songNow, useRhythmPrefs } from './live';
import { musicStats } from './music';
import { RhythmScene } from './Scene';
import { RhythmHud } from './Hud';
import { RhythmIntro } from './Intro';

const rhythm: MinigameModule<RhythmState, RhythmInput> = {
  rules: {
    ...rhythmRules,
    // Practice plays the track chosen on the intro card; tournaments take one from the seed.
    init(contestants, seed, config) {
      resetSongClock(songClock);
      const practice = useMatch.getState().kind === 'practice';
      return rhythmRules.init(contestants, seed, { ...(practice ? { track: useRhythmPrefs.getState().track } : {}), ...config });
    },
  },
  createBot: createRhythmBot,
  bindings: SLOT_BINDINGS,
  /**
   * Presses carry the high-resolution time they happened at (shared input layer). Convert that to
   * song time through the smooth song clock, minus the player's latency calibration.
   */
  readLocalInput: (presses) => {
    const s = getMatchState() as RhythmState | null;
    if (!s) return [];
    syncSongClock(songClock, performance.now(), s.t);
    return pressesToInputs(presses, getPressTimes(), songClock, useGame.getState().rhythmOffsetMs);
  },
  Scene: RhythmScene,
  Hud: RhythmHud,
  IntroExtras: RhythmIntro,
};

exposeDebug({
  rhythm: {
    /** Smooth song time (ms) and clock rate, for e2e tests that press on a note. */
    songTime: () => songNow(),
    rate: () => songClock.rate,
    music: () => musicStats(),
  },
});

export default rhythm;
