import { describe, expect, it } from 'vitest';
import { FLOATS_PER_PARTICLE, Kind, STREAM_REF_LENGTH, buildFormations } from './formations';
import { arcLift, stepCpu, target, type CpuState, type Target } from './sim.cpu';
import { oneHot, signals, type SimInputs } from './sim.shared';

const colours = { neutral: [1, 1, 1], sde: [0, 0, 1], llm: [1, 1, 0], ml: [1, 0, 0.5] } as const;
const inputs = (over: Partial<SimInputs> = {}): SimInputs => ({
  time: 1,
  dt: 1 / 60,
  assemble: 1,
  weights: oneHot(0),
  cursor: 3.5,
  front: 0.4,
  pointer: [99, 99, 99],
  pointerStrength: 0,
  alpha: 0.5,
  tintBoost: 0,
  neutral: [...colours.neutral],
  sde: [...colours.sde],
  llm: [...colours.llm],
  ml: [...colours.ml],
  ...over,
});
const out = (): Target => ({ x: 0, y: 0, z: 0, sig: 0, vis: 0, tint: 0, hue: [0, 0, 0], rigid: 0 });

describe('target()', () => {
  it('data: slides from A to B, and a longer (faster) segment is brighter', () => {
    const a = [0, 0, 0, Kind.STREAM];
    const slow = [STREAM_REF_LENGTH * 0.2, 0, 0, 0.5];
    const fast = [STREAM_REF_LENGTH, 0, 0, 0.5];
    const [o1, o2] = [out(), out()];
    target(0, a, slow, 0.1, inputs({ time: 0 }), o1);
    target(0, a, fast, 0.1, inputs({ time: 0 }), o2);
    expect(o2.vis).toBeGreaterThan(o1.vis);
    expect(o1.rigid).toBe(1);
    expect(o1.x).toBeCloseTo(STREAM_REF_LENGTH * 0.1, 5);
  });

  it('ml: the pulse lights particles at the front', () => {
    const [at, away] = [out(), out()];
    target(1, [0, 0, 0, Kind.POINT], [0, 0, 0, 0.4], 0, inputs({ front: 0.4 }), at);
    target(1, [0, 0, 0, Kind.POINT], [0, 0, 0, 0.9], 0, inputs({ front: 0.4 }), away);
    expect(at.sig).toBeCloseTo(1, 5);
    expect(away.sig).toBeLessThan(0.01);
  });

  it('llm: tokens after the cursor are dim, generated ones are bright', () => {
    const [done, next] = [out(), out()];
    target(2, [0, 0, 0, Kind.BLOCK], [0, 0, 0, 2], 0, inputs({ cursor: 3.5 }), done);
    target(2, [0, 0, 0, Kind.BLOCK], [0, 0, 0, 5], 0, inputs({ cursor: 3.5 }), next);
    expect(done.vis).toBe(1);
    expect(next.vis).toBeCloseTo(0.1, 5);
  });

  it('llm: arcs peak at the lifted midpoint', () => {
    const o = out();
    // phase 0.5 at time 0 puts the particle half way along the arc
    target(2, [0, 0, 0, Kind.ARC], [4, 0, 0, 3.5], 0, inputs({ time: 0, cursor: 4 }), o);
    expect(o.x).toBeCloseTo(2, 5);
    expect(o.y).toBeCloseTo(arcLift(4) / 2, 5);
  });

  it('sde: queue packets decelerate into their target', () => {
    const [flow, queue] = [out(), out()];
    const a = [0, 0, 0];
    const b = [1, 0, 0];
    target(3, [...a, Kind.FLOW], [...b, 0.5], 0, inputs({ time: 0 }), flow);
    target(3, [...a, Kind.QUEUE], [...b, 0.5], 0, inputs({ time: 0 }), queue);
    expect(flow.x).toBeCloseTo(0.5, 5);
    expect(queue.x).toBeGreaterThan(0.75);
  });

  it('converge: petals take the three role colours', () => {
    const hues = new Set<string>();
    for (let u = 0.02; u < 1; u += 0.05) {
      const o = out();
      target(4, [0, 0, 0, Kind.KNOT], [0, 0, 0, u], 0, inputs({ time: 0 }), o);
      hues.add(o.hue.join());
    }
    for (const c of [colours.sde, colours.llm, colours.ml]) expect(hues).toContain(c.join());
  });
});

describe('stepCpu()', () => {
  const make = (n: number): CpuState => {
    const { data, hash } = buildFormations(n);
    return {
      n,
      form: data,
      hash,
      pos: new Float32Array(n * 4),
      vel: new Float32Array(n * 4),
      col: new Float32Array(n * 4),
    };
  };

  it('snaps rigid formations exactly onto their targets once formed', () => {
    const S = make(64);
    const U = inputs({ weights: oneHot(0), time: 2 });
    stepCpu(S, U);
    const o = out();
    target(0, S.form.subarray(0, 4), S.form.subarray(4, 8), S.hash[0] ?? 0, U, o);
    expect(S.pos[0]).toBeCloseTo(o.x, 5);
    expect(S.pos[1]).toBeCloseTo(o.y, 5);
  });

  it('springs toward non-rigid targets and damps', () => {
    const S = make(64);
    const U = inputs({ weights: oneHot(1) });
    const tx = S.form[FLOATS_PER_PARTICLE * 0 + 8] ?? 0;
    const errors: number[] = [];
    for (let f = 0; f < 240; f++) {
      stepCpu(S, U);
      errors.push(Math.abs((S.pos[0] ?? 0) - tx));
    }
    expect(errors.at(-1)).toBeLessThan(0.05);
    expect(errors.at(-1)).toBeLessThan(errors[10] ?? 0);
  });

  it('writes colour and size for every particle', () => {
    const S = make(32);
    stepCpu(S, inputs({ weights: [0.2, 0.2, 0.2, 0.2, 0.2], ...signals(3) }));
    expect(S.col.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < 32; i++) expect(S.vel[i * 4 + 3]).toBeGreaterThan(0);
  });

  it('does not move when assemble is 0 and there is no flow or pointer', () => {
    const S = make(8);
    const U = inputs({ weights: oneHot(1), assemble: 0 });
    // Only the curl field acts; over one frame it moves particles by at most a few millimetres.
    stepCpu(S, U);
    for (let i = 0; i < 8; i++)
      expect(Math.hypot(S.pos[i * 4] ?? 0, S.pos[i * 4 + 1] ?? 0)).toBeLessThan(0.01);
  });
});
