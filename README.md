# Portfolio

The portfolio of an SDE, LLM and AI/ML engineer, built as an Astro static site
with one persistent Three.js world. The full showcase README (architecture,
graphics engine, measured budgets) is written in Phase 5; see `PLAN.md` for the
design and graphics spec and the results of each phase so far.

## Run it

Requires Node 22.12 or later.

```sh
npm ci
npm run dev             # http://localhost:4321
npm run build:preview   # build with [EDIT] placeholders allowed
npm run build           # production build: fails while any [EDIT] remains
```

## Checks

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm run lint`          | ESLint and Prettier                                                      |
| `npm run check`         | `astro check` (TypeScript strictest)                                     |
| `npm test`              | Vitest unit tests                                                        |
| `npm run check-content` | every `[EDIT]` with file and line, empty media frames, evidence warnings |
| `npm run budgets`       | initial JS and preloaded font bytes per page, after a build              |
| `npm run test:e2e`      | Playwright + axe against the built site                                  |
| `npm run lhci`          | Lighthouse CI against `dist/` with the budgets in BRIEF.md section 8     |
| `npm run palette`       | contrast and colour-vision checks for the design tokens                  |

## Generated files

Run these against a preview server (`npm run build:preview && npx astro preview --port 4321`) and commit the output:

| Command                  | Writes                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `npm run og-images`      | `public/og/*.png`, the social cards for Home and each project |
| `npm run resume-pdf`     | `public/resume.pdf` from `/resume`, and checks it is one page |
| `npm run capture-poster` | `public/poster/*.webp`, the poster tier's stills              |

## Graphics and the Lab

The world lives in `src/graphics/`. `docs/walkthrough.md` explains how it works in plain language. In dev and preview builds, `/dev/world` shows every formation; add `?tier=high|medium|low|poster` to force a tier, or open Stats for nerds in the footer.

The Lab's three demos live in `src/lab/<demo>/`: `logic.ts` (plain TypeScript, unit-tested), an entry module for the controls, and a scene module that loads three.js only when the tier allows a 3D view. On a project page, "Explore in 3D" (`src/graphics/explorer.ts`) turns the world into that project's architecture graph.

## Editing content

- Site facts: `src/data/site.json`
- Projects: `src/content/projects/<slug>/index.md` and `architecture.yaml`
- Roles: `src/content/experience/<id>.md`
- Fonts are subset by `scripts/subset-fonts.py` into `src/assets/fonts/`.
