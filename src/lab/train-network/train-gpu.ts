// WebGPU training for "Train a network": the same maths as logic.ts, as two
// TSL compute kernels per step. The first runs one invocation per point:
// a forward pass, then backpropagation, writing that point's gradient. The
// second runs one invocation per weight: it averages that weight's gradient
// over the points and applies the momentum update. The weights never leave
// the GPU while training; the page reads them back a few times a second to
// draw the decision boundary. Loops over layers are unrolled in JavaScript, so
// the shader is straight-line code. Used on the high tier only (WebGPU).
import type { WebGPURenderer } from 'three/webgpu';
import {
  Fn,
  Loop,
  exp,
  float,
  instanceIndex,
  instancedArray,
  max,
  select,
  tanh,
  uint,
  uniform,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { LEARNING_RATE, MAX_POINTS, MOMENTUM, OFFSETS as O, PARAMS, type Point } from './logic';

type F = Node<'float'>;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function createGpuTrainer(renderer: WebGPURenderer) {
  const params = instancedArray(PARAMS, 'float');
  const velocity = instancedArray(PARAMS, 'float');
  const points = instancedArray(MAX_POINTS, 'vec4');
  const grads = instancedArray(MAX_POINTS * PARAMS, 'float');
  const count = uniform(0, 'uint');

  const perPoint = Fn(() => {
    const i = instanceIndex;
    const pt = points.element(i);
    const x = pt.x.toVar();
    const y = pt.y.toVar();
    const label = pt.z.toVar();
    // Points past the count contribute nothing.
    const active = select(i.lessThan(count), float(1), float(0));
    const P = (k: number) => params.element(uint(k)) as unknown as F;

    const h1 = range(8).map((j) =>
      tanh(
        P(O.w1 + j * 2)
          .mul(x)
          .add(P(O.w1 + j * 2 + 1).mul(y))
          .add(P(O.b1 + j)),
      ).toVar(),
    );
    const h2 = range(8).map((j) => {
      let z: F = P(O.b2 + j);
      for (let k = 0; k < 8; k++) z = z.add(P(O.w2 + j * 8 + k).mul(h1[k] as F));
      return tanh(z).toVar();
    });
    let z3: F = P(O.b3);
    for (let k = 0; k < 8; k++) z3 = z3.add(P(O.w3 + k).mul(h2[k] as F));
    const out = float(1).div(exp(z3.negate()).add(1));

    const base = i.mul(uint(PARAMS));
    const G = (k: number, value: F) => grads.element(base.add(uint(k))).assign(value);
    const d3 = out.sub(label).mul(active).toVar();
    G(O.b3, d3);
    const d2 = range(8).map((j) => {
      const h = h2[j] as F;
      G(O.w3 + j, d3.mul(h));
      return d3
        .mul(P(O.w3 + j))
        .mul(float(1).sub(h.mul(h)))
        .toVar();
    });
    const d1: F[] = range(8).map(() => float(0));
    for (let j = 0; j < 8; j++) {
      const dj = d2[j] as F;
      G(O.b2 + j, dj);
      for (let k = 0; k < 8; k++) {
        G(O.w2 + j * 8 + k, dj.mul(h1[k] as F));
        d1[k] = (d1[k] as F).add(dj.mul(P(O.w2 + j * 8 + k)));
      }
    }
    for (let k = 0; k < 8; k++) {
      const h = h1[k] as F;
      const dk = (d1[k] as F).mul(float(1).sub(h.mul(h))).toVar();
      G(O.b1 + k, dk);
      G(O.w1 + k * 2, dk.mul(x));
      G(O.w1 + k * 2 + 1, dk.mul(y));
    }
  })().compute(MAX_POINTS);

  const perWeight = Fn(() => {
    const j = instanceIndex;
    const sum = float(0).toVar();
    Loop({ start: uint(0), end: count, type: 'uint', condition: '<' }, ({ i }: { i: Node<'uint'> }) => {
      sum.addAssign(grads.element(i.mul(uint(PARAMS)).add(j)));
    });
    const g = sum.div(max(float(count), float(1)));
    const v = velocity.element(j);
    v.assign(v.mul(MOMENTUM).sub(g.mul(LEARNING_RATE)));
    params.element(j).addAssign(v);
  })().compute(PARAMS);

  const upload = (node: { value: { needsUpdate: boolean } }) => {
    node.value.needsUpdate = true;
  };

  return {
    setPoints(list: readonly Point[]) {
      const a = points.value.array as Float32Array;
      a.fill(0);
      list.slice(0, MAX_POINTS).forEach((p, i) => a.set([p.x, p.y, p.label, 0], i * 4));
      count.value = Math.min(list.length, MAX_POINTS);
      upload(points);
    },
    setParams(p: Float32Array) {
      (params.value.array as Float32Array).set(p);
      (velocity.value.array as Float32Array).fill(0);
      upload(params);
      upload(velocity);
    },
    /** Queues `n` training steps. */
    steps(n: number) {
      if (!count.value) return;
      for (let s = 0; s < n; s++) {
        renderer.compute(perPoint);
        renderer.compute(perWeight);
      }
    },
    async stepsAsync(n: number) {
      if (!count.value) return;
      for (let s = 0; s < n; s++) {
        await renderer.computeAsync(perPoint);
        await renderer.computeAsync(perWeight);
      }
    },
    async read(): Promise<Float32Array> {
      return new Float32Array(await renderer.getArrayBufferAsync(params.value));
    },
  };
}

export type GpuTrainer = ReturnType<typeof createGpuTrainer>;
