// The contract between pages and the persistent world (PLAN.md 7.1). Each page
// declares what it wants on <body>; the world mirrors its state onto <html>.
export const FORMATIONS = ['data', 'ml', 'llm', 'sde', 'converge', 'graph'] as const;
export type Formation = (typeof FORMATIONS)[number];
/** full: behind the page; band: a header band (project pages); off: hidden (presentation mode). */
export const MODES = ['full', 'band', 'off'] as const;
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

/** What each formation shows, in plain words. Shown as DOM text beside the world. */
export const CAPTIONS: Record<Exclude<Formation, 'graph'>, { area?: 'sde' | 'llm' | 'ml'; text: string }> = {
  data: { text: 'Data: particles streaming along the lines of a flow field. Brighter strands move faster.' },
  ml: {
    area: 'ml',
    text: 'AI/ML: a forward pass through a five-layer network. Denser edges carry larger weights.',
  },
  llm: {
    area: 'llm',
    text: 'LLM: a sentence being generated. Arcs show which earlier tokens each new token attends to.',
  },
  sde: { area: 'sde', text: 'SDE: requests fan out through services, a cache and a queue to the database.' },
  converge: {
    text: 'One knot with three lobes: network pulses, attention arcs and request packets on a single path.',
  },
};

export const STORAGE_TIER_KEY = 'pref:tier';
