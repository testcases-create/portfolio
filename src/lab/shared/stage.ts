// A small three.js stage for a Lab demo: its own canvas, the same renderer and
// the same three.js chunk as the world, and the same tier decision. High uses
// WebGPU; medium and low use WebGL2. The poster tier (reduced motion,
// Save-Data, no usable GPU) gets no 3D view: each demo then shows its DOM
// view alone.
import { Color, PerspectiveCamera, Scene, Vector3, WebGPURenderer } from 'three/webgpu';
import { tierReady } from './loop';

const root = document.documentElement;

export interface Palette {
  text: Color;
  muted: Color;
  line: Color;
  ground: Color;
  sde: Color;
  llm: Color;
  ml: Color;
}

export function readPalette(): Palette {
  const css = getComputedStyle(root);
  const c = (name: string) => new Color(css.getPropertyValue(name).trim() || '#888');
  return {
    text: c('--text'),
    muted: c('--muted'),
    line: c('--line'),
    ground: c('--ground'),
    sde: c('--sde'),
    llm: c('--llm'),
    ml: c('--ml'),
  };
}

export type Stage = NonNullable<Awaited<ReturnType<typeof createStage>>>;

/** Creates a 3D stage inside `host`, or returns null on the poster tier or when the renderer fails. */
export async function createStage(host: HTMLElement) {
  const tier = await tierReady();
  if (tier === 'poster' || tier === 'pending') return null;
  const renderer = new WebGPURenderer({ antialias: true, alpha: true, forceWebGL: tier !== 'high' });
  try {
    await renderer.init();
  } catch (error) {
    console.warn('Lab: no 3D view on this browser.', error);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.domElement.className = 'lab-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  let palette = readPalette();
  const onTheme = () => {
    palette = readPalette();
    stage.onTheme?.(palette);
  };
  root.addEventListener('world:theme', onTheme);

  let width = 1;
  let height = 1;
  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const sizer = new ResizeObserver(resize);
  sizer.observe(host);
  resize();

  let failed = false;
  const projected = new Vector3();
  const stage = {
    renderer,
    scene,
    camera,
    tier,
    backend: tier === 'high' ? ('webgpu' as const) : ('webgl2' as const),
    get palette() {
      return palette;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get failed() {
      return failed;
    },
    onTheme: undefined as ((p: Palette) => void) | undefined,
    /** Draws a frame. A renderer that throws is given up, and the demo keeps its DOM view. */
    render() {
      if (failed) return;
      try {
        renderer.render(scene, camera);
      } catch (error) {
        failed = true;
        console.error('Lab: the 3D view failed; the demo continues without it.', error);
        renderer.domElement.hidden = true;
      }
    },
    /** A world point in CSS pixels relative to the host, or null when behind the camera. */
    project(x: number, y: number, z: number): { x: number; y: number } | null {
      const v = projected.set(x, y, z).project(camera);
      if (v.z > 1) return null;
      return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
    },
    dispose() {
      sizer.disconnect();
      root.removeEventListener('world:theme', onTheme);
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
  return stage;
}
