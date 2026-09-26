# Master brief: SDE, LLM Engineer and AI/ML Engineer portfolio

> How to use: create an empty folder, put this file in it as `BRIEF.md`, open Claude Code in that folder, type `/effort high`, then say: "Read BRIEF.md and start with Phase 0."

The bar for this site: the visual craft of an award-winning creative studio, with the engineering quality of a FAANG code review. Anyone who opens it should see extraordinary graphics. Anyone who opens DevTools or the repo should see an engineer who knows exactly what they're doing.

---

## 0. Owner details (fill later)

Leave every line blank for now. Invent a coherent, clearly fictional placeholder for each and tag it `[EDIT]`.

- Name:
- Current role and company:
- Years of experience:
- Target roles: Software Development Engineer (SDE), LLM Engineer, AI/ML Engineer
- Target companies: product companies and big tech (FAANG-level)
- Positioning line:
- Location, and relocation or remote preference:
- Email, GitHub, LinkedIn, LeetCode, blog:
- Education and awards:

---

## 1. Role and goal

You are a staff-level graphics and front-end engineer with a product designer's eye. Build the portfolio of an engineer who works across three roles: SDE, LLM engineer, and AI/ML engineer. They build ML systems and LLM agents end to end, from the model to the interface people use, and ship them as production software.

Three audiences, three time budgets:

- Recruiters (30 seconds) need role, level, current company, core stack, résumé, GitHub, and 2–3 impact numbers above the fold.
- Hiring managers and engineers (5 minutes) need project depth: architecture, decisions, evaluation, measured results, real code.
- Interview loops (45 minutes) need system design depth, trade-offs, what failed, and ownership.

The site itself is the strongest project in the portfolio. Its graphics must be extraordinary, and they must also be fast, accessible, tested, and cleanly engineered, because the people evaluating it are engineers.

## 2. Non-negotiables

1. Evidence over adjectives. Every claim links to a project, repo, demo, or measured number.
2. Every metric says how it was measured (dataset, baseline, conditions).
3. Credibility over inflation. Title, years, and scope match the owner's real level.
4. "I" versus "we" is always explicit.
5. Confidential work: client names, proprietary data, and internal system names never appear unless the owner marks an item as cleared. Confidential projects are described in general terms.
6. Every invented fact is tagged `[EDIT]` (section 4). The production build fails while any remain.
7. Content is fully separated from layout.
8. Graphics serve the content. Every visual effect maps to something real: a role, a system, a model, a decision. No decorative effect without a meaning.
9. The budgets in section 8 are hard requirements, graphics included.

## 3. Stack

Verify the current docs and versions of every library below before writing code, and report anything that has changed.

- **Astro** (current stable, static output) with TypeScript in strict mode. Use Astro's client router and View Transitions, with `transition:persist` so the 3D canvas survives page navigation instead of re-initialising.
- **Three.js** as the only 3D engine: `WebGPURenderer` with TSL node materials and compute shaders, falling back automatically to its WebGL2 backend. Loaded as a client island.
- **GSAP** for all choreography: timelines, ScrollTrigger (scrubbed, never scroll-jacking), and SplitText for the one hero headline moment. Confirm the current licence covers every plugin used.
- **Babylon.js and PixiJS are not used by default.** They would add a second full rendering engine that duplicates what Three.js already does, which costs load time and reads as poor judgment to engineers reviewing the code. Add one only if Phase 0 shows a specific capability Three.js can't deliver, and justify it with measurements.
- Vanilla CSS with custom properties as design tokens. No UI kit.
- Content collections for projects (Markdown or MDX, whichever fits current Astro best), experience, and site data (JSON or YAML with zod schemas).
- Shiki at build time for code. Architecture diagrams are authored once as data (nodes and edges in the project's frontmatter or a sibling file) and rendered two ways: static SVG at build time, and the 3D architecture explorer (section 6).
- Self-hosted fonts (Astro's Fonts API or Fontsource).
- Netlify, with `netlify.toml`. Netlify Functions only for the optional assistant in Phase 6.
- Quality tooling: ESLint and Prettier, `astro check`, Vitest for logic (simulation, tiers, schemas), Playwright with axe-core, Lighthouse CI with the budgets from section 8, and a GitHub Actions workflow that runs all of them on push.
- Initialize git and commit after each phase with conventional commit messages.

## 4. Content model and placeholder system

```
src/
  content/
    projects/<slug>/     index.md(x), images, video, architecture data
    experience/          one file per role
  data/site.json         name, positioning, links, impact lines, skills, education, awards, availability
  graphics/              engine, formations, shaders, tiers, choreography
  lab/                   one folder per Lab demo
public/
  resume.pdf             placeholder
prototype/               Phase 0 only
```

Placeholder rules:

- Write realistic, specific sample copy (no lorem ipsum).
- Put `[EDIT]` directly after every invented fact: numbers, names, companies, links, dates, alt text.
- Render `[EDIT]` as a visible badge in dev and on preview deploys.
- `npm run check-content` lists every remaining `[EDIT]` with file and line. The production build fails if any remain, unless `ALLOW_PLACEHOLDERS=1` is set for previews.
- Image and video placeholders are neutral frames at the right aspect ratio, captioned with exactly what belongs there. Empty frames also fail the production build.

Project schema (minimum):

- `title`, `slug`, `outcomeHeadline`, `summary`
- `areas`: one or more of `sde`, `llm`, `ml`
- `role`, `team`, `timeline`, `myScope`
- `stack` (8 items at most)
- `metrics`: 1–4 items of `{label, value, baseline?, measuredBy}`
- `links`: `{repo?, demo?, video?, paper?}`. The build warns when a non-confidential project has none.
- `confidential` (default false), `featured`, `order`, `cover`
- `architecture`: `{nodes[], edges[], flows[]}`, used for both the SVG diagram and the 3D explorer
- `decisions`: 1–5 items of `{question, options[], chose, tradeoff, evidence}`

Experience schema: `company`, `companyNote` (one factual line, no rankings or superlatives unless sourced), `title`, `start`, `end`, `location`, `highlights` (each "did X, measured by Y, by doing Z"), `stack`.

Skills: grouped as SDE, LLM, AI/ML, and MLOps and infrastructure. Every skill links to at least one project or role that proves it, and the build warns on skills with no evidence. No percentage bars, no logo walls.

## 5. Site map and page specs

### Home

- Hero: name, role line, current role and company, positioning line, and primary actions for Résumé (PDF), GitHub, LinkedIn, and Email. Availability and location line. The hero text is the LCP element and renders before any graphics.
- The persistent world (section 6) runs through the whole page, changing formation as each section comes into view.
- Impact: 3–4 sentences with measured numbers.
- Featured projects: rows with outcome headline, summary, area tags, one metric, a small cover, and links (Deep dive, Code, Demo).
- The Lab: a teaser for the three interactive demos.
- Experience snapshot, skills with evidence, awards, contact.

### Role lenses

Static pages at `/for/sde`, `/for/llm`, and `/for/ml`. Each is Home with a tailored role line, projects reordered by area, skills filtered, and the world opening on that role's formation. The owner sends the matching link with each application. Keep them out of the main nav, with the canonical URL set to Home.

### Projects index

All projects, filterable by area. Filtering works without JavaScript (static area pages) and is enhanced with it.

### Project deep dive (the most important page)

- Top: a TL;DR block with problem, my role, team, timeline, stack, metrics (measurement notes visible, not hover-only), and links. It stands alone for a 30-second reader.
- Skim / Full toggle, remembered in localStorage (wrapped in try/catch).
- Sections, in order:
  1. Context and constraints.
  2. Architecture: the static SVG diagram, the flow in 3–5 sentences, and an "Explore in 3D" control that opens the architecture explorer.
  3. Engineering decisions (signature component): question, options, choice, trade-off, evidence. Expandable, keyboard-operable, works without JS.
  4. Evaluation: method, dataset, baselines, results table. For LLM work: eval harness, failure categories, latency p50/p95, cost per 1,000 requests.
  5. Deployment and operations: CI/CD, serving, monitoring, drift, rollback.
  6. Results, with measurement context.
  7. Code highlight: 1–2 snippets of 25 lines or fewer, each with why it matters.
  8. What I'd do next.
- Sticky section nav on desktop, reading progress indicator, next project, contact.
- On these pages the world becomes a quiet header band in the project's area formation. It never sits behind body text.

Seed projects (fictional, all tagged `[EDIT]`), two per role plus the site:

1. LLM: a tool-using agent with RAG, guardrails, and an eval harness.
2. LLM: structured extraction or text-to-SQL with evaluation against a labelled set.
3. AI/ML: industrial visual defect detection with a trained deep learning model and a full MLOps pipeline (tracking, registry, serving, monitoring).
4. AI/ML (`confidential: true`): an applied ML project at the owner's current company, described in general terms.
5. SDE: a multi-service system (for example order and fulfilment) with end-to-end tests and load-test results.
6. SDE: a low-latency service, for example an inference gateway with batching, caching, and rate limiting.
7. This site: the graphics engineering, budgets, and CI. Its numbers come from real Phase 5 measurements, so they are not tagged `[EDIT]`.

### The Lab

One interactive demo per role, each explained in two or three sentences of plain language, each loaded only when opened.

- **AI/ML: "Train a network in your browser."** The visitor places points of two classes on a 2D field. A small neural network trains live, the decision boundary updates in real time, and the network itself is rendered in 3D with edge thickness showing weights and pulses showing activations. Training runs in WebGPU compute where available and on the CPU otherwise.
- **LLM: "Watch attention."** A visitor picks from a set of sentences and sees tokenisation, then attention between tokens rendered as 3D arcs, layer by layer and head by head. By default it uses attention data precomputed by a script in the repo from a small open model. An optional live mode runs a small model in the browser only after the visitor presses a button that states the download size.
- **SDE: "Scale a system."** A live simulation of requests moving through a load balancer, services, a cache, a queue, and a database. The visitor changes traffic, adds replicas or a cache, or injects a failure, and watches p95 latency, throughput, and error rate respond. The simulation logic is plain TypeScript with unit tests; the rendering uses the same Three.js engine.

### Experience, About, Résumé, Contact, 404

- Experience: timeline of roles, education, certifications, awards.
- About: a short first-person story and what I'm looking for next.
- Résumé: `/resume` renders from the site data with a print stylesheet for a clean one-page print, plus a link to the uploaded PDF.
- Contact: email, LinkedIn, GitHub. No form.
- 404: useful, with links to projects and contact, and the world in its idle formation.

### Presentation mode

`/projects/<slug>/present` renders a project as full-screen slides (one section or decision per slide) with arrow keys, clicks, a slide counter, and large type. For "walk me through a project" interview rounds.

## 6. The graphics system

### 6.1 One persistent world

A single Three.js canvas lives across the whole site and persists through page navigation. Each page and section tells it which formation to show. It never re-initialises between pages, and it pauses completely when off-screen or when the tab is hidden.

### 6.2 Formations

Every formation is built from the same GPU particle system, so moving between them is one continuous transformation.

1. **Data:** a structured-noise cloud flowing along a curl-noise field. This is the idle and intro state.
2. **AI/ML:** particles settle into a layered neural network. Edges draw between layers, and pulses travel through them like a forward pass.
3. **LLM:** particles become a stream of tokens, with attention arcs connecting them and brightening as the stream moves.
4. **SDE:** particles form a service graph, with request packets moving between nodes, queuing, and fanning out.

On Home, scrolling moves through Data, AI/ML, LLM, and SDE, then everything converges into a calm final state behind the contact section. Role lenses open on their own formation. Transitions are scrubbed by GSAP ScrollTrigger, interruptible, and driven by GPU uniforms, never by moving DOM elements.

### 6.3 Simulation and rendering

- Particle positions are simulated on the GPU: compute shaders with WebGPU, and ping-pong render targets on the WebGL2 fallback.
- The pointer (or touch) acts like attention: nearby particles bend toward or away from it. Subtle, with no cursor trails.
- Custom TSL materials with depth-based size and soft falloff. Selective bloom is allowed only on moving signals (pulses, packets, attention peaks) and only if it fits the budget. No full-screen glow, no neon wash.
- Colour comes from the meaning colours in section 7, read from CSS tokens, and updates when the theme changes.

### 6.4 Choreography

- One hero intro per session: the headline reveals with SplitText while the Data formation assembles, finishing within 2.5 seconds and skippable by any input.
- Page transitions use View Transitions for the DOM and GSAP for the world, choreographed together so a click on a project card morphs the world toward that project's formation as the page changes.
- Motion that answers an action (opening a decision, toggling skim, exploring an architecture) is welcome. Scattered entrance animations on every section are not.

### 6.5 Architecture explorer

On any project page, "Explore in 3D" loads the project's architecture data into the world as an explorable 3D graph. Request flows animate along edges, nodes can be focused with mouse or keyboard, and a text list of nodes and flows is always available beside it. Loaded only on demand.

### 6.6 Quality tiers

- **High:** WebGPU compute, the full particle count (propose numbers in Phase 0), selective bloom.
- **Medium:** WebGL2 GPGPU with a reduced count and no bloom.
- **Low:** a few thousand particles simulated on the CPU.
- **Poster:** a pre-rendered image of the real scene (captured in Phase 5, AVIF or WebP), used when WebGL is unavailable, `prefers-reduced-motion` is set, Save-Data is on, or the low tier can't hold its frame rate.
- The tier is chosen by capability detection plus a short frame-time probe. Dynamic resolution scaling keeps the frame rate steady, and device pixel ratio is capped at about 1.75.

### 6.7 Accessibility and testability

- The canvas is `aria-hidden`. Everything essential exists in the DOM.
- A visible pause/play control is always available (WCAG 2.2.2). Reduced motion switches to the poster and removes scroll choreography.
- The world mirrors its state (tier, formation, paused, ready) into DOM data attributes so Playwright can assert on it.
- "Stats for nerds": an optional panel, off by default, showing FPS, particle count, tier, backend (WebGPU or WebGL2), draw calls, and graphics bytes transferred.

## 7. Visual design direction

Aim: extraordinary, professional, engineered. Dark by default, with a fully designed light theme behind a toggle that is remembered.

- **Extraordinary is not busy.** The world is the one continuous spectacle. Everything around it stays quiet, precise, and readable so the graphics land.
- **Colour with meaning:** one hue per role (SDE, LLM, AI/ML), used the same way in the world, area tags, diagrams, and the Lab, always paired with a text label. Contrast checked to WCAG AA in both themes, and distinct under common colour-vision deficiencies.
- Before any code, write a design plan: 4–6 named hex colours per theme with roles and contrast ratios, typefaces and their roles, a type scale, ASCII wireframes for Home and the project page at 1440px and 390px, and 3–4 design principles.
- Avoid the generic developer and AI portfolio look: neon cyan or purple gradients and glow, glassmorphism cards, near-black with a single acid-green accent, typing-effect terminal heroes, "Hi, I'm X" with a wave emoji, skill percentage bars, logo walls, random floating-particle backgrounds with no meaning, cursor trails, scroll-jacking or smooth-scroll hijacking, identical rounded cards with soft grey shadows, ALL-CAPS eyebrow labels over every heading, monospace for labels (monospace is for code only), accenting a single word in a headline, 01/02/03 numbering on content that isn't a sequence, and fade-and-slide-up on every section. Review the plan against this list and say what you changed.
- **Typography:** a deliberate choice, not the default families (Inter, Space Grotesk, Poppins, Roboto). One or two families, a clear scale, body text at about 70 characters per line or less.

## 8. Quality bar and budgets

- Core Web Vitals, Lighthouse mobile, Home: LCP 2.0s or less, CLS 0.05 or less, TBT 200ms or less, INP under 200ms.
- Lighthouse: Performance 90+ on Home (mobile) and 95+ elsewhere; Accessibility, Best Practices, and SEO 95+ everywhere. Enforced in Lighthouse CI.
- JavaScript: 50 KB gzipped or less before the page is idle. The graphics engine loads after first paint, 300 KB gzipped or less. Each Lab demo and the architecture explorer load only when opened, with their own budgets set in Phase 0.
- Frame rate: 60 fps on a mid-range laptop at high tier, and at least 30 fps on a mid-range phone at low tier.
- WCAG 2.2 AA throughout, including keyboard access to every control and the pause control.
- Responsive from 360px to wide desktop.
- SEO: per-page meta, Open Graph images, sitemap, robots.txt, JSON-LD Person schema, canonical URLs.
- No third-party trackers.

## 9. Writing rules

- First person, sentence case, active voice.
- Impact lines follow "Accomplished X, measured by Y, by doing Z."
- Project titles are outcomes ("Cut inference p95 latency from 820 ms to 190 ms"), not names.
- Numbers always come with measurement context.
- Banned words: passionate, cutting-edge, state-of-the-art (unless citing a benchmark), leverage (as a verb), robust, seamless, revolutionize, synergy, ninja, rockstar, 10x, "hard-working team player".
- Explain technical choices in plain language first, with the depth available below.

## 10. Deliverables

- The working site.
- `README.md` written as a project showcase: architecture, the graphics engine (tiers, WebGPU and WebGL2 paths, persistence), budgets with measured results, and how to run, edit, and deploy.
- `CONTENT_GUIDE.md`: every `[EDIT]` grouped by file, what real information belongs there with one example of a strong answer, and a checklist for confidential work.
- `netlify.toml`, the GitHub Actions workflow, and the tests.

## 11. How to work

Stop at the end of every phase, summarise what was built and measured, and wait for my go-ahead. Commit after each phase.

1. **Phase 0 (plan and prototype):** restate the brief in five lines; propose the file tree, schemas, the design plan from section 7, and the graphics spec (formations, particle counts per tier, compute approach for WebGPU and WebGL2, bloom rules, choreography, budgets per chunk). Review against the defaults in section 7 and list what you changed. Build a standalone prototype at `prototype/world.html` showing all four formations with scroll-scrubbed transitions and tier switching, and tell me how to open it.
2. **Phase 1 (foundation):** Astro and TypeScript, client router with the persistent canvas slot, content collections, the placeholder system and check script, design tokens, fonts, and the lint, test, and CI skeleton.
3. **Phase 2 (graphics engine):** the production world with all formations, GPU simulation on both backends, tiers, dynamic resolution, poster fallback, pause control, theme sync, DOM state mirroring, stats panel, and GSAP choreography.
4. **Phase 3 (pages):** Home, role lenses, projects index, the project template with the seven seed projects, Experience, About, Résumé, Contact, 404, and presentation mode.
5. **Phase 4 (architecture explorer and the Lab):** the 3D explorer and the three Lab demos, each lazy-loaded with its own budget and unit-tested logic.
6. **Phase 5 (QA and polish):** run check-content, Vitest, Playwright with axe, and Lighthouse CI against the budgets; capture the poster image; screenshot Home, a project, and the Lab at 390px and 1440px in both themes; profile frame times on each tier; critique and fix. Fill the "This site" project with the measured numbers. Finish with the ten most important `[EDIT]` items to fill first.
7. **Phase 6 (optional, only when I ask):** an "Ask my portfolio" assistant using RAG over the site content through a Netlify Function. The API key stays in an environment variable and never reaches the browser. Answers come only from site content, link to their sources, and say so when the answer isn't there. Rate limiting and a monthly cost cap. Hidden when no key is set or while any `[EDIT]` tags remain.

Before anything is pushed to a public GitHub repo, confirm no confidential detail is in it.

---

# Follow-up prompt (use after generation to add real details)

```
Update the portfolio with my real details below. Rules:
- Replace [EDIT] items only where I've given the information. Keep the tag on
  anything I haven't covered. Never invent numbers, names, links, or quotes.
- Every metric needs its measurement context. If I haven't given one, ask me.
- For work projects, follow the confidential rules unless I say an item is cleared.
- Keep the structure and design unchanged unless I say otherwise.
- If my information doesn't fit a section, suggest an honest alternative
  instead of padding it.
- When done, run npm run check-content and tell me what's still left.

My details:
[paste here, e.g. for one project: the problem, my role, team, stack,
architecture in a few lines, 2-3 key decisions with evidence, metrics and how
they were measured, repo or demo links, what I'd do next]
```
