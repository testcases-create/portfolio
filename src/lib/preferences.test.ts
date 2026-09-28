import { describe, expect, it } from 'vitest';
import { KEYS, readPaused, themeFor, write, type PreferenceStore } from './preferences';

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
  it('takes the theme from the device, dark without a light preference', () => {
    expect(themeFor(true)).toBe('light');
    expect(themeFor(false)).toBe('dark');
  });

  it('defaults to playing', () => {
    expect(readPaused(memory())).toBe(false);
    expect(readPaused(undefined)).toBe(false);
  });

  it('remembers pause', () => {
    const store = memory();
    write(store, KEYS.paused, '1');
    expect(readPaused(store)).toBe(true);
  });

  it('survives storage that throws', () => {
    expect(() => write(broken, KEYS.paused, '1')).not.toThrow();
    expect(readPaused(broken)).toBe(false);
  });
});
