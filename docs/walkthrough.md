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
A Playwright test steps the real GPU kernel once on WebGL2 and on WebGPU, reads
the buffers back, and checks they match the CPU version to within 0.2%. When I changed one
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
that, drops bloom first, then gives up the tier and steps down. A lost GPU
device (a driver reset, for example) is handled the same way. The result is
a slower world instead of a blank one. _Where:_ `frame()` in
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

## Phase 3: pages and content

**One content model, checked at build time.** A project is a markdown file
plus an `architecture.yaml`. The schema fixes the six section headings and
their order (context and constraints, architecture, evaluation, deployment
and operations, results, what I'd do next), caps the problem statement at
240 characters, and allows at most two code snippets of 25 lines, each with a
"why this matters" note. A project that drifts from the template fails the
build instead of looking different. _Where:_ `src/lib/schemas.ts`,
`src/content/projects/`.

**Markdown and components interleaved.** The architecture diagram, the
decision cards and the code snippets belong inside particular sections, but
markdown can't hold components. The page renders the markdown once, splits
the HTML at each `<h2 id>`, and slots the components into the right section.
_Where:_ `src/lib/sections.ts`, `src/components/ProjectBody.astro`.

**Architecture diagrams laid out by code.** Each node's layer is the longest
path to it from an entry point; nodes in a layer are ordered by where their
parents sit, which removes most crossings. It runs top to bottom because the
page is a narrow text column, and the SVG is never scaled below its natural
size (it scrolls instead), so labels stay readable. A test checks that no
boxes overlap in any real project. The same YAML will feed the 3D explorer
in Phase 4. _Where:_ `src/lib/diagram.ts`,
`src/components/ArchitectureDiagram.astro`.

**Skim or full, without breaking no-JS.** Skim keeps each section's first
paragraph and its key table. The toggle is hidden until JavaScript runs, so
without JavaScript you get the full page. The choice is remembered across
projects. The table of contents highlights the section you're in, and a
scroll-driven CSS animation draws the reading progress bar. _Where:_
`src/scripts/deep-dive.ts`, `src/pages/projects/[slug]/index.astro`.

**Filters are pages.** The area filter on the projects index is a set of
links to static pages (`/projects/area/llm/` and so on), so it works without
JavaScript and each filtered view has its own URL. _Where:_
`src/components/ProjectList.astro`, `src/pages/projects/area/[area].astro`.

**Role lenses share one canonical URL.** `/for/sde`, `/for/ml` and `/for/llm`
reorder Home for one audience and start the world in that formation. Their
canonical link points at `/`, so search engines see one page, not four
near-duplicates. _Where:_ `src/pages/for/[role].astro`,
`src/components/HomeContent.astro`.

**Presentation mode.** Each project has a `/present` page for screen sharing
in an interview: one section per slide, arrow keys, Space and Page keys to
move, the slide number in the URL, and Escape to leave. Without JavaScript
the slides simply stack. It sets the world to "off", and the boot script
then doesn't download the engine at all. _Where:_
`src/pages/projects/[slug]/present.astro`, `src/scripts/present.ts`.

**One résumé source, two outputs.** `/resume` is an HTML page with a print
stylesheet sized for A4. A script prints that page to `public/resume.pdf`
with headless Chromium and fails if it runs past one page. The same trick
makes the social cards: a dev-only page renders each card, and a script
screenshots it to `public/og/`. _Where:_ `src/styles/print.css`,
`scripts/resume-pdf.ts`, `scripts/og-images.ts`.

**The hero text stays the LCP element.** On phones the poster appears in the
gaps between blocks of text. In the hero's gap it became the largest paint,
so Lighthouse counted a decorative image as the page's main content. The
hero's gap now shows a glow in the three role colours, made with CSS
gradients, which don't count as LCP candidates. Home's LCP is the hero text
at 1.66 s. _Where:_ `src/components/WorldSlot.astro`.

**Numbers to quote.**

- Seven projects, 37 built pages, every one within budget: initial
  JavaScript 8.9 KB on most pages and 39.5 KB on Home; engine 297.6 KB of
  320 KB, loaded after first paint.
- Lighthouse mobile: 99–100 performance and 100 for accessibility, best
  practices and SEO on Home, the projects index, a deep dive, a presentation
  and the résumé. Home LCP is 1.66 s, and total blocking time is under 25 ms
  everywhere.
- 110 unit tests and 71 end-to-end tests. axe runs on 12 page types in both
  themes.

## Phase 4: the architecture explorer and the Lab

**The explorer borrows a formation instead of adding one.** "Explore in 3D"
lays the project's architecture out in 3D and writes it into the particles'
SDE slots, then morphs the world there. Nodes are boxes of particles, edges
are faint lines, and packets run along the request flows. The GPU kernel
needs no new code, because a graph is just another shape made of the same
kinds of particle. Focusing a node or a flow rewrites that slot again. The
same random seed gives every particle the same job each time, so only
brightness and packet routes change. When you close the explorer, the
original SDE slot is copied back. _Where:_ `src/graphics/graph.ts`,
`src/graphics/explorer.ts`.

**One data source, two renderings.** The explorer uses the same
`architecture.yaml` as the static SVG, and the same "longest path" layering,
so the 3D graph and the diagram always agree. _Where:_ `src/lib/diagram.ts`
(`columns`), `src/graphics/graph.ts` (`layoutGraph`).

**The dialog is the accessible explorer.** The explorer is a native
`<dialog>`. Its list of components and flows is rendered at build time, and
every node and flow is a button. So the keyboard and screen readers get the
same choices as the mouse, and a status line says what each component
connects to. The labels floating over the 3D view are hidden from assistive
technology, because they duplicate the list. On the poster tier the dialog is
that list alone, and it says why there is no 3D view. _Where:_
`src/components/ArchitectureExplorer.astro`.

**Train a network: the same maths on the CPU and the GPU.** The network is
2 → 8 → 8 → 1, trained with gradient descent and momentum. The CPU version
is the specification. The WebGPU version is two TSL compute kernels per
step:

1. One invocation per point runs the forward pass and backpropagation, and
   writes that point's gradient.
2. One invocation per weight averages its gradient over the points and
   applies the update.

The loops over layers are unrolled in JavaScript, so the shader is
straight-line code. A test runs both versions for 40 steps from the same
start: the weights move by 0.94, and the two agree to within 0.0000002. A
separate unit test checks the gradient against finite differences.
_Where:_ `src/lab/train-network/`.

**Watch attention: real data, when it can be fetched.** A Python script runs
distilgpt2 over five sentences and saves every layer's and head's attention
at one byte per weight, which is 8.8 KB gzipped. Hugging Face was blocked
from the build container, so the repo ships clearly labelled sample data
until the script is run. The page says it is a sample, and the file carries
an `[EDIT]` tag, so a production build fails until the real data replaces
it. _Where:_ `scripts/precompute-attention.py`,
`scripts/sample-attention.ts`.

**Scale a system: a real queueing model.** It is a discrete-event
simulation, with a priority queue of timed events and Poisson arrivals. It
models round-robin load balancing, worker pools with bounded queues, a
cache, an asynchronous write queue, database connections, timeouts and
health checks. The tests check behaviour you could reason out on paper:

- the number of requests in the system obeys Little's law;
- one replica collapses above about 200 requests per second, and more
  replicas recover it;
- a cache takes load off the database;
- a crashed replica causes errors only until the health check removes it;
- no request is ever lost.

_Where:_ `src/lab/scale-system/logic.ts`.

**Poster-tier visitors never download three.js for a demo.** Each demo has
a small entry module (controls, simulation, read-outs) and a separate scene
module that brings three.js. The scene loads only when the world's tier
allows a 3D view. Otherwise the demo runs without it: read-outs, lists and a
2D field. _Where:_ `src/lab/shared/loop.ts`, `src/lab/shared/stage.ts`.

**Every lazy feature has a measured budget.** The budget script follows each
feature's chunks from the page and counts only what opening it adds after
the engine has loaded. _Where:_ `LAZY` in `scripts/budgets.ts`.

**Numbers to quote.**

| Feature         | Measured                    | Budget                     |
| --------------- | --------------------------- | -------------------------- |
| Explorer        | 3.7 KB                      | 25 KB                      |
| Train a network | 7.6 KB                      | 35 KB                      |
| Watch attention | 5.4 KB, plus 8.8 KB of data | 25 KB, plus 120 KB of data |
| Scale a system  | 6.9 KB                      | 25 KB                      |

- The engine is 303.9 KB against its 320 KB budget. It grew by 6.3 KB,
  because three.js classes the Lab uses now sit in the shared three.js chunk.
- There are 139 unit tests and 93 end-to-end tests, including the GPU
  training parity check.

## Phase 5: QA and polish

**Screenshots are a script, not a chore.** `npm run screenshots` captures
Home, a project and the Lab at 390 px and 1440 px in both themes. It scrolls
through each page first, so the scroll choreography runs, and saves WebP
files to `docs/screenshots/`. Rerunning it after a change makes before/after
comparison cheap. _Where:_ `scripts/screenshots.ts`.

**What the review found and fixed.**

- **Clipped placeholder captions.** In the small cover frames, the frame
  cropped its own caption. Now only a real image is cropped; a caption can
  make the frame taller.
- **Toggles that looked the same pressed or not.** The theme and pause
  buttons had `aria-pressed` for screen readers but no visible pressed state.
  A pressed toggle now has a heavier border.
- **A stale "you are here".** The contents list kept its last highlight after
  you scrolled back above the first section.
- **Crowded spacing:** the "Open the Lab" link sat tight against the list
  above it.

_Where:_ `src/components/MediaFrame.astro`, `src/styles/base.css`,
`src/scripts/deep-dive.ts`.

**Measure what you can, and say what you can't.**

- **Frame times in the browser.** `npm run profile-frames` records frame
  times and long tasks per tier, and reports the tier that actually ran, since
  a tier the browser can't run steps down. On the build machine (no GPU) that
  is software rendering at 2 to 7 frames per second. The numbers are real but
  say nothing about a laptop or phone, so the README asks for the run on real
  hardware instead of quoting them as performance.
- **The CPU simulation, on its own.** A separate timing test measures the low
  tier's simulation: 4.0 ms a step for 4,096 particles. That leaves room
  inside a phone's 33 ms frame even on a CPU a few times slower.

_Where:_ `scripts/profile-frames.ts`, `src/graphics/sim.cpu.perf.test.ts`.

**Lighthouse's own variance.** Home's largest paint ranged from 1.66 to
1.96 s across runs with identical requests. First paint moved with it, so the
spread comes from Lighthouse's simulated CPU time, not the page. I tested one
theory, that the hero line waited for the serif font, and moving it to the
preloaded sans made no difference. So the change was reverted and the range
is reported as it is.

**A guide that can't go stale.** `CONTENT_GUIDE.md` is generated from the same
audit that blocks the production build. It lists every placeholder by file,
with what belongs there, an example of a strong answer, the ten items to fill
first and a confidential-work checklist. A unit test fails when the guide no
longer matches the content, so it is always current. _Where:_
`scripts/content-guide.ts`.

**Numbers to quote.**

- Lighthouse mobile across six page types: performance 99–100, and
  accessibility, best practices and SEO 100 everywhere.
- CLS is at most 0.001, and blocking time at most 14 ms.
- 142 unit tests and 93 end-to-end tests pass.
- Every page and every lazy feature is within budget.

## Launch readiness: demo mode, real data, a flaky test, and LCP

**Demo mode, and a one-line launch.** Until the real details are in, Netlify
publishes a demo build (`npm run build:demo`). It keeps the `[EDIT]` badges,
so anyone can see what is example content. It also keeps the example persona
out of search engines in three ways:

- a `noindex` meta tag on every page;
- an `X-Robots-Tag: noindex` header, which also covers the résumé PDF and
  images, since a meta tag can't;
- no sitemap.

The build also leaves out the `/dev` test pages. CI checks each demo build
with `npm run check-demo`. Launching is one change: in `netlify.toml`, set
`command = "npm run build"`, the strict build that fails on any placeholder.
_Where:_ `astro.config.ts` (`DEMO`), `src/layouts/Base.astro`,
`scripts/check-demo.ts`, `netlify.toml`.

**Real attention data without a GPU or a fast connection.** A manually
started GitHub Actions workflow does the work:

1. It runs the Python precompute script on GitHub's runners, which can reach
   Hugging Face.
2. It checks the new file against the same tests and budget as the site.
3. It opens a pull request with the file.

The Lab's "sample data" notice is driven by the file itself (`"source":
"sample"`), so it disappears as soon as the real data is merged. Nothing else
needs to change. _Where:_ `.github/workflows/attention.yml`.

**A flaky test that was a real bug.** CI run #8 failed on "any input skips
the intro". The trace showed a race: the key was pressed after the page
loaded but before the intro's script had loaded, so nothing was listening and
the intro played in full. A real visitor who pressed a key or scrolled early
got the same result. The fix is in the product, not only the test: a tiny
inline script in the page head records any early input, and the intro skips
itself if it finds that record. A new test forces the race by holding back
the intro's script. Without the fix it fails exactly as run #8 did. _Where:_
`src/layouts/Base.astro`, `src/graphics/intro.ts`, `tests/e2e/world.spec.ts`.

**Finding what "added" LCP time.** I built the Phase 3 and Phase 4 commits
side by side and ran Lighthouse on both, interleaved so they saw the same
machine load. They measured the same, so Phase 4's code added nothing. The
steady 1.66 s after Phase 3 had come from a quiet machine.

The spread comes in steps of one simulated round trip (150 ms). That fits how
Lighthouse estimates a slow phone: it replays the page's requests on a
simulated network, and its worst-case estimate counts every request that
started before the largest paint. The intro's GSAP chunk (about 30 KB) was
requested just before that paint, so in some runs it competed with the fonts
and CSS.

The intro now starts once the browser reports its first contentful paint.
`requestAnimationFrame` wasn't enough: it runs before the frame is painted,
and a new test caught that. Over 12 interleaved runs each:

| Build    | Median | Worst  |
| -------- | ------ | ------ |
| `main`   | 1.67 s | 1.96 s |
| This fix | 1.67 s | 1.81 s |

I checked two other ideas and rejected them:

- **Not preloading the headline font** swung LCP between 0.9 and 1.8 s and
  pushed layout shift to 0.044.
- **Setting the hero line in the preloaded sans** made no difference.

Lighthouse CI now judges Home's LCP on the median of its runs (it used the
best run before), and warns above 1.85 s, before the 2.0 s budget fails.
_Where:_ `src/scripts/boot.ts` (`afterFirstPaint`), `lighthouserc.json`.

**A generated file has to follow its source.** The first run of the
attention workflow opened a pull request that failed CI. The real data
removed the sample's placeholder, but the content guide, which is generated
from the placeholders, still listed it, and its freshness test caught the
mismatch.

The workflow now regenerates the guide and commits it with the data. It runs
the unit tests and lint before opening the pull request. It also starts CI on
the new branch itself: GitHub doesn't start workflows for pushes made with a
workflow's own token, except for an explicit `workflow_dispatch`, which CI now
accepts. _Where:_ `.github/workflows/attention.yml`, `.github/workflows/ci.yml`.

## The invisible world in the light theme (high tier)

**The bug.** On a Mac in Chrome, the high tier (WebGPU) showed nothing in the
light theme, while Stats for nerds reported 61 fps and "Bloom: on". The
particles' material had a second output, "glow", which feeds the bloom pass.
In three.js's WebGPU renderer, when the scene is drawn without that pass
(through its own intermediate framebuffer), a material's extra outputs
replace its normal colour output. Only signal particles wrote anything to
"glow", so almost nothing reached the screen.

The dark theme hid the bug, because it always drew through the bloom pass.
But three other cases draw without the pass, and all three were broken:

- the light theme;
- the project-page header band;
- the fallback after bloom fails.

**The fix.** The glow output is attached only on frames the bloom pass
actually draws, and removed otherwise. The Stats line now says what the frame
does ("off in the light theme", "off in the header band"), not a fixed label.
Bloom stays dark-only on purpose: it adds light, which on a light background
only washes signals toward white. _Where:_ `setGlow` in
`src/graphics/render.ts`, `bloomActive` in `src/graphics/world.ts`.

**Light-theme visibility.** A script counted the pixels that clearly differ
from the background, for every formation, tier and theme. The light theme
reached only 70–85% of the dark theme's area, and the Data strands read as
grey dust. The light settings now have more opacity (×4, was ×2.4) and
full-size, softer sprites. Every formation now covers at least as much of the
frame in light as in dark, on both the medium and low tiers. The colours are
unchanged, so the contrast checks still pass. _Where:_ `SETTINGS.light` in
`src/graphics/theme.ts`.

**A test that looks at pixels.** `tests/e2e/visibility.spec.ts` renders each
tier in the light theme. It counts visible particle pixels in the world's
area at load, after switching to dark, and after switching back to light, and
checks that light reads at least as well as dark. It uses the Data formation,
which has no signals, so the glow bug would leave it blank. A tier the
browser can't run is skipped, and the tier that actually ran is recorded.
When a check fails, its message includes all three measurements, the Stats
for nerds readout in both themes, and the page's console errors.

**What CI covers, and what it can't.** CI checks the medium and low tiers.
It can't check the high tier: CI's Chromium starts WebGPU and runs its
compute (the kernel test passes), but it loses the GPU device when it
presents frames. So the high tier draws nothing in either theme there, fixed
or not. The test skips the high tier with that reason, but only when both
are true: the device was lost, and nothing was drawn in any of the three
measurements. Any other blank frame still fails. To check the high tier, run
the test on a machine with a GPU, such as the Mac where the bug was found:

```sh
npm run build:preview
npx playwright test tests/e2e/visibility.spec.ts --project=desktop --headed
```

**Proof run.** To see whether the test catches the bug, it ran in CI once
without the fix, on a throwaway branch (`claude/visibility-test-proof`, now
deleted). Results:

- Before the fix, medium and low failed: light read worse than dark (of the
  world's area, medium showed 0.85% in light against 1.08% in dark, and low
  2.46% against 2.99%).
- With the fix, both pass.
- High failed at 0.00% in the light theme both before and after the fix.
  The diagnostics then showed 0.00% in the dark theme too, with the GPU
  device lost, so that failure was CI's WebGPU and not this bug. The high
  tier's fix is checked by the code path (the glow output is only attached
  while the bloom pass draws) and on real hardware, not in CI.

**CI runs on main.** Every commit on main now gets its own CI result. Before,
a quick second merge cancelled the first merge's run.

## Theme from the device, a deliberate intro, the pause icon, GPU time, and the grey box

**Theme follows the device.** The site used to open dark and offer a "Light
theme" button. Now it follows the device's light or dark setting
(`prefers-color-scheme`). The inline script in `Base.astro` sets it before the
first paint, so there is no flash. `boot.ts` listens for the setting to change
and switches the page and the 3D world live. With the toggle gone there is
nothing to remember, so any old stored choice is ignored. A device with no
preference gets dark. _Where:_ `src/layouts/Base.astro`, `src/scripts/boot.ts`,
`themeFor` in `src/lib/preferences.ts`.

**The header.** The theme button is gone. "Pause motion" is now a small
pause/play icon button:

- Its accessible name stays "Pause motion", and `aria-pressed` says whether
  motion is paused.
- The icon and tooltip switch to "play" while paused.
- The tooltip shows on hover and keyboard focus. It stays open while the
  pointer is over it, and Escape closes it (WCAG 1.4.13).
- Pause works exactly as before (WCAG 2.2.2).

_Where:_ `src/components/SiteHeader.astro`.

**The intro.** It used to start every particle on a big random sphere, and
the spring pulled them into the Data formation in well under a second. For
that moment the screen was covered in single dots, through the hero text,
which read as dust or static in the light theme. Now:

- Particles start as a small seed: the Data formation shrunk to 8% of its size
  around its own centre (`seed` in `src/graphics/formations.ts`).
- Each particle's target grows from the seed to its place, following the
  intro's 2.2 s timeline, so the formation visibly unfolds rather than
  snapping (`grow` in `src/graphics/sim.shared.ts`, used by both simulations).
- The particles fade in as they gather. Their opacity also follows the
  formation's area, so the dense seed is as light as the full formation, not
  a dark blot (`reveal` in `src/graphics/render.ts`).
- Skipping and reduced motion work as before.

**Never over the text.** The world's mask on wide screens used to start at a
fixed 46% of the width. At 1280 px the hero text reaches 49%, so particles
could sit over the words. The mask now starts where the hero text actually
ends (`textEdge` in `src/graphics/world.ts`, measured again when the fonts
load).

**A test for the intro.** `tests/e2e/intro.spec.ts` holds the intro at six
points of its timeline, lets the particles settle, and counts particle pixels.
It checks two viewports: a 13-inch MacBook Air in light, and 1280 px in dark.
Nothing may be drawn left of where the hero text ends, the start must be faint
(under 0.1% of the screen), and the formation must grow to full size. Holding
the intro makes the test independent of frame rate, which matters because CI
renders in software, where one frame can outlast the whole intro. Run against
the old intro code it fails: 3,206 particle pixels over the text at 1280 px,
and 1.75% of the screen covered at the first moment.

**GPU time.** On the Mac, the dark theme showed 40.83 ms of GPU time at a
steady 60 fps, which can't be right. Stats for nerds used three.js's
per-pass timers and added them up. With bloom a frame is about 14 passes, and
on Apple's tile-based GPUs a pass's timer starts before the passes it depends
on have finished. So the windows overlap and the sum counts the same time many
times over. The light theme has one pass, so its 1.44 ms was right. Now
`src/graphics/gpu-timer.ts` marks the start of every 30th frame's GPU work and
the end of its last pass, and reports the span between them. The units
(nanoseconds to milliseconds) and the age of the readings were already
correct. This couldn't be checked here or in CI, because neither can present
WebGPU frames; the dark-theme figure needs a fresh look on the Mac.

**The grey box.** On the deploy preview, a grey box with Chrome's "sad
document" icon sat at the bottom centre. That is where Netlify puts its
preview toolbar, the Netlify Drawer, which it loads as a frame from
`app.netlify.com`. Our Content Security Policy allows frames only from the
site itself, so Chrome refuses it and shows the placeholder. The
recommendation is to turn the Drawer off in Netlify's Deploy Previews
settings, rather than loosen the CSP for previews, so previews keep testing
the same headers production sends. Production never gets the Drawer: Netlify
injects it only into previews. A new test also checks that our own pages load
nothing from other origins and contain no frames. This environment can't
reach the preview, so the diagnosis rests on where the box appears, what it
looks like, and the CSP. To confirm it, right-click the box → Inspect: it
should be an iframe from `app.netlify.com`, with a CSP error in the console.

**The engine waits for the first paint.** CI failed "the intro chunk is
requested only after the first paint" on this PR, and the same test failed 5
runs in 12 on main's code in this environment. The intro itself was fine: it
waits for the first contentful paint. But the engine also imports the GSAP
chunk (for the scroll choreography), and it started at page load plus an idle
moment. Load can come before the first paint, because the hero text waits on
its fonts, so GSAP was sometimes fetched while the hero was still painting,
despite the comment saying the engine loads after first paint. Now the engine
waits for the first paint too, then load and an idle moment. The test passed
16 runs in 16. _Where:_ the end of `src/scripts/boot.ts`.
