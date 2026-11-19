/**
 * What a lobby runs when its host presses Start: one trial, or a tournament of several, entirely
 * on the server. Phases (the same as the local host's, src/minigames/session.ts):
 *
 *   reveal → countdown → playing → results → (tournament) standings → reveal … → final → done
 *
 * The server owns the seed, picks the tournament's trials from the format's pool (Toy Squad only
 * in Normal and Treasure), seats the field (humans, then bots when the host turned bot fill on),
 * steps the rules (GameRun), keeps the standings, and decides results and placements. Players who
 * joined mid-match watch and are seated at the next trial. A player who leaves, is kicked or stays
 * disconnected longer than RESUME_WINDOW_MS forfeits the trial (last place) and the tournament.
 *
 * Pure and deterministic: no sockets or timers; `now` is passed in. Unit-tested headless.
 */
import { makeBots } from '../src/minigames/bots';
import { subSeed } from '../src/minigames/rng';
import { addRound, pointsForPlace, rankStandings, type Standing } from '../src/minigames/scoring';
import { FORMATS, poolForFormat, selectGames } from '../src/minigames/tournament';
import { GAME_FACTS, onlineGames } from '../src/minigames/facts';
import { SERVER_GAMES } from './games';
import type { MinigameId } from '../src/minigames/ids';
import type { Contestant, MinigameResult } from '../src/minigames/types';
import { PAINT_JOBS } from '../src/game/palette';
import { DEFAULT_LOOK, sanitizeLook } from './sanitize';
import { diff } from '../src/net/delta';
import type { LeaderboardResult } from '../src/net/leaderboardProtocol';
import type { LobbyDifficulty, LobbySettings, Look, MatchEventWire, MatchInfo, MatchPhaseWire, MatchSeat, MatchStateMsg } from '../src/net/protocol';
import { GameRun } from './matchRunner';

/** How long each between-trial phase lasts (ms of match time; `continue` from everyone skips results, standings and final). */
export const PHASE_MS = { reveal: 4500, countdown: 3000, results: 9000, standings: 8000, final: 15000 } as const;
/** A trial that hasn't ended by itself after this long is stopped and scored as it stands. */
export const MAX_TRIAL_MS = 15 * 60_000;
export const MAX_FIELD = 8;

type Obj = Record<string, unknown>;

/** A lobby member as the match sees them. */
export interface FlowMember {
  id: string;
  name: string;
  look: Look;
  /** Signed-in account's username, if linked. */
  account: string | null;
  connected: boolean;
  /** Ready to move on (results, standings, final). */
  ready: boolean;
  /** Spectator: whose view to follow (null: the first seated human). */
  watch: string | null;
}

export interface FlowTick {
  /** Phase, field, standings or result changed: the lobby re-sends its state. */
  changed: boolean;
  /** Match-state messages, one per recipient (player id). */
  snapshots: { to: string; msg: MatchStateMsg }[];
  records: LeaderboardResult[];
  /** The match is over: back to the lobby. */
  done: boolean;
}

interface Tournament {
  format: LobbySettings['format'];
  games: MinigameId[];
  round: number;
  standings: Standing[];
}

/** The trials the server can run (game facts and a server entry). */
const serverPool = () => onlineGames().filter((g) => SERVER_GAMES.has(g.id));

/** Can these settings start with this many humans? Null when yes, else why not. */
export function startProblem(s: LobbySettings, humans: number): 'need_players' | 'not_online' | null {
  const field = fieldSize(s, humans);
  if (s.mode === 'single') {
    const g = GAME_FACTS[s.game];
    if (!g || !SERVER_GAMES.has(s.game)) return 'not_online';
    return field >= g.players.min ? null : 'need_players';
  }
  return poolForFormat(s.format, serverPool(), field).length ? null : 'need_players';
}

/** Humans, plus bots up to the cap when bot fill is on. */
export function fieldSize(s: LobbySettings, humans: number): number {
  return Math.min(MAX_FIELD, s.botFill ? Math.max(humans, s.cap) : humans);
}

const lookOf = (c: Contestant): Look => ({ ...DEFAULT_LOOK, paint: Math.max(0, PAINT_JOBS.indexOf(c.paint)), hat: c.hat, keySkin: c.keySkin });

function contestantOf(m: { id: string; name: string; look: Look }, bot?: LobbyDifficulty): Contestant {
  const look = sanitizeLook(m.look);
  return { id: m.id, name: m.name, paint: PAINT_JOBS[look.paint], hat: look.hat, keySkin: look.keySkin, accessories: { back: look.back, face: look.face, neck: look.neck }, isLocal: false, ...(bot ? { bot } : {}) };
}

export class MatchFlow {
  phase: MatchPhaseWire = 'reveal';
  seq: number;
  game: MinigameId;
  run: GameRun | null = null;
  /** Everyone in the field: humans (seated at the start of each trial) and bots. */
  private field: (Contestant & { look: Look; account: string | null })[] = [];
  private readonly bots: (Contestant & { look: Look })[];
  readonly tournament: Tournament | null;
  private result: MinigameResult | null = null;
  /** Humans out of the match for good (left, kicked, gone). */
  private readonly gone = new Set<string>();
  /** Humans who joined during this match and wait for the next trial. */
  private readonly waiting = new Set<string>();
  private phaseLeft: number = PHASE_MS.reveal;
  private trialMs = 0;
  private lastNow: number;
  private tickNo = 0;
  /** Last view sent to each recipient, for patches. */
  private readonly sent = new Map<string, { seq: number; view: Obj }>();
  private events: MatchEventWire[] = [];
  timeScale: number;

  constructor(
    readonly settings: LobbySettings,
    humans: FlowMember[],
    readonly seed: number,
    now: number,
    seqStart: number,
    timeScale = 1,
  ) {
    this.seq = seqStart;
    this.lastNow = now;
    this.timeScale = timeScale;
    const nBots = Math.max(0, fieldSize(settings, humans.length) - humans.length);
    this.bots = makeBots(subSeed(seed, 'bots'), nBots, settings.difficulty, humans[0]?.name).map((c) => ({ ...c, look: lookOf(c) }));
    const seated = humans.map((h) => ({ ...contestantOf(h), look: h.look, account: h.account }));
    this.field = [...seated, ...this.bots.map((b) => ({ ...b, account: null }))];
    if (settings.mode === 'tournament') {
      const pool = poolForFormat(settings.format, serverPool(), this.field.length);
      const games = selectGames(subSeed(seed, 'games'), FORMATS[settings.format].games, pool);
      this.tournament = { format: settings.format, games, round: 0, standings: this.field.map((c) => ({ contestantId: c.id, points: 0, rounds: [], wins: 0 })) };
      this.game = games[0];
    } else {
      this.tournament = null;
      this.game = settings.game;
      this.phaseLeft = PHASE_MS.reveal - 1500;
    }
  }

  // ------------------------------------------------------------ membership
  /** Seated in the current trial (or the next one, between trials). */
  isSeated(id: string) {
    return this.field.some((c) => c.id === id) && !this.waiting.has(id);
  }

  /** A member who joined mid-match: watches, and is seated at the next trial. */
  addLate(id: string) {
    if (!this.field.some((c) => c.id === id) || this.gone.has(id)) this.waiting.add(id);
    this.gone.delete(id);
  }

  /** A human is out for good: forfeits the trial in play and the rest of the tournament. */
  forfeit(id: string) {
    this.waiting.delete(id);
    if (!this.field.some((c) => c.id === id && !c.bot)) return;
    this.gone.add(id);
    this.run?.forfeit(id);
  }

  input(id: string, seq: number, items: unknown[]) {
    if (seq !== this.seq || this.phase !== 'playing' || !this.run || this.waiting.has(id) || this.gone.has(id)) return 0;
    return this.run.input(id, items);
  }

  /** Send this recipient a full keyframe next (they reconnected, or changed whom they watch). */
  resync(id: string) {
    this.sent.delete(id);
  }

  // ------------------------------------------------------------ what clients see
  info(now: number): MatchInfo {
    const t = this.tournament;
    const timed = this.phase !== 'playing';
    return {
      seq: this.seq,
      phase: this.phase,
      game: this.game,
      endsAt: timed && this.timeScale > 0 ? Math.round(now + this.phaseLeft / this.timeScale) : null,
      seats: this.seats(),
      tournament: t ? { format: t.format, games: t.games, round: t.round, standings: t.standings.map((s) => ({ ...s, rounds: s.rounds.slice() })) } : null,
      result: this.result ? { placements: this.result.placements.map((p) => ({ ...p })), durationMs: Math.round(this.result.durationMs) } : null,
      forfeits: [...this.gone],
      timeScale: this.timeScale,
    };
  }

  /** The field of the current trial (or the one about to start). */
  private seats(): MatchSeat[] {
    return this.field.map((c) => ({ id: c.id, name: c.name, look: c.look, bot: (c.bot as LobbyDifficulty | undefined) ?? null }));
  }

  // ------------------------------------------------------------ time
  tick(now: number, members: FlowMember[]): FlowTick {
    const out: FlowTick = { changed: false, snapshots: [], records: [], done: false };
    const dt = Math.max(0, Math.min(now - this.lastNow, 1000)) * this.timeScale;
    this.lastNow = now;
    this.tickNo++;
    const seatedHumans = members.filter((m) => this.isSeated(m.id) && m.connected);
    const allReady = seatedHumans.length > 0 && seatedHumans.every((m) => m.ready);

    switch (this.phase) {
      case 'reveal':
        if ((this.phaseLeft -= dt) <= 0) {
          this.startTrial(members);
          out.changed = true;
        }
        break;
      case 'countdown':
        if ((this.phaseLeft -= dt) <= 0) {
          this.phase = 'playing';
          out.changed = true;
        }
        break;
      case 'playing': {
        const run = this.run!;
        run.advance(dt);
        this.trialMs += dt;
        for (const e of run.takeEvents()) this.events.push(e as MatchEventWire);
        if (run.over || this.trialMs >= MAX_TRIAL_MS) {
          this.finishTrial(out);
          out.changed = true;
        }
        break;
      }
      case 'results':
      case 'standings':
        if ((this.phaseLeft -= dt) <= 0 || allReady) {
          this.afterResults(out, now);
          out.changed = true;
        }
        break;
      case 'final':
        if ((this.phaseLeft -= dt) <= 0 || allReady) out.done = true;
        break;
    }
    if (this.run && (this.phase === 'countdown' || this.phase === 'playing' || this.phase === 'results')) this.snapshots(members, out);
    return out;
  }

  /** Countdown starts: seat the field and build the rules state from the server's seed. */
  private startTrial(members: FlowMember[]) {
    const present = members.filter((m) => !this.gone.has(m.id));
    // Humans: everyone still here (newcomers too), in join order; leavers drop out.
    const humans = present.map((m) => ({ ...contestantOf(m), look: m.look, account: m.account }));
    this.waiting.clear();
    const def = GAME_FACTS[this.game]!;
    let bots = this.bots.slice();
    // Keep the field within the game's limits: newcomers take a bot's seat; too few toys get bots.
    const want = Math.min(MAX_FIELD, def.players.max, fieldSize(this.settings, humans.length));
    while (humans.length + bots.length > want && bots.length) bots.pop();
    if (humans.length + bots.length < def.players.min) {
      const extra = makeBots(subSeed(this.seed, `fill-${this.seq}`), def.players.min - humans.length - bots.length, this.settings.difficulty, humans[0]?.name)
        .map((c, i) => ({ ...c, id: `bot-x${this.seq}-${i + 1}`, look: lookOf(c) }));
      bots = [...bots, ...extra];
    }
    this.field = [...humans, ...bots.map((b) => ({ ...b, account: null }))];
    const t = this.tournament;
    if (t) {
      for (const c of this.field) {
        if (!t.standings.some((s) => s.contestantId === c.id)) t.standings.push({ contestantId: c.id, points: 0, rounds: new Array<number>(t.round).fill(0), wins: 0 });
      }
    }
    const trialSeed = subSeed(this.seed, `game-${this.seq}`);
    this.run = new GameRun(this.game, this.field, trialSeed);
    this.trialMs = 0;
    this.result = null;
    this.events = [];
    this.phase = 'countdown';
    this.phaseLeft = PHASE_MS.countdown;
  }

  private finishTrial(out: FlowTick) {
    const run = this.run!;
    for (const id of this.gone) run.forfeit(id);
    this.result = run.result();
    for (const e of run.takeEvents()) this.events.push(e as MatchEventWire);
    const t = this.tournament;
    if (t) {
      // Players who are out of the tournament still get this trial's (last) place.
      t.standings = addRound(t.standings, this.result.placements);
      // Anyone in the table but not in this trial (left earlier, or a benched bot) scores nothing.
      for (const s of t.standings) while (s.rounds.length < t.round + 1) s.rounds.push(0);
    } else {
      const of = this.result.placements.length;
      for (const p of this.result.placements) {
        const c = this.field.find((x) => x.id === p.contestantId);
        if (!c || c.bot || p.forfeit || this.gone.has(c.id)) continue;
        out.records.push({ name: c.account ?? c.name, account: !!c.account, board: this.game, place: p.place, of, points: pointsForPlace(p.place), at: this.lastNow });
      }
    }
    this.phase = 'results';
    this.phaseLeft = PHASE_MS.results;
  }

  private afterResults(out: FlowTick, now: number) {
    const t = this.tournament;
    if (!t) {
      out.done = true;
      return;
    }
    if (this.phase === 'results' && t.round + 1 < t.games.length) {
      this.phase = 'standings';
      this.phaseLeft = PHASE_MS.standings;
      return;
    }
    if (this.phase === 'standings') {
      t.round++;
      this.seq++;
      this.game = t.games[t.round];
      this.run = null;
      this.result = null;
      this.phase = 'reveal';
      this.phaseLeft = PHASE_MS.reveal;
      return;
    }
    // Last trial's results: the final table, and the leaderboard.
    this.phase = 'final';
    this.phaseLeft = PHASE_MS.final;
    const ranked = rankStandings(t.standings);
    for (const s of ranked) {
      const c = this.field.find((x) => x.id === s.contestantId);
      if (!c || c.bot || this.gone.has(c.id)) continue;
      out.records.push({ name: c.account ?? c.name, account: !!c.account, board: t.format, place: s.place, of: ranked.length, points: s.points, at: now });
    }
  }

  /** One message per connected member: their own view, a patch when possible, plus the events. */
  private snapshots(members: FlowMember[], out: FlowTick) {
    const run = this.run!;
    const every = run.def.snapshotEvery ?? 1;
    if (this.tickNo % every !== 0 && this.phase === 'playing') return;
    const base = run.publicView();
    const events = this.events;
    this.events = [];
    const firstHuman = this.field.find((c) => !c.bot)?.id ?? this.field[0]?.id ?? null;
    const views = new Map<string | null, Obj>();
    for (const m of members) {
      if (!m.connected) continue;
      const seated = this.isSeated(m.id) && !this.gone.has(m.id);
      const viewer = seated ? m.id : m.watch && this.field.some((c) => c.id === m.watch) ? m.watch : firstHuman;
      let view = views.get(viewer);
      if (!view) views.set(viewer, (view = run.viewFor(base, viewer)));
      const last = this.sent.get(m.id);
      let msg: MatchStateMsg;
      if (!last || last.seq !== this.seq) msg = { t: 'ms', m: this.seq, k: 1, d: view, e: events, n: this.lastNow };
      else {
        const patch = diff(last.view, view);
        if (!patch && !events.length) continue;
        msg = { t: 'ms', m: this.seq, k: 0, d: patch ?? { o: {} }, e: events, n: this.lastNow };
      }
      this.sent.set(m.id, { seq: this.seq, view });
      out.snapshots.push({ to: m.id, msg });
    }
  }
}

/** A fresh match seed from the board's random source. */
export const newMatchSeed = (random: () => number) => Math.floor(random() * 2 ** 32) >>> 0;
