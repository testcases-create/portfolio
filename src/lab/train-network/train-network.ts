// "Train a network in your browser": the field, the controls and the training
// loop. Training runs as WebGPU compute (train-gpu.ts) on the high tier and on the
// CPU (logic.ts) otherwise; the 3D network (network-scene.ts) loads only when the
// tier allows a 3D view.
import { createLoop, tierReady } from '../shared/loop';
import {
  MAX_POINTS,
  PARAMS,
  accuracy,
  forward,
  initParams,
  meanLoss,
  predictGrid,
  preset,
  trainStep,
  type Point,
  type Preset,
} from './logic';
import type { GpuTrainer } from './train-gpu';

const GRID = 48;
const CPU_STEPS_PER_FRAME = 8;
const GPU_STEPS_PER_FRAME = 8;

export async function mount(el: HTMLElement): Promise<void> {
  const canvas = el.querySelector<HTMLCanvasElement>('[data-field]');
  const form = el.querySelector<HTMLFormElement>('[data-controls]');
  const view = el.querySelector<HTMLElement>('[data-view]');
  const trainButton = el.querySelector<HTMLButtonElement>('[data-train]');
  const summary = el.querySelector<HTMLElement>('[data-summary]');
  const where = el.querySelector<HTMLElement>('[data-where]');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !form || !view || !trainButton || !summary || !where || !ctx) return;
  const metric = (name: string) => el.querySelector<HTMLElement>(`[data-metric="${name}"]`);
  const say = (text: string) => (summary.textContent = text);
  const trainingOn = (text: string) => (where.textContent = text);

  let points: Point[] = preset('xor');
  let seed = 1;
  let params = initParams(seed);
  const velocity = new Float32Array(PARAMS);
  let steps = 0;
  let training = true;
  let dirty = true;
  /** Where the 3D view shows activations: the pointer or the keyboard cursor. */
  const probe = { x: 0.35, y: 0.35 };
  const cursor = { x: 0, y: 0, shown: false };
  let gpu: GpuTrainer | null = null;
  let reading = false;

  const css = () => getComputedStyle(document.documentElement);
  const grid = new Float32Array(GRID * GRID);
  const image = document.createElement('canvas');
  image.width = image.height = GRID;
  const imageCtx = image.getContext('2d');

  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.trim().replace('#', '');
    const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  function drawField() {
    if (!ctx || !canvas || !imageCtx) return;
    const s = css();
    const ground = hexToRgb(s.getPropertyValue('--raised'));
    const a = hexToRgb(s.getPropertyValue('--ml'));
    const b = hexToRgb(s.getPropertyValue('--text'));
    predictGrid(params, GRID, grid);
    const img = imageCtx.createImageData(GRID, GRID);
    for (let i = 0; i < GRID * GRID; i++) {
      const p = grid[i] ?? 0.5;
      // Shade toward class A's colour where the network says A, and faintly toward the text colour for B.
      const ta = Math.max(0, p - 0.5) * 2 * 0.42;
      const tb = Math.max(0, 0.5 - p) * 2 * 0.16;
      for (let c = 0; c < 3; c++) {
        img.data[i * 4 + c] = (ground[c] ?? 0) * (1 - ta - tb) + (a[c] ?? 0) * ta + (b[c] ?? 0) * tb;
      }
      img.data[i * 4 + 3] = 255;
    }
    imageCtx.putImageData(img, 0, 0);
    const W = canvas.width;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, 0, 0, W, W);
    const toPx = (v: number) => ((v + 1) / 2) * W;
    ctx.lineWidth = 2;
    for (const pt of points) {
      const [x, y] = [toPx(pt.x), toPx(-pt.y)];
      if (pt.label === 1) {
        ctx.fillStyle = s.getPropertyValue('--ml');
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = s.getPropertyValue('--raised');
        ctx.stroke();
      } else {
        ctx.strokeStyle = s.getPropertyValue('--text');
        ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
      }
    }
    if (cursor.shown) {
      const [x, y] = [toPx(cursor.x), toPx(-cursor.y)];
      ctx.strokeStyle = s.getPropertyValue('--text');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
    }
  }

  const selectedLabel = (): 0 | 1 =>
    form.querySelector<HTMLInputElement>('[name="label"]:checked')?.value === '0' ? 0 : 1;

  function pointsChanged() {
    gpu?.setPoints(points);
    dirty = true;
    announce();
  }

  function addPoint(x: number, y: number, label: 0 | 1) {
    if (points.length >= MAX_POINTS) {
      say(`The field holds at most ${MAX_POINTS} points.`);
      return;
    }
    points = [...points, { x, y, label }];
    pointsChanged();
  }

  function removeNearest(x: number, y: number) {
    let best = -1;
    let bestD = 0.15;
    points.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) [best, bestD] = [i, d];
    });
    if (best >= 0) {
      points = points.filter((_, i) => i !== best);
      pointsChanged();
    }
  }

  function resetWeights() {
    params = initParams(++seed);
    velocity.fill(0);
    steps = 0;
    gpu?.setParams(params);
    dirty = true;
  }

  // A summary for screen readers, shortly after things settle.
  let timer = 0;
  function announce() {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const a = points.filter((p) => p.label === 1).length;
      say(
        `${points.length} points: ${a} in class A, ${points.length - a} in class B. ` +
          (points.length
            ? `The network classifies ${Math.round(accuracy(params, points) * 100)}% correctly.`
            : ''),
      );
    }, 2500);
  }

  // Pointer: click adds the chosen class; shift-click or right-click adds the other one.
  const fieldPoint = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = fieldPoint(e);
    const label = selectedLabel();
    addPoint(p.x, p.y, e.shiftKey || e.button === 2 ? ((1 - label) as 0 | 1) : label);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    Object.assign(probe, fieldPoint(e));
  });
  canvas.addEventListener('focus', () => {
    cursor.shown = true;
    dirty = true;
  });
  canvas.addEventListener('blur', () => {
    cursor.shown = false;
    dirty = true;
  });
  canvas.addEventListener('keydown', (e) => {
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-0.05, 0],
      ArrowRight: [0.05, 0],
      ArrowUp: [0, 0.05],
      ArrowDown: [0, -0.05],
    };
    const m = move[e.key];
    if (m) {
      cursor.x = Math.max(-0.97, Math.min(0.97, cursor.x + m[0]));
      cursor.y = Math.max(-0.97, Math.min(0.97, cursor.y + m[1]));
      Object.assign(probe, { x: cursor.x, y: cursor.y });
    } else if (e.key === 'Enter' || e.key === ' ') addPoint(cursor.x, cursor.y, selectedLabel());
    else if (e.key === 'Delete' || e.key === 'Backspace') removeNearest(cursor.x, cursor.y);
    else return;
    e.preventDefault();
    dirty = true;
  });

  form.addEventListener('submit', (e) => e.preventDefault());
  form.querySelector('[name="preset"]')?.addEventListener('change', (e) => {
    points = preset((e.target as HTMLSelectElement).value as Preset);
    resetWeights();
    pointsChanged();
  });
  el.querySelector('[data-reset]')?.addEventListener('click', resetWeights);
  el.querySelector('[data-clear]')?.addEventListener('click', () => {
    points = [];
    pointsChanged();
  });
  trainButton.addEventListener('click', () => {
    training = !training;
    trainButton.textContent = training ? 'Pause training' : 'Train';
  });

  let scene: Awaited<ReturnType<typeof import('./network-scene').createNetworkScene>> = null;
  let sinceDom = 1;
  function updateDom() {
    const set = (name: string, text: string) => {
      const node = metric(name);
      if (node && node.textContent !== text) node.textContent = text;
    };
    set('accuracy', points.length ? `${Math.round(accuracy(params, points) * 100)}%` : '–');
    set('loss', points.length ? meanLoss(params, points).toFixed(3) : '–');
    set('steps', steps.toLocaleString('en'));
  }

  function useCpu(reason: string) {
    gpu = null;
    trainingOn(`Training on the CPU${reason}.`);
  }

  const loop = createLoop(el, (dt) => {
    if (training && points.length) {
      if (gpu) {
        try {
          gpu.steps(GPU_STEPS_PER_FRAME);
          steps += GPU_STEPS_PER_FRAME;
          if (!reading) {
            reading = true;
            void gpu
              .read()
              .then((p) => {
                params = p;
                dirty = true;
              })
              .catch((error: unknown) => {
                console.warn('Lab: GPU training failed; continuing on the CPU.', error);
                useCpu(' (WebGPU training failed on this browser)');
              })
              .finally(() => (reading = false));
          }
        } catch (error) {
          console.warn('Lab: GPU training failed; continuing on the CPU.', error);
          useCpu(' (WebGPU training failed on this browser)');
        }
      } else {
        for (let i = 0; i < CPU_STEPS_PER_FRAME; i++) trainStep(params, velocity, points);
        steps += CPU_STEPS_PER_FRAME;
        dirty = true;
      }
    }
    if (dirty) {
      drawField();
      dirty = false;
    }
    scene?.update(dt, params, forward(params, probe.x, probe.y), probe);
    sinceDom += dt;
    if (sinceDom > 0.3) {
      sinceDom = 0;
      updateDom();
    }
  });
  document.documentElement.addEventListener('world:theme', () => (dirty = true));

  useCpu('');
  drawField();
  updateDom();
  announce();
  loop.start();

  const tier = await tierReady();
  if (tier !== 'poster') {
    const { createNetworkScene } = await import('./network-scene');
    scene = await createNetworkScene(view);
    if (scene?.backend === 'webgpu') {
      try {
        const { createGpuTrainer } = await import('./train-gpu');
        const trainer = createGpuTrainer(scene.renderer);
        trainer.setParams(params);
        trainer.setPoints(points);
        velocity.fill(0);
        gpu = trainer;
        where.textContent = 'Training on the GPU, as WebGPU compute shaders.';
      } catch (error) {
        console.warn('Lab: no GPU training.', error);
      }
    }
  }
  el.dataset.view3d = scene ? 'on' : 'off';
  el.dataset.training = gpu ? 'gpu' : 'cpu';

  // Test hook: with ?lab-debug, compare the GPU kernels with the CPU spec.
  if (new URLSearchParams(location.search).has('lab-debug')) {
    const { gpuParity } = await import('./parity');
    Object.assign(window, { __labTrainParity: gpuParity });
  }
}
