/**
 * After a new version is deployed, a page that was opened before it still asks for the old
 * version's code chunks, which no longer exist ("Failed to fetch dynamically imported module").
 * The fix is to reload onto the new version. A reload is allowed once a minute, so a chunk that
 * is genuinely missing can't cause a reload loop.
 */
const KEY = 'toybox-trials:stale-reload';

export function isStaleChunkError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS|module script/i.test(msg);
}

/** Reload onto the latest version; false if we already reloaded in the last minute. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Private mode without storage: reload anyway (worst case, one extra reload).
  }
  window.location.reload();
  return true;
}

/** Load a chunk; on a stale-version failure, try once more, then reload onto the new version. */
export async function importFresh<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (!isStaleChunkError(e)) throw e;
    try {
      return await load();
    } catch (e2) {
      if (isStaleChunkError(e2) && reloadForNewVersion()) {
        // The page is reloading; never settle so no error card flashes up first.
        return new Promise<T>(() => {});
      }
      throw new Error('The game was updated while this page was open. Refresh the page to play.');
    }
  }
}
