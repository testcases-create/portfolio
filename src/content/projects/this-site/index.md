---
title: Fit a WebGPU particle world into 304 KB, loaded after first paint
slug: this-site
name: This site
outcomeHeadline: This portfolio, built as a production project with budgets, tests and CI
summary: One particle world runs through the site on WebGPU or WebGL2, from one compute kernel checked against a CPU specification. Text never waits for it, visitors with no usable GPU never download it, the Lab and the 3D explorer load only when opened, and CI enforces every budget.
problem: A portfolio that shows graphics skill usually costs load time and accessibility. This one had to be striking and still pass a strict engineering review.
areas: [sde, ml, llm]
role: Sole engineer and designer
team: Just me
timeline: September 2026
myScope: Design, the graphics engine, the content system, tests and CI
stack: [Astro, TypeScript, three.js (WebGPU and TSL), GSAP, Playwright, Vitest, Lighthouse CI]
metrics:
  - label: Graphics engine
    value: 303.9 KB
    baseline: 320 KB budget
    measuredBy: Gzipped JavaScript the engine adds after first paint, measured on the built site by scripts/budgets.ts in CI
  - label: JavaScript before idle
    value: 10.8 KB
    baseline: 50 KB budget
    measuredBy: Gzipped initial JavaScript on project pages (40.2 KB on Home, which adds the one-time intro), same script
  - label: GPU kernel against CPU spec
    value: < 0.2% error
    measuredBy: Playwright steps the WebGPU and WebGL2 kernels once and compares the buffers with the CPU simulation, in CI on Chrome 153
  - label: Lighthouse performance (mobile)
    value: 99–100
    measuredBy: Three Lighthouse CI runs per page (Home, projects, a deep dive, a presentation, the Lab and the résumé) on the built site. CI has no GPU, so this measures the poster path; frame rates on real devices are still to be measured
links:
  repo: https://github.com/example/portfolio [EDIT]
confidential: false
featured: true
order: 7
cover:
  alt: The particle world in its AI/ML formation
  ratio: 16/9
  placeholder: A still of the world in its AI/ML formation, captured from the high tier on a machine with a GPU (POSTER_TIER=high npm run capture-poster) [EDIT]
architecture: this-site
decisions:
  - question: How do GPU and CPU simulations stay in step?
    options:
      [
        Write them separately and eyeball it,
        Generate both from one source,
        Treat the CPU version as the specification and test the GPU against it,
      ]
    chose: The CPU version is the specification, and a test compares GPU read-back with it
    tradeoff: The same logic exists twice, so every change touches both files.
    evidence: Changing one constant in the GPU kernel only makes the test fail with a 7.7% error against a 0.2% tolerance.
  - question: What happens on a browser without a usable GPU?
    options: [Run the low tier anyway, Show nothing, Show a poster chosen before downloading the engine]
    chose: A poster, chosen by about 1 KB of boot code
    tradeoff: Visitors with a software renderer never see the moving world.
    evidence: Headless Chrome with software rendering blocked the main thread for 2.4 s per frame; with the check, blocking time is 0 ms.
  - question: How does a Three.js bug stay out of the kernel?
    options:
      [
        Pin an older version,
        Work around it per call site,
        Write the kernel with no branches around buffer reads,
      ]
    chose: No branches around buffer reads
    tradeoff: The kernel evaluates all five formations for every particle.
    evidence: A 40-line reproduction shows WebGL2 reading wrong elements inside a second sibling If() block; the branch-free kernel matches the CPU specification on both backends. Upstream issue link to follow. [EDIT]
code:
  - title: Blending formations without branching
    lang: ts
    code: |
      const base = i.mul(STRIDE);
      for (let k = 0; k < K; k++) {
        const w = U.weights[k];
        const A = formBuf.element(base.add(k * 2)).toVar();
        const B = formBuf.element(base.add(k * 2 + 1)).toVar();
        const f = formationTarget(k, A, B, h, U);
        tgt.addAssign(f.pos.mul(w));
        sig.addAssign(f.sig.mul(w));
        vis.addAssign(f.vis.mul(w));
        hue.addAssign(f.hue.mul(w));
        rigid.addAssign(f.rigid.mul(w));
      }
    why: Every formation is evaluated and weighted, so moving between shapes is one continuous blend, GPU threads never diverge, and the WebGL2 bug has nothing to trigger on.
---

## Context and constraints

The brief set hard limits: 50 KB of JavaScript before idle, strict Lighthouse scores, WCAG 2.2 AA, and graphics that are extraordinary yet always mean something. Every number on this site had to come from a script, not an estimate.

## Architecture

Pages are static Astro. One `#world` element persists across navigation, and pages describe the formation they want with data attributes. After first paint, boot code decides between the poster and the engine. The engine builds all five formations once, simulates them in one compute kernel, and renders them as one instanced sprite draw. A camera rig and GSAP scroll progress blend between them. The architecture explorer and the three Lab demos load only when opened; the explorer rewrites one formation's data so the same particles become the project's architecture.

## Evaluation

CI runs lint, type checking, 142 unit tests, 95 end-to-end tests with axe accessibility checks in both themes, the size budgets and Lighthouse CI on every push.

| Check                                                    | Result                                |
| -------------------------------------------------------- | ------------------------------------- |
| Graphics engine after first paint                        | 303.9 KB of 320 KB                    |
| JavaScript before idle                                   | 9.6–10.8 KB (Home 40.2 KB) of 50 KB   |
| Architecture explorer, loaded on demand                  | 3.7 KB of 25 KB                       |
| Lab demos, loaded on demand                              | 5.4–7.6 KB each, of 25–35 KB          |
| GPU particle kernel against CPU spec (WebGL2 and WebGPU) | under 0.2% error                      |
| GPU training kernels against CPU spec (40 steps)         | largest difference 0.00000012         |
| Low tier CPU simulation, 4,096 particles                 | 4.0 ms a step on the build machine    |
| Lighthouse mobile, six page types                        | performance 99–100, 0–23 ms blocking  |
| Home largest paint (hero text), 12 runs                  | median 1.66 s, worst 1.81 s, of 2.0 s |

## Deployment and operations

Netlify builds production strictly: the build fails while any placeholder remains. Preview deploys show placeholders as badges. The world picks a quality tier on each device, steps down when frames are slow or the GPU fails, and mirrors its state onto the page for tests.

## Results

The site meets every budget in CI, and the hero text is always the largest paint. The build machine has no GPU, so it renders in software at 2 to 7 frames per second; those numbers say nothing about a real laptop or phone, and `npm run profile-frames` on real hardware is the next measurement to take. On that machine's CPU, the low tier's simulation step takes 4.0 ms for 4,096 particles, which leaves room inside a 33 ms frame on a phone a few times slower.

## What I'd do next

Move rendering into a worker with OffscreenCanvas, so even a slow GPU never touches the main thread.
