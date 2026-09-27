// Curl noise from a sum-of-sines vector potential (PLAN.md 7.3).
//
// The curl of any smooth field is divergence-free, so particles carried by it
// neither bunch up nor thin out. Nine cosine terms cost less than six Perlin
// samples and give identical results on the GPU (sim.gpu.ts) and the CPU.
import { mulberry32 } from './random';

export interface CurlTerm {
  /** Which component of the vector potential this term adds to. */
  c: 0 | 1 | 2;
  k: [number, number, number];
  amp: number;
  phi: number;
  omega: number;
}

export const CURL_TERMS: CurlTerm[] = (() => {
  const r = mulberry32(99);
  const terms: CurlTerm[] = [];
  for (const c of [0, 1, 2] as const) {
    for (let j = 0; j < 3; j++) {
      const v = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
      const f = ([1, 2.1, 4.3][j] ?? 1) / Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
      terms.push({
        c,
        k: [(v[0] ?? 0) * f, (v[1] ?? 0) * f, (v[2] ?? 0) * f],
        amp: [1, 0.45, 0.2][j] ?? 0,
        phi: r() * 6.283,
        omega: [0.11, 0.17, 0.29][j] ?? 0,
      });
    }
  }
  return terms;
})();

const g = new Float64Array(9);

/** Writes curl(A)(x, y, z, t) into out. A_c = Σ amp·sin(k·p + ωt + φ). */
export function curl(x: number, y: number, z: number, t: number, out: number[] | Float32Array): void {
  g.fill(0);
  // g[c*3 + d] accumulates ∂A_c/∂x_d.
  for (const { c, k, amp, phi, omega } of CURL_TERMS) {
    const s = Math.cos(x * k[0] + y * k[1] + z * k[2] + t * omega + phi) * amp;
    g[c * 3] = (g[c * 3] ?? 0) + k[0] * s;
    g[c * 3 + 1] = (g[c * 3 + 1] ?? 0) + k[1] * s;
    g[c * 3 + 2] = (g[c * 3 + 2] ?? 0) + k[2] * s;
  }
  out[0] = (g[7] ?? 0) - (g[5] ?? 0); // ∂A_z/∂y − ∂A_y/∂z
  out[1] = (g[2] ?? 0) - (g[6] ?? 0); // ∂A_x/∂z − ∂A_z/∂x
  out[2] = (g[3] ?? 0) - (g[1] ?? 0); // ∂A_y/∂x − ∂A_x/∂y
}
