// The low tier's CPU simulation step, timed on its own (also: npm run bench).
// The low tier runs this every frame, so it has to leave most of a 16.7 ms
// frame for everything else. It takes about 4 ms on a developer machine and
// about 9 ms on a shared CI runner under a parallel test run, so the
// assertion is one whole frame: it catches a real regression (an allocation
// per particle, say) without turning CI noise into failures.
import { expect, it } from 'vitest';
import { buildFormations } from './formations';
import { stepCpu, type CpuState } from './sim.cpu';
import type { SimInputs } from './sim.shared';
import { TIERS } from './tiers';

it(`steps the low tier's ${TIERS.low.particles.toLocaleString('en')} particles well inside a frame`, () => {
  const n = TIERS.low.particles;
  const { data: form, hash } = buildFormations(n);
  const state: CpuState = {
    n,
    form,
    hash,
    pos: new Float32Array(n * 4),
    vel: new Float32Array(n * 4),
    col: new Float32Array(n * 4),
  };
  const inputs: SimInputs = {
    time: 0,
    dt: 1 / 60,
    assemble: 1,
    // Mid-transition: two formations evaluated per particle, the costliest case.
    weights: [0.5, 0.5, 0, 0, 0],
    cursor: 3,
    front: 0.4,
    pointer: [99, 99, 99],
    pointerStrength: 0,
    alpha: 0.4,
    tintBoost: 0,
    centre: [0, 0, 0],
    neutral: [1, 1, 1],
    sde: [0, 0, 1],
    llm: [1, 1, 0],
    ml: [1, 0, 1],
  };
  for (let i = 0; i < 60; i++) stepCpu(state, inputs); // warm up the JIT
  const times: number[] = [];
  for (let i = 0; i < 200; i++) {
    inputs.time += 1 / 60;
    const t0 = performance.now();
    stepCpu(state, inputs);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[100] ?? 0;
  console.log(`low tier CPU step: median ${median.toFixed(2)} ms, p95 ${(times[190] ?? 0).toFixed(2)} ms`);
  expect(median).toBeLessThan(1000 / 60);
});
