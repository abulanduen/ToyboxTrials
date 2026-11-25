/**
 * Minigame host / match session (GAME_DESIGN.md §5 lifecycle).
 *
 *   picker → reveal (tournaments) → loading → intro → countdown → playing → results
 *        → (tournament) standings → reveal next … → final
 *
 * React UI reads the `useMatch` store (phase changes only). The live rules state and bot memory
 * live in the module-level `runtime` object and are stepped by `tickMatch()` from the render loop,
 * so nothing re-renders per frame.
 */
import { create } from 'zustand';
import { useGame } from '../game/store';
import { HUB_BINDINGS, clearInput, getPressLog, setBindings } from '../game/input';
import { exposeDebug } from '../game/debug';
import { paintJobFor } from '../game/cosmetics';
import { accessoriesOf } from '../game/profile';
import { NO_REWARD, applyReward, dateKey, grantAchievements, rewardForGame, rewardForTournament, statsFrom, type Reward } from '../game/economy';
import { sfx } from '../game/audio';
import { Emitter } from '../game/events';
import { player } from '../game/player';
import { MINIGAMES, gameById } from './registry';
import { makeBots } from './bots';
import { newSeed, seededRng, subSeed } from './rng';
import { addRound, rankStandings, type Standing } from './scoring';
import { poolForFormat, selectTournament, type TournamentFormat } from './tournament';
import type { BotDifficulty, Contestant, MatchEvent, MinigameId, MinigameModule, MinigameResult } from './types';
import { importFresh } from '../game/staleBuild';

/** `lobby`: an online lobby's waiting room (src/minigames/remote.ts). */
export type MatchPhase = 'idle' | 'picker' | 'reveal' | 'loading' | 'intro' | 'countdown' | 'playing' | 'results' | 'standings' | 'final' | 'lobby';

export const LOCAL_ID = 'you';
const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 10;
export const COUNTDOWN_MS = 3000;

export interface TournamentRun {
  format: TournamentFormat;
  seed: number;
  games: MinigameId[];
  /** Index of the current game in `games`. */
  round: number;
  standings: Standing[];
}

interface MatchStore {
  phase: MatchPhase;
  /** `online`: a server-run lobby match (remote.ts); the rest are local. */
  kind: 'practice' | 'tournament' | 'online' | null;
  gameId: MinigameId | null;
  module: MinigameModule | null;
  contestants: Contestant[];
  seed: number;
  /** Practice: number of bot opponents (0 = solo). Tournament: field size − 1. */
  opponents: number;
  difficulty: BotDifficulty;
  tournament: TournamentRun | null;
  lastResult: MinigameResult | null;
  newBest: boolean;
  /** Cogs paid for the last finished trial (results screen), and items it unlocked. */
  reward: Reward;
  /** Cogs paid for finishing the tournament (final screen). */
  tournamentReward: Reward;
  /** Names of items unlocked by achievements since the last results screen. */
  unlocked: string[];
  paused: boolean;
  error: string | null;
  /** The contestant id the Scene and Hud treat as "you": LOCAL_ID locally; the player's server id online. */
  localId: string;
  set: (p: Partial<MatchStore>) => void;
}

export const useMatch = create<MatchStore>()((set) => ({
  phase: 'idle',
  kind: null,
  gameId: null,
  module: null,
  contestants: [],
  seed: 0,
  opponents: 0,
  difficulty: 'normal',
  tournament: null,
  lastResult: null,
  newBest: false,
  reward: NO_REWARD,
  tournamentReward: NO_REWARD,
  unlocked: [],
  paused: false,
  error: null,
  localId: 'you',
  set: (p) => set(p),
}));

/** Rules-core events re-broadcast for the minigame Scene/Hud (sounds, animations). */
export const matchBus = new Emitter<{ event: MatchEvent; countdown: { n: number } }>();

const runtime = {
  state: null as unknown,
  acc: 0,
  bot: null as ReturnType<NonNullable<MinigameModule['createBot']>> | null,
  botRngs: new Map<string, () => number>(),
  countdownLeft: 0,
  lastCount: 4,
  timeScale: 1,
  pendingLocal: [] as unknown[],
  startedAt: 0,
};

export const getMatchState = () => (remoteHost.active ? remoteHost.getState() : runtime.state);

/**
 * Online lobby matches (src/minigames/remote.ts) plug in here: while `active`, the host shows the
 * server's state instead of running the local rules, and the frame tick goes to the remote host
 * (which sends local input to the server). Local practice and tournaments never set it.
 */
export const remoteHost = {
  active: false,
  getState: (): unknown => null,
  tick: (_dtRealMs: number): void => {},
  /** Tell the server whose board this seated player is looking at (null: their own). */
  follow: (_id: string | null): void => {},
};

/**
 * A game's HUD switched which player's board it shows (the player rail). Locally nothing is
 * needed (every board is in the state); online, the server is told, so games that send other
 * boards only on request (Toy Squad's battles) include the one being viewed.
 */
export function followBoard(id: string | null) {
  if (remoteHost.active) remoteHost.follow(id);
}

function localContestant(): Contestant {
  const g = useGame.getState();
  const l = g.profile.loadout;
  return {
    id: LOCAL_ID,
    name: g.contenderName || 'You',
    paint: paintJobFor(l.paint),
    hat: l.hat,
    keySkin: l.keySkin,
    accessories: accessoriesOf(l),
    isLocal: true,
  };
}

export function enterMinigameScreen() {
  const g = useGame.getState();
  if (g.screen !== 'minigame') {
    // Remember where to put the toy back in the hub.
    g.set({ hubReturn: { x: player.pos.x, z: player.pos.z, yaw: player.yaw, level: player.level } });
    g.goTo('minigame');
  }
  player.pos.set(0, 0, 0); // centre the shadow frustum on the stage
}

async function loadGame(id: MinigameId) {
  const def = gameById(id);
  if (!def.load) throw new Error(`${def.title} isn't playable yet.`);
  // The previous game's state must never reach the next game's Scene (it renders behind the
  // intro card before beginCountdown builds fresh state) — e.g. between tournament rounds.
  runtime.state = null;
  runtime.bot = null;
  useMatch.getState().set({ phase: 'loading', gameId: id, module: null, error: null });
  try {
    const mod = await importFresh(def.load);
    useMatch.getState().set({ module: mod, phase: 'intro' });
  } catch (e) {
    useMatch.getState().set({ error: (e as Error).message, phase: 'intro' });
  }
}

// ---------------------------------------------------------------------------------- practice

/** Open a minigame for solo practice (or vs bots). */
export function openPractice(id: MinigameId) {
  enterMinigameScreen();
  const m = useMatch.getState();
  const def = gameById(id);
  let opponents = m.kind === 'practice' ? m.opponents : 0;
  // Games that need company (e.g. Jack-in-the-Box) default to a few bots.
  if (opponents + 1 < def.players.min) opponents = Math.min(3, def.players.max - 1);
  if (opponents + 1 > def.players.max) opponents = def.players.max - 1;
  m.set({ kind: 'practice', tournament: null, lastResult: null, contestants: [localContestant()], opponents });
  void loadGame(id);
}

export function setPracticeOpponents(n: number, difficulty?: BotDifficulty) {
  useMatch.getState().set({ opponents: n, ...(difficulty ? { difficulty } : {}) });
}

// -------------------------------------------------------------------------------- tournament

export function openTournamentPicker() {
  useMatch.getState().set({ phase: 'picker' });
}

export function startTournament(format: TournamentFormat, opponents: number, difficulty: BotDifficulty) {
  const field = opponents + 1;
  // The format's rotation for this field size; Normal and Treasure end with a strategy finale.
  const pool = poolForFormat(format, MINIGAMES, field);
  const seed = newSeed();
  const games = selectTournament(seed, format, pool);
  const local = localContestant();
  const bots = makeBots(subSeed(seed, 'bots'), opponents, difficulty, local.name);
  const contestants = [local, ...bots];
  useMatch.getState().set({
    kind: 'tournament',
    contestants,
    opponents,
    difficulty,
    lastResult: null,
    tournament: { format, seed, games, round: 0, standings: contestants.map((c) => ({ contestantId: c.id, points: 0, rounds: [], wins: 0 })) },
    phase: 'reveal',
  });
  enterMinigameScreen();
}

/** From the reveal card: load the current tournament game. */
export function playRevealedGame() {
  const t = useMatch.getState().tournament;
  if (t) void loadGame(t.games[t.round]);
}

// --------------------------------------------------------------------------------- lifecycle

/** Intro → countdown (or straight to playing for `skipStartCountdown` games). Builds the field (adds practice bots) and initialises the rules. */
export function beginCountdown() {
  const m = useMatch.getState();
  const mod = m.module;
  if (!mod) return;
  let contestants = m.contestants;
  let seed: number;
  if (m.kind === 'practice') {
    seed = newSeed();
    contestants = [localContestant(), ...makeBots(subSeed(seed, 'bots'), m.opponents, m.difficulty, localContestant().name)];
  } else {
    const t = m.tournament!;
    seed = subSeed(t.seed, `game-${t.round}`);
  }
  runtime.state = mod.rules.init(contestants, seed);
  runtime.bot = mod.createBot?.() ?? null;
  runtime.botRngs = new Map(contestants.filter((c) => c.bot).map((c) => [c.id, seededRng(subSeed(seed, c.id))]));
  runtime.acc = 0;
  runtime.pendingLocal = [];
  // Games that open with their own untimed pre-phase (Spellbox's draft) skip the 3-2-1.
  const skip = !!m.gameId && !!gameById(m.gameId).skipStartCountdown;
  runtime.countdownLeft = skip ? 0 : COUNTDOWN_MS;
  runtime.lastCount = skip ? 0 : 4;
  if (skip) runtime.startedAt = performance.now();
  m.set({ contestants, seed, phase: skip ? 'playing' : 'countdown', paused: false, lastResult: null, newBest: false, reward: NO_REWARD, unlocked: [] });
  setBindings(mod.bindings);
  clearInput();
}

/** Called every rendered frame while the minigame screen is up (from MatchDriver). */
export function tickMatch(dtRealMs: number) {
  if (remoteHost.active) return remoteHost.tick(dtRealMs);
  const m = useMatch.getState();
  const mod = m.module;
  if (!mod || !runtime.state || m.paused) return;
  const dtMs = Math.min(dtRealMs, 100) * runtime.timeScale;

  if (m.phase === 'countdown') {
    runtime.countdownLeft -= dtMs;
    const n = Math.ceil(runtime.countdownLeft / 1000);
    if (n !== runtime.lastCount && n >= 0) {
      runtime.lastCount = n;
      matchBus.emit('countdown', { n });
      if (n > 0) sfx.click();
      else sfx.bell();
    }
    if (runtime.countdownLeft <= 0) {
      runtime.startedAt = performance.now();
      m.set({ phase: 'playing' });
    }
    return;
  }
  if (m.phase !== 'playing') return;

  // Local presses are queued and delivered on the next fixed step. On high-refresh displays
  // (e.g. 120 Hz) many frames run no 60 Hz step at all — without the queue those presses vanish.
  runtime.pendingLocal.push(...mod.readLocalInput(getPressLog()));
  runtime.acc += dtMs;
  let steps = 0;
  const maxSteps = MAX_STEPS_PER_FRAME * Math.max(1, runtime.timeScale);
  while (runtime.acc >= STEP_MS && steps < maxSteps) {
    const inputs: Record<string, unknown[]> = {};
    if (runtime.pendingLocal.length) {
      inputs[LOCAL_ID] = runtime.pendingLocal;
      runtime.pendingLocal = [];
    }
    if (runtime.bot) {
      for (const c of m.contestants) {
        if (!c.bot) continue;
        const out = runtime.bot.decide(runtime.state, c, STEP_MS, runtime.botRngs.get(c.id)!);
        if (out.length) inputs[c.id] = out;
      }
    }
    mod.rules.step(runtime.state, inputs, STEP_MS);
    for (const ev of mod.rules.drainEvents(runtime.state)) matchBus.emit('event', ev);
    runtime.acc -= STEP_MS;
    steps++;
    if (mod.rules.isOver(runtime.state)) {
      finishGame();
      return;
    }
  }
  if (steps >= maxSteps) runtime.acc = 0; // don't spiral after a long hitch
}

function finishGame() {
  const m = useMatch.getState();
  const mod = m.module!;
  const res: MinigameResult = { minigame: m.gameId!, ...mod.rules.result(runtime.state) };
  const g = useGame.getState();
  const mine = res.placements.find((p) => p.contestantId === LOCAL_ID);
  // Records: best score, plays, wins (practice and tournament both count).
  const prev = g.records[res.minigame] ?? { best: 0, plays: 0, wins: 0 };
  const newBest = !!mine && mine.score > prev.best;
  const records = {
    ...g.records,
    [res.minigame]: {
      best: Math.max(prev.best, mine?.score ?? 0),
      plays: prev.plays + 1,
      wins: prev.wins + (mine?.place === 1 && res.placements.length > 1 ? 1 : 0),
    },
  };
  // Cogs for this trial (economy.ts), then any achievement the new records meet.
  const today = dateKey(new Date());
  const reward = rewardForGame({ placements: res.placements, localId: LOCAL_ID, newBest, today, firstWinDay: g.profile.firstWinDay });
  const ach = grantAchievements(applyReward(g.profile, reward, today), statsFrom(records, g.tournamentWins), Date.now());
  g.set({ records, profile: ach.profile });
  let tournament = m.tournament;
  if (tournament) tournament = { ...tournament, standings: addRound(tournament.standings, res.placements) };
  setBindings(HUB_BINDINGS);
  clearInput();
  if (mine?.place === 1) sfx.reward();
  m.set({ phase: 'results', lastResult: res, newBest, tournament, reward, unlocked: ach.unlocked.map((i) => i.name) });
}

/** Results → next step. */
export function continueAfterResults() {
  const m = useMatch.getState();
  if (m.kind === 'tournament' && m.tournament) {
    const t = m.tournament;
    if (t.round + 1 < t.games.length) {
      m.set({ phase: 'standings' });
    } else {
      finishTournament();
    }
  } else {
    m.set({ phase: 'intro' }); // practice: back to the intro card to go again
  }
}

/** Standings → reveal the next game. */
export function nextTournamentRound() {
  const m = useMatch.getState();
  if (!m.tournament) return;
  m.set({ tournament: { ...m.tournament, round: m.tournament.round + 1 }, phase: 'reveal', module: null });
}

function finishTournament() {
  const m = useMatch.getState();
  const t = m.tournament!;
  const ranked = rankStandings(t.standings);
  const me = ranked.find((s) => s.contestantId === LOCAL_ID);
  const g = useGame.getState();
  const history = [{ format: t.format, place: me?.place ?? ranked.length, of: ranked.length, games: t.games, at: Date.now() }, ...g.tournamentHistory].slice(0, 10);
  const tournamentWins = { ...g.tournamentWins, [t.format]: (g.tournamentWins[t.format] ?? 0) + (me?.place === 1 ? 1 : 0) };
  const today = dateKey(new Date());
  const tournamentReward = rewardForTournament({ trials: t.games.length, place: me?.place ?? ranked.length, today, firstWinDay: g.profile.firstWinDay });
  const ach = grantAchievements(applyReward(g.profile, tournamentReward, today), statsFrom(g.records, tournamentWins), Date.now());
  g.set({ tournamentHistory: history, tournamentWins, profile: ach.profile });
  if (me?.place === 1) sfx.reward();
  m.set({ phase: 'final', tournamentReward, unlocked: ach.unlocked.map((i) => i.name) });
}

export function pauseMatch(on: boolean) {
  const m = useMatch.getState();
  if (m.phase === 'playing' || m.phase === 'countdown') {
    m.set({ paused: on });
    clearInput();
  }
}

/** Leave to the Playroom. Mid-match in a tournament this abandons the tournament. */
export function quitMatch() {
  runtime.state = null;
  runtime.bot = null;
  setBindings(HUB_BINDINGS);
  clearInput();
  useMatch.getState().set({ phase: 'idle', kind: null, gameId: null, module: null, tournament: null, paused: false, lastResult: null });
  useGame.getState().goTo('playing');
}

/** Test hook (?debug only): speed up match time. */
export function setMatchTimeScale(k: number) {
  runtime.timeScale = k;
}

exposeDebug({
  match: {
    state: () => getMatchState(), // the server's state during online matches
    phase: () => useMatch.getState().phase,
    timeScale: setMatchTimeScale,
    /** Open a game's practice card directly (for games without a hub entrance yet). */
    practice: (id: MinigameId) => openPractice(id),
  },
});
