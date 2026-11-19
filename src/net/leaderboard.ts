/**
 * The online leaderboard, client side: fetched from `GET /api/leaderboard?board=…` on the online
 * Hub server (results of server-run lobby matches only), cached for a little while, shown on the
 * Hub Scoreboard panel and the TV. Local records stay on this device and are shown beside it.
 */
import { create } from 'zustand';
import { API_BASE } from './account';
import { isLeaderboardBoard, type LeaderboardBoard, type LeaderboardResponse } from './leaderboardProtocol';

/** Re-fetch a board at most this often (ms). */
export const LEADERBOARD_TTL_MS = 30_000;

export type BoardStatus = 'loading' | 'ok' | 'off' | 'error';

interface LeaderboardState {
  boards: Partial<Record<LeaderboardBoard, { data: LeaderboardResponse | null; status: BoardStatus; at: number }>>;
  set: (p: Partial<LeaderboardState>) => void;
}

export const useLeaderboard = create<LeaderboardState>()((set) => ({ boards: {}, set: (p) => set(p) }));

function put(board: LeaderboardBoard, v: { data: LeaderboardResponse | null; status: BoardStatus; at: number }) {
  const s = useLeaderboard.getState();
  s.set({ boards: { ...s.boards, [board]: v } });
}

/** Fetch a board (unless a fresh copy is cached). Never throws. */
export async function fetchLeaderboard(board: LeaderboardBoard, force = false): Promise<void> {
  const cur = useLeaderboard.getState().boards[board];
  if (!force && cur && (cur.status === 'loading' || Date.now() - cur.at < LEADERBOARD_TTL_MS)) return;
  if (!API_BASE) return put(board, { data: null, status: 'off', at: Date.now() });
  put(board, { data: cur?.data ?? null, status: 'loading', at: Date.now() });
  try {
    const r = await fetch(`${API_BASE}/api/leaderboard?board=${encodeURIComponent(board)}`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    const body = (await r.json()) as LeaderboardResponse;
    if (!body || !isLeaderboardBoard(body.board) || !Array.isArray(body.entries) || !Array.isArray(body.recent)) throw new Error('bad body');
    put(board, { data: body, status: 'ok', at: Date.now() });
  } catch {
    put(board, { data: cur?.data ?? null, status: 'error', at: Date.now() });
  }
}
