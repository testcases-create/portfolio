# Issue draft for mrdoob/three.js

File at https://github.com/mrdoob/three.js/issues/new (bug report template).
Paste everything below the line. Attach or link `tsl-pbo-if-repro.html`; it runs
as-is from any static server or a jsfiddle.

---

**Title:** WebGLBackend: PBO element reads in sibling `If()` blocks use a size variable assigned only in the first block

### Description

A storage buffer with `setPBO(true)` is read at an arbitrary index inside two
sibling `If()` blocks of a compute kernel. On the WebGL2 backend the second
block's reads are wrong for every index past the first texture row.

The generated GLSL shows why. `generatePBO()` caches the texture-width variable
per buffer (`bufferNodeData.propertySizeName`) and emits its assignment with
`addLineFlowCode()` at the current flow position, which is inside the first
`If()`. The second block reuses the cached name, but when the first block is
skipped the variable was never assigned, so `index % size` and `index / size`
divide by an unassigned (zero) value.

```glsl
if ( ( nodeUniform1 == 0.0 ) ) {
    nodeVar0Size = uint( textureSize( nodeUniform0, 0 ).x );
    nodeVar0 = vec4( texelFetch( nodeUniform0, ivec2( ( uint( gl_InstanceID ) * 2u ) % nodeVar0Size, ( uint( gl_InstanceID ) * 2u ) / nodeVar0Size ), int( 0 ) ) ).xyzw;
    ...
}
if ( ( nodeUniform1 == 1.0 ) ) {
    // nodeVar0Size is read here but only assigned in the block above
    nodeVar1 = vec4( texelFetch( nodeUniform0, ivec2( ( ( uint( gl_InstanceID ) * 2u ) + 1u ) % nodeVar0Size, ( ( uint( gl_InstanceID ) * 2u ) + 1u ) / nodeVar0Size ), int( 0 ) ) ).xyzw;
    ...
}
```

### Reproduction steps

1. Open the attached `tsl-pbo-if-repro.html` (three r186.1 from jsDelivr).
2. It runs two kernels on `WebGPURenderer({ forceWebGL: true })` and reads the output back.

### Code

```js
const data = instancedArray(8, 'vec4').setPBO(true); // element 2i + 1 holds i * 10 + 5
const out = instancedArray(4, 'float');
const branch = uniform(1);

const kernel = Fn(() => {
  const base = instanceIndex.mul(2);
  If(branch.equal(0), () => {
    out.element(instanceIndex).assign(data.element(base).x);
  });
  If(branch.equal(1), () => {
    out.element(instanceIndex).assign(data.element(base.add(1)).x);
  });
})().compute(4);
```

### Expected

`[5, 15, 25, 35]`

### Actual

`[5, 15, 0, 0]` on the WebGL2 backend. The same read with no `If()` returns
`[5, 15, 25, 35]`. With a single `If()` it is also correct.

### Suggested fix

Emit the size assignment where it is always executed (function scope, before
the flow code), or inline `uint( textureSize( tex, 0 ).x )` at each use instead
of caching it in a variable assigned from inside the current block.

### Version

r186.1 (latest on npm, September 2026)

### Device / browser / OS

Reproduced in headless Chromium 141 on Linux with SwiftShader (WebGL2). The
generated GLSL above does not depend on the device; on hardware drivers the
unassigned variable may read as garbage rather than 0.

### Workaround

Build the kernel without branches around PBO reads (read every element
before any `If()`, or blend branches arithmetically). That is what this
portfolio's particle kernel does.

### Note on an earlier report

In Phase 0 of this project I believed an index node built inside an `If()`
was also affected on the WebGPU backend. I could not reproduce that on
r186.1 with minimal kernels, so this report covers only the WebGL2 PBO case.
