/**
 * The online leaderboard's shapes: what the server stores for every finished lobby tournament
 * (and single-trial lobby match), and what `GET /api/leaderboard?board=…` answers. Pure; shared by
 * the server (server/leaderboard.ts) and the client (src/net/leaderboard.ts).
 *
 * Results only ever come from matches the server ran itself, never from a client's claim.
 */
import { MINIGAME_IDS, type MinigameId } from '../minigames/ids';
import { LOBBY_FORMATS, type LobbyFormat } from './protocol';

/** A tournament format, or a trial id for single-trial lobby matches. */
export type LeaderboardBoard = LobbyFormat | MinigameId;
export const LEADERBOARD_BOARDS: readonly LeaderboardBoard[] = [...LOBBY_FORMATS, ...MINIGAME_IDS];
export const isLeaderboardBoard = (v: unknown): v is LeaderboardBoard => typeof v === 'string' && (LEADERBOARD_BOARDS as readonly string[]).includes(v);

/** Most rows a board answer lists. */
export const LEADERBOARD_LIMIT = 20;

/** One player's finish in one server-run lobby match. */
export interface LeaderboardResult {
  /** The account's username when signed in, else the (sanitised) nickname. */
  name: string;
  /** True when `name` is a signed-in account's username. */
  account: boolean;
  board: LeaderboardBoard;
  /** 1-based. */
  place: number;
  /** Field size (bots included). */
  of: number;
  /** Tournament points (tournaments), or the points that place earns (single trials). */
  points: number;
  /** Epoch ms. */
  at: number;
}

/** One name's line on a board: summed over every result on that board. */
export interface LeaderboardEntry {
  name: string;
  account: boolean;
  played: number;
  wins: number;
  points: number;
  /** Best single result's points. */
  best: number;
  /** Epoch ms of the latest result. */
  last: number;
}

export interface LeaderboardResponse {
  board: LeaderboardBoard;
  /** Ranked by wins, then total points, then best result. */
  entries: LeaderboardEntry[];
  /** Latest finishes, newest first. */
  recent: LeaderboardResult[];
}

/** Rank aggregated entries (shared by the memory store and tests). */
export function rankEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.slice().sort((a, b) => b.wins - a.wins || b.points - a.points || b.best - a.best || a.name.localeCompare(b.name));
}
