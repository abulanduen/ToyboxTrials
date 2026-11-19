/**
 * Where online play connects. Pure resolution (tested) plus the value for this build.
 *
 *   - VITE_SERVER_URL set (e.g. wss://toybox-hub.up.railway.app) → that server.
 *   - Development build without it → ws://<this machine>:2567 (`npm run server:dev`).
 *   - Production build without it → null: the menus say "Online play isn't switched on yet".
 */
export interface OnlineEnv {
  DEV?: boolean;
  VITE_SERVER_URL?: string;
}

export function resolveServerUrl(env: OnlineEnv, hostname = 'localhost'): string | null {
  const url = env.VITE_SERVER_URL?.trim();
  if (url) return /^wss?:\/\/[^\s/]+/.test(url) ? url.replace(/\/+$/, '') : null;
  return env.DEV ? `ws://${hostname || 'localhost'}:2567` : null;
}

export const SERVER_URL: string | null = resolveServerUrl(
  import.meta.env as unknown as OnlineEnv,
  typeof window !== 'undefined' ? window.location.hostname : 'localhost',
);

export const OFFLINE_TEXT = "Online play isn't switched on yet.";
