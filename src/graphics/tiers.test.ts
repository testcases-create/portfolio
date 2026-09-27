import { describe, expect, it } from 'vitest';
import { DPR_CAP, chooseTier, createProbe, createResolution, nextTier, pixelRatio } from './tiers';

const caps = { reducedMotion: false, saveData: false, webgpu: true, webgl2: true };

describe('chooseTier', () => {
  it('prefers WebGPU, then WebGL2, then the poster', () => {
    expect(chooseTier(caps)).toBe('high');
    expect(chooseTier({ ...caps, webgpu: false })).toBe('medium');
    expect(chooseTier({ ...caps, webgpu: false, webgl2: false })).toBe('poster');
  });

  it('gives the poster to reduced motion and Save-Data', () => {
    expect(chooseTier({ ...caps, reducedMotion: true })).toBe('poster');
    expect(chooseTier({ ...caps, saveData: true })).toBe('poster');
  });

  it('honours a valid forced tier and ignores an invalid one', () => {
    expect(chooseTier({ ...caps, forced: 'low' })).toBe('low');
    expect(chooseTier({ ...caps, forced: 'ultra' })).toBe('high');
  });

  it('steps down in order and stops at the poster', () => {
    expect(['high', 'medium', 'low', 'poster'].map((t) => nextTier(t as never))).toEqual([
      'medium',
      'low',
      'poster',
      'poster',
    ]);
  });
});

describe('createProbe', () => {
  it('ignores warm-up frames and decides on the median', () => {
    const probe = createProbe({ warmup: 5, window: 11, limitMs: 21 });
    for (let i = 0; i < 5; i++) probe.push(i < 2 ? 500 : 16); // shader compilation stalls the first frames
    for (let i = 0; i < 10; i++) expect(probe.push(i % 3 === 0 ? 40 : 16)).toBe('pending');
    expect(probe.push(16)).toBe('ok');
    expect(probe.median).toBe(16);
  });

  it('bails out within a few frames on a device that is far too slow', () => {
    const probe = createProbe();
    expect(probe.push(2400)).toBe('pending'); // first frames compile shaders
    expect(probe.push(2400)).toBe('pending');
    expect(probe.push(2400)).toBe('pending');
    expect(probe.push(2400)).toBe('pending');
    expect(probe.push(2400)).toBe('step-down');
  });

  it('does not bail out on isolated stalls', () => {
    const probe = createProbe();
    for (let i = 0; i < 200; i++) probe.push(i % 3 === 0 ? 150 : 16);
    expect(probe.verdict).toBe('ok');
  });

  it('steps down when the median is too slow', () => {
    const probe = createProbe({ warmup: 0, window: 5, limitMs: 21 });
    [25, 30, 18, 26, 40].forEach((ms) => probe.push(ms));
    expect(probe.verdict).toBe('step-down');
  });
});

describe('createResolution', () => {
  it('sheds pixels under sustained load, never below the floor', () => {
    const r = createResolution({ min: 0.55, holdDown: 10 });
    for (let i = 0; i < 2000; i++) r.update(33);
    expect(r.scale).toBe(0.55);
  });

  it('wins pixels back slowly when frames are fast', () => {
    const r = createResolution({ holdDown: 10, holdUp: 50 });
    for (let i = 0; i < 400; i++) r.update(33);
    const low = r.scale;
    for (let i = 0; i < 49; i++) r.update(10);
    expect(r.scale).toBe(low);
    for (let i = 0; i < 3000; i++) r.update(10);
    expect(r.scale).toBe(1);
  });

  it('caps device pixel ratio', () => {
    expect(pixelRatio(3, 1)).toBe(DPR_CAP);
    expect(pixelRatio(1, 0.5)).toBe(0.5);
  });
});
