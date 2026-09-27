# Walkthrough

A plain-language tour of the key code and design decisions, phase by phase,
written so you can explain each one in an interview. Each entry says what the
thing is, why it is built that way, and where to find it.

## Phase 1: foundation

**One persistent canvas.** The layout has a single `<div id="world">` marked
`transition:persist`. Astro's client router swaps the page content on
navigation but keeps this element, so the 3D world never restarts between
pages. _Where:_ `src/components/WorldSlot.astro`, `src/layouts/Base.astro`.

**Pages talk to the world through data attributes.** A page says what it
wants on `<body data-world-formation="ml" data-world-mode="band">`. The world
reports what it is doing on `<html data-world-tier data-world-running …>`.
CSS, the engine and the Playwright tests all read the same attributes, so
there is one contract instead of three. _Where:_ `src/lib/world-config.ts`.

**Placeholders that can't ship.** Every invented fact carries an `[EDIT]`
tag. It renders as a visible badge in development and on preview deploys,
and a build hook fails any production build while a tag remains. That hook
runs inside `astro build` itself, so it can't be skipped by calling the
build a different way. _Where:_ `scripts/content-audit.ts`,
`astro.config.ts` (`contentGate`).

**Schemas catch bad content at build time.** Projects, roles and site data
are validated with zod. The architecture schema checks the graph itself:
every edge points at a real node, and every request flow only steps along
existing edges. _Where:_ `src/lib/schemas.ts`.

**Budgets are measured, not hoped for.** `scripts/budgets.ts` walks each
built page's JavaScript graph and gzips it, and CI fails if a page goes
over. _Where:_ `scripts/budgets.ts`.

## Phase 2: the graphics engine

**One particle system, five shapes.** Every particle has a slot in every
formation: data flow, neural network, token stream, service graph, and a
knot. A formation is only a different target for the same particles, so
moving between shapes is one continuous transformation, not a crossfade.
Each frame blends the targets by weights that sum to 1, then springs each
particle toward the blend. _Where:_ `src/graphics/formations.ts`,
`src/graphics/sim.shared.ts`.

**The CPU version is the specification.** The simulation exists twice: a
GPU compute kernel (TSL, which compiles to WebGPU and to WebGL2) and a plain
TypeScript version. The TypeScript one runs the low tier and is unit-tested.
A Playwright test steps the real GPU kernel once, reads the buffers back, and
checks they match the CPU version to within 0.2%. When I changed one
constant in the GPU code only, that test failed. _Where:_
`src/graphics/sim.gpu.ts`, `src/graphics/sim.cpu.ts`,
`tests/e2e/world.spec.ts`.

**A branch-free kernel, because of a Three.js bug.** On the WebGL2 backend,
reading a buffer inside one of two sibling `If()` blocks uses a size
variable that only the first block assigns, so the second block reads
garbage. I reduced it to a 40-line reproduction and wrote up the issue
(`docs/upstream/`). The kernel evaluates every formation and blends them
arithmetically instead of branching, which avoids the bug and keeps GPU
threads in lockstep.

**Quality tiers, chosen by measurement.** High uses WebGPU with 65,536
particles and bloom. Medium uses WebGL2 with 16,384. Low simulates 4,096 on
the CPU. The poster is a still image. The tier is picked from capabilities,
then a frame-time probe watches the first seconds: a slow median steps down
one tier, and three frames over 100 ms step down at once. Dynamic resolution
sheds pixels under sustained load and wins them back slowly. _Where:_
`src/graphics/tiers.ts`, with tests beside it.

**The poster decision costs nothing.** Reduced motion, Save-Data, no WebGL2,
or a software rasteriser (no usable GPU) all lead to the poster. Boot code
decides this in about 1 KB of JavaScript, before the 300 KB engine is ever
requested. This matters: without it, headless Chrome with no GPU blocked the
main thread for 2.4 seconds per frame. _Where:_ `src/lib/gpu-check.ts`,
`src/scripts/boot.ts`.

**Failing safely.** Some browsers grant WebGPU but reject a descriptor Three
passes, and the render then throws on every frame. The frame loop catches
that, drops bloom first, then gives up the tier and steps down. The result
is a slower world instead of a blank one. _Where:_ `frame()` in
`src/graphics/world.ts`.

**A camera that makes it read as 3D.** Each formation has a camera pose. The
rig blends poses with the same weights as the particles, so the camera
dollies and orbits as the shapes change. A slow drift and pointer parallax
keep the depth visible, and particles fade with distance. The network's
layers are discs of nodes in depth, and the service graph sits in tiers.
_Where:_ `src/graphics/camera.ts`.

**Colour with meaning, and two themes done separately.** Blue, gold and rose
mean SDE, LLM and AI/ML. There are two versions of each: a vivid graphic
colour (3:1 contrast, the WCAG rule for graphics) and a darker ink colour
for text (4.5:1). A script checks both, including under three kinds of
colour blindness. The light theme has its own render settings (normal
blending, stronger alpha, harder sprites), because dark-theme settings turn
particles into grey dust on a light ground. _Where:_ `scripts/palette.mjs`,
`src/graphics/theme.ts`.

**Text never sits behind the world.** On wide screens a screen-space mask
keeps particles out of the text column. On narrow screens pages mark
"windows" between blocks of text, and the engine composes the formation into
the nearest window and masks it there. On project pages the world is a band
at the top, placed by CSS alone so it never shifts the layout. _Where:_
`compose()` in `src/graphics/world.ts`.

**Readable tokens.** In the LLM formation, DOM labels are positioned over
the projected token blocks, so the generated sentence can be read. The
labels are real text, not pixels. _Where:_ `src/graphics/labels.ts`.

**Choreography without scroll-jacking.** GSAP ScrollTrigger only reads how
far each section has scrolled. That progress becomes target weights, and the
frame loop eases toward them. Scrolling stays native and nothing is pinned.
_Where:_ `src/graphics/choreography.ts`, `src/graphics/weights.ts`.

**Numbers to quote.**

- Initial JavaScript: 8.8 KB on most pages, 39.4 KB on Home (GSAP and the
  one-time intro).
- Graphics engine: 297 KB gzipped against a 300 KB budget, loaded after
  first paint. three.js is 243 KB of that and GSAP 44 KB.
- Lighthouse mobile: 99–100 performance, 0 ms blocking time.
- 82 unit tests and 20 end-to-end tests, including the GPU-against-CPU check.
