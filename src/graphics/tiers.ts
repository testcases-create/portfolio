// Quality tiers (PLAN.md 7.5): capability detection, the frame-time probe and
// dynamic resolution. Pure functions and small state machines, unit-tested.

export const TIER_ORDER = ['high', 'medium', 'low', 'poster'] as const;
export type Tier = (typeof TIER_ORDER)[number];
export type RenderTier = Exclude<Tier, 'poster'>;

export interface TierSpec {
  particles: number;
  backend: 'webgpu' | 'webgl2';
  sim: 'gpu' | 'cpu';
  bloom: boolean;
  /** World-space sprite size at the reference camera distance. */
  size: number;
  /** Base per-particle alpha: fewer particles need more each. */
  alpha: number;
}

export const TIERS: Record<RenderTier, TierSpec> = {
  high: { particles: 65_536, backend: 'webgpu', sim: 'gpu', bloom: true, size: 0.042, alpha: 0.3 },
  medium: { particles: 16_384, backend: 'webgl2', sim: 'gpu', bloom: false, size: 0.06, alpha: 0.5 },
  low: { particles: 4_096, backend: 'webgl2', sim: 'cpu', bloom: false, size: 0.085, alpha: 0.75 },
};

export const DPR_CAP = 1.75;

export interface Capabilities {
  forced?: string | null;
  reducedMotion: boolean;
  saveData: boolean;
  /** A real (non-fallback) WebGPU adapter was granted. */
  webgpu: boolean;
  webgl2: boolean;
}

export const isTier = (value: unknown): value is Tier => TIER_ORDER.includes(value as Tier);

export function chooseTier(c: Capabilities): Tier {
  if (isTier(c.forced)) return c.forced;
  if (c.reducedMotion || c.saveData) return 'poster';
  if (c.webgpu) return 'high';
  return c.webgl2 ? 'medium' : 'poster';
}

export const nextTier = (tier: Tier): Tier =>
  TIER_ORDER[Math.min(TIER_ORDER.indexOf(tier) + 1, TIER_ORDER.length - 1)] as Tier;

/**
 * Frame-time probe: ignore `warmup` frames (shader compilation, first uploads),
 * then take the median of the next `window` frames. Above `limitMs` the world
 * steps down one tier.
 *
 * A device that is far too slow shouldn't block the page for 120 frames first:
 * after `severeWarmup` frames, `severeRun` consecutive frames slower than
 * `severeMs` step down at once.
 */
export function createProbe({
  warmup = 30,
  window = 90,
  limitMs = 21,
  severeWarmup = 2,
  severeMs = 100,
  severeRun = 3,
} = {}) {
  const samples: number[] = [];
  let seen = 0;
  let slow = 0;
  let verdict: 'pending' | 'ok' | 'step-down' = 'pending';
  let median = 0;
  return {
    push(ms: number) {
      if (verdict !== 'pending') return verdict;
      seen++;
      if (seen > severeWarmup) {
        slow = ms > severeMs ? slow + 1 : 0;
        if (slow >= severeRun) {
          median = ms;
          verdict = 'step-down';
          return verdict;
        }
      }
      if (seen <= warmup) return verdict;
      samples.push(ms);
      if (samples.length < window) return verdict;
      const sorted = [...samples].sort((a, b) => a - b);
      median = sorted[sorted.length >> 1] ?? 0;
      verdict = median > limitMs ? 'step-down' : 'ok';
      return verdict;
    },
    get verdict() {
      return verdict;
    },
    get median() {
      return median;
    },
  };
}

/**
 * Dynamic resolution: an exponential moving average of frame time. Sustained
 * slow frames shed pixels quickly; sustained fast frames win them back slowly.
 */
export function createResolution({
  min = 0.55,
  slowMs = 19.5,
  fastMs = 17.5,
  holdDown = 45,
  holdUp = 300,
} = {}) {
  let scale = 1;
  let ema = 16.7;
  // Consecutive frames on each side of the thresholds: a change needs a sustained run.
  let slowRun = 0;
  let fastRun = 0;
  return {
    /** Returns the new scale when it changes, otherwise null. */
    update(ms: number): number | null {
      ema += (ms - ema) * 0.05;
      slowRun = ema > slowMs ? slowRun + 1 : 0;
      fastRun = ema < fastMs ? fastRun + 1 : 0;
      if (slowRun >= holdDown && scale > min) {
        scale = Math.max(min, scale * 0.85);
        slowRun = 0;
        return scale;
      }
      if (fastRun >= holdUp && scale < 1) {
        scale = Math.min(1, scale * 1.1);
        fastRun = 0;
        return scale;
      }
      return null;
    },
    get scale() {
      return scale;
    },
    get ema() {
      return ema;
    },
  };
}

export const pixelRatio = (devicePixelRatio: number, scale: number) =>
  Math.min(devicePixelRatio, DPR_CAP) * scale;
