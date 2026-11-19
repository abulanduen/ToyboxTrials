/**
 * Odd Page Out — rules core (GAME_DESIGN.md §4 · 12). Deterministic; no DOM, no timers.
 *
 * Two pictures from a storybook, side by side. Each round:
 *  - one of the four scenes (themes.ts), in a seeded order with no repeats in a match;
 *  - the reference page gives every one of the scene's 60 slots a random variant, so the original
 *    itself is different every round;
 *  - 15 of the 60 slots, spread out over the page (`pickSpread`), get a different variant on the
 *    second page. Everything else is the same on both.
 *
 * Players tap either page. A tap is in normalised picture coordinates (0..1 across and down), so
 * the rules never know the screen size. A tap inside an unfound difference's hit circle finds it
 * (+10). Inside one you already found: nothing happens. Anywhere else: a wrong tap, and you are
 * locked out for a second. Everyone has the same pictures; each player's finds are their own.
 *
 * Find all 15 and you get a bonus by finishing order (first 60, then 40, 30, 20) plus up to 40 for
 * time left. A round lasts 30 s, or until everyone has found all 15. Four rounds.
 * Placement: total points, then differences found, then the faster finds (sum of find times).
 */
import { randInt, seededRng, shuffle, subSeed } from '../rng';
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { PIC_H, PIC_W } from './shapes';
import { THEMES, themeById, type SlotDef, type ThemeDef, type ThemeId } from './themes';

/** A tap, in normalised picture coordinates (0..1 across, 0..1 down). Either page. */
export interface SpotInput {
  x: number;
  y: number;
}

export interface SpotConfig {
  rounds: number;
  /** Differences per round. */
  diffs: number;
  introMs: number;
  /** The page turn before each round (pictures covered). */
  turnMs: number;
  searchMs: number;
  revealMs: number;
  pointsPerFind: number;
  /** Bonus for finding them all, by finishing order (the last value repeats). */
  finishBonus: number[];
  /** Extra bonus for finding them all, scaled by the time left (all of it at 0 s). */
  speedBonus: number;
  /** Lockout after a wrong tap. */
  lockMs: number;
  /** Differences are at least this far apart (picture units) where the scene allows it. */
  spacing: number;
}

export const DEFAULT_CONFIG: SpotConfig = {
  rounds: 4,
  diffs: 15,
  introMs: 900,
  turnMs: 2200,
  searchMs: 30000,
  revealMs: 3000,
  pointsPerFind: 10,
  finishBonus: [60, 40, 30, 20],
  speedBonus: 40,
  lockMs: 1000,
  spacing: 64,
};

export interface RoundData {
  theme: ThemeId;
  /** Variant per slot on the reference (left / top) page. */
  ref: number[];
  /** Variant per slot on the other page: equal to `ref` except at `diffs`. */
  alt: number[];
  /** The slots that differ, ascending. */
  diffs: number[];
}

export interface SpotPlayer {
  id: string;
  score: number;
  /** This round: slots found, in the order found, and when (ms into the search). */
  found: number[];
  foundAt: number[];
  /** Found all of this round's differences; 0-based finishing order (or -1) and the bonus paid. */
  done: boolean;
  doneOrder: number;
  bonus: number;
  lockMs: number;
  /** Wrong taps this round. */
  wrong: number;
  /** Match totals. */
  finds: number;
  findMs: number;
  wrongTotal: number;
  /** Rounds in which this player found all the differences. */
  clears: number;
}

export type Phase = 'intro' | 'turn' | 'search' | 'reveal' | 'over';

export interface SpotState {
  config: SpotConfig;
  seed: number;
  /** Scenes in the order this match plays them. */
  themes: ThemeId[];
  t: number;
  phase: Phase;
  phaseT: number;
  /** 1-based. */
  round: number;
  data: RoundData;
  /** Players who have found everything this round. */
  doneCount: number;
  players: SpotPlayer[];
  events: MatchEvent[];
}

const dist = (a: SlotDef, b: SlotDef) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Pick `k` slots at random, each at least `spacing` from the others. A few seeded shuffles are
 * tried at each spacing; where the scene can't fit that many, the spacing shrinks by 10 % at a time.
 */
export function pickSpread(rng: () => number, slots: readonly SlotDef[], k: number, spacing: number): number[] {
  const all = slots.map((_, i) => i);
  for (let d = spacing; d >= 1; d *= 0.9) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const chosen: number[] = [];
      for (const i of shuffle(rng, all)) {
        if (chosen.every((j) => dist(slots[i], slots[j]) >= d)) chosen.push(i);
        if (chosen.length === k) return chosen.sort((a, b) => a - b);
      }
    }
  }
  return shuffle(rng, all)
    .slice(0, k)
    .sort((a, b) => a - b);
}

/** The order of scenes for a match (no repeats until every scene has been used). */
export function themeOrder(seed: number): ThemeId[] {
  return shuffle(
    seededRng(subSeed(seed, 'themes')),
    THEMES.map((t) => t.id),
  );
}

/** Build round `round` (1-based) of a match: its scene, both pages' variants and the differences. */
export function buildRound(seed: number, round: number, themes: readonly ThemeId[], cfg: SpotConfig = DEFAULT_CONFIG): RoundData {
  const theme = themeById(themes[(round - 1) % themes.length]);
  const rng = seededRng(subSeed(seed, `round-${round}`));
  const ref = theme.slots.map((s) => randInt(rng, s.vary.length));
  const diffs = pickSpread(rng, theme.slots, Math.min(cfg.diffs, theme.slots.length), cfg.spacing);
  const alt = ref.slice();
  for (const i of diffs) {
    const n = theme.slots[i].vary.length;
    alt[i] = (ref[i] + 1 + randInt(rng, n - 1)) % n;
  }
  return { theme: theme.id, ref, alt, diffs };
}

export type Hit = { kind: 'find'; slot: number } | { kind: 'again'; slot: number } | { kind: 'miss' };

/**
 * What a tap at (px, py) in picture units hits. Only differences count: a tap inside one or more
 * hit circles goes to the nearest (distance over radius) one you haven't found yet; if every one
 * it is inside is already found, nothing happens (`again`); outside them all, it's a miss.
 */
export function hitTest(theme: ThemeDef, diffs: readonly number[], found: readonly number[], px: number, py: number): Hit {
  let best = -1;
  let bestQ = Infinity;
  let again = -1;
  let againQ = Infinity;
  for (const i of diffs) {
    const s = theme.slots[i];
    const q = Math.hypot(px - s.x, py - s.y) / s.r;
    if (q > 1) continue;
    if (found.includes(i)) {
      if (q < againQ) {
        againQ = q;
        again = i;
      }
    } else if (q < bestQ) {
      bestQ = q;
      best = i;
    }
  }
  if (best >= 0) return { kind: 'find', slot: best };
  if (again >= 0) return { kind: 'again', slot: again };
  return { kind: 'miss' };
}

/** Bonus for finding everything: by finishing order, plus the share of the round left. */
export function finishBonus(cfg: SpotConfig, order: number, ms: number): number {
  const base = cfg.finishBonus[Math.min(order, cfg.finishBonus.length - 1)] ?? 0;
  return base + Math.round(cfg.speedBonus * Math.max(0, 1 - ms / cfg.searchMs));
}

function setPhase(s: SpotState, phase: Phase) {
  s.phase = phase;
  s.phaseT = 0;
}

function startRound(s: SpotState, round: number) {
  s.round = round;
  s.data = buildRound(s.seed, round, s.themes, s.config);
  s.doneCount = 0;
  for (const p of s.players) {
    p.found = [];
    p.foundAt = [];
    p.done = false;
    p.doneOrder = -1;
    p.bonus = 0;
    p.lockMs = 0;
    p.wrong = 0;
  }
  setPhase(s, 'turn');
  s.events.push({ type: 'round-start', round, theme: s.data.theme });
}

function endSearch(s: SpotState, reason: 'all' | 'time') {
  for (const p of s.players) p.lockMs = 0;
  setPhase(s, 'reveal');
  s.events.push({ type: 'reveal', round: s.round, reason });
}

const inRange = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export const spotRules: RulesCore<SpotState, SpotInput, SpotConfig> = {
  init(contestants: Contestant[], seed: number, config?: Partial<SpotConfig>): SpotState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const themes = themeOrder(seed);
    return {
      config: cfg,
      seed,
      themes,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      round: 1,
      data: buildRound(seed, 1, themes, cfg),
      doneCount: 0,
      players: contestants.map((c) => ({
        id: c.id,
        score: 0,
        found: [],
        foundAt: [],
        done: false,
        doneOrder: -1,
        bonus: 0,
        lockMs: 0,
        wrong: 0,
        finds: 0,
        findMs: 0,
        wrongTotal: 0,
        clears: 0,
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

      case 'turn':
        if (s.phaseT >= cfg.turnMs) {
          setPhase(s, 'search');
          s.events.push({ type: 'search', round: s.round });
        }
        break;

      case 'search': {
        const theme = themeById(s.data.theme);
        const finishers: SpotPlayer[] = [];
        for (const p of s.players) {
          if (p.lockMs > 0) {
            p.lockMs = Math.max(0, p.lockMs - dtMs);
            if (p.lockMs === 0) s.events.push({ type: 'unlock', id: p.id });
          }
          if (p.done || p.lockMs > 0) continue;
          for (const inp of inputs[p.id] ?? []) {
            if (!inRange(inp?.x) || !inRange(inp?.y)) continue;
            const hit = hitTest(theme, s.data.diffs, p.found, inp.x * PIC_W, inp.y * PIC_H);
            if (hit.kind === 'again') {
              s.events.push({ type: 'again', id: p.id, slot: hit.slot });
              continue;
            }
            if (hit.kind === 'miss') {
              p.lockMs = cfg.lockMs;
              p.wrong++;
              p.wrongTotal++;
              s.events.push({ type: 'wrong', id: p.id, x: inp.x, y: inp.y, lockMs: cfg.lockMs });
              break; // locked: the rest of this step's taps are ignored
            }
            p.found.push(hit.slot);
            p.foundAt.push(s.phaseT);
            p.score += cfg.pointsPerFind;
            p.finds++;
            p.findMs += s.phaseT;
            s.events.push({ type: 'found', id: p.id, slot: hit.slot, count: p.found.length, points: cfg.pointsPerFind });
            if (p.found.length >= s.data.diffs.length) {
              finishers.push(p);
              break;
            }
          }
        }
        if (finishers.length) {
          // Finishing in the same step ties: the same order and the same bonus.
          const order = s.doneCount;
          const bonus = finishBonus(cfg, order, s.phaseT);
          for (const p of finishers) {
            p.done = true;
            p.doneOrder = order;
            p.bonus = bonus;
            p.score += bonus;
            p.clears++;
            s.events.push({ type: 'done', id: p.id, order, bonus, ms: s.phaseT });
          }
          s.doneCount += finishers.length;
        }
        if (s.doneCount >= s.players.length) endSearch(s, 'all');
        else if (s.phaseT >= cfg.searchMs) endSearch(s, 'time');
        break;
      }

      case 'reveal':
        if (s.phaseT >= cfg.revealMs) {
          if (s.round >= cfg.rounds) {
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
        clears: s.players.reduce((n, p) => n + p.clears, 0),
      },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },
};
