# Phase 0: plan and prototype

Status: Phase 0 approved. Phase 1 (foundation) complete; see section 11. Waiting for your go-ahead before Phase 2.

## 1. The brief in five lines

1. Build the portfolio of an engineer who works across SDE, LLM and AI/ML roles, pitched at product and big-tech hiring loops.
2. Serve three readers: recruiters (30 seconds, above the fold), engineers (5 minutes, project depth), and interview loops (45 minutes, design and trade-offs).
3. One persistent Three.js particle world runs through the site, and every formation it takes stands for something real: data, a network, attention, a service graph.
4. Every claim is evidence-backed and every metric says how it was measured. Invented facts carry `[EDIT]`, and the production build fails while any remain.
5. The site is itself the strongest project: fast, accessible, tested, within hard budgets, with Astro, TypeScript, GSAP and CI on Netlify.

## 2. Stack check (verified 26 September 2026)

| Package | Version | What changed and what I'll do about it |
|---|---|---|
| astro | 7.3.5 | Astro 7 (June 2026) uses a new Rust `.astro` compiler that rejects unclosed tags and strips whitespace between elements the way React does (`{" "}` where needed). It ships Vite 8 with Rolldown, and its default Markdown pipeline is now Sätteri (remark/rehype plugins need `@astrojs/markdown-remark`; we need none). `src/fetch.ts` is now a reserved filename. `ClientRouter` and `transition:persist` are unchanged. The Fonts API is stable (top-level `fonts`). Content collections use `src/content.config.ts` with `glob`/`file` loaders and `z` from `astro/zod` (Zod 4). |
| typescript | **pin 6.x** | TypeScript 7 is out, but `@astrojs/check` 0.9.10 only supports `^5 \|\| ^6`. |
| three | 0.186.1 | `PostProcessing` was renamed `RenderPipeline` in r183. The WebGL2 fallback runs TSL compute through transform feedback, so one shader serves both backends (see 7.3). Reading a storage buffer at an arbitrary index on WebGL2 needs `.setPBO(true)`. |
| gsap | 3.15.0 | Every plugin, including SplitText and ScrollTrigger, is free under the Standard "No Charge" licence. The only restriction is on no-code animation tools that compete with Webflow, which doesn't apply to a portfolio. |
| vitest / @playwright/test / @axe-core/playwright / @lhci/cli | 5.0.2 / 1.63.0 / 4.13.0 / 0.15.1 | No blockers. |
| eslint / typescript-eslint / prettier / prettier-plugin-astro | 10.11 / 8.70 / 3.9.9 / 1.1.0 | ESLint 10 supports flat config only. |
| shiki | 4.4.3 | Used at build time through Astro's `<Code>`. |
| @fontsource-variable/archivo, /source-serif-4 | 5.3.0 | Self-hosted through the Fonts API's local provider. |
| Node | 22.23 local | Astro 7 requires Node 22.12 or later. |

- **Babylon.js and PixiJS:** not added. Phase 0 found no capability that Three.js lacks.
- **Content format:** plain Markdown, not MDX. All structured data (metrics, decisions, architecture) lives in frontmatter or a sibling YAML file, and the prose sections only need tables and code fences. MDX comes in only if a project ever needs an inline component.
- **Netlify:** static output needs no adapter. The optional Phase 6 function lives in `netlify/functions/`.

## 3. File tree

```
.
├── BRIEF.md  PLAN.md  README.md  CONTENT_GUIDE.md
├── astro.config.ts  tsconfig.json  netlify.toml  lighthouserc.json
├── eslint.config.js  .prettierrc  vitest.config.ts  playwright.config.ts
├── .github/workflows/ci.yml          lint, astro check, vitest, check-content, build, playwright+axe, lhci
├── scripts/
│   ├── palette.mjs                   contrast + colour-blindness check (exists)
│   ├── check-content.ts              lists every [EDIT] with file:line; exit 1 in production builds
│   ├── capture-poster.ts             Phase 5: renders the high tier headless and writes AVIF/WebP
│   └── precompute-attention.py       Phase 4: attention weights from a small open model → JSON
├── public/  resume.pdf  robots.txt  favicon.svg  poster/  og/
├── prototype/world.html              Phase 0 only
├── src/
│   ├── content.config.ts             zod schemas (section 4)
│   ├── content/
│   │   ├── projects/<slug>/index.md  + architecture.yaml, cover.avif, media
│   │   └── experience/<role>.md
│   ├── data/site.json                name, positioning, links, impact, skills, education, awards
│   ├── graphics/
│   │   ├── engine.ts                 renderer, loop, pause, visibility, DOM state mirror
│   │   ├── sim.gpu.ts                the one TSL compute kernel (WebGPU + WebGL2)
│   │   ├── sim.cpu.ts                low tier; also the unit-tested spec for the kernel
│   │   ├── formations/               data, ml, llm, sde, converge, graph (architecture explorer)
│   │   ├── tiers.ts                  detection, probe, dynamic resolution (pure functions)
│   │   ├── choreography.ts           ScrollTrigger segments, intro, page-transition morphs
│   │   ├── theme.ts                  reads CSS tokens into uniforms
│   │   └── stats.ts                  "Stats for nerds"
│   ├── lab/  train-network/  watch-attention/  scale-system/   each: logic.ts + logic.test.ts + view
│   ├── components/                   Hero, ProjectRow, Tldr, Metric, Decision, Diagram (SVG), EditBadge, WorldSlot…
│   ├── layouts/                      Base, Project, Present
│   ├── pages/                        index, for/[role], projects/, projects/area/[area],
│   │                                 projects/[slug]/, projects/[slug]/present, lab/, experience,
│   │                                 about, resume, contact, 404
│   └── styles/                       tokens.css, base.css, print.css
└── tests/e2e/                        Playwright + axe specs; unit tests sit next to their code
```

## 4. Schemas

```ts
// src/content.config.ts (sketch)
const area = z.enum(['sde', 'llm', 'ml']);
const metric = z.object({
  label: z.string(),                 // "p95 latency"
  value: z.string(),                 // "190 ms [EDIT]"
  baseline: z.string().optional(),   // "820 ms [EDIT]"
  measuredBy: z.string().min(20),    // dataset, baseline, conditions; never empty
});
const node = z.object({ id: z.string(), label: z.string(), kind: z.enum(['client', 'gateway', 'service', 'model', 'store', 'queue', 'cache', 'external']) });
const edge = z.object({ from: z.string(), to: z.string(), label: z.string().optional() });
const flow = z.object({ name: z.string(), path: z.array(z.string()).min(2) }); // animated in 3D

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '*/index.md' }),
  schema: ({ image }) => z.object({
    title: z.string(),               // an outcome, not a name
    slug: z.string(), outcomeHeadline: z.string(), summary: z.string().max(280),
    areas: z.array(area).min(1),
    role: z.string(), team: z.string(), timeline: z.string(), myScope: z.string(),
    stack: z.array(z.string()).max(8),
    metrics: z.array(metric).min(1).max(4),
    links: z.object({ repo: z.url(), demo: z.url(), video: z.url(), paper: z.url() }).partial(),
    confidential: z.boolean().default(false),
    featured: z.boolean().default(false), order: z.number(), cover: image(),
    architecture: z.object({ nodes: z.array(node), edges: z.array(edge), flows: z.array(flow) })
      .refine(noDanglingEdges), // every edge and flow references a real node
    decisions: z.array(z.object({
      question: z.string(), options: z.array(z.string()).min(2), chose: z.string(),
      tradeoff: z.string(), evidence: z.string(),
    })).min(1).max(5),
  }),
});
// build warning: !confidential && no links → "project has no public evidence"

const experience = defineCollection({
  loader: glob({ base: './src/content/experience', pattern: '*.md' }),
  schema: z.object({
    company: z.string(), companyNote: z.string(),   // one factual line
    title: z.string(), start: z.string(), end: z.string().or(z.literal('present')),
    location: z.string(),
    highlights: z.array(z.string()),                // "did X, measured by Y, by doing Z"
    stack: z.array(z.string()),
  }),
});

// site.json: name, role, current, positioning, location, availability, links{email,github,linkedin,leetcode,blog},
// impact[] (3–4 sentences), skills{sde[],llm[],ml[],mlops[]} where each skill = {name, evidence: string[]}
// (evidence ids resolve to project slugs or experience ids; the build warns on an empty list), education[], awards[].
```

## 5. Design plan

### Principles

1. **One spectacle.** The world is the only thing that moves on its own. Everything around it stays still, quiet and precise until someone acts.
2. **Every colour is a claim.** Blue, gold and rose mean SDE, LLM and AI/ML everywhere: in the world, tags, diagrams and the Lab. They never appear without their text label, and everything else is neutral.
3. **Numbers carry their method.** A metric never appears without the line that says how it was measured, directly below it and never in a tooltip.
4. **Text never waits for graphics.** Every page is complete and readable as HTML and CSS. The world arrives afterwards, and leaving it out loses nothing essential.

### Colour

There are five neutrals and three role colours. The brief asks for 4–6 colours per theme; I count the role colours separately because the colour-with-meaning rule fixes them. All values below come from `node scripts/palette.mjs`, and every check passes.

**Dark (default)**

| Name | Hex | Role | Contrast on ground / raised |
|---|---|---|---|
| Basalt | `#1A1D23` | page ground (lifted graphite, not near-black) | — |
| Slate | `#22262E` | raised surfaces: TL;DR, code, stats | — |
| Chalk | `#ECE8E1` | text, neutral particles | 13.82 / 12.42 |
| Pewter | `#A7ABB3` | secondary text, measurement notes | 7.33 / 6.59 |
| Rule | `#6B717C` | control borders, dividers | 3.44 / 3.09 (non-text ≥ 3) |
| Signal blue | `#4FAAF5` | SDE | 6.75 / 6.07 |
| Lamp gold | `#E0B444` | LLM | 8.67 / 7.79 |
| Stain rose | `#EC7BA6` | AI/ML (eosin, the stain used on neural tissue) | 6.39 / 5.74 |

**Light**

| Name | Hex | Role | Contrast on ground / raised |
|---|---|---|---|
| Fog | `#EEF0F2` | page ground (cool, not cream) | — |
| Paper | `#FFFFFF` | raised surfaces | — |
| Ink | `#1A1D23` | text, neutral particles | 14.78 / 16.88 |
| Graphite | `#4E545E` | secondary text | 6.68 / 7.63 |
| Rule | `#7C828C` | control borders | 3.39 / 3.87 |
| Signal blue | `#2F63BE` | SDE | 5.04 / 5.75 |
| Lamp gold | `#765A00` | LLM (deep ochre on light) | 5.69 / 6.50 |
| Stain rose | `#A8406F` | AI/ML | 5.07 / 5.79 |

**Colour-blind separation** (minimum OKLab distance between any two role colours; the script requires at least 0.10):

| Vision | Dark | Light |
|---|---|---|
| Typical | 0.210 | 0.184 |
| Protanopia | 0.122 | 0.130 |
| Deuteranopia | 0.144 | 0.108 |
| Tritanopia | 0.105 | 0.106 |

My first pairing, amber and rose, failed under tritanopia (0.064), so LLM moved from amber to gold.

### Typography

- **Archivo** (variable, width 62–125 and weight 100–900) sets the display, headings, interface and numbers (tabular figures). The hero name is set expanded (width 116), which gives the name the look of engineered instrument lettering. That typographic moment is the design's one bold move outside the world.
- **Source Serif 4** (variable weight) sets long-form prose only: deep dives, About and project summaries. The serif carries narrative in my own voice; the grotesk carries interface, data and structure.
- **Code** uses the system monospace stack (`ui-monospace, SF Mono, Menlo, Consolas`), so there's no third download. Monospace appears only in code.
- **Font sizes (measured):** Archivo latin with the width axis is 90 KB (woff2), and Source Serif 4 latin (weight axis only) is 51 KB. Only Archivo is preloaded. In Phase 1 I'll try subsetting Archivo to width 100–125 and weight 400–700, and I'll measure the result rather than estimate it.

| Step | Size / line height | Face |
|---|---|---|
| Display (hero name) | `clamp(2.9rem, 1.2rem + 6.4vw, 6.25rem)` / 0.98 | Archivo, width 116, weight 620 |
| Page title | `clamp(2.25rem, 1.5rem + 2.6vw, 3.5rem)` / 1.05 | Archivo, width 110, weight 620 |
| Section heading | `clamp(1.75rem, 1.2rem + 1.8vw, 2.5rem)` / 1.1 | Archivo, width 108, weight 620 |
| Subheading | 1.5625rem / 1.2 | Archivo, width 104, weight 600 |
| Lead (role line) | 1.25rem / 1.4 | Archivo, weight 520 |
| Prose | 1.125rem / 1.65, at most 62ch | Source Serif 4 |
| Interface text | 1rem / 1.5 | Archivo |
| Small (measurement notes, captions) | 0.875rem / 1.45 | Archivo |
| Metric figure | 2.5rem / 1 | Archivo, width 112, tabular figures |

### Layout

At 900px and wider, text sits in the left five columns of a 12-column grid, always left-aligned. The world composes into the band from 46% to 97% of the viewport width, and a screen-space mask in the particle shader fades out anything that drifts toward the text column, so the world never sits behind body text. Below 900px, each section opens with a window onto the world (62svh) and the text sits below it on solid ground.

**Home, 1440px**
```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Rhea Sander        Work   Lab   Experience   About   Résumé    [Pause] [Theme]  │
├──────────────────────────────────────┬─────────────────────────────────────────┤
│                                      │                                         │
│  Rhea                                │     ≈≈≈ ≈≈≈≈ ≈≈≈ flow strands ≈≈ ≈≈≈     │
│  Sander        (Archivo, expanded)   │   ≈≈≈≈ ≈≈ ≈≈≈≈≈≈ ≈≈≈≈ ≈≈≈ ≈≈≈ ≈≈≈≈      │
│  Software engineer for ML and LLM…   │     ≈≈≈≈≈ ≈≈≈≈ ≈≈≈ ≈≈≈≈≈ ≈≈≈≈            │
│  ML platform engineer, Halden [EDIT] │                                         │
│  I build ML systems… (serif, ≤62ch)  │                                         │
│  [Résumé (PDF)]  GitHub  LinkedIn  Email                                       │
│  Open to roles from January 2027. Based in Bengaluru.   Data: a cloud of points…│
├──────────────────────────────────────┼─────────────────────────────────────────┤
│  Impact: 3–4 measured sentences      │            (Data, calm)                 │
├──────────────────────────────────────┼─────────────────────────────────────────┤
│  AI/ML ● projects                    │     network: forward pass               │
│  Cut defect escapes 38% [EDIT]  ─────│──   ○─○─○  pulses in rose              │
│  summary · tag · one metric · links  │                                         │
│  LLM ● projects        (rows)        │     tokens + attention arcs             │
│  SDE ● projects        (rows)        │     service graph + packets             │
├──────────────────────────────────────┼─────────────────────────────────────────┤
│  The Lab: three demos, 2–3 lines each│     (SDE)                               │
│  Experience, Skills with evidence    │                                         │
│  Contact                             │     three rings, one per role           │
└──────────────────────────────────────┴─────────────────────────────────────────┘
```
Featured projects are grouped by area, so the formation beside a project is always that project's own area.

**Home, 390px**
```
┌──────────────────────────────┐
│ Data: a cloud of points…     │ ← caption strip (formation + colour label)
│ Rhea                         │
│ Sander                       │
│ Software engineer for ML…    │
│ ML platform engineer [EDIT]  │
│ I build ML systems… (serif)  │
│ [Résumé (PDF)] GitHub        │
│ LinkedIn Email               │
│ Open to roles from Jan 2027… │
│    ≈≈≈ flow strands ≈≈≈      │ ← the world, below the hero text
├──────────────────────────────┤
│   window 62svh: network      │
├──────────────────────────────┤
│ Models trained and shipped   │ ← solid ground under text
│ ● AI/ML   project rows…      │
└──────────────────────────────┘
   [Pause] [Theme] in header in production
```

**Project page, 1440px**
```
┌────────────────────────────────────────────────────────────────────────────────┐
│ header                                                                          │
├────────────────────────────────────────────────────────────────────────────────┤
│  band 28vh: world in this project's area formation, quiet (no bloom, low alpha)│
│  Cut inference p95 latency from 820 ms to 190 ms [EDIT]            ● SDE        │
├────────────────────────────────────────────────────────────────────────────────┤
│ ┌ TL;DR (raised) ─────────────────────────────────────────────────────────────┐│
│ │ Problem …                    My role …     Team …       Timeline …          ││
│ │ Stack  Go · Redis · …                                                       ││
│ │ 820 → 190 ms          4.3× throughput          $0.41 per 1,000 requests      ││
│ │ p95, k6 at 500 rps    same hardware, same      token + compute cost,         ││
│ │ for 10 min [EDIT]     payload mix [EDIT]       March traffic [EDIT]          ││
│ │ Code   Demo   Video                                       Skim ◐ Full        ││
│ └─────────────────────────────────────────────────────────────────────────────┘│
│  On this page      │  Context and constraints   (serif prose ≤62ch)            │
│  Context           │  Architecture   [SVG diagram, wider]   [Explore in 3D]    │
│  Architecture      │  Engineering decisions  ▸ Why batch at the gateway?       │
│  Decisions         │     options · choice · trade-off · evidence (details)     │
│  Evaluation        │  Evaluation  (results table)                              │
│  Operations        │  Deployment and operations                                │
│  Results           │  Results   Code highlight (≤25 lines)   What I'd do next  │
│  ▮▮▮▯▯ progress    │  Next project →     Contact                               │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Project page, 390px**
```
┌──────────────────────────────┐
│ header                       │
│ band 22svh (quiet world)     │
│ Cut inference p95 latency    │
│ from 820 ms to 190 ms [EDIT] │
│ ● SDE                        │
│ ┌ TL;DR ───────────────────┐ │
│ │ Problem / Role / Team /  │ │
│ │ Timeline, stacked        │ │
│ │ 820 → 190 ms             │ │
│ │ p95, k6 at 500 rps…      │ │
│ │ Code  Demo    Skim ◐ Full│ │
│ └──────────────────────────┘ │
│ ▸ On this page (details)     │
│ Context… (serif)             │
│ [SVG diagram, scrolls in x]  │
│ [Explore in 3D]              │
│ ▸ Decision: Why batch…?      │
└──────────────────────────────┘
```

## 6. Review against section 7's list, and what I changed

| Default to avoid | Where the plan stands |
|---|---|
| Neon cyan/purple gradients and glow | None. Bloom falls only on moving signals. The prototype showed a faint full-screen halo, so I **tightened** the bloom radius from 0.4 to 0.05 and the strength to 0.55. |
| Glassmorphism cards | None. The TL;DR sits on a solid raised surface. |
| Near-black with one acid-green accent | The ground is lifted graphite `#1A1D23`, and there are three meaningful hues instead of one accent. |
| Typing-effect terminal hero; "Hi, I'm X 👋" | None. The hero is typographic. |
| Skill percentage bars; logo walls | None. Every skill links to its evidence. |
| Random floating particles with no meaning | **Changed.** My first Data formation was exactly this: a gaussian blob. It's now strands traced along the same curl field that moves them, so it reads as a flow field. Every formation also has a caption saying what it shows. |
| Cursor trails | None. The pointer only bends nearby particles, subtly. |
| Scroll-jacking or smooth-scroll hijacking | None. ScrollTrigger only reads scroll progress, and scrolling stays native. |
| Identical rounded cards with grey shadows | There are no cards: projects are rows. A 2px radius appears on buttons only. |
| ALL-CAPS eyebrow labels | None. Area tags are sentence case with a colour dot, and they appear only where they carry the area. |
| Monospace for labels | None. Monospace appears only in code. |
| Accenting one word in a headline | None. |
| 01/02/03 numbering | None. Project sections are named, not numbered. |
| Fade-and-slide-up on every section | None. The only unprompted motion is the world and the single hero intro. |

Beyond that list, I checked the plan against other generic looks: cream background with serif and terracotta (not used), broadsheet hairlines (not used), meta strings joined by middle dots (removed from my draft copy), and "Label — fragment" captions (my first captions used an em dash; they're now plain sentences). The Contact formation also **changed**, from a speckled sphere (generic) to three tilted rings, one per role, orbiting one centre.

## 7. Graphics spec

### 7.1 One persistent world
- **Mounting:** `<div id="world" transition:persist>` sits in the base layout. The engine module owns its state, so navigation never re-initialises it.
- **Page config:** each page declares its config on `<body data-world-formation data-world-mode="full|band">`, and the engine reads it on `astro:after-swap`.
- **Pausing:** the loop stops completely (`setAnimationLoop(null)`) when the tab is hidden, when a band scrolls off-screen (IntersectionObserver), or when the visitor presses Pause.

### 7.2 Formations

Every particle has a slot in every formation: two `vec4` per formation, written as A = (x, y, z, kind) and B = (x, y, z, param). The kinds are cloud, point, flow, arc, queue and shell. The data is built once on the CPU from a fixed seed; a formation is just a different target for the same particles, so moving between formations is one continuous transformation.

| # | Formation | What it shows | Signals (the only bloomed elements) |
|---|---|---|---|
| 0 | Data | 180 strands traced through the curl field; the cloud rotates slowly and the field keeps it moving. 7% of particles carry a role colour. | none |
| 1 | AI/ML | A 4-7-9-7-3 network. Edge particle density grows with the absolute weight, so a larger weight draws a denser edge. | A forward-pass pulse sweeps layer by layer |
| 2 | LLM | 14 tokens of a real sentence (block width follows token length). Arcs are Bézier curves whose height grows with distance, and the first token carries an attention sink. | The newest token and its arcs; tokens appear one by one |
| 3 | SDE | Client, load balancer, three services, cache, queue, worker, database. Nodes are boxes and edges are faint lines. | Packets in clumps; they bunch in front of the queue (eased *t*) |
| 4 | Converge | Three tilted rings in the three role colours, one per role, orbiting one centre | none |
| graph | Architecture explorer (Phase 4) | Uses the SDE kinds, built from a project's `architecture` data, so the same data also renders the static SVG | Flows animate along the listed paths |

### 7.3 Simulation and compute

- **One TSL compute kernel on both GPU backends:**
  - **WebGPU:** a real compute shader.
  - **WebGL2:** Three's transform-feedback path, which runs the same kernel as a vertex shader writing each particle's own element. Formation data is read through a PBO data texture.
  - **Deviation from the brief:** this replaces the separate ping-pong render-target path. The result is the same (double-buffered state on the GPU) with one shader source instead of two.
  - **Constraint:** each invocation writes only its own particle. That's fine here, because no formation needs neighbour interactions.
- **Low tier:** the same formation math in TypeScript on the CPU. That TypeScript version is also the unit-tested specification the kernel must match.
- **Per-frame update, in order:**
  1. Blend targets by formation weight, w_k = max(0, 1 − |morph − k|).
  2. Apply a damped spring toward the blend (stiffness per formation).
  3. Add curl flow and pointer attraction.
  4. Particles on moving paths (packets, attention arcs) follow the path exactly once their formation is fully formed. Otherwise springs lag behind and cut corners.
- **Curl field:** the curl of a sum-of-sines vector potential. It's divergence-free by construction, costs 9 trig calls instead of 6 Perlin samples, and gives the same result on the GPU and the CPU. A Vitest check will assert its numerical divergence is about 0.
- **Memory:** 160 bytes of formation data per particle, which is 10.5 MB at 65k. WebGPU's default 128 MiB binding limit caps this design at about 838k particles; the prototype hit that at 1,048,576.
- **Pitfall found, r186:** a TSL node first emitted inside one `If` block is cached as a variable in that block and reads 0 in sibling blocks when that block is skipped. It hit both my index node on WebGPU and Three's own PBO size variable on WebGL2, and either made every particle collapse to one point.
  - **Fix:** the kernel evaluates all five formations with no branches, about 250 ALU operations per particle.
  - **Guard:** Phase 2 adds a Playwright test that reads GPU buffers back on both backends.
  - **Upstream:** I can file a minimal reproduction with three.js if you want; I haven't filed anything.

### 7.4 Rendering

- **Sprites:** one instanced sprite draw with a custom TSL material. Size shrinks with depth through world-space sprites, and each sprite has a gaussian soft falloff (`exp(−22·r²)`).
- **Blending:** additive in dark, normal in light.
- **Colour:** CSS tokens are read into uniforms and re-read on theme change, with no page reload.
- **Text mask:** fades particles to zero in the text column on wide screens.
- **Alpha:** scales with camera distance, so dense phone views don't saturate.
- **Bloom rules:**
  - High tier and dark theme only.
  - A separate `glow` render target is written only by signals: pulses, packets and current attention arcs.
  - Strength 0.55, radius 0.05; no full-screen glow.
  - Phase 2 skips the pass entirely in the light theme instead of multiplying it by zero.

### 7.5 Tiers

| Tier | Particles | Path | Bloom | Chosen when |
|---|---|---|---|---|
| High | 65,536 | WebGPU compute | yes (dark theme) | a WebGPU adapter exists |
| Medium | 16,384 | WebGL2 transform feedback | no | WebGL2 but no WebGPU, or High fails the probe |
| Low | 4,096 | CPU | no | Medium fails the probe |
| Poster | 0 | static AVIF/WebP of the real scene | — | reduced motion, Save-Data, no WebGL2, or Low fails the probe |

- **Probe:** frames 30 to 120 after start. If the median exceeds 21 ms, the world steps down one tier; this applies in automatic mode only.
- **Dynamic resolution:** tracks a smoothed frame time. Above 19.5 ms for 45 frames, the render scale drops to 0.85× its current value (never below 0.55). Below 17.5 ms for 300 frames, it rises 1.1× (up to 1). Pixel density is capped at 1.75.
- **Vsync limit:** frame intervals are capped by the display's refresh, so they can't show spare headroom. Phase 2 adds WebGPU timestamp queries (`trackTimestamp`) to measure real GPU milliseconds.

### 7.6 Choreography

- **Intro:** once per session, stored in sessionStorage inside try/catch.
  - The headline's characters resolve from 12% opacity to full with SplitText (`words,chars`, 0.6 s each, 35 ms stagger). The text is never at opacity 0, so it still counts as the LCP paint.
  - Meanwhile the Data formation assembles from a 12-unit sphere over 2.2 s.
  - Any pointer, key, wheel or touch input completes both at once.
  - If JavaScript never runs, a CSS fallback shows the full text after 3 s.
- **Scroll:** each section boundary adds 0 to 1 to the formation index through ScrollTrigger (`top 85%` to `top 30%`). The frame loop eases the index toward that sum with a time constant of about 170 ms. The result is scrubbed, interruptible and native-scrolling, and all movement comes from GPU uniforms, never from moving DOM elements.
- **Page transitions (Phase 2):** on `astro:before-preparation`, the engine reads the clicked link's `data-area` and eases the world toward that formation over the view transition's duration. After the swap, the new page's config sets band or full mode.
- **Role lenses:** open directly on their formation.
- **Reduced motion:** poster, no ScrollTrigger, no intro.

### 7.7 Accessibility and testability

- **Screen readers:** the canvas is `aria-hidden`, and every caption exists as DOM text.
- **Pause:** Pause/Play is a real button with `aria-pressed`, keyboard reachable, and lives in the header in production. In the prototype it's a floating control that overlaps text at 390px; the header placement fixes that.
- **DOM state mirror:** `data-world-tier`, `-backend`, `-formation`, `-paused` and `-ready` on `<html>`. Playwright tests assert on these.
- **Stats for nerds:** off by default. Shows FPS, particle count, tier, backend, draw calls, compute passes, render scale and graphics bytes transferred. The bytes figure comes from Resource Timing, which reads accurately once assets are same-origin.

### 7.8 Budgets per chunk (gzip)

| Chunk | Budget | Evidence so far |
|---|---|---|
| Initial JS (before idle) | ≤ 50 KB | GSAP core + SplitText: **30.7 KB measured**; ClientRouter and boot code (theme, tier detection, pause, intro) to be measured in Phase 1 |
| Graphics engine (after first paint) | ≤ 300 KB | Three.js WebGPU + TSL + bloom, minimal entry bundled with esbuild: **248.0 KB measured**; ScrollTrigger **18.2 KB measured**; world code target ≤ 25 KB. **About 291 KB: tight.** Phase 2 re-measures with Rolldown tree-shaking. |
| Architecture explorer | ≤ 25 KB | reuses the engine; adds only graph layout, focus handling and labels |
| Lab: Train a network | ≤ 35 KB | MLP maths + a WebGPU training kernel + the CPU fallback |
| Lab: Watch attention | ≤ 25 KB code + ≤ 120 KB data | precomputed attention (quantised). Live mode downloads its model only after a button that states the size. |
| Lab: Scale a system | ≤ 25 KB | the simulation is plain TypeScript with unit tests |
| Poster image | ≤ 60 KB desktop, ≤ 25 KB mobile | captured in Phase 5 |
| Fonts | Archivo 90 KB (preloaded), Source Serif 4 51 KB | measured woff2 sizes; subset in Phase 1 |

## 8. Prototype results (measured)

The prototype is `prototype/world.html`. I tested it in Chrome 153 on this Mac (Apple GPU, Metal 3) at 1440×900 and a pixel density of 1.

| Run | Median frame | p95 frame | Result |
|---|---|---|---|
| High, 65,536 particles, WebGPU + bloom | 16.7 ms | 17.3 ms | 60 fps, 14 draw calls (bloom passes), 1 compute pass |
| High at 4× (262,144), each of the four formations | 16.7 ms | 17.4–17.6 ms | 60 fps, so the high tier has at least 4× headroom here |
| Medium, 16,384 particles, WebGL2 transform feedback | 16.7 ms | 17.2 ms | 60 fps, 2 draw calls |
| Low, 4,096 particles, CPU | 16.7 ms | 17.3 ms | 60 fps |
| 1,048,576 particles | — | — | fails as predicted: the formation buffer exceeds the 128 MiB binding limit |

- **Paint timing (local, no throttling):** LCP is the hero `<h1>` at 64 ms and FCP is 64 ms. The ghosted intro doesn't delay LCP. Budget numbers come from Lighthouse mobile in Phase 5.
- **Reduced motion:** gives the poster tier, no canvas and no intro.
- **Theme switching:** works live, with no reload and no console errors.

The pixel-density-1 window understates Retina displays, where a density of 1.75 means about 3× the pixels. Phones are untested; they're a Phase 5 item.

Screenshots from this run are in `~/.playwright-mcp/p0/`, outside the repo.

## 9. Owner placeholders (all `[EDIT]`)

- **Name:** Rhea Sander
- **Current role:** ML platform engineer at Halden Systems, 4 years' experience
- **Positioning:** "I build ML systems and LLM agents end to end, from the model to the interface people use, and run them in production."
- **Location and availability:** Bengaluru, open to relocation or remote, available from January 2027
- **Contact:** rhea.sander@example.com, github.com/example, linkedin.com/in/example, leetcode.com/example, blog at example.com
- **Education:** B.Tech in Computer Science, 2021 (institution placeholder); one hackathon award (placeholder)

## 10. How to open the prototype

```sh
cd ~/Desktop/portfolio
python3 -m http.server 4321
# open http://localhost:4321/prototype/world.html
```

| Query | Effect |
|---|---|
| `?tier=high\|medium\|low\|poster` | force a tier |
| `?intro=0` | skip the intro |
| `?n=262144` | override the particle count, for headroom tests |

On the page, the quality menu switches tiers live, Stats shows the nerd panel, and the theme and pause buttons work. Scroll through the page to scrub between formations. The page needs internet access for Three.js, GSAP and the fonts, which it loads from jsDelivr (prototype only; production self-hosts them).

## 11. Phase 1 results (27 September 2026)

**Stack re-check.** Every version in section 2 is still current on npm: astro 7.3.5, @astrojs/check 0.9.10 (TypeScript peer still `^5 || ^6`, so TypeScript is pinned to 6.0.3), three 0.186.1, gsap 3.15.0, vitest 5.0.2, @playwright/test 1.63.0, @axe-core/playwright 4.13.0, @lhci/cli 0.15.1, eslint 10.11.0, typescript-eslint 8.70.1, prettier 3.9.9, prettier-plugin-astro 1.1.0, shiki 4.4.3, both Fontsource packages 5.3.0. Two notes: Astro 7's `astro preview` keeps a lock file, so Playwright starts it with `--ignore-lock`; `npm audit` reports 10 advisories, all in @lhci/cli's dev-only dependency tree (inquirer, uuid), none in anything shipped.

**Built.**
- Astro 7 static site, TypeScript `strictest`, `ClientRouter`, and one persistent `#world` slot (`transition:persist`, `aria-hidden`).
- Page to world contract: `<body data-world-formation data-world-mode>`, mirrored to `data-world-*` on `<html>` by boot code on load and after every swap.
- Theme (dark default, remembered, set before first paint) and a Pause control with `aria-pressed`, both in the header and both remembered through guarded storage.
- Content collections: `projects` (`*/index.md`), `architectures` (sibling `architecture.yaml`, linked by `reference()`), `experience`; `site.json` validated by zod at build time. Architecture validation rejects unknown nodes, duplicate ids, and flow steps with no edge.
- Placeholder system: `Edit.astro` and `EditProse.astro` render `[EDIT]` as badges; `MediaFrame.astro` renders captioned empty frames. `npm run check-content` lists every tag with file:line, every empty frame and every evidence warning. Production builds fail from both `npm run build` and a bare `astro build` (an integration hook); `ALLOW_PLACEHOLDERS=1` lets previews through.
- Design tokens from section 5, with a unit test that keeps `tokens.css` identical to `scripts/palette.mjs` and re-runs its contrast and colour-vision checks.
- Fonts through the Fonts API local provider with generated metric fallbacks; only Archivo is preloaded.
- Tooling: ESLint (flat, strict), Prettier, `astro check`, Vitest, Playwright with axe (desktop 1440 and mobile 390), Lighthouse CI, `scripts/budgets.ts`, GitHub Actions, `netlify.toml` (strict production, preview contexts with placeholders allowed, security headers, immutable `/_astro/*`).
- One seed project (the inference gateway) and one role, only to exercise the schemas end to end. The other six projects and all page design arrive in Phase 3.

**Measured.**

| What | Result | Budget |
|---|---|---|
| Initial JS, every page (router + boot + theme script, gzip -9; KB = 1,000 bytes) | 6.4 KB | 50 KB (leaves about 43.6 KB; GSAP core + SplitText measured 30.7 KB in Phase 0) |
| Archivo subset to width 100–125, weight 400–700 | 90.1 KB → 57.0 KB | preloaded fonts ≤ 60 KB |
| Source Serif 4 subset to weight 400–700 (roman / italic) | 50.8 → 35.0 KB / 51.5 → 35.6 KB | not preloaded |
| CSS, gzip | 1.9 KB | — |
| Lighthouse mobile, Home (median of 3, local Chromium 141) | Performance 100, Accessibility 100, Best Practices 100, SEO 100; LCP 1.51 s, CLS 0.001, TBT 0 ms | LCP ≤ 2.0 s, CLS ≤ 0.05, TBT ≤ 200 ms |
| Lighthouse mobile, project page | 100 / 100 / 100 / 100; LCP 1.66 s, CLS 0.026 | as above |

These are foundation numbers with no graphics loaded; Phase 5 re-measures the finished pages.

**Deviations from the plan.** Architecture data is a separate `architectures` collection joined by `reference()`, which is how a sibling `architecture.yaml` becomes validated build input. Links are strings that may end in ` [EDIT]` rather than `z.url()`, so invented URLs can carry the tag; `strip()` removes it for `href`s. The Content-Security-Policy still allows inline scripts (the pre-paint theme script and Astro's inlined boot module); Phase 5 replaces that with hashes.

