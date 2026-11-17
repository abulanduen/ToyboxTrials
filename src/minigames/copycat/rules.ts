/**
 * Copycat Conductor — rules core (GAME_DESIGN.md §4 · 01). Deterministic; no DOM/three/timers.
 *
 * Round loop:  intro → demo (conductor plays the sequence) → turn ("your turn") → input → judge → …
 * - The sequence starts at `startLength` notes and grows by one each round.
 * - Demonstrations speed up every round (interval × `speedUp`, floored at `minIntervalMs`).
 * - In the input phase each player repeats the sequence. A wrong note or running out of time
 *   eliminates them. Finishing early is fine — they wait for the others.
 * - Multiplayer: last toy standing wins; elimination order decides the rest. Toys knocked out in
 *   the same round are ranked by how far they got, then by who was out last.
 * - Solo practice: the run ends on the first mistake; score = rounds completed.
 */
import { seededRng, randInt } from '../rng';
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';

export type Slot = 0 | 1 | 2 | 3;
export interface CopycatInput {
  slot: Slot;
}

export interface CopycatConfig {
  startLength: number;
  startIntervalMs: number;
  speedUp: number;
  minIntervalMs: number;
  introMs: number;
  turnMs: number;
  judgeMs: number;
  /** Time allowed per note in the input phase (shrinks a little each round). */
  perNoteMs: number;
  minPerNoteMs: number;
  graceMs: number;
  maxRounds: number;
}

export const DEFAULT_CONFIG: CopycatConfig = {
  startLength: 3,
  startIntervalMs: 720,
  speedUp: 0.93,
  minIntervalMs: 280,
  introMs: 1200,
  turnMs: 650,
  judgeMs: 1300,
  perNoteMs: 1400,
  minPerNoteMs: 650,
  graceMs: 1500,
  maxRounds: 40,
};

export interface CopycatPlayer {
  id: string;
  alive: boolean;
  /** Notes correctly repeated in the current round. */
  progress: number;
  finished: boolean;
  roundsCompleted: number;
  elimRound: number;
  elimProgress: number;
  /** Match time of elimination (later = better among equals). */
  elimAt: number;
  forfeit: boolean;
}

export type Phase = 'intro' | 'demo' | 'turn' | 'input' | 'judge' | 'over';

export interface CopycatState {
  config: CopycatConfig;
  t: number;
  phase: Phase;
  phaseT: number;
  round: number;
  /** Full pre-generated note sequence; round r uses the first `lengthFor(r)` notes. */
  sequence: Slot[];
  demoIndex: number;
  players: CopycatPlayer[];
  solo: boolean;
  events: MatchEvent[];
}

export const lengthFor = (s: CopycatState, round = s.round) => s.config.startLength + round - 1;
export const intervalFor = (s: CopycatState, round = s.round) =>
  Math.max(s.config.minIntervalMs, s.config.startIntervalMs * Math.pow(s.config.speedUp, round - 1));
export const perNoteFor = (s: CopycatState, round = s.round) => Math.max(s.config.minPerNoteMs, s.config.perNoteMs - (round - 1) * 45);
/** Total time allowed to enter the whole sequence this round. */
export const inputDeadline = (s: CopycatState) => perNoteFor(s) * lengthFor(s) + s.config.graceMs;
/** Duration of the demonstration (all notes + a short tail). */
export const demoDuration = (s: CopycatState) => intervalFor(s) * (lengthFor(s) + 0.6);

function makeSequence(seed: number, length: number): Slot[] {
  const rng = seededRng(seed);
  const seq: Slot[] = [];
  for (let i = 0; i < length; i++) {
    let n = randInt(rng, 4) as Slot;
    // Avoid three of the same note in a row — it reads as a glitch rather than a challenge.
    if (i >= 2 && seq[i - 1] === n && seq[i - 2] === n) n = ((n + 1 + randInt(rng, 3)) % 4) as Slot;
    seq.push(n);
  }
  return seq;
}

function setPhase(s: CopycatState, phase: Phase) {
  s.phase = phase;
  s.phaseT = 0;
}

function eliminate(s: CopycatState, p: CopycatPlayer, reason: 'wrong' | 'timeout' | 'forfeit') {
  if (!p.alive) return;
  p.alive = false;
  p.elimRound = s.round;
  p.elimProgress = p.progress;
  p.elimAt = s.t;
  p.forfeit = reason === 'forfeit';
  s.events.push({ type: 'eliminated', id: p.id, reason });
}

function startRound(s: CopycatState) {
  for (const p of s.players) {
    p.progress = 0;
    p.finished = false;
  }
  s.demoIndex = 0;
  setPhase(s, 'demo');
  s.events.push({ type: 'round-start', round: s.round, length: lengthFor(s), interval: intervalFor(s) });
}

const aliveCount = (s: CopycatState) => s.players.filter((p) => p.alive).length;

export const copycatRules: RulesCore<CopycatState, CopycatInput, CopycatConfig> & {
  forfeit(state: CopycatState, id: string): void;
} = {
  init(contestants: Contestant[], seed: number, config?: Partial<CopycatConfig>): CopycatState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    return {
      config: cfg,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      round: 1,
      sequence: makeSequence(seed, cfg.startLength + cfg.maxRounds),
      demoIndex: 0,
      players: contestants.map((c) => ({
        id: c.id,
        alive: true,
        progress: 0,
        finished: false,
        roundsCompleted: 0,
        elimRound: 0,
        elimProgress: 0,
        elimAt: 0,
        forfeit: false,
      })),
      solo: contestants.length === 1,
      events: [],
    };
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    s.t += dtMs;
    s.phaseT += dtMs;

    switch (s.phase) {
      case 'intro':
        if (s.phaseT >= s.config.introMs) startRound(s);
        break;

      case 'demo': {
        const iv = intervalFor(s);
        const len = lengthFor(s);
        // Emit each demonstrated note as its time arrives.
        while (s.demoIndex < len && s.phaseT >= s.demoIndex * iv + iv * 0.35) {
          s.events.push({ type: 'demo-note', slot: s.sequence[s.demoIndex], index: s.demoIndex, holdMs: iv * 0.62 });
          s.demoIndex++;
        }
        if (s.phaseT >= demoDuration(s)) {
          setPhase(s, 'turn');
          s.events.push({ type: 'your-turn' });
        }
        break;
      }

      case 'turn':
        if (s.phaseT >= s.config.turnMs) setPhase(s, 'input');
        break;

      case 'input': {
        const len = lengthFor(s);
        for (const p of s.players) {
          if (!p.alive || p.finished) continue;
          for (const inp of inputs[p.id] ?? []) {
            if (!p.alive || p.finished) break;
            const expected = s.sequence[p.progress];
            if (inp.slot === expected) {
              p.progress++;
              s.events.push({ type: 'press', id: p.id, slot: inp.slot, ok: true, index: p.progress - 1 });
              if (p.progress >= len) {
                p.finished = true;
                p.roundsCompleted = s.round;
                s.events.push({ type: 'player-done', id: p.id });
              }
            } else {
              s.events.push({ type: 'press', id: p.id, slot: inp.slot, ok: false, expected });
              eliminate(s, p, 'wrong');
            }
          }
        }
        if (s.phaseT >= inputDeadline(s)) {
          for (const p of s.players) if (p.alive && !p.finished) eliminate(s, p, 'timeout');
        }
        const alive = s.players.filter((p) => p.alive);
        const allDone = alive.every((p) => p.finished);
        const decided = !s.solo && alive.length <= 1 && s.players.length > 1;
        if (allDone || decided || alive.length === 0) {
          setPhase(s, 'judge');
          s.events.push({ type: 'round-end', round: s.round, survivors: alive.map((p) => p.id) });
        }
        break;
      }

      case 'judge':
        if (s.phaseT >= s.config.judgeMs) {
          const alive = aliveCount(s);
          const over = alive === 0 || (!s.solo && alive <= 1) || s.round >= s.config.maxRounds;
          if (over) {
            setPhase(s, 'over');
            s.events.push({ type: 'over' });
          } else {
            s.round++;
            startRound(s);
          }
        }
        break;
    }
    return s;
  },

  isOver: (s) => s.phase === 'over',

  result(s) {
    // Survivors first (by rounds completed), then eliminated by round, progress, and lateness.
    const ordered = s.players
      .map((p) => ({
        contestantId: p.id,
        score: p.roundsCompleted,
        eliminated: !p.alive,
        forfeit: p.forfeit,
        p,
      }))
      .sort((a, b) => {
        if (a.p.alive !== b.p.alive) return a.p.alive ? -1 : 1;
        if (a.p.alive) return b.p.roundsCompleted - a.p.roundsCompleted;
        if (a.p.forfeit !== b.p.forfeit) return a.p.forfeit ? 1 : -1;
        return b.p.elimRound - a.p.elimRound || b.p.elimProgress - a.p.elimProgress || b.p.elimAt - a.p.elimAt;
      })
      .map((x) => ({
        contestantId: x.contestantId,
        score: x.score,
        eliminated: x.eliminated,
        forfeit: x.forfeit,
        // Equal keys share a place (simultaneous identical exits).
        key: x.p.alive ? `alive|${x.p.roundsCompleted}` : x.p.forfeit ? `forfeit` : `out|${x.p.elimRound}|${x.p.elimProgress}|${x.p.elimAt}`,
      }));
    const best = Math.max(0, ...s.players.map((p) => p.roundsCompleted));
    return {
      placements: rankByKey(ordered),
      durationMs: s.t,
      stats: { roundsCompleted: best, longestSequence: best > 0 ? s.config.startLength + best - 1 : 0 },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },

  /** A player quitting mid-match (counts as last place). */
  forfeit(s, id) {
    const p = s.players.find((x) => x.id === id);
    if (p) eliminate(s, p, 'forfeit');
  },
};
