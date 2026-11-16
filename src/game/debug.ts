/**
 * Test/debug hooks, active only with `?debug` in the URL. Used by the automated smoke test
 * (teleport, camera aim, renderer stats). Never relied on by gameplay.
 */
export const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

type DebugApi = Record<string, unknown>;

export function exposeDebug(part: DebugApi) {
  if (!DEBUG) return;
  const w = window as unknown as { __toybox?: DebugApi };
  w.__toybox = { ...(w.__toybox ?? {}), ...part };
}
