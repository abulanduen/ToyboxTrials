/**
 * Every trial as the game server runs it: the same pure rules cores and bot policies the browser
 * uses for practice (src/minigames/<game>/rules.ts and bot.ts), plus what only the server needs:
 *
 *   - `validate`: the meaning of one input (the protocol has already checked its shape);
 *   - `publicView`: hidden information removed from the state before it leaves the server, for
 *     everyone (seeds, pre-rolled timings, Jack-in-the-Box's fuse, other players' queued inputs);
 *   - `viewFor`: what only one player may see (Toy Squad: your own shop, passives and battle);
 *   - `config`: online-only rule settings (Music Box Rhythm's wider input window);
 *   - `repeatInputs`: held-input games whose last batch stands until the next one arrives.
 *
 * Pure: no sockets, timers or wall clock. Unit-tested in tests/unit/lobby-match.test.ts.
 */
import type { BotPolicy as GameBotPolicy, RulesCore } from '../src/minigames/types';
import type { MinigameId } from '../src/minigames/ids';
import { GAME_FACTS } from '../src/minigames/facts';
import { copycatRules } from '../src/minigames/copycat/rules';
import { createCopycatBot } from '../src/minigames/copycat/bot';
import { infernoRules } from '../src/minigames/inferno/rules';
import { createInfernoBot } from '../src/minigames/inferno/bot';
import { hungerRules } from '../src/minigames/midnight/rules';
import { createHungerBot } from '../src/minigames/midnight/bot';
import { findRules } from '../src/minigames/findoriginal/rules';
import { createFindBot } from '../src/minigames/findoriginal/bot';
import { rlglRules } from '../src/minigames/redlight/rules';
import { createRlglBot } from '../src/minigames/redlight/bot';
import { blinkRules } from '../src/minigames/blink/rules';
import { createBlinkBot } from '../src/minigames/blink/bot';
import { dashRules } from '../src/minigames/winddash/rules';
import { createDashBot } from '../src/minigames/winddash/bot';
import { rhythmRules } from '../src/minigames/rhythm/rules';
import { createRhythmBot } from '../src/minigames/rhythm/bot';
import { squadRules } from '../src/minigames/toysquad/rules';
import { createSquadBot } from '../src/minigames/toysquad/bot';
import { spellboxRules } from '../src/minigames/spellbox/rules';
import { createSpellboxBot } from '../src/minigames/spellbox/bot';
import { jackRules } from '../src/minigames/jackbox/rules';
import { spotRules } from '../src/minigames/spotdiff/rules';
import { createSpotBot } from '../src/minigames/spotdiff/bot';
import { tumbleRules } from '../src/minigames/towertumble/rules';
import { createTumbleBot } from '../src/minigames/towertumble/bot';
import { createJackBot } from '../src/minigames/jackbox/bot';
import { siegeRules, CLASS_IDS as SIEGE_CLASSES } from '../src/minigames/siege/rules';
import { createSiegeBot } from '../src/minigames/siege/bot';
import { hoopRules as hoopHustleRules } from '../src/minigames/hoophustle/rules';
import { createHoopBot as createHoopHustleBot } from '../src/minigames/hoophustle/bot';
import { hoopRules as hoopClashRules } from '../src/minigames/hoopclash/rules';
import { createHoopBot as createHoopClashBot } from '../src/minigames/hoopclash/bot';

type Obj = Record<string, unknown>;

// `any`: the catalogue holds every game's own state and input types.
export type RulesCoreAny = RulesCore<any, any, any> & { forfeit?(state: any, id: string): void };
export type BotPolicy = GameBotPolicy<any, any>;

export interface ServerGame {
  id: MinigameId;
  rules: RulesCoreAny;
  createBot: () => BotPolicy;
  /** The input as the rules core expects it, or null to drop it. */
  validate(input: Obj): unknown | null;
  /** Remove hidden information from a fresh wire copy of the state (mutating it is fine). */
  publicView?(view: Obj): void;
  /**
   * What `viewer` may see, from the public view (return a shallow copy; never mutate `view`).
   * `watching` is another seat whose board the viewer is looking at (a game's player rail), if any.
   */
  viewFor?(view: Obj, viewer: string | null, watching?: string | null): Obj;
  /**
   * Optional, for large states: before the wire copy, cut the parts no viewer this tick will be
   * sent (return a shallow copy of the raw state; never mutate it). `views` are the (viewer,
   * watching) pairs about to be served; `viewFor` must still cut each view on its own. Saves the
   * server copying data it then throws away (Toybox Siege's eight 75 KB boards).
   */
  trimForViews?(state: Obj, views: readonly { viewer: string | null; watching: string | null }[]): Obj;
  config?: Obj;
  repeatInputs?: boolean;
  /** Send a snapshot every N server ticks (default 1). */
  snapshotEvery?: number;
}

const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const num = (v: unknown, lim: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const opt = <T>(v: unknown, ok: (x: unknown) => x is T) => v === undefined || ok(v);

/** Toybox Siege: which boards one viewer is sent whole (their own and the one they watch; none in the arena). */
function siegeKeep(v: Obj, viewer: string | null): Set<unknown> {
  const players = v.players as Obj[];
  const me = players.find((p) => p.id === viewer);
  const keep = new Set<unknown>(v.phase === 'arena' || v.phase === 'over' ? [] : [viewer, me?.watching ?? null]);
  if (!me && v.phase === 'run') keep.add(players.find((p) => p.status === 'alive')?.id ?? players[0]?.id);
  return keep;
}
/** Pooled entity lists on a Siege board (each slot has `on`; the client never reads a dead slot's other fields). */
const SIEGE_POOLS = ['mobs', 'projs', 'shots', 'gems', 'chests', 'blasts', 'bigs'] as const;
const DEAD_SLOT: Obj = Object.freeze({ on: false }) as Obj;
/** A board as sent whole: every dead pool slot is just `{ on: false }` (no stale fields to copy, diff and send). */
const siegeLive = (b: Obj): Obj => {
  const out: Obj = { ...b };
  for (const k of SIEGE_POOLS) if (Array.isArray(b[k])) out[k] = (b[k] as Obj[]).map((e) => (e.on ? e : DEAD_SLOT));
  return out;
};
/** A board cut to what other players need: no pooled entities, only its live elites (the HUD's send-limit check). */
const siegeStub = (b: Obj): Obj => ({ ...b, mobs: [], projs: [], shots: [], gems: [], chests: [], blasts: [], bigs: (b.bigs as Obj[]).filter((g) => g.on) });

/** Movement games (Red Light, Wind-Up Dash): the shared MoveInput. */
function moveInput(i: Obj) {
  if (!num(i.ax, 1.5) || !num(i.ay, 1.5)) return null;
  return { ax: i.ax, ay: i.ay, run: i.run === true, jump: i.jump === true };
}

/** The seed lets a client compute everything the rules will roll next. Never sent. */
const hideSeed = (v: Obj) => {
  if ('seed' in v) v.seed = 0;
};

const GAMES: ServerGame[] = [
  {
    id: 'copycat-conductor',
    rules: copycatRules as RulesCoreAny,
    createBot: createCopycatBot as () => BotPolicy,
    validate: (i) => (int(i.slot, 0, 3) ? { slot: i.slot } : null),
    publicView(v) {
      hideSeed(v);
      // The tune is revealed note by note in the demonstration: nothing ahead of it is sent.
      const seq = v.sequence as number[];
      const shown = v.phase === 'intro' ? 0 : v.phase === 'demo' ? (v.demoIndex as number) : seq.length;
      v.sequence = seq.map((n, i) => (i < shown ? n : 0));
    },
  },
  {
    id: 'inferno-escape',
    rules: infernoRules as RulesCoreAny,
    createBot: createInfernoBot as () => BotPolicy,
    validate: (i) => (opt(i.direction, (x): x is number => int(x, 0, 3)) && opt(i.action, (x): x is string => x === 'break' || x === 'build') ? { ...(i.direction !== undefined ? { direction: i.direction } : {}), ...(i.action !== undefined ? { action: i.action } : {}) } : null),
    repeatInputs: GAME_FACTS['inferno-escape']?.heldInputs,
  },
  {
    id: 'midnight-hunger',
    rules: hungerRules as RulesCoreAny,
    createBot: createHungerBot as () => BotPolicy,
    validate: (i) => (opt(i.direction, (x): x is number | null => x === null || int(x, 0, 3)) && opt(i.hit, (x): x is boolean => typeof x === 'boolean') ? { direction: i.direction ?? null, hit: i.hit === true } : null),
    publicView: hideSeed,
    repeatInputs: GAME_FACTS['midnight-hunger']?.heldInputs,
  },
  {
    id: 'find-the-original',
    rules: findRules as RulesCoreAny,
    createBot: createFindBot as () => BotPolicy,
    validate: (i) => (int(i.pick, 0, 63) ? { pick: i.pick } : null),
    publicView: hideSeed,
  },
  {
    id: 'red-light-green-light',
    rules: rlglRules as RulesCoreAny,
    createBot: createRlglBot as () => BotPolicy,
    validate: moveInput,
    // The pre-rolled light timings would tell a client exactly when the Signalman turns.
    publicView(v) {
      v.cycles = [];
    },
    // Online a player sees the light turn red one network trip plus a snapshot late, and their
    // "stop" reaches the rules another trip plus an input batch later: about 130-180 ms on a good
    // connection, more than the whole 140 ms grace. Without this, toys kept moving after their
    // player let go and were caught (flung back) far more often than in practice.
    config: { graceMs: 140 + 170 },
  },
  {
    id: 'blink-duel',
    rules: blinkRules as RulesCoreAny,
    createBot: createBlinkBot as () => BotPolicy,
    validate(i) {
      if (i.type === 'move' || i.type === 'aim') return num(i.x, 1000) && num(i.z, 1000) ? { type: i.type, x: i.x, z: i.z } : null;
      return i.type === 'blink' || i.type === 'attack' ? { type: i.type } : null;
    },
    publicView(v) {
      hideSeed(v);
      v.pending = {};
    },
  },
  {
    id: 'wind-up-dash',
    rules: dashRules as RulesCoreAny,
    createBot: createDashBot as () => BotPolicy,
    validate: moveInput,
  },
  {
    id: 'music-box-rhythm',
    rules: rhythmRules as RulesCoreAny,
    createBot: createRhythmBot as () => BotPolicy,
    validate: (i) => (int(i.lane, 0, 3) && num(i.t, 1e7) ? { lane: i.lane, t: i.t } : null),
    // Presses are judged by the song time the client stamped them with. Online, that time is a
    // round trip plus a snapshot behind the server clock, so the window for how old a press may
    // claim to be is wider (and misses are called correspondingly later).
    config: { maxInputAgeMs: 450, missGraceMs: 450, maxInputLeadMs: 150 },
  },
  {
    id: 'toy-squad',
    rules: squadRules as RulesCoreAny,
    createBot: createSquadBot as () => BotPolicy,
    validate(i) {
      switch (i.type) {
        case 'buy':
          return int(i.slot, 0, 15) ? { type: 'buy', slot: i.slot } : null;
        case 'move':
          return int(i.unit, -1e6, 1e6) && int(i.cell, -64, 64) ? { type: 'move', unit: i.unit, cell: i.cell } : null;
        case 'merge':
          return int(i.unit, -1e6, 1e6) && int(i.other, -1e6, 1e6) ? { type: 'merge', unit: i.unit, other: i.other } : null;
        case 'sell':
        case 'bench':
          return int(i.unit, -1e6, 1e6) ? { type: i.type, unit: i.unit } : null;
        case 'ready':
        case 'reroll':
          return { type: i.type };
        case 'passive':
          return typeof i.passive === 'string' && i.passive.length <= 32 ? { type: 'passive', passive: i.passive } : null;
        default:
          return null;
      }
    },
    // A public number for the effects layer's battle key, instead of the seed (future shops).
    publicView(v) {
      v.seed = 1;
    },
    // Your own shop and passive offers; nobody else's. Squads (units, passives, points, last
    // result) are public, so the player rail can show anyone's board; battles are sent only for
    // you and the board you are viewing (they are large, not secret).
    viewFor(v, viewer, watching) {
      const players = (v.players as Obj[]).map((p) => (p.id === viewer ? p : { ...p, shop: [], passiveOffers: [] }));
      const battles = (v.battles as Obj[]).filter((b) => b.owner === viewer || (!!watching && b.owner === watching));
      return { ...v, players, battles };
    },
    snapshotEvery: 2,
  },
  {
    id: 'spellbox-showdown',
    rules: spellboxRules as RulesCoreAny,
    createBot: createSpellboxBot as () => BotPolicy,
    // Spellbox is being extended separately: its inputs are checked by shape here and by meaning
    // in its own rules core, so new input types keep working online.
    validate: (i) => (typeof i.type === 'string' && i.type.length <= 16 ? { ...i } : null),
    publicView(v) {
      hideSeed(v);
      v.pending = {};
    },
  },
  {
    id: 'jack-in-the-box',
    rules: jackRules as RulesCoreAny,
    createBot: createJackBot as () => BotPolicy,
    validate: (i) => (typeof i.text === 'string' && i.text.length <= 48 ? { text: i.text } : null),
    // The fuse is the whole game: only how long the box has been held this round is sent (the
    // Scene's tension wobble), never how long is left, the round's total, or the pre-rolled list.
    publicView(v) {
      const held = Math.max(0, (v.fuseTotalMs as number) - (v.fuseMs as number));
      v.fuseTotalMs = HIDDEN_FUSE_MS;
      v.fuseMs = HIDDEN_FUSE_MS - held;
      v.fuses = [];
      v.order = [];
    },
  },
  {
    id: 'odd-page-out',
    rules: spotRules as RulesCoreAny,
    createBot: createSpotBot as () => BotPolicy,
    validate: (i) => (num(i.x, 2) && num(i.y, 2) ? { x: i.x, y: i.y } : null),
    // The seed would deal every later round's pictures. This round's differences are drawn on the
    // two pages everyone sees (finding them by eye is the game), so they are not a secret to keep.
    publicView: hideSeed,
  },
  {
    id: 'toy-tower-tumble',
    rules: tumbleRules as RulesCoreAny,
    createBot: createTumbleBot as () => BotPolicy,
    validate(i) {
      const cell = (v: unknown) => int(v, 0, 255);
      switch (i.type) {
        case 'build':
          return i.cell === undefined ? { type: 'build' } : cell(i.cell) ? { type: 'build', cell: i.cell } : null;
        case 'auto-merge':
          return i.preferredCell === undefined ? { type: 'auto-merge' }
            : cell(i.preferredCell) ? { type: 'auto-merge', preferredCell: i.preferredCell } : null;
        case 'merge':
        case 'move':
          return cell(i.from) && cell(i.to) ? { type: i.type, from: i.from, to: i.to } : null;
        case 'sell':
          return cell(i.cell) ? { type: 'sell', cell: i.cell } : null;
        case 'builder':
        case 'ready':
          return { type: i.type };
        case 'speed':
          return int(i.speed, 1, 4) ? { type: 'speed', speed: i.speed } : null;
        default:
          return null;
      }
    },
    // Each board's random-draw state would tell a client which tower its next Build gives.
    publicView(v) {
      hideSeed(v);
      for (const p of v.players as Obj[]) if ('rng' in p) p.rng = 0;
    },
  },
  {
    id: 'toybox-siege',
    rules: siegeRules as RulesCoreAny,
    createBot: createSiegeBot as () => BotPolicy,
    validate(i) {
      const who = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.length <= 64);
      switch (i.type) {
        case 'move':
          return num(i.x, 1.5) && num(i.y, 1.5) ? { type: 'move', x: i.x, y: i.y } : null;
        case 'class':
          return SIEGE_CLASSES.includes(i.cls as never) ? { type: 'class', cls: i.cls } : null;
        case 'choose':
          return int(i.index, 0, 3) && who(i.target) ? { type: 'choose', index: i.index, target: i.target ?? null } : null;
        case 'skill':
          return who(i.target) ? { type: 'skill', target: i.target ?? null } : null;
        case 'target':
          return who(i.id) ? { type: 'target', id: i.id ?? null } : null;
        case 'revive':
        case 'giveup':
          return { type: i.type };
        case 'watch':
          return (i.dir === 1 || i.dir === -1) && who(i.id) ? { type: 'watch', dir: i.dir, ...(typeof i.id === 'string' ? { id: i.id } : {}) } : null;
        case 'spectate':
          return typeof i.on === 'boolean' ? { type: 'spectate', on: i.on } : null;
        default:
          return null;
      }
    },
    // The match-wide random counter would tell a client what spawns and which cards come next.
    publicView(v) {
      hideSeed(v);
      v.rng = 0;
    },
    // A board is a few hundred pooled entities: send whole boards only for the viewer's own toy
    // and the board it is watching. Everyone else's board is cut to its live elites (the HUD's
    // send-limit check reads them); the players' own fields (status, level, points, incoming
    // elites, ghost position) always go out in full. Once the final arena opens, every board is
    // stubbed: the shared arena (`v.arena`) is what everyone sees, and it goes out whole.
    viewFor(v, viewer) {
      const keep = siegeKeep(v, viewer);
      return { ...v, players: (v.players as Obj[]).map((p) => (keep.has(p.id) ? p : { ...p, board: siegeStub(p.board as Obj) })) };
    },
    // The same cut on the raw state before it is copied for the wire: only boards some viewer
    // keeps are copied in full (with one human and seven bots, one board of eight), and their
    // dead pool slots go out as `{ on: false }`.
    trimForViews(state, views) {
      const keep = new Set<unknown>();
      for (const w of views) for (const id of siegeKeep(state, w.viewer)) keep.add(id);
      const arena = state.arena as Obj | null | undefined;
      return {
        ...state,
        players: (state.players as Obj[]).map((p) => ({ ...p, board: keep.has(p.id) ? siegeLive(p.board as Obj) : siegeStub(p.board as Obj) })),
        ...(arena ? { arena: siegeLive(arena) } : {}),
      };
    },
    // 30 snapshots a second like the other real-time trials (it was 15 while each one copied all
    // eight boards; the trim above made that cheap).
    // Online, nobody may stall a shared match: the class pick closes after a minute (first class
    // for anyone still choosing) and a level-up or treasure card after 20 s (its first option).
    // The finale needs no extra timer: the prep window settles its own cards after 15 s, the arena
    // opens 15 s after 5:00 at the latest, and the arena itself ends by 90 s.
    config: { pickTimeoutMs: 60_000, choiceTimeoutMs: 20_000 },
  },
  {
    id: 'hoop-hustle',
    rules: hoopHustleRules as RulesCoreAny,
    createBot: createHoopHustleBot as () => BotPolicy,
    validate(i) {
      switch (i.type) {
        case 'aim':
          return num(i.yaw, 100) ? { type: 'aim', yaw: i.yaw } : null;
        case 'charge':
        case 'cancel':
          return { type: i.type };
        case 'throw':
          // Power and facing as the player let go, and when (the rules honour at most a short lag).
          if (!opt(i.power, (x): x is number => num(x, 1) && x >= 0) || !opt(i.yaw, (x): x is number => num(x, 100)) || !opt(i.at, (x): x is number => num(x, 1e7))) return null;
          return { type: 'throw', ...(i.power !== undefined ? { power: i.power } : {}), ...(i.yaw !== undefined ? { yaw: i.yaw } : {}), ...(i.at !== undefined ? { at: i.at } : {}) };
        default:
          return null;
      }
    },
    // The seed deals every toy's next spot; queued inputs are nobody else's business.
    publicView(v) {
      hideSeed(v);
      v.pending = {};
    },
  },
  {
    id: 'hoop-clash',
    rules: hoopClashRules as RulesCoreAny,
    createBot: createHoopClashBot as () => BotPolicy,
    // The stick and the held action button, sampled every frame (the rules latch the newest and
    // see the button's presses and releases in order), passes, and cancelling a shot being charged.
    validate(i) {
      if (i.type === 'cancel') return { type: 'cancel' };
      if (i.type === 'in') {
        if (!(num(i.ax, 1.5) && num(i.ay, 1.5) && typeof i.run === 'boolean' && typeof i.act === 'boolean')) return null;
        // `charge`: the meter the player saw on letting go (the rules only take it near their own count).
        if (i.charge !== undefined && !num(i.charge, 600_000)) return null;
        return { type: 'in', ax: i.ax, ay: i.ay, run: i.run, act: i.act, ...(i.charge !== undefined ? { charge: i.charge } : {}) };
      }
      if (i.type === 'pass') return i.to === undefined ? { type: 'pass' } : typeof i.to === 'string' && i.to.length <= 64 ? { type: 'pass', to: i.to } : null;
      return null;
    },
    // The rules' random stream (the fillers' AI) and the seed are nobody's business.
    publicView(v) {
      hideSeed(v);
      v.rng = 0;
    },
  },
];

/** What a client sees as Jack-in-the-Box's fuse total (a constant, so it reveals nothing). */
export const HIDDEN_FUSE_MS = 1e9;

export const SERVER_GAMES = new Map<MinigameId, ServerGame>(GAMES.map((g) => [g.id, g]));

export function serverGame(id: MinigameId): ServerGame {
  const g = SERVER_GAMES.get(id);
  if (!g) throw new Error(`no server game ${id}`);
  return g;
}
