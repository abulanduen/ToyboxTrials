/**
 * Jack-in-the-Box — rules core (GAME_DESIGN.md §4 · 11, amendment A8). Deterministic; no DOM/three/timers.
 *
 * A wind-up jack-in-the-box is passed around the circle. Each round has a category ("Name a fruit")
 * and a hidden fuse. Whoever holds the box must type a valid answer that hasn't been said this round;
 * a good answer cranks the handle and passes the box clockwise. Wrong or repeated answers keep it in
 * your hands. When the fuse runs out the jack pops and the holder is out. Each round brings a new
 * category, a new fuse, and the box starts with the toy after the one who popped.
 *
 * Placement is elimination order (last toy in wins). Score = valid answers given, for records.
 */
import { seededRng, randInt, shuffle } from '../rng';
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { CATEGORIES, type Category } from './categories';
import { indexCategory, matchAnswer, pretty } from './matching';

export interface JackInput {
  text: string;
}

export interface JackConfig {
  introMs: number;
  /** Category shown before the fuse starts. */
  revealMs: number;
  /** Pause after a pop before the next round. */
  poppedMs: number;
  fuseMinMs: number;
  fuseMaxMs: number;
  /** Answers longer than this are ignored outright. */
  maxLength: number;
  /** Category ids to use (defaults to the whole bank). */
  categories?: string[];
}

export const DEFAULT_CONFIG: JackConfig = {
  introMs: 1200,
  revealMs: 2600,
  poppedMs: 2600,
  fuseMinMs: 12000,
  fuseMaxMs: 28000,
  maxLength: 48,
};

export interface JackPlayer {
  id: string;
  alive: boolean;
  answers: number;
  /** Round in which they popped (0 = still in). */
  outRound: number;
  outAt: number;
  forfeit: boolean;
}

export type Phase = 'intro' | 'reveal' | 'live' | 'popped' | 'over';

export interface Said {
  id: number;
  display: string;
  by: string;
}

export interface JackState {
  config: JackConfig;
  t: number;
  phase: Phase;
  phaseT: number;
  round: number;
  /** Category order for the whole match (pre-shuffled; no repeats until the bank runs out). */
  order: string[];
  category: Category;
  /** Ms of fuse left this round. Hidden from the HUD; the Scene only hints at it near the end. */
  fuseMs: number;
  fuseTotalMs: number;
  holder: string;
  /** Clockwise seating = contestant order. */
  seats: string[];
  said: Said[];
  players: JackPlayer[];
  /** Pre-rolled fuse lengths so the outcome never depends on input timing. */
  fuses: number[];
  events: MatchEvent[];
}

const player = (s: JackState, id: string) => s.players.find((p) => p.id === id);
const aliveIds = (s: JackState) => s.seats.filter((id) => player(s, id)!.alive);

/** The next toy still in, clockwise from `id` (which may itself be out). */
export function nextAlive(s: JackState, id: string): string {
  const n = s.seats.length;
  const i = s.seats.indexOf(id);
  for (let k = 1; k <= n; k++) {
    const cand = s.seats[(i + k) % n];
    if (player(s, cand)!.alive) return cand;
  }
  return id;
}

function setPhase(s: JackState, phase: Phase) {
  s.phase = phase;
  s.phaseT = 0;
}

function startRound(s: JackState, firstHolder: string) {
  s.category = CATEGORIES.find((c) => c.id === s.order[(s.round - 1) % s.order.length])!;
  s.fuseTotalMs = s.fuses[(s.round - 1) % s.fuses.length];
  s.fuseMs = s.fuseTotalMs;
  s.holder = firstHolder;
  s.said = [];
  setPhase(s, 'reveal');
  s.events.push({ type: 'round-start', round: s.round, category: s.category.id, prompt: s.category.prompt, holder: s.holder });
}

function knockOut(s: JackState, p: JackPlayer, reason: 'pop' | 'forfeit') {
  if (!p.alive) return;
  p.alive = false;
  p.outRound = s.round;
  p.outAt = s.t;
  p.forfeit = reason === 'forfeit';
}

function endRoundOrMatch(s: JackState) {
  if (aliveIds(s).length <= 1) {
    setPhase(s, 'over');
    s.events.push({ type: 'over' });
  } else {
    setPhase(s, 'popped');
  }
}

export type JackRules = RulesCore<JackState, JackInput, JackConfig> & { forfeit(state: JackState, id: string): void };

export const jackRules: JackRules = {
  init(contestants: Contestant[], seed: number, config?: Partial<JackConfig>): JackState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const rng = seededRng(seed);
    const pool = cfg.categories ?? CATEGORIES.map((c) => c.id);
    const order = shuffle(rng, pool);
    const fuses = Array.from({ length: 64 }, () => cfg.fuseMinMs + rng() * (cfg.fuseMaxMs - cfg.fuseMinMs));
    const seats = contestants.map((c) => c.id);
    const s: JackState = {
      config: cfg,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      round: 1,
      order,
      category: CATEGORIES.find((c) => c.id === order[0])!,
      fuseMs: 0,
      fuseTotalMs: 0,
      holder: seats[randInt(rng, seats.length)],
      seats,
      said: [],
      players: seats.map((id) => ({ id, alive: true, answers: 0, outRound: 0, outAt: 0, forfeit: false })),
      fuses,
      events: [],
    };
    return s;
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    s.t += dtMs;
    s.phaseT += dtMs;

    switch (s.phase) {
      case 'intro':
        if (s.phaseT >= s.config.introMs) startRound(s, s.holder);
        break;

      case 'reveal':
        if (s.phaseT >= s.config.revealMs) {
          setPhase(s, 'live');
          s.events.push({ type: 'live', holder: s.holder });
        }
        break;

      case 'live': {
        // Only the holder's answers count; everyone else's are ignored.
        for (const inp of inputs[s.holder] ?? []) {
          const text = (inp.text ?? '').trim();
          if (!text || text.length > s.config.maxLength) continue;
          const idx = indexCategory(s.category);
          const id = matchAnswer(idx, text);
          if (id === null) {
            s.events.push({ type: 'reject', id: s.holder, text, reason: 'invalid' });
            continue;
          }
          const prior = s.said.find((x) => x.id === id);
          if (prior) {
            s.events.push({ type: 'reject', id: s.holder, text, reason: 'repeat', display: prior.display, by: prior.by });
            continue;
          }
          const display = pretty(idx.answers[id].display);
          s.said.push({ id, display, by: s.holder });
          player(s, s.holder)!.answers++;
          const from = s.holder;
          s.holder = nextAlive(s, from);
          s.events.push({ type: 'accept', id: from, text, display, to: s.holder });
          break; // the box has moved on; anything else typed this step is too late
        }
        s.fuseMs -= dtMs;
        if (s.fuseMs <= 0) {
          s.fuseMs = 0;
          const p = player(s, s.holder)!;
          knockOut(s, p, 'pop');
          s.events.push({ type: 'pop', id: p.id, round: s.round });
          endRoundOrMatch(s);
        }
        break;
      }

      case 'popped':
        if (s.phaseT >= s.config.poppedMs) {
          // The box restarts with the toy after the one who popped.
          const start = nextAlive(s, s.holder);
          s.round++;
          startRound(s, start);
        }
        break;
    }
    return s;
  },

  isOver: (s) => s.phase === 'over',

  result(s) {
    const ordered = [...s.players]
      .sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (a.forfeit !== b.forfeit) return a.forfeit ? 1 : -1;
        return b.outRound - a.outRound || b.outAt - a.outAt;
      })
      .map((p) => ({
        contestantId: p.id,
        score: p.answers,
        eliminated: !p.alive,
        forfeit: p.forfeit,
        key: p.alive ? 'alive' : p.forfeit ? 'forfeit' : `out|${p.outRound}|${p.outAt}`,
      }));
    return {
      placements: rankByKey(ordered),
      durationMs: s.t,
      stats: { rounds: s.round, answers: s.players.reduce((n, p) => n + p.answers, 0) },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },

  /** A player quitting mid-match (last place). If they held the box, it moves on. */
  forfeit(s, id) {
    const p = player(s, id);
    if (!p || !p.alive) return;
    knockOut(s, p, 'forfeit');
    if (s.holder === id) s.holder = nextAlive(s, id);
    if (aliveIds(s).length <= 1 && s.phase !== 'over') {
      setPhase(s, 'over');
      s.events.push({ type: 'over' });
    }
  },
};
