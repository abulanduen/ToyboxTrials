/**
 * One trial, run by the server: the authoritative rules state, stepped in fixed 60 Hz sub-steps
 * (exactly as the browser's local host steps practice matches), fed by validated player inputs
 * and server-side bots, and turned into per-player views with secrets removed.
 *
 * Pure and deterministic: time is passed in as elapsed milliseconds, randomness comes only from
 * the seed. Unit-tested headless with bots in tests/unit/lobby-match.test.ts.
 */
import { seededRng, subSeed } from '../src/minigames/rng';
import type { Contestant, MatchEvent, MinigameResult, Placement } from '../src/minigames/types';
import type { MinigameId } from '../src/minigames/ids';
import { wireCopy } from '../src/net/delta';
import { serverGame, type BotPolicy, type ServerGame } from './games';

/** The rules' fixed step, the same as the local host (src/minigames/session.ts). */
export const STEP_MS = 1000 / 60;
/** Never run more than this much match time in one advance (a stalled timer must not spiral). */
export const MAX_ADVANCE_MS = 2000;
/** Inputs one player may have waiting for the next step; more are dropped. */
export const MAX_PENDING_INPUTS = 64;
/** A held-input batch (repeatInputs games) stops repeating after this much match time without a new one. */
export const HELD_INPUT_MS = 250;

type Obj = Record<string, unknown>;

/** Forfeits go to the bottom (in their own order); places are recomputed, ties kept. */
export function applyForfeits(placements: Placement[], forfeited: ReadonlySet<string>): Placement[] {
  const marked = placements.map((p) => (forfeited.has(p.contestantId) ? { ...p, forfeit: true } : p));
  const sorted = marked.slice().sort((a, b) => Number(!!a.forfeit) - Number(!!b.forfeit) || a.place - b.place);
  let place = 1;
  return sorted.map((p, i) => {
    if (i > 0) {
      const q = sorted[i - 1];
      if (!!q.forfeit !== !!p.forfeit || q.place !== p.place) place = i + 1;
    }
    return { ...p, place };
  });
}

export class GameRun {
  readonly def: ServerGame;
  readonly state: Obj;
  /** Match time run so far (ms). */
  t = 0;
  private acc = 0;
  private readonly bot: BotPolicy;
  private readonly botRngs = new Map<string, () => number>();
  private readonly pending = new Map<string, unknown[]>();
  private readonly held = new Map<string, { items: unknown[]; at: number }>();
  private events: MatchEvent[] = [];
  readonly forfeited = new Set<string>();
  /** Inputs refused by the game's validator (diagnostics, tests). */
  rejected = 0;

  constructor(
    readonly game: MinigameId,
    readonly seats: Contestant[],
    seed: number,
  ) {
    this.def = serverGame(game);
    this.state = this.def.rules.init(seats, seed, this.def.config) as Obj;
    this.bot = this.def.createBot();
    for (const c of seats) if (c.bot) this.botRngs.set(c.id, seededRng(subSeed(seed, c.id)));
  }

  get over(): boolean {
    return this.def.rules.isOver(this.state);
  }

  /** Queue a human player's inputs for the next step. Returns how many were accepted. */
  input(id: string, items: unknown[]): number {
    const seat = this.seats.find((c) => c.id === id);
    if (!seat || seat.bot || this.forfeited.has(id) || this.over) return 0;
    const ok: unknown[] = [];
    for (const raw of items) {
      const v = raw && typeof raw === 'object' ? this.def.validate(raw as Obj) : null;
      if (v === null) this.rejected++;
      else ok.push(v);
    }
    if (this.def.repeatInputs) {
      // A held-input game: this batch is the player's input until the next one (an empty batch
      // means they let go).
      this.held.set(id, { items: ok, at: this.t });
    }
    const q = this.pending.get(id) ?? [];
    const room = Math.max(0, MAX_PENDING_INPUTS - q.length);
    q.push(...ok.slice(0, room));
    this.pending.set(id, q);
    return Math.min(ok.length, room);
  }

  /** A player is out of this trial for good (left, kicked, or gone too long). */
  forfeit(id: string) {
    if (this.forfeited.has(id)) return;
    this.forfeited.add(id);
    this.pending.delete(id);
    this.held.delete(id);
    if (!this.over) this.def.rules.forfeit?.(this.state, id);
  }

  /** Run `dtMs` of match time (already scaled) in fixed steps. */
  advance(dtMs: number) {
    this.acc += Math.min(Math.max(0, dtMs), MAX_ADVANCE_MS);
    while (this.acc >= STEP_MS && !this.over) {
      this.stepOnce();
      this.acc -= STEP_MS;
    }
    if (this.over) this.acc = 0;
  }

  private stepOnce() {
    const inputs: Record<string, unknown[]> = {};
    for (const [id, q] of this.pending) {
      if (q.length) inputs[id] = q;
    }
    this.pending.clear();
    if (this.def.repeatInputs) {
      for (const [id, h] of this.held) {
        if (inputs[id] || !h.items.length) continue;
        if (this.t - h.at <= HELD_INPUT_MS) inputs[id] = h.items.slice();
        else this.held.delete(id);
      }
    }
    for (const c of this.seats) {
      if (!c.bot) continue;
      const out = this.bot.decide(this.state, c, STEP_MS, this.botRngs.get(c.id)!);
      if (out.length) inputs[c.id] = out;
    }
    this.def.rules.step(this.state, inputs, STEP_MS);
    this.t += STEP_MS;
    for (const e of this.def.rules.drainEvents(this.state)) this.events.push(e);
  }

  /** Events since the last call (sounds and animations for the clients). */
  takeEvents(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** The state as everyone may see it: a JSON-safe copy without hidden information or events. */
  publicView(): Obj {
    const v = wireCopy(this.state) as Obj;
    v.events = [];
    this.def.publicView?.(v);
    return v;
  }

  /** What one player (or a spectator following them) may see, from `publicView()`. */
  viewFor(base: Obj, viewer: string | null): Obj {
    return this.def.viewFor ? this.def.viewFor(base, viewer) : base;
  }

  result(): MinigameResult {
    const r = this.def.rules.result(this.state);
    return { minigame: this.game, ...r, placements: applyForfeits(r.placements, this.forfeited) };
  }
}
