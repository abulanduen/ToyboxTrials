/**
 * Find the Original — rules core (GAME_DESIGN.md §4 · 04). Deterministic; no DOM/three/timers.
 *
 * Five short rounds. Each round opens with a reference card ("This is Baldwyn"), then a crowd of
 * look-alikes appears and everyone races to pick the real one. Crowds grow (6 → 24), the decoys'
 * mistakes get fewer and subtler, and from round 3 the crowd shuffles about.
 *
 *  - Correct pick: points by finishing order (100/70/50/…) plus a speed bonus (up to +50).
 *  - Wrong pick: −15 points and a short "wound down" lockout that grows with each mistake that round.
 *  - Once the first toy finds him, the others have a few seconds left ("hurry").
 *  - The round ends when all but one have found him (so the last toy scores nothing), or on time.
 *
 * Placement is by total score; ties go to the faster total correct-pick time, then share a place.
 * Toys' positions are a pure function of the state (`toyPose`), so every client and a future server
 * agree on where everyone stands without sending positions.
 */
import { seededRng, shuffle, subSeed } from '../rng';
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { TRAITS, isOriginal, normalise, type Tier } from './traits';

export interface FindInput {
  /** Index of the toy picked in `state.toys`. */
  pick: number;
}

export interface RoundSpec {
  /** Grid of standing spots (cols ≥ rows; the render layer may transpose it for portrait screens). */
  cols: number;
  rows: number;
  /** How many details each decoy gets wrong [min, max]. */
  diffs: [number, number];
  /** Relative chance of a wrong detail coming from each tier (obvious, medium, subtle). */
  tierWeights: [number, number, number];
  /** Every decoy has at least one mistake this easy to spot (or easier). */
  needTier: Tier;
  /** How far toys shuffle from their spot, as a fraction of a cell (0 = standing still). */
  drift: number;
  /** How far they turn from side to side, in radians. */
  turn: number;
  /** 0..1, how hard the round is to read; bots take longer and slip more. */
  hardness: number;
}

export interface FindConfig {
  rounds: RoundSpec[];
  introMs: number;
  /** Reference card time before round 1 (longer: you're meeting him). */
  firstStudyMs: number;
  studyMs: number;
  searchMs: number;
  /** Time left for everyone else once the first toy has found him. */
  hurryMs: number;
  revealMs: number;
  /** Points for a correct pick by finishing order. */
  orderPoints: number[];
  /** Extra points for an instant pick, falling to 0 at the time limit. */
  speedBonus: number;
  wrongPenalty: number;
  /** Lockout after a wrong pick: lockMs, then + lockStepMs per earlier mistake this round, up to lockMaxMs. */
  lockMs: number;
  lockStepMs: number;
  lockMaxMs: number;
}

export const DEFAULT_CONFIG: FindConfig = {
  rounds: [
    { cols: 3, rows: 2, diffs: [2, 3], tierWeights: [3, 2, 1], needTier: 0, drift: 0, turn: 0, hardness: 0 },
    { cols: 4, rows: 3, diffs: [1, 2], tierWeights: [2, 3, 1], needTier: 1, drift: 0, turn: 0, hardness: 0.25 },
    { cols: 5, rows: 3, diffs: [1, 2], tierWeights: [0, 3, 2], needTier: 2, drift: 0.08, turn: 0.12, hardness: 0.5 },
    { cols: 5, rows: 4, diffs: [1, 1], tierWeights: [0, 3, 3], needTier: 2, drift: 0.1, turn: 0.22, hardness: 0.8 },
    { cols: 6, rows: 4, diffs: [1, 1], tierWeights: [0, 1, 3], needTier: 2, drift: 0.1, turn: 0.32, hardness: 1 },
  ],
  introMs: 900,
  firstStudyMs: 3400,
  studyMs: 2400,
  searchMs: 20000,
  hurryMs: 7000,
  revealMs: 2400,
  orderPoints: [100, 70, 50, 40, 30, 20, 10, 0],
  speedBonus: 50,
  wrongPenalty: 15,
  lockMs: 1500,
  lockStepMs: 500,
  lockMaxMs: 3000,
};

export interface Toy {
  /** Deviations from Baldwyn (see traits.ts). 0 = the original. */
  traits: number;
  col: number;
  row: number;
  /** Fixed offset from the centre of the spot, in cells, so the crowd isn't a perfect grid. */
  jx: number;
  jz: number;
  /** Shuffle phases and tempo. */
  ph: number;
  ph2: number;
  f: number;
}

export interface FindPlayer {
  id: string;
  score: number;
  /** This round. */
  found: boolean;
  /** 0-based finishing order this round, or -1. */
  foundOrder: number;
  /** Points from this round's correct pick (for the HUD). */
  lastPoints: number;
  lockMs: number;
  /** Length of the current lockout (for the HUD bar). */
  lockTotalMs: number;
  /** Decoys this player has already picked this round (they can't be picked twice). */
  wrong: number[];
  /** Match totals. */
  finds: number;
  findMs: number;
  wrongTotal: number;
}

export type Phase = 'intro' | 'study' | 'search' | 'reveal' | 'over';

export interface FindState {
  config: FindConfig;
  seed: number;
  t: number;
  phase: Phase;
  phaseT: number;
  /** 1-based. */
  round: number;
  spec: RoundSpec;
  toys: Toy[];
  /** How long this round's search ran (frozen when it ends, so toys stop where they were). */
  searchT: number;
  /** Current time limit for this round's search (shrinks to "hurry" after the first find). */
  limitMs: number;
  foundCount: number;
  players: FindPlayer[];
  events: MatchEvent[];
}

const TAU = Math.PI * 2;

/**
 * Where toy `i` stands right now: `u`/`v` in cells (0..cols, 0..rows; v grows towards the viewer)
 * and `yaw` in radians (0 = facing the viewer). Pure function of the state.
 */
export function toyPose(s: FindState, i: number, out = { u: 0, v: 0, yaw: 0 }) {
  const toy = s.toys[i];
  const t = s.searchT / 1000;
  const k = s.spec.drift;
  out.u = toy.col + 0.5 + toy.jx + k * Math.sin(TAU * toy.f * t + toy.ph);
  out.v = toy.row + 0.5 + toy.jz + k * 0.5 * Math.sin(TAU * toy.f * 0.83 * t + toy.ph2);
  out.yaw = s.spec.turn * Math.sin(TAU * toy.f * 0.6 * t + toy.ph + toy.ph2);
  return out;
}

/** The index of the real Baldwyn, derived from the looks (there is no stored flag). */
export const originalIndex = (s: FindState) => s.toys.findIndex((t) => isOriginal(t.traits));

/** One decoy's set of mistakes. Never 0. */
function rollDecoy(rng: () => number, spec: RoundSpec): number {
  const pickFrom = (maxTier: number) => {
    const pool = TRAITS.filter((t) => t.tier <= maxTier);
    const weight = (tier: number) => spec.tierWeights[tier] + 0.0001;
    let r = rng() * pool.reduce((n, t) => n + weight(t.tier), 0);
    for (const t of pool) {
      r -= weight(t.tier);
      if (r <= 0) return t.bit;
    }
    return pool[pool.length - 1].bit;
  };
  // The guaranteed readable mistake first, then extras from the whole weighted pool.
  let traits = pickFrom(spec.needTier);
  const want = spec.diffs[0] + Math.floor(rng() * (spec.diffs[1] - spec.diffs[0] + 1));
  for (let tries = 0, n = 1; n < want && tries < 12; tries++) {
    const bit = pickFrom(2);
    if (traits & bit) continue;
    const next = normalise(traits | bit);
    if (next === traits || next === 0) continue;
    traits = next;
    n++;
  }
  return normalise(traits);
}

function buildCrowd(seed: number, round: number, spec: RoundSpec): Toy[] {
  const rng = seededRng(subSeed(seed, `crowd-${round}`));
  const n = spec.cols * spec.rows;
  const looks = [0];
  while (looks.length < n) looks.push(rollDecoy(rng, spec));
  const order = shuffle(rng, looks);
  return order.map((traits, i) => ({
    traits,
    col: i % spec.cols,
    row: Math.floor(i / spec.cols),
    // Static jitter + drift stay ≤ 0.14 cell per toy, so neighbours never come closer than
    // 72 % of a cell: keeps every target ≥ 56 px apart on phones (see e2e findoriginal.cjs).
    jx: (rng() - 0.5) * 0.08,
    jz: (rng() - 0.5) * 0.06,
    ph: rng() * TAU,
    ph2: rng() * TAU,
    f: 0.16 + rng() * 0.12,
  }));
}

function setPhase(s: FindState, phase: Phase) {
  s.phase = phase;
  s.phaseT = 0;
}

function startRound(s: FindState, round: number) {
  s.round = round;
  s.spec = s.config.rounds[round - 1];
  s.toys = buildCrowd(s.seed, round, s.spec);
  s.searchT = 0;
  s.limitMs = s.config.searchMs;
  s.foundCount = 0;
  for (const p of s.players) {
    p.found = false;
    p.foundOrder = -1;
    p.lastPoints = 0;
    p.lockMs = 0;
    p.lockTotalMs = 0;
    p.wrong = [];
  }
  setPhase(s, 'study');
  s.events.push({ type: 'round-start', round, count: s.toys.length });
}

function endSearch(s: FindState, reason: 'found' | 'time') {
  for (const p of s.players) p.lockMs = 0;
  setPhase(s, 'reveal');
  s.events.push({ type: 'reveal', round: s.round, toy: originalIndex(s), reason });
}

export const findRules: RulesCore<FindState, FindInput, FindConfig> = {
  init(contestants: Contestant[], seed: number, config?: Partial<FindConfig>): FindState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    return {
      config: cfg,
      seed,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      round: 1,
      spec: cfg.rounds[0],
      toys: [],
      searchT: 0,
      limitMs: cfg.searchMs,
      foundCount: 0,
      players: contestants.map((c) => ({
        id: c.id,
        score: 0,
        found: false,
        foundOrder: -1,
        lastPoints: 0,
        lockMs: 0,
        lockTotalMs: 0,
        wrong: [],
        finds: 0,
        findMs: 0,
        wrongTotal: 0,
      })),
      events: [],
    };
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    s.t += dtMs;
    s.phaseT += dtMs;
    const cfg = s.config;

    switch (s.phase) {
      case 'intro':
        if (s.phaseT >= cfg.introMs) startRound(s, 1);
        break;

      case 'study':
        if (s.phaseT >= (s.round === 1 ? cfg.firstStudyMs : cfg.studyMs)) {
          setPhase(s, 'search');
          s.events.push({ type: 'search', round: s.round });
        }
        break;

      case 'search': {
        s.searchT = s.phaseT;
        const finders: FindPlayer[] = [];
        for (const p of s.players) {
          if (p.lockMs > 0) {
            p.lockMs = Math.max(0, p.lockMs - dtMs);
            if (p.lockMs === 0) s.events.push({ type: 'unlock', id: p.id });
          }
          if (p.found || p.lockMs > 0) continue;
          for (const inp of inputs[p.id] ?? []) {
            const i = inp?.pick;
            if (!Number.isInteger(i) || i < 0 || i >= s.toys.length || p.wrong.includes(i)) continue;
            if (isOriginal(s.toys[i].traits)) {
              finders.push(p);
            } else {
              p.wrong.push(i);
              p.wrongTotal++;
              p.lockTotalMs = Math.min(cfg.lockMaxMs, cfg.lockMs + cfg.lockStepMs * (p.wrong.length - 1));
              p.lockMs = p.lockTotalMs;
              const lost = Math.min(p.score, cfg.wrongPenalty);
              p.score -= lost;
              s.events.push({ type: 'wrong', id: p.id, toy: i, lockMs: p.lockMs, lost });
            }
            break; // one pick per step: anything else was tapped after the answer was already in
          }
        }
        if (finders.length) {
          // Picks landing in the same step tie: they share the finishing order and its points.
          const order = s.foundCount;
          const bonus = Math.round(cfg.speedBonus * Math.max(0, 1 - s.phaseT / cfg.searchMs));
          const points = (cfg.orderPoints[order] ?? 0) + bonus;
          for (const p of finders) {
            p.found = true;
            p.foundOrder = order;
            p.lastPoints = points;
            p.score += points;
            p.finds++;
            p.findMs += s.phaseT;
            s.events.push({ type: 'found', id: p.id, order, points, ms: s.phaseT });
          }
          s.foundCount += finders.length;
          if (order === 0 && s.players.length - s.foundCount > 1 && s.phaseT + cfg.hurryMs < s.limitMs) {
            s.limitMs = s.phaseT + cfg.hurryMs;
            s.events.push({ type: 'hurry', ms: cfg.hurryMs });
          }
        }
        // All but one have found him (solo: you have) → the round is settled.
        if (s.foundCount >= Math.max(1, s.players.length - 1)) endSearch(s, 'found');
        else if (s.phaseT >= s.limitMs) endSearch(s, 'time');
        break;
      }

      case 'reveal':
        if (s.phaseT >= cfg.revealMs) {
          if (s.round >= cfg.rounds.length) {
            setPhase(s, 'over');
            s.events.push({ type: 'over' });
          } else startRound(s, s.round + 1);
        }
        break;
    }
    return s;
  },

  isOver: (s) => s.phase === 'over',

  result(s) {
    const ordered = [...s.players]
      .sort((a, b) => b.score - a.score || b.finds - a.finds || a.findMs - b.findMs)
      .map((p) => ({ contestantId: p.id, score: p.score, key: `${p.score}|${p.finds}|${Math.round(p.findMs)}` }));
    return {
      placements: rankByKey(ordered),
      durationMs: s.t,
      stats: {
        rounds: s.round,
        finds: s.players.reduce((n, p) => n + p.finds, 0),
        wrong: s.players.reduce((n, p) => n + p.wrongTotal, 0),
      },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },
};
