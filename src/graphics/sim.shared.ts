// Constants and per-frame inputs shared by the GPU kernel and the CPU spec.
// Change a number here and both simulations change together.
import { K, SEED_SCALE, TOKENS } from './formations';

export { SEED_SCALE };

/** How strongly the curl field stirs each formation. Data flows; the diagrams hold still. */
export const FLOW_AMP = [0.05, 0.05, 0.03, 0.03, 0.04];
/** Spring stiffness toward each formation's target. */
export const STIFFNESS = [3.2, 7, 8, 8, 4];
/** Sprite size multiplier: data strands are finer, token outlines crisper. */
export const SIZE = [0.62, 1, 0.78, 1, 0.8];
export const DAMPING = 4.2;
export const CURL_SCALE = 0.42;
export const CURL_GAIN = 1.4;
export const POINTER_FALLOFF = 0.9;
export const POINTER_GAIN = 3;
/** Signals (pulses, packets, current arcs) are this much brighter than the rest. */
export const SIGNAL_GAIN = 1.2;
/** Rotation speeds (radians per second) of the data cloud and the knot. */
export const DATA_SPIN = 0.03;
export const KNOT_SPIN = 0.05;
/** How far targets have grown from the seed at intro progress a (1 at the end). */
export const grow = (a: number): number => SEED_SCALE + (1 - SEED_SCALE) * a;
/** Particles snap to moving paths once their formation is this fully formed. */
export const RIGID_AT = 0.97;

/** Everything the simulation reads each frame, besides the particle buffers. */
export interface SimInputs {
  time: number;
  dt: number;
  /**
   * 0 → 1 during the intro: every target grows from a small seed around
   * `centre` (SEED_SCALE of full size) to its place in the formation.
   */
  assemble: number;
  /** The intro's seed: the first formation's centre. */
  centre: [number, number, number];
  /** One weight per formation, summing to 1. */
  weights: number[];
  /** LLM: the index of the token being generated (fractional part is progress). */
  cursor: number;
  /** AI/ML: where the forward-pass pulse is, 0 at the input layer and 1 at the output. */
  front: number;
  pointer: [number, number, number];
  pointerStrength: number;
  alpha: number;
  /** Theme: how far particles lean toward their role colour (light theme leans more). */
  tintBoost: number;
  neutral: [number, number, number];
  sde: [number, number, number];
  llm: [number, number, number];
  ml: [number, number, number];
}

/** Time-driven signals, computed once per frame on the CPU and passed to both simulations. */
export function signals(time: number): { cursor: number; front: number } {
  return {
    // Generate one token every 1.25 s, hold the full sentence for 5 tokens' time, then restart.
    cursor: Math.min((time * 0.8) % (TOKENS.length + 4), TOKENS.length - 1 + 0.999),
    front: ((time * 0.22) % 1) * 1.4 - 0.2,
  };
}

export const oneHot = (k: number): number[] => Array.from({ length: K }, (_, j) => (j === k ? 1 : 0));
