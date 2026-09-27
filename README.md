# Portfolio

The portfolio of an SDE, LLM and AI/ML engineer. A static Astro site with one
persistent three.js particle world behind it, three interactive Lab demos, and
a 3D explorer for each project's architecture, all inside measured budgets that
CI enforces on every push.

![Home in the dark theme: the hero text on the left and the particle world's Data formation on the right](docs/screenshots/readme-home.webp)

More screenshots, at 390 px and 1440 px in both themes: [`docs/screenshots/`](docs/screenshots/).
A plain-language tour of the code, phase by phase: [`docs/walkthrough.md`](docs/walkthrough.md).
The full design and graphics specification, with each phase's results: [`PLAN.md`](PLAN.md).

## What it does

- **One world, many meanings.** A single particle system runs through the whole
  site and reshapes into five formations, each standing for something real:
  - a data flow field;
  - a neural network with a forward pass;
  - a sentence being generated, with attention arcs;
  - a service graph with request packets;
  - a knot that joins all three roles.

  Scrolling blends between them. Project pages show the world as a quiet band
  above the text.

- **Architecture explorer.** "Explore in 3D" on a project page morphs the same
  particles into that project's architecture, built from the data that also
  draws the page's SVG diagram. Nodes and request flows can be chosen from a
  text list, by pointer or by keyboard.
- **The Lab.** Three demos, each loaded only when opened:
  - **Train a network in your browser**: WebGPU compute training, with a CPU
    fallback.
  - **Watch attention**: tokens and attention, layer by layer and head by head.
  - **Scale a system**: a discrete-event simulation of a load balancer,
    replicas, a cache, a queue and a database.
- **Built for a 30-second reader.** Every project page opens with a TL;DR that
  stands alone. It has a Skim/Full toggle, a presentation mode for interviews,
  and a printable one-page résumé.

## Architecture

```
src/
  pages/            Astro pages: Home, role lenses, projects, the Lab, Experience, About, Résumé, Contact, 404
  content/          projects (markdown + architecture.yaml) and roles, validated by zod schemas
  data/site.json    name, links, impact lines, skills with evidence
  graphics/         the world engine: formations, GPU and CPU simulation, tiers, camera, explorer
  lab/<demo>/       logic.ts (plain TypeScript, unit-tested), an entry module, a three.js scene module
  scripts/          boot code (device theme, pause, poster decision), deep-dive and Lab controls
scripts/            budgets, content audit and guide, screenshots, profiling, poster, OG images, résumé PDF
tests/e2e/          Playwright + axe, run against the built site
```

- **Static first.** Every page is static HTML with its essential content in
  the DOM, so the site reads fully without JavaScript. Enhancements load
  afterwards: the Skim toggle, the explorer and the demos.
- **One persistent canvas.** `<div id="world" transition:persist>` survives
  client-side navigation, so the world never restarts between pages. Pages
  declare what they want on `<body data-world-formation data-world-mode>`, and
  the world mirrors its own state onto `<html data-world-*>` for CSS and tests.
- **Content as data.** Projects, roles and site facts are validated at build
  time: section order, metric shape, the graph in each architecture, and
  evidence for every skill.
- **Placeholders that can't ship.** Every invented fact carries `[EDIT]`. It
  shows as a badge on previews and fails the production build.

## The graphics engine

| Tier   | Particles | Simulation                                    | Rendering                             | Chosen when                                     |
| ------ | --------- | --------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| High   | 65,536    | WebGPU compute (TSL)                          | WebGPU, bloom on signals (dark theme) | a real WebGPU adapter exists                    |
| Medium | 16,384    | the same kernel via WebGL2 transform feedback | WebGL2                                | WebGL2 but no WebGPU, or High is too slow       |
| Low    | 4,096     | CPU (the specification the kernel matches)    | WebGL2                                | Medium is too slow                              |
| Poster | 0         | —                                             | a still of the real scene             | reduced motion, Save-Data, no WebGL2, or no GPU |

- **One kernel, two GPU backends.** The simulation is written once in TSL, and
  three.js compiles it to a WebGPU compute shader or a WebGL2 transform-feedback
  pass. The CPU version is the specification: a Playwright test steps the GPU
  kernel on both backends and compares the buffers with it (under 0.2% error).
- **Tier choice.** Boot code picks the poster before the engine downloads, so
  visitors with no usable GPU never fetch it. A frame-time probe steps down a
  slow tier. Dynamic resolution holds the frame rate, and the pixel ratio is
  capped at 1.75. A GPU that fails or loses its device steps down rather than
  going blank.
- **Theme.** Light or dark follows the device's setting (`prefers-color-scheme`),
  set before first paint so there is no flash, and it changes live when the
  device switches. There is no toggle; the world starts in the matching theme.
- **Intro.** Once per session, Home grows the Data formation out of a small
  seed inside the world's own area, fading in as it gathers, in 2.2 s. It never
  crosses the text: the world's mask starts where the hero text ends. Any input
  skips it, and reduced motion never plays it.
- **Accessibility.** The canvas is `aria-hidden` and every formation has a
  text caption. A pause/play icon button (labelled "Pause motion", with a
  tooltip) is always in the header and stops all motion (WCAG 2.2.2). Reduced
  motion gets the poster with no scroll choreography.

## Budgets and measured results

All sizes are gzipped, where KB means 1,000 bytes. `npm run budgets` measures
every built page and every lazy feature, and CI fails on any overrun.

| What                                                         | Measured                                                                                                 | Budget                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------- |
| JavaScript before idle, most pages                           | 9.7–10.9 KB                                                                                              | 50 KB                      |
| JavaScript before idle, Home (with the intro)                | 40.3 KB                                                                                                  | 50 KB                      |
| Graphics engine, after first paint                           | 304.6 KB                                                                                                 | 320 KB                     |
| Architecture explorer, on demand                             | 3.7 KB                                                                                                   | 25 KB                      |
| Lab: Train a network / Watch attention / Scale a system      | 7.6 / 5.4 (+ 8.8 KB data) / 6.9 KB                                                                       | 35 / 25 (+ 120) / 25 KB    |
| Preloaded fonts                                              | 57.0 KB                                                                                                  | 60 KB                      |
| Lighthouse mobile, Home                                      | 99–100; LCP median 1.66 s (worst 1.81 s), CLS 0.001, TBT 0 ms                                            | 90; 2.0 s, 0.05, 200 ms    |
| Lighthouse mobile, other pages                               | 99–100 performance; 100 accessibility, best practices, SEO                                               | 95                         |
| GPU training kernels against the CPU spec                    | largest difference 1.2 × 10⁻⁷ after 40 steps                                                             | test < 10⁻⁴                |
| High tier on a MacBook Air 13-inch (Apple M5, 16 GB), Chrome | 61 fps; 16.6 ms frames (vsync at 60 Hz); 1.44 ms GPU time; 65,536 particles, 1 draw call, 1 compute pass | 60 fps                     |
| Low tier CPU simulation step, 4,096 particles                | 4.0 ms on the build machine                                                                              | test < 16.7 ms (one frame) |

**The high tier on a laptop.** On a MacBook Air 13-inch (Apple M5, 16 GB) in
Chrome, the high tier holds 61 fps: its 16.6 ms frame time is the display's
60 Hz refresh, not the work. The GPU needs 1.44 ms a frame for all 65,536
particles (one compute pass, one draw call), under a tenth of the 16.7 ms
budget, according to Stats for nerds in the light theme.

**GPU time with bloom.** In the dark theme, with bloom (about 14 passes), the
same Mac showed 40.83 ms of GPU time while holding 60 fps, which is
impossible. Stats for nerds added up each pass's own timer, and on Apple's
tile-based GPUs those windows overlap, so the sum counted the same time many
times. It now times each frame as one span, from the start of its first pass
to the end of its last (`src/graphics/gpu-timer.ts`). The dark-theme figure
needs measuring again on the Mac: CI and the build machine can't present
WebGPU frames.

**Still to measure:** a mid-range phone on the low tier (target 30 fps). The
build machine has no GPU and renders in software at 2–7 fps, which says
nothing about real hardware. Run `npm run profile-frames` on the device, or
read Stats for nerds.

## Run it

Requires Node 22.12 or later.

```sh
npm ci
npm run dev             # http://localhost:4321; /dev/world shows every formation (?tier=high|medium|low|poster)
npm run build:preview   # build with [EDIT] placeholders allowed (shown as badges), plus /dev pages
npm run build:demo      # what Netlify publishes until launch: badges, noindex everywhere
npm run build           # production build: fails while any [EDIT] or empty media frame remains
```

## Checks

| Command                  | What it does                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`           | ESLint and Prettier                                                                                                                                 |
| `npm run check`          | `astro check` (TypeScript strictest)                                                                                                                |
| `npm test`               | Vitest unit tests                                                                                                                                   |
| `npm run check-content`  | every `[EDIT]` with file and line, empty media frames, evidence warnings                                                                            |
| `npm run budgets`        | JavaScript and font bytes per page and per lazy feature, after a build                                                                              |
| `npm run test:e2e`       | Playwright + axe against the built site, both themes                                                                                                |
| `npm run lhci`           | Lighthouse CI against `dist/` with the budgets in BRIEF.md section 8; Home's LCP is judged on the median of three runs, with a warning above 1.85 s |
| `npm run palette`        | contrast and colour-vision checks for the design tokens                                                                                             |
| `npm run bench`          | the low tier's CPU simulation step, timed                                                                                                           |
| `npm run profile-frames` | frame times per tier in Chromium (run on real hardware)                                                                                             |

## Edit the content

Start with [`CONTENT_GUIDE.md`](CONTENT_GUIDE.md). It lists:

- every placeholder, grouped by file, with what belongs there and an example
  of a strong answer;
- the ten items to fill first;
- a checklist for confidential work.

| Content                   | Where                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Site facts, links, skills | `src/data/site.json`                                                                                                            |
| Projects                  | `src/content/projects/<slug>/index.md` and `architecture.yaml`                                                                  |
| Roles                     | `src/content/experience/<id>.md`                                                                                                |
| Lab attention data        | the "Precompute attention" workflow (below), or `npm run precompute-attention` locally (needs `pip install torch transformers`) |

Then regenerate what reads the content. Run these against a preview server
(`npm run build:preview && npx astro preview --port 4321`) and commit the
output:

| Command                  | Writes                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `npm run resume-pdf`     | `public/resume.pdf` from `/resume`, and checks it is one page          |
| `npm run og-images`      | `public/og/*.png`, the social cards for Home and each project          |
| `npm run capture-poster` | `public/poster/*.webp`; use `POSTER_TIER=high` on a machine with a GPU |
| `npm run screenshots`    | `docs/screenshots/*.webp` at 390 px and 1440 px, both themes           |
| `npm run content-guide`  | `CONTENT_GUIDE.md`; a unit test fails when it is out of date           |

## Deploy

Netlify builds from `netlify.toml`. Until launch, every deploy is a **demo
build** of the example content:

| Build                   | Placeholders                                    | Search engines                                                                          | Used by                                                          |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run build:demo`    | allowed, shown as `[EDIT]` badges               | `noindex` on every page and an `X-Robots-Tag: noindex` header on every file; no sitemap | Netlify production (for now), deploy previews and branch deploys |
| `npm run build`         | the build fails while any remain                | indexed, with a sitemap                                                                 | Netlify production after launch                                  |
| `npm run build:preview` | allowed, shown as badges; includes `/dev` pages | not deployed                                                                            | CI and local testing                                             |

`npm run check-demo` checks a demo build (CI runs it on every push).

**At launch**, once `npm run check-content` reports nothing left, make one
change: in `netlify.toml`, set `[build] command = "npm run build"`. Previews
and branch deploys stay demo builds.

Security headers: a strict Content Security Policy, and immutable caching for
hashed assets. The CSP allows nothing from other origins, and a Playwright test
checks that no page loads anything from another origin or contains a frame.

**The grey box on deploy previews.** On a deploy preview, Netlify injects its
preview toolbar, the Netlify Drawer, as a frame from `app.netlify.com`. Our CSP
refuses that frame, and Chrome draws a grey "blocked content" box at the bottom
centre instead. Turn the Drawer off in Netlify: in the project's Deploy
Previews settings (under Build & deploy), set the Netlify Drawer to disabled.
Loosening the CSP for previews would mean previews no longer test the headers
production sends. Production never gets the Drawer: Netlify injects it only
into deploy previews (and branch deploys, if enabled there).

## CI and workflows

- **`.github/workflows/ci.yml`** runs every check above on every push and pull
  request, then builds the demo site and checks it. It can also be started by
  hand (`workflow_dispatch`); the attention workflow uses that.
- **`.github/workflows/attention.yml`** ("Precompute attention") is started
  by hand from the Actions tab. It:
  1. runs `npm run precompute-attention` on GitHub's runners, which can reach
     Hugging Face;
  2. checks the result against the 120 KB budget;
  3. regenerates `CONTENT_GUIDE.md`, which lists the sample's placeholder
     that the real data removes;
  4. runs the unit tests and lint;
  5. opens a pull request with both files;
  6. starts CI on its branch.

  The last step is needed because pushes made with a workflow's own token
  don't trigger other workflows, but a `workflow_dispatch` does. The pull
  request's checks then appear as usual, with nothing to close and reopen.
  - **Before the first run**, allow it to open pull requests: Settings →
    Actions → General → Workflow permissions → tick "Allow GitHub Actions to
    create and approve pull requests".
  - **Once the real data is merged**, the Lab's "sample data" notice
    disappears (it shows only while the file says `"source": "sample"`), and
    the file stops blocking the production build.
