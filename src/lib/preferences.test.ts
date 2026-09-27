import { describe, expect, it } from 'vitest';
import { KEYS, readPaused, readTheme, write, type PreferenceStore } from './preferences';

const memory = (): PreferenceStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const broken: PreferenceStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('preferences', () => {
  it('defaults to dark and playing', () => {
    expect(readTheme(memory())).toBe('dark');
    expect(readPaused(memory())).toBe(false);
    expect(readTheme(undefined)).toBe('dark');
  });

  it('remembers light theme and pause', () => {
    const store = memory();
    write(store, KEYS.theme, 'light');
    write(store, KEYS.paused, '1');
    expect(readTheme(store)).toBe('light');
    expect(readPaused(store)).toBe(true);
  });

  it('ignores unknown stored values', () => {
    const store = memory();
    write(store, KEYS.theme, 'sepia');
    expect(readTheme(store)).toBe('dark');
  });

  it('survives storage that throws', () => {
    expect(() => write(broken, KEYS.theme, 'light')).not.toThrow();
    expect(readTheme(broken)).toBe('dark');
  });
});
