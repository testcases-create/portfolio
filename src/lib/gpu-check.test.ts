import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer, posterReason } from './gpu-check';

const gpu = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)';
const base = { forced: null, reducedMotion: false, saveData: false, renderer: gpu };

describe('isSoftwareRenderer', () => {
  it('recognises software rasterisers', () => {
    expect(
      isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'),
    ).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)')).toBe(true);
  });

  it('accepts hardware GPUs', () => {
    expect(isSoftwareRenderer(gpu)).toBe(false);
    expect(isSoftwareRenderer('ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)')).toBe(false);
  });
});

describe('posterReason', () => {
  it('runs the world on a hardware GPU', () => {
    expect(posterReason(base)).toBeNull();
  });

  it('explains each poster case', () => {
    expect(posterReason({ ...base, reducedMotion: true })).toBe('reduced-motion');
    expect(posterReason({ ...base, saveData: true })).toBe('save-data');
    expect(posterReason({ ...base, renderer: null })).toBe('no-webgl2');
    expect(posterReason({ ...base, renderer: 'SwiftShader' })).toBe('software-rendering');
    expect(posterReason({ ...base, forced: 'poster' })).toBe('forced');
  });

  it('lets a forced tier override the checks, for testing', () => {
    expect(
      posterReason({ ...base, forced: 'medium', renderer: 'SwiftShader', reducedMotion: true }),
    ).toBeNull();
  });
});
