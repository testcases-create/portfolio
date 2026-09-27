// Shared by the intro chunk and the engine without importing either: both
// only read and write two timestamps on <html>.
export const INTRO_MS = 2200;

/** Intro progress: 0 while particles are scattered, 1 when gathered. */
export function assembleProgress(root: HTMLElement, now = performance.now()): number {
  const start = Number(root.dataset.introStart);
  if (!start || root.dataset.introSkip) return 1;
  const p = Math.min(1, Math.max(0, (now - start) / INTRO_MS));
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // power2.inOut, as the headline uses
}
