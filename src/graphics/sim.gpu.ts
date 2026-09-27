// The GPU simulation: one TSL compute kernel that runs as a WebGPU compute
// shader, and on WebGL2 through Three's transform-feedback path (PLAN.md 7.3).
//
// It mirrors sim.cpu.ts line for line; that file is the specification.
//
// The kernel has no branches around buffer reads. On the WebGL2 backend, a
// PBO read inside one of several sibling If() blocks uses a size variable that
// is only assigned in the first block (three r186.1; see docs/upstream/). So
// every formation is evaluated and blended arithmetically instead.
import type { ComputeNode, Node, StorageBufferNode, UniformNode } from 'three/webgpu';
import { Color, Vector3 } from 'three/webgpu';
import {
  Fn,
  abs,
  atan,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  instanceIndex,
  instancedArray,
  length,
  min,
  mix,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { CURL_TERMS } from './curl';
import {
  K,
  KNOT_MAJOR,
  KNOT_MINOR,
  KNOT_PERIOD,
  KNOT_SCALE,
  Kind,
  STREAM_PERIOD,
  STREAM_REF_LENGTH,
  STRIDE,
} from './formations';
import {
  CURL_GAIN,
  CURL_SCALE,
  DAMPING,
  DATA_SPIN,
  FLOW_AMP,
  KNOT_SPIN,
  POINTER_FALLOFF,
  POINTER_GAIN,
  RIGID_AT,
  SIGNAL_GAIN,
  SIZE,
  STIFFNESS,
  type SimInputs,
} from './sim.shared';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** Uniform nodes, written from SimInputs once per frame. */
export function createUniforms() {
  return {
    time: uniform(0),
    dt: uniform(1 / 60),
    assemble: uniform(1),
    weights: Array.from({ length: K }, () => uniform(0)),
    cursor: uniform(0),
    front: uniform(0),
    pointer: uniform(new Vector3(99, 99, 99)),
    pointerStrength: uniform(0),
    alpha: uniform(0.3),
    tintBoost: uniform(0),
    neutral: uniform(new Color()),
    sde: uniform(new Color()),
    llm: uniform(new Color()),
    ml: uniform(new Color()),
  };
}
export type Uniforms = ReturnType<typeof createUniforms>;

export function writeUniforms(u: Uniforms, s: SimInputs): void {
  u.time.value = s.time;
  u.dt.value = s.dt;
  u.assemble.value = s.assemble;
  u.weights.forEach((w, k) => (w.value = s.weights[k] ?? 0));
  u.cursor.value = s.cursor;
  u.front.value = s.front;
  u.pointer.value.set(...s.pointer);
  u.pointerStrength.value = s.pointerStrength;
  u.alpha.value = s.alpha;
  u.tintBoost.value = s.tintBoost;
  u.neutral.value.setRGB(...s.neutral);
  u.sde.value.setRGB(...s.sde);
  u.llm.value.setRGB(...s.llm);
  u.ml.value.setRGB(...s.ml);
}

// A colour uniform is a vec3 in the shader; the typings keep it as its own 'color' type.
const colour = (u: UniformNode<'color', Color>): V3 => u as unknown as V3;

/** 1 when kind equals k, else 0 (kinds are small integers stored as floats). */
const isKind = (kind: F, k: number): F => float(1).sub(step(0.5, abs(kind.sub(k))));
const smooth = (e0: number, e1: number, x: F): F => smoothstep(e0, e1, x);
// x * x, not pow(x, 2): pow() with a negative base is undefined in GLSL and WGSL.
const sq = (x: F): F => x.mul(x);

function rotY(p: V3, angle: F): V3 {
  const c = cos(angle);
  const s = sin(angle);
  return vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s)));
}

function rotZ(p: V3, angle: F): V3 {
  const c = cos(angle);
  const s = sin(angle);
  return vec3(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)), p.z);
}

function arc(a: V3, b: V3, lift: F, t: F): V3 {
  const u = float(1).sub(t);
  const ctrl = a
    .add(b)
    .mul(0.5)
    .add(vec3(0, lift, 0));
  return a
    .mul(u.mul(u))
    .add(ctrl.mul(u.mul(t).mul(2)))
    .add(b.mul(t.mul(t)));
}

function knotPoint(u: F): V3 {
  const t = u.mul(Math.PI * 2);
  const rho = cos(t.mul(3)).mul(KNOT_MINOR).add(KNOT_MAJOR);
  return vec3(
    rho.mul(cos(t.mul(2))).mul(KNOT_SCALE),
    rho.mul(sin(t.mul(2))).mul(KNOT_SCALE),
    sin(t.mul(3)).mul(KNOT_MINOR * KNOT_SCALE),
  );
}

/** Mirrors knotSector() in formations.ts: petal index plus progress, in [0, 3). */
const knotSector = (p: V3): F =>
  fract(
    atan(p.y, p.x)
      .add(Math.PI / 3)
      .div(Math.PI * 2),
  ).mul(3);

function curlField(p: V3, t: F): V3 {
  const g: V3[] = [vec3(0), vec3(0), vec3(0)];
  for (const { c, k, amp, phi, omega } of CURL_TERMS) {
    const kv = vec3(...k);
    g[c] = (g[c] as V3).add(kv.mul(cos(dot(p, kv).add(t.mul(omega)).add(phi)).mul(amp)));
  }
  const [gx, gy, gz] = g as [V3, V3, V3];
  return vec3(gz.y.sub(gy.z), gx.z.sub(gz.x), gy.x.sub(gx.y));
}

interface GpuTarget {
  pos: V3;
  sig: F;
  vis: F;
  tint: F;
  hue: V3;
  rigid: F;
}

/** The five formation targets. Each mirrors the same branch of target() in sim.cpu.ts. */
function formationTarget(k: number, A: V4, B: V4, h: F, U: Uniforms): GpuTarget {
  const t = U.time;
  const kind = A.w;
  const param = B.w;
  const one = float(1);

  if (k === 0) {
    const s = fract(param.add(t.div(STREAM_PERIOD)));
    const speed = min(length(B.xyz.sub(A.xyz)).div(STREAM_REF_LENGTH), 1);
    const role = fract(h.mul(7.13));
    return {
      pos: rotY(mix(A.xyz, B.xyz, s), t.mul(DATA_SPIN)),
      sig: float(0),
      vis: speed
        .mul(0.7)
        .add(0.3)
        .mul(smooth(0, 0.12, s))
        .mul(one.sub(smooth(0.88, 1, s))),
      tint: step(0.93, h).mul(0.85),
      hue: select(
        role.lessThan(1 / 3),
        colour(U.sde),
        select(role.lessThan(2 / 3), colour(U.llm), colour(U.ml)),
      ),
      rigid: one,
    };
  }

  if (k === 1) {
    return {
      pos: A.xyz,
      sig: exp(sq(param.sub(U.front).div(0.045)).negate()),
      vis: one,
      tint: float(0.22),
      hue: colour(U.ml),
      rigid: float(0),
    };
  }

  if (k === 2) {
    const isArc = isKind(kind, Kind.ARC);
    const idx = floor(param);
    const generated = step(idx, U.cursor);
    const now = one.sub(min(abs(idx.sub(floor(U.cursor))), 1));
    const s = fract(fract(param).add(t.mul(0.3)));
    const lift = sqrt(abs(B.x.sub(A.x)))
      .mul(1.4)
      .add(0.8);
    const arcVis = generated
      .mul(now.mul(0.8).add(0.2))
      .mul(smooth(0, 0.06, s))
      .mul(one.sub(smooth(0.94, 1, s)));
    return {
      pos: mix(A.xyz, arc(A.xyz, B.xyz, lift, s), isArc),
      sig: mix(now.mul(0.6), now, isArc),
      vis: mix(mix(float(0.1), one, generated), arcVis, isArc),
      tint: mix(generated.mul(0.4).add(0.3), float(0.25), isArc),
      hue: colour(U.llm),
      rigid: one,
    };
  }

  if (k === 3) {
    const isPoint = isKind(kind, Kind.POINT);
    const isQueue = isKind(kind, Kind.QUEUE);
    const s = fract(param.add(t.mul(0.3)));
    const eased = mix(s, one.sub(one.sub(s).pow(2.4)), isQueue);
    const flowVis = smooth(0, 0.05, s).mul(one.sub(smooth(0.93, 1, s)));
    return {
      pos: mix(mix(A.xyz, B.xyz, eased), A.xyz, isPoint),
      sig: one.sub(isPoint),
      vis: mix(flowVis, param, isPoint),
      tint: float(0.3),
      hue: colour(U.sde),
      rigid: one.sub(isPoint),
    };
  }

  // Converge: the torus knot.
  const isArc = isKind(kind, Kind.ARC);
  const spin = t.mul(KNOT_SPIN);
  const sa = fract(param.add(t.mul(0.35)));
  const arcPos = rotZ(arc(A.xyz, B.xyz, float(0.25), sa), spin);
  const arcVis = smooth(0, 0.1, sa)
    .mul(one.sub(smooth(0.9, 1, sa)))
    .mul(0.8);

  const u = fract(param.add(t.div(KNOT_PERIOD)));
  const onKnot = knotPoint(u);
  const knotPos = rotZ(onKnot.add(A.xyz), spin);
  const l = knotSector(onKnot);
  const lobe = floor(l);
  const edge = smooth(0.85, 1, fract(l));
  const [sde, llm, ml] = [colour(U.sde), colour(U.llm), colour(U.ml)];
  const from = select(lobe.lessThan(0.5), sde, select(lobe.lessThan(1.5), llm, ml));
  const to = select(lobe.lessThan(0.5), llm, select(lobe.lessThan(1.5), ml, sde));
  const packets = step(0.82, fract(u.mul(36).sub(t.mul(0.9)))).mul(isKind(lobe, 0));
  const pulse = exp(
    sq(
      fract(l)
        .sub(fract(t.mul(0.25)))
        .div(0.06),
    ).negate(),
  ).mul(isKind(lobe, 2));
  return {
    pos: mix(knotPos, arcPos, isArc),
    sig: mix(packets.add(pulse), float(0.6), isArc),
    vis: mix(float(0.9), arcVis, isArc),
    tint: float(0.85),
    hue: mix(mix(from, to, edge), llm, isArc),
    rigid: one,
  };
}

export interface GpuSim {
  pos: StorageBufferNode<'vec4'>;
  vel: StorageBufferNode<'vec4'>;
  col: StorageBufferNode<'vec4'>;
  compute: ComputeNode;
}

/**
 * Builds the buffers and the compute kernel.
 * form: n * STRIDE vec4 (buildFormations); hash: n floats; start: n vec4 positions.
 */
export function createGpuSim(
  n: number,
  form: Float32Array,
  hash: Float32Array,
  start: Float32Array,
  U: Uniforms,
): GpuSim {
  const pos = instancedArray(n, 'vec4');
  const vel = instancedArray(n, 'vec4');
  const col = instancedArray(n, 'vec4');
  // Formation data is read at arbitrary indices, which WebGL2 does through a PBO texture.
  const formBuf = instancedArray(n * STRIDE, 'vec4').setPBO(true);
  const hashBuf = instancedArray(n, 'float');
  (formBuf.value.array as Float32Array).set(form);
  (hashBuf.value.array as Float32Array).set(hash);
  (pos.value.array as Float32Array).set(start);

  const compute = Fn(() => {
    const i = instanceIndex;
    const P = pos.element(i).xyz.toVar();
    const V = vel.element(i).xyz.toVar();
    const h = hashBuf.element(i).toVar();

    const tgt = vec3(0).toVar();
    const sig = float(0).toVar();
    const vis = float(0).toVar();
    const tint = float(0).toVar();
    const hue = vec3(0).toVar();
    const flow = float(0).toVar();
    const stiff = float(0).toVar();
    const rigid = float(0).toVar();
    const size = float(0).toVar();

    const base = i.mul(STRIDE);
    for (let k = 0; k < K; k++) {
      const w = U.weights[k] as UniformNode<'float', number>;
      const A = formBuf.element(base.add(k * 2)).toVar();
      const B = formBuf.element(base.add(k * 2 + 1)).toVar();
      const f = formationTarget(k, A, B, h, U);
      tgt.addAssign(f.pos.mul(w));
      sig.addAssign(f.sig.mul(w));
      vis.addAssign(f.vis.mul(w));
      tint.addAssign(f.tint.mul(w));
      hue.addAssign(f.hue.mul(w));
      rigid.addAssign(f.rigid.mul(w));
      flow.addAssign(w.mul(FLOW_AMP[k] ?? 0));
      stiff.addAssign(w.mul(STIFFNESS[k] ?? 0));
      size.addAssign(w.mul(SIZE[k] ?? 0));
    }

    const d = U.pointer.sub(P);
    const pull = exp(dot(d, d).mul(-POINTER_FALLOFF)).mul(U.pointerStrength).mul(POINTER_GAIN);
    const force = tgt
      .sub(P)
      .mul(stiff.mul(U.assemble))
      .add(curlField(P.mul(CURL_SCALE), U.time).mul(flow.mul(CURL_GAIN)))
      .add(d.mul(pull));
    V.assign(V.mul(exp(U.dt.mul(-DAMPING))).add(force.mul(U.dt)));
    P.addAssign(V.mul(U.dt));

    const snap = step(RIGID_AT, rigid).mul(step(0.99, U.assemble));
    P.assign(mix(P, tgt, snap));
    V.assign(mix(V, vec3(0), snap));

    const m = clamp(tint.add(U.tintBoost).add(sig), 0, 1);
    pos.element(i).assign(vec4(P, sig));
    vel.element(i).assign(vec4(V, size));
    col
      .element(i)
      .assign(vec4(mix(colour(U.neutral), hue, m), vis.mul(U.alpha).mul(sig.mul(SIGNAL_GAIN).add(1))));
  })().compute(n);

  return { pos, vel, col, compute };
}
