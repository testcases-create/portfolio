// One running world: renderer, particle buffers, camera and frame loop for a
// given tier. The controller in index.ts owns the state that must survive a
// tier switch or a page navigation (time, weights, camera, pointer).
import { PerspectiveCamera, Scene, Vector3, WebGPURenderer, type RenderPipeline } from 'three/webgpu';
import { approach, blendPose, drift, fitDistance, orbitPosition, parallax, type Pose } from './camera';
import {
  FLOATS_PER_PARTICLE,
  FORMATION_NAMES,
  K,
  buildFormations,
  scatter,
  type FormationName,
} from './formations';
import { createLabels } from './labels';
import { applySettings, createBloomPipeline, createParticles, createRenderUniforms } from './render';
import type { CpuState } from './sim.cpu';
import { createGpuSim, createUniforms, writeUniforms } from './sim.gpu';
import { signals, type SimInputs } from './sim.shared';
import type { RenderSettings, ThemeColours } from './theme';
import { TIERS, createProbe, createResolution, pixelRatio, type RenderTier } from './tiers';

export const FOV = 35;
/** Wide screens: the world composes into this horizontal band, right of the text column. */
export const REGION: [number, number] = [0.46, 0.97];
/** Seconds: particles blend between formations quickly; the camera follows slowly. */
const WEIGHT_TAU = 0.25;
const CAMERA_TAU = 0.9;

/**
 * The architecture explorer's view: the pose to frame, and the part of the
 * viewport the world composes into (the rest is the explorer's panel).
 */
export interface ExploreView {
  pose: Pose;
  /** Orbit and zoom the visitor added by dragging, keys or the wheel. */
  orbit: { azimuth: number; elevation: number; zoom: number };
  stage: { left: number; top: number; width: number; height: number };
}

/** State owned by the controller and shared with whichever world is running. */
export interface SharedState {
  time: number;
  /** Paused while exploring: the loop keeps running for the camera, but time stands still. */
  frozen: boolean;
  explore: ExploreView | null;
  weights: number[];
  targetWeights: number[];
  mode: 'full' | 'band' | 'off';
  /** Pointer in [-1, 1]², eased, for parallax. */
  pointer: { x: number; y: number; tx: number; ty: number; until: number };
  camera: { azimuth: number; elevation: number; distance: number; target: [number, number, number] } | null;
  theme: { name: 'dark' | 'light'; colours: ThemeColours; settings: RenderSettings };
  /** Intro progress in [0, 1]: 1 means assembled. */
  assemble: () => number;
}

export interface FrameStats {
  fps: number;
  frameMs: number;
  gpuMs: number | null;
  drawCalls: number;
  computeCalls: number;
  renderScale: number;
  probe: string;
  bloom: string;
}

export type WorldHandle = Awaited<ReturnType<typeof createWorld>>;

export async function createWorld(
  host: HTMLElement,
  tierName: RenderTier,
  state: SharedState,
  hooks: {
    onStepDown: (probeNote: string) => void;
    /** The tier failed while running; the controller steps down. */
    onFailure: (error: unknown) => void;
    onFormation: (name: FormationName) => void;
    particles?: number;
  },
) {
  const tier = TIERS[tierName];
  const renderer = new WebGPURenderer({
    antialias: false,
    alpha: true,
    forceWebGL: tier.backend !== 'webgpu',
    powerPreference: 'high-performance',
    trackTimestamp: tier.backend === 'webgpu',
  });
  await renderer.init();
  let failed = false;
  let disposed = false;
  // A lost GPU device (driver reset, GPU watchdog, memory pressure) would leave
  // a silent, frozen world. Treat it like any other render failure.
  renderer.onDeviceLost = (info) => {
    if (disposed || failed) return;
    failed = true;
    console.error(`World: the GPU device was lost (${info.message}).`);
    void renderer.setAnimationLoop(null);
    hooks.onFailure(new Error(`GPU device lost: ${info.message}`));
  };
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'world-canvas';
  host.prepend(renderer.domElement);

  const n = hooks.particles ?? tier.particles;
  const { data: form, hash } = buildFormations(n);
  const start = new Float32Array(n * 4);
  if (state.assemble() < 1) scatter(start, n);
  else
    for (let i = 0; i < n; i++)
      start.set(form.subarray(i * FLOATS_PER_PARTICLE, i * FLOATS_PER_PARTICLE + 3), i * 4);

  const U = createUniforms();
  const R = createRenderUniforms();
  const gpu = createGpuSim(n, tier.sim === 'gpu' ? form : new Float32Array(4), hash, start, U);
  let cpu: CpuState | null = null;
  // The CPU simulation only runs on the low tier, so it is its own chunk.
  const stepCpu = tier.sim === 'cpu' ? (await import('./sim.cpu')).stepCpu : null;
  if (tier.sim === 'cpu') {
    cpu = {
      n,
      form,
      hash,
      pos: gpu.pos.value.array as Float32Array,
      vel: gpu.vel.value.array as Float32Array,
      col: gpu.col.value.array as Float32Array,
    };
  }

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  const { sprite, material } = createParticles(n, gpu, R, tier.bloom);
  scene.add(sprite);
  let pipeline: RenderPipeline | null = tier.bloom ? createBloomPipeline(renderer, scene, camera) : null;
  let bloomNote = tier.bloom ? 'on (dark theme)' : 'off for this tier';
  const labels = createLabels(host);

  const probe = createProbe();
  const resolution = createResolution();
  let probeNote = 'measuring';
  let size = { w: 1, h: 1, wide: false };
  let last = performance.now();
  let fps = 60;
  let frameMs = 16.7;
  let gpuMs: number | null = null;
  let frames = 0;
  let formation: FormationName | null = null;
  const inputs: SimInputs = {
    time: 0,
    dt: 1 / 60,
    assemble: 1,
    weights: state.weights,
    cursor: 0,
    front: 0,
    pointer: [99, 99, 99],
    pointerStrength: 0,
    alpha: tier.alpha,
    tintBoost: 0,
    neutral: [1, 1, 1],
    sde: [1, 1, 1],
    llm: [1, 1, 1],
    ml: [1, 1, 1],
  };
  const ray = new Vector3();
  const projected = new Vector3();

  function applyTheme() {
    applySettings(material, R, state.theme.settings);
    const c = state.theme.colours;
    Object.assign(inputs, {
      neutral: c.neutral,
      sde: c.sde,
      llm: c.llm,
      ml: c.ml,
      tintBoost: state.theme.settings.tintBoost,
    });
  }

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    size = { w, h, wide: state.mode === 'full' && w >= 900 && w / h >= 1.1 };
    camera.aspect = w / h;
    if (size.wide) {
      const centre = (REGION[0] + REGION[1]) / 2;
      camera.setViewOffset(w, h, -(centre - 0.5) * w, 0, w, h);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    R.maskFrom.value = size.wide ? REGION[0] : 0;
    R.maskTop.value = -1;
    R.maskBottom.value = 2;
    renderer.setPixelRatio(pixelRatio(devicePixelRatio, resolution.scale));
    renderer.setSize(w, h, false);
  }

  /**
   * Narrow screens: pages mark windows onto the world ([data-world-window])
   * between blocks of text. The formation is composed into the window nearest
   * the middle of the viewport and masked to it. Returns its rect, or null.
   */
  function narrowWindow(): DOMRect | null {
    if (size.wide || state.mode !== 'full') return null;
    let best: DOMRect | null = null;
    let bestDistance = Infinity;
    for (const el of document.querySelectorAll<HTMLElement>('[data-world-window]')) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.bottom < 0 || r.top > size.h) continue;
      const d = Math.abs(r.top + r.height / 2 - size.h / 2);
      if (d < bestDistance) [best, bestDistance] = [r, d];
    }
    return best;
  }

  function compose(): { spanX: number; spanY: number } {
    const ex = state.explore;
    if (ex) {
      // The explorer: compose into its stage, beside (or above) its panel.
      const { left, top, width, height } = ex.stage;
      camera.setViewOffset(
        size.w,
        size.h,
        size.w / 2 - (left + width / 2),
        size.h / 2 - (top + height / 2),
        size.w,
        size.h,
      );
      camera.updateProjectionMatrix();
      R.maskFrom.value = 0;
      R.maskTop.value = -1;
      R.maskBottom.value = 2;
      return { spanX: Math.max(0.2, width / size.w), spanY: Math.max(0.2, height / size.h) };
    }
    if (state.mode === 'off') {
      // Presentation mode hides the world; CSS removes it and the observer pauses the loop.
      R.maskTop.value = 1;
      R.maskBottom.value = 0;
      return { spanX: 1, spanY: 1 };
    }
    if (size.wide) return { spanX: REGION[1] - REGION[0], spanY: 1 };
    if (state.mode === 'band') {
      // The band sits behind the header too: compose below it and keep the header clear.
      const header = document.querySelector('.site-header')?.getBoundingClientRect();
      const top = header ? Math.max(0, header.bottom - host.getBoundingClientRect().top) : 0;
      const spanY = Math.max(0.2, 1 - top / size.h);
      camera.setViewOffset(size.w, size.h, 0, -top / 2, size.w, size.h);
      camera.updateProjectionMatrix();
      R.maskTop.value = top / size.h;
      R.maskBottom.value = 2;
      return { spanX: 1, spanY };
    }
    const win = narrowWindow();
    if (!win) {
      // No window in view: nothing to draw.
      R.maskTop.value = 1;
      R.maskBottom.value = 0;
      return { spanX: 1, spanY: 1 };
    }
    camera.setViewOffset(size.w, size.h, 0, size.h / 2 - (win.top + win.height / 2), size.w, size.h);
    camera.updateProjectionMatrix();
    R.maskTop.value = win.top / size.h;
    R.maskBottom.value = win.bottom / size.h;
    return { spanX: win.width / size.w, spanY: win.height / size.h };
  }

  function updateCamera(dt: number) {
    const ex = state.explore;
    const pose = ex?.pose ?? blendPose(state.weights);
    const { spanX, spanY } = compose();
    // The band is wide and short: let the formation overfill it vertically a little.
    const fill = state.mode === 'band' && !ex ? 1.25 : 0.85;
    const distance = fitDistance(pose.radius, FOV, camera.aspect, spanX, fill, spanY) * (ex?.orbit.zoom ?? 1);
    const d = drift(state.time);
    const px = ex ? { azimuth: 0, elevation: 0 } : parallax(state.pointer.x, state.pointer.y);
    const goal = {
      azimuth: pose.azimuth + d.azimuth + px.azimuth + (ex?.orbit.azimuth ?? 0),
      elevation: Math.max(
        -1.2,
        Math.min(1.2, pose.elevation + d.elevation + px.elevation + (ex?.orbit.elevation ?? 0)),
      ),
      distance,
      target: pose.target,
    };
    const c = (state.camera ??= { ...goal, target: [...goal.target] });
    c.azimuth = approach(c.azimuth, goal.azimuth, dt, CAMERA_TAU);
    c.elevation = approach(c.elevation, goal.elevation, dt, CAMERA_TAU);
    c.distance = approach(c.distance, goal.distance, dt, CAMERA_TAU);
    c.target = c.target.map((v, j) => approach(v, goal.target[j] ?? 0, dt, CAMERA_TAU)) as [
      number,
      number,
      number,
    ];
    camera.position.set(...orbitPosition(c.target, c.distance, c.azimuth, c.elevation));
    camera.lookAt(...c.target);

    const s = state.theme.settings;
    R.size.value = tier.size * s.sizeScale * (c.distance / 15);
    R.depthNear.value = c.distance - pose.radius;
    R.depthFar.value = c.distance + pose.radius * 1.2;
    // A farther camera puts more particles on each pixel: thin the alpha so it doesn't saturate.
    inputs.alpha = tier.alpha * s.alphaScale * Math.min(1, (20 / c.distance) ** 1.5);

    // Pointer: intersect the pointer ray with the plane through the target that faces the camera.
    const strength = performance.now() < state.pointer.until ? 1 : 0;
    inputs.pointerStrength = approach(inputs.pointerStrength, strength, dt, 0.25);
    ray.set(state.pointer.tx, state.pointer.ty, 0.5).unproject(camera).sub(camera.position).normalize();
    const toTarget = new Vector3(...c.target).sub(camera.position);
    const forward = camera.getWorldDirection(new Vector3());
    const hit = camera.position
      .clone()
      .addScaledVector(ray, toTarget.dot(forward) / Math.max(1e-3, ray.dot(forward)));
    inputs.pointer = [hit.x, hit.y, hit.z];
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (!state.frozen) state.time += dt;
    for (let k = 0; k < K; k++) {
      state.weights[k] = approach(state.weights[k] ?? 0, state.targetWeights[k] ?? 0, dt, WEIGHT_TAU);
    }
    state.pointer.x = approach(state.pointer.x, state.pointer.tx, dt, 0.6);
    state.pointer.y = approach(state.pointer.y, state.pointer.ty, dt, 0.6);

    updateCamera(dt);
    const sig = signals(state.time);
    Object.assign(inputs, {
      time: state.time,
      dt,
      assemble: state.assemble(),
      weights: state.weights,
      ...sig,
    });

    if (cpu && stepCpu) {
      stepCpu(cpu, inputs);
      gpu.pos.value.needsUpdate = true;
      gpu.vel.value.needsUpdate = true;
      gpu.col.value.needsUpdate = true;
    } else {
      writeUniforms(U, inputs);
      renderer.compute(gpu.compute);
    }
    const bloomNow = pipeline && state.theme.settings.bloom && (state.mode === 'full' || !!state.explore);
    if (bloomNow) pipeline?.render();
    else renderer.render(scene, camera);

    labels.update(camera, size.w, size.h, state.weights[2] ?? 0, sig.cursor);

    let best = 0;
    for (let k = 1; k < K; k++) if ((state.weights[k] ?? 0) > (state.weights[best] ?? 0)) best = k;
    const name = FORMATION_NAMES[best] as FormationName;
    if (name !== formation) hooks.onFormation((formation = name));

    const ms = dt * 1000;
    frameMs += (ms - frameMs) * 0.05;
    fps += (1000 / Math.max(ms, 1) - fps) * 0.05;
    frames++;
    if (probe.push(ms) === 'step-down' && probeNote === 'measuring') {
      probeNote = `${tierName}: median ${probe.median.toFixed(1)} ms`;
      hooks.onStepDown(probeNote);
    } else if (probe.verdict === 'ok' && probeNote === 'measuring') {
      probeNote = `${tierName}: median ${probe.median.toFixed(1)} ms, kept`;
    }
    if (resolution.update(ms) !== null) resize();
    if (tier.backend === 'webgpu' && frames % 30 === 0) {
      void Promise.all([
        renderer.resolveTimestampsAsync('render'),
        renderer.resolveTimestampsAsync('compute'),
      ]).then(([r, c]) => (gpuMs = r === undefined && c === undefined ? null : (r ?? 0) + (c ?? 0)));
    }
  }

  /**
   * A browser can grant WebGPU and still fail inside the render (an older
   * implementation rejecting a descriptor Three passes, for example). A blank
   * world with no error is the worst outcome, so: first drop bloom, then give
   * the tier up and let the controller step down.
   */
  function frame() {
    if (failed) return;
    try {
      tick();
    } catch (error) {
      if (pipeline) {
        console.warn('World: bloom failed; continuing without it.', error);
        pipeline = null;
        bloomNote = 'failed, disabled';
        return;
      }
      failed = true;
      void renderer.setAnimationLoop(null);
      hooks.onFailure(error);
    }
  }

  applyTheme();
  resize();

  return {
    tier: tierName,
    backend: (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
      ? ('webgpu' as const)
      : ('webgl2' as const),
    particles: n,
    start() {
      last = performance.now();
      void renderer.setAnimationLoop(frame);
    },
    stop() {
      void renderer.setAnimationLoop(null);
    },
    resize,
    applyTheme,
    /** Formation data as the running simulation reads it (GPU buffer or CPU array). */
    formation(): Float32Array {
      return tier.sim === 'gpu' ? (gpu.form.value.array as Float32Array) : form;
    },
    /** Re-uploads the formation data after it was rewritten. */
    formationChanged() {
      if (tier.sim !== 'gpu') return;
      const attribute = gpu.form.value as typeof gpu.form.value & { pbo?: { needsUpdate: boolean } };
      attribute.needsUpdate = true;
      // WebGL2 reads the buffer through a texture made from the same array.
      if (attribute.pbo) attribute.pbo.needsUpdate = true;
    },
    /** Projects a world point to viewport pixels with the current camera; null when behind it. */
    project(p: readonly [number, number, number]): { x: number; y: number } | null {
      const v = projected.set(p[0], p[1], p[2]).project(camera);
      if (v.z > 1) return null;
      return { x: ((v.x + 1) / 2) * size.w, y: ((1 - v.y) / 2) * size.h };
    },
    stats(): FrameStats {
      const info = renderer.info as unknown as {
        render: { drawCalls: number };
        compute: { frameCalls: number };
      };
      return {
        fps,
        frameMs,
        gpuMs,
        drawCalls: info.render.drawCalls,
        computeCalls: info.compute.frameCalls,
        renderScale: pixelRatio(devicePixelRatio, resolution.scale),
        probe: probeNote,
        bloom: bloomNote,
      };
    },
    /** Test hook: one simulation step from the current state, returned with the state it started from. */
    async debugStep(input: SimInputs) {
      const read = async () => ({
        pos: new Float32Array(await renderer.getArrayBufferAsync(gpu.pos.value)),
        vel: new Float32Array(await renderer.getArrayBufferAsync(gpu.vel.value)),
      });
      // One warm-up step makes Three upload the buffers even if no frame was ever
      // drawn (tests start the world paused); the comparison starts from its result.
      writeUniforms(U, input);
      await renderer.computeAsync(gpu.compute);
      const before = await read();
      await renderer.computeAsync(gpu.compute);
      const after = {
        ...(await read()),
        col: new Float32Array(await renderer.getArrayBufferAsync(gpu.col.value)),
      };
      return { before, after, form, hash, n };
    },
    dispose() {
      disposed = true;
      void renderer.setAnimationLoop(null);
      labels.dispose();
      material.dispose();
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}
