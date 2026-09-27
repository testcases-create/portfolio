// Theme → render settings (PLAN.md 7.4 and 12, note 1). Colours come from the
// CSS tokens, so the world always matches the page. The light theme has its
// own settings: on a light ground, additive blending and faint alpha turn
// particles into grey dust, so light uses normal blending, stronger alpha,
// smaller and harder sprites, and leans further toward the role colours.

export type Rgb = [number, number, number];

export interface RenderSettings {
  blending: 'additive' | 'normal';
  /** Multiplies the tier's base alpha. */
  alphaScale: number;
  sizeScale: number;
  /** Gaussian falloff exponent: larger is a harder sprite edge. */
  falloff: number;
  /** Added to every particle's tint toward its role colour. */
  tintBoost: number;
  /** Floor of the depth fade: how visible the farthest particles stay. */
  depthFloor: number;
  bloom: boolean;
}

export const SETTINGS: Record<'dark' | 'light', RenderSettings> = {
  dark: {
    blending: 'additive',
    alphaScale: 1,
    sizeScale: 1,
    falloff: 22,
    tintBoost: 0,
    depthFloor: 0.3,
    bloom: true,
  },
  light: {
    blending: 'normal',
    alphaScale: 2.4,
    sizeScale: 0.82,
    falloff: 30,
    tintBoost: 0.38,
    depthFloor: 0.22,
    bloom: false,
  },
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Parses #rgb, #rrggbb or rgb(r g b) / rgb(r, g, b) into linear RGB in [0, 1]. */
export function parseColour(value: string): Rgb {
  const v = value.trim();
  let rgb: number[] | undefined;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  } else {
    const parts = /^rgba?\(([^)]+)\)$/i
      .exec(v)?.[1]
      ?.split(/[\s,/]+/)
      .filter(Boolean);
    if (parts && parts.length >= 3) rgb = parts.slice(0, 3).map((p) => Number.parseFloat(p) / 255);
  }
  if (!rgb || rgb.some((c) => !Number.isFinite(c))) return [1, 1, 1];
  return rgb.map(toLinear) as Rgb;
}

export interface ThemeColours {
  ground: Rgb;
  neutral: Rgb;
  sde: Rgb;
  llm: Rgb;
  ml: Rgb;
}

export function readTheme(root: HTMLElement): {
  name: 'dark' | 'light';
  colours: ThemeColours;
  settings: RenderSettings;
} {
  const name = root.dataset.theme === 'light' ? 'light' : 'dark';
  const cs = getComputedStyle(root);
  const token = (n: string) => parseColour(cs.getPropertyValue(n));
  return {
    name,
    colours: {
      ground: token('--ground'),
      neutral: token('--text'),
      sde: token('--sde'),
      llm: token('--llm'),
      ml: token('--ml'),
    },
    settings: SETTINGS[name],
  };
}
