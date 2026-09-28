// The particle material and the optional bloom pipeline (PLAN.md 7.4).
import {
  AdditiveBlending,
  NormalBlending,
  RenderPipeline,
  Sprite,
  SpriteNodeMaterial,
  type StorageBufferNode,
  type WebGPURenderer,
  type Scene,
  type PerspectiveCamera,
} from 'three/webgpu';
import {
  cameraPosition,
  dot,
  exp,
  float,
  length,
  mix,
  mrt,
  output,
  pass,
  screenUV,
  smoothstep,
  uniform,
  uv,
  vec4,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { RenderSettings } from './theme';

/** Uniforms the frame loop writes; shared by every material the world creates. */
export function createRenderUniforms() {
  return {
    size: uniform(0.05),
    falloff: uniform(22),
    /** Screen-space left edge of the world's band on wide screens; 0 disables the mask. */
    maskFrom: uniform(0),
    /** Narrow screens: the window's top and bottom, as fractions of the viewport height. */
    maskTop: uniform(-1),
    maskBottom: uniform(2),
    depthNear: uniform(10),
    depthFar: uniform(20),
    depthFloor: uniform(0.3),
    /** Intro fade-in: 0 at the seed, 1 once gathered. */
    reveal: uniform(1),
  };
}
export type RenderUniforms = ReturnType<typeof createRenderUniforms>;

export function createParticles(
  n: number,
  buffers: { pos: StorageBufferNode<'vec4'>; vel: StorageBufferNode<'vec4'>; col: StorageBufferNode<'vec4'> },
  R: RenderUniforms,
  withGlow: boolean,
) {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const P = buffers.pos.toAttribute();
  const V = buffers.vel.toAttribute();
  const C = buffers.col.toAttribute();

  const d = uv().sub(0.5);
  const falloff = exp(dot(d, d).mul(R.falloff.negate()));
  // Farther particles are fainter; the rig sets near and far around the formation.
  const depth = mix(
    R.depthFloor,
    float(1),
    smoothstep(R.depthFar, R.depthNear, length(P.xyz.sub(cameraPosition))),
  );
  // Wide screens: fade anything that drifts over the text column.
  const mask = smoothstep(R.maskFrom.sub(0.06), R.maskFrom, screenUV.x)
    // Narrow screens: only inside the current window, so the world never sits behind text.
    .mul(smoothstep(R.maskTop, R.maskTop.add(0.03), screenUV.y))
    .mul(float(1).sub(smoothstep(R.maskBottom.sub(0.03), R.maskBottom, screenUV.y)));

  material.positionNode = P.xyz;
  // Signals (P.w) are drawn slightly larger than the rest.
  material.scaleNode = R.size.mul(V.w).mul(P.w.mul(0.45).add(1));
  material.colorNode = C.rgb;
  material.opacityNode = C.a.mul(falloff).mul(mask).mul(depth).mul(R.reveal);
  // Only signals write to the glow target, so bloom never washes the whole frame.
  // The engine attaches this only on frames the bloom pass draws (setGlow):
  // rendered on its own, three.js would take a material's MRT as its only
  // output, and every non-signal particle would draw nothing.
  const glow = withGlow
    ? mrt({ glow: vec4(C.rgb.mul(P.w), C.a.mul(falloff).mul(mask).mul(depth).mul(R.reveal)) })
    : null;

  const sprite = new Sprite(material);
  sprite.count = n;
  sprite.frustumCulled = false;
  return {
    sprite,
    material,
    /** Attaches or detaches the glow output; true only while the bloom pass renders. */
    setGlow(on: boolean) {
      const next = on ? glow : null;
      if (material.mrtNode === next) return;
      material.mrtNode = next;
      material.needsUpdate = true;
    },
  };
}

export function applySettings(material: SpriteNodeMaterial, R: RenderUniforms, s: RenderSettings): void {
  material.blending = s.blending === 'additive' ? AdditiveBlending : NormalBlending;
  material.needsUpdate = true;
  R.falloff.value = s.falloff;
  R.depthFloor.value = s.depthFloor;
}

/**
 * Selective bloom: strength 0.55, radius 0.05, fed only by the glow target.
 * Dark theme only: bloom adds light, which on a light background only washes
 * signals toward white, so the engine skips the pipeline in the light theme.
 */
export function createBloomPipeline(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera) {
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, glow: vec4(0) }));
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = scenePass
    .getTextureNode('output')
    .add(bloom(scenePass.getTextureNode('glow'), 0.55, 0.05, 0))
    .renderOutput();
  return pipeline;
}
