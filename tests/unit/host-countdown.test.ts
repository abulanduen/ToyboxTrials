/* The shared host's start countdown, and the `skipStartCountdown` opt-in (Spellbox Showdown's draft, Toybox Siege's class pick). */
import { beforeEach, describe, expect, it } from 'vitest';
import { beginCountdown, getMatchState, matchBus, pauseMatch, quitMatch, setMatchTimeScale, tickMatch, useMatch } from '../../src/minigames/session';
import { MINIGAMES, gameById } from '../../src/minigames/registry';
import type { MinigameId, MinigameModule, RulesCore } from '../../src/minigames/types';

/** A tiny rules core that only counts simulated time, so the test sees exactly when play starts. */
const counter: RulesCore<{ t: number }, never> = {
  init: () => ({ t: 0 }),
  step: (s, _inputs, dt) => { s.t += dt; return s; },
  isOver: () => false,
  result: () => ({ placements: [], durationMs: 0 }),
  drainEvents: () => [],
};
const fake = { rules: counter, bindings: {}, readLocalInput: () => [], Scene: () => null, Hud: () => null } as unknown as MinigameModule;
const simulated = () => (getMatchState() as { t: number }).t;
const phase = () => useMatch.getState().phase;
/** Frames of real time (the host clamps each frame to 100 ms). */
const run = (ms: number) => { for (let left = ms; left > 0; left -= 50) tickMatch(Math.min(50, left)); };

function open(id: MinigameId) {
  useMatch.getState().set({ phase: 'intro', kind: 'practice', gameId: id, module: fake, opponents: 0, contestants: [], tournament: null, paused: false });
  beginCountdown();
}
let counts: number[] = [];
matchBus.on('countdown', ({ n }) => counts.push(n));
beforeEach(() => { quitMatch(); setMatchTimeScale(1); counts = []; });

describe('host start countdown', () => {
  it('only Spellbox Showdown and Toybox Siege (their own untimed opening cards) opt out; every other game keeps the 3-2-1', () => {
    expect(gameById('spellbox-showdown').skipStartCountdown).toBe(true);
    expect(gameById('toybox-siege').skipStartCountdown).toBe(true);
    expect(MINIGAMES.filter((g) => g.skipStartCountdown).map((g) => g.id)).toEqual(['spellbox-showdown', 'toybox-siege']);
  });
  it('goes straight to Toybox Siege\'s class pick', () => {
    open('toybox-siege');
    expect(phase()).toBe('playing');
    expect(counts).toEqual([]);
  });
  it('runs 3-2-1 before play for an ordinary game, stepping no rules until it ends, and pauses', () => {
    open('copycat-conductor');
    expect(phase()).toBe('countdown');
    run(2000);
    pauseMatch(true); run(5000); expect(phase()).toBe('countdown'); pauseMatch(false);
    run(999); expect(phase()).toBe('countdown'); expect(simulated()).toBe(0);
    run(1); expect(phase()).toBe('playing');
    expect(counts).toEqual([3, 2, 1, 0]);
    tickMatch(50); expect(simulated()).toBeGreaterThan(0);
  });
  it('goes straight to playing for a skipStartCountdown game: no countdown phase or count events, rules step at once', () => {
    open('spellbox-showdown');
    expect(phase()).toBe('playing');
    tickMatch(100);
    expect(simulated()).toBeGreaterThan(80);
    expect(counts).toEqual([]);
    expect(phase()).toBe('playing');
  });
  it('honours pause and timeScale on the skipped path, and Play again skips it again', () => {
    open('spellbox-showdown');
    tickMatch(50); const t = simulated(); expect(t).toBeGreaterThan(0);
    pauseMatch(true); expect(useMatch.getState().paused).toBe(true); run(1000); expect(simulated()).toBe(t); pauseMatch(false);
    setMatchTimeScale(0); run(1000); expect(simulated()).toBe(t);
    setMatchTimeScale(4); tickMatch(50); expect(simulated()).toBeGreaterThan(t + 150);
    setMatchTimeScale(1);
    // "Play again" on the results card calls beginCountdown again: still no 3-2-1, fresh rules state.
    useMatch.getState().set({ phase: 'results' }); beginCountdown();
    expect(phase()).toBe('playing'); expect(simulated()).toBe(0); expect(counts).toEqual([]);
  });
});
