/**
 * Recovery for "stale build" errors after a deploy.
 *
 * A tab opened before a deployment still runs the old JavaScript. When
 * it navigates, it can request code chunks that no longer exist (or
 * mix old and new chunks), which surfaces as ChunkLoadError or webpack's
 * "Cannot read properties of undefined (reading 'call')". Re-rendering
 * can't fix that — only a full reload onto the new build can.
 */

const STALE_PATTERNS = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  // webpack runtime: module factory missing from the loaded chunks.
  /Cannot read properties of undefined \(reading 'call'\)/i,
  /undefined is not an object \(evaluating '[^']*\.call'\)/i,
];

export function isStaleBuildError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; message?: string };
  const text = `${e.name ?? ""} ${e.message ?? String(error)}`;
  return STALE_PATTERNS.some((re) => re.test(text));
}

const RELOAD_KEY = "wacrm.staleBuildReloadAt";
/** Don't reload again within this window — avoids loops if the error persists. */
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Reload the page once to pick up the latest deployment. Returns true
 * if a reload was triggered, false if we already tried recently (then
 * the caller should show its normal error UI).
 */
export function reloadOnceForStaleBuild(now: number = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage blocked (private mode, etc.) — still reload once; the
    // error boundary only mounts again if the new build also fails.
  }
  window.location.reload();
  return true;
}
