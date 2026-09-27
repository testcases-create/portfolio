// The contract between pages and the persistent world (PLAN.md 7.1). Each page
// declares what it wants on <body>; the world mirrors its state onto <html>.
export const FORMATIONS = ['data', 'ml', 'llm', 'sde', 'converge', 'graph'] as const;
export type Formation = (typeof FORMATIONS)[number];
export const MODES = ['full', 'band'] as const;
export type Mode = (typeof MODES)[number];

export interface WorldConfig {
  formation: Formation;
  mode: Mode;
}

export const DEFAULT_CONFIG: WorldConfig = { formation: 'data', mode: 'full' };

const oneOf = <T extends string>(list: readonly T[], value: string | undefined, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

/** Reads `data-world-formation` and `data-world-mode`; unknown values fall back to defaults. */
export function readConfig(dataset: Record<string, string | undefined>): WorldConfig {
  return {
    formation: oneOf(FORMATIONS, dataset.worldFormation, DEFAULT_CONFIG.formation),
    mode: oneOf(MODES, dataset.worldMode, DEFAULT_CONFIG.mode),
  };
}
