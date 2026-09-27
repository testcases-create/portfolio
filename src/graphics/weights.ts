// Formation weights from page config and scroll position. Pure, unit-tested.
import { FORMATION_NAMES, type FormationName } from './formations';
import { oneHot } from './sim.shared';

/** Maps a page formation to a world formation. The architecture graph arrives in Phase 4. */
export function formationIndex(name: string | undefined): number {
  const i = FORMATION_NAMES.indexOf(name as FormationName);
  return i >= 0 ? i : 0;
}

/**
 * Target weights for a scroll position. Section j's boundary has progress p_j
 * in [0, 1]; the weights move from each section's formation to the next one's.
 * Because boundaries complete in scroll order, this handles any sequence of
 * formations, not only 0, 1, 2, …
 */
export function scrollWeights(formations: number[], progress: number[]): number[] {
  let w = oneHot(formations[0] ?? 0);
  for (let j = 1; j < formations.length; j++) {
    const p = Math.min(1, Math.max(0, progress[j] ?? 0));
    if (p === 0) continue;
    const next = oneHot(formations[j] ?? 0);
    w = w.map((v, k) => v + ((next[k] ?? 0) - v) * p);
  }
  return w;
}
