// Cheap capability checks that run in boot code, before any graphics code is
// downloaded. A software rasteriser (no usable GPU) can't hold the world's
// frame rate and would block the main thread for seconds per frame, so those
// visitors get the poster (PLAN.md 7.5) and never download the engine.

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic/i;

export const isSoftwareRenderer = (renderer: string): boolean => SOFTWARE.test(renderer);

export type PosterReason = 'forced' | 'reduced-motion' | 'save-data' | 'no-webgl2' | 'software-rendering';

/** Returns why this browser should get the poster, or null if it can run the world. */
export function posterReason(env: {
  forced: string | null;
  reducedMotion: boolean;
  saveData: boolean;
  renderer: string | null;
}): PosterReason | null {
  if (env.forced === 'poster') return 'forced';
  if (env.forced) return null; // any other forced tier: try it
  if (env.reducedMotion) return 'reduced-motion';
  if (env.saveData) return 'save-data';
  if (env.renderer === null) return 'no-webgl2';
  if (isSoftwareRenderer(env.renderer)) return 'software-rendering';
  return null;
}

/** The unmasked WebGL2 renderer string, or null without WebGL2. */
export function readRenderer(): string | null {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return renderer;
}
