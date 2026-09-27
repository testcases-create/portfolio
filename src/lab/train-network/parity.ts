// Test hook (only loaded with ?lab-debug): runs the WebGPU training kernels
// and the CPU specification from the same start and returns the largest
// difference in any weight. tests/e2e/lab.spec.ts asserts it is tiny.
import { WebGPURenderer } from 'three/webgpu';
import { createGpuTrainer } from './train-gpu';
import { PARAMS, initParams, preset, trainStep, type Preset } from './logic';

export async function gpuParity(steps = 40, data: Preset = 'circle') {
  const renderer = new WebGPURenderer();
  await renderer.init();
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  const points = preset(data);
  const start = initParams(5);
  const trainer = createGpuTrainer(renderer);
  trainer.setParams(start);
  trainer.setPoints(points);
  await trainer.stepsAsync(steps);
  const gpu = await trainer.read();

  const cpu = start.slice();
  const velocity = new Float32Array(PARAMS);
  for (let i = 0; i < steps; i++) trainStep(cpu, velocity, points);

  let maxDiff = 0;
  let moved = 0;
  for (let i = 0; i < PARAMS; i++) {
    maxDiff = Math.max(maxDiff, Math.abs((gpu[i] ?? 0) - (cpu[i] ?? 0)));
    moved = Math.max(moved, Math.abs((cpu[i] ?? 0) - (start[i] ?? 0)));
  }
  renderer.dispose();
  return { backend, maxDiff, moved };
}
