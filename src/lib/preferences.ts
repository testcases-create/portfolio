// Per-visitor settings: the theme follows the device, and pause is remembered.
// Storage can be missing or throw (private windows, blocked site data), so
// every access is guarded and has a default.
export type Theme = 'dark' | 'light';

export interface PreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const KEYS = { paused: 'pref:paused' } as const;

/** The device's setting decides the theme; no preference means dark. */
export const LIGHT_QUERY = '(prefers-color-scheme: light)';
export const themeFor = (prefersLight: boolean): Theme => (prefersLight ? 'light' : 'dark');

export function read(store: PreferenceStore | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function write(store: PreferenceStore | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Not remembered this time; the setting still applies to this page view.
  }
}

export const readPaused = (store?: PreferenceStore): boolean => read(store, KEYS.paused) === '1';
