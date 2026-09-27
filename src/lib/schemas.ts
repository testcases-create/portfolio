// Content schemas (BRIEF.md section 4, PLAN.md section 4). Kept free of Astro
// runtime imports so Vitest can exercise them directly; content.config.ts wires
// them into collections.
import { z } from 'astro/zod';

export const AREAS = ['sde', 'llm', 'ml'] as const;
export const area = z.enum(AREAS);
export type Area = z.infer<typeof area>;

export const metric = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  baseline: z.string().optional(),
  // Dataset, baseline and conditions. Never empty, never hover-only.
  measuredBy: z.string().min(20, 'measuredBy must say how the number was measured'),
});

export const NODE_KINDS = [
  'client',
  'gateway',
  'service',
  'model',
  'store',
  'queue',
  'cache',
  'external',
] as const;

export const architecture = z
  .object({
    nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: z.enum(NODE_KINDS) })).min(2),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
    flows: z.array(z.object({ name: z.string(), path: z.array(z.string()).min(2) })),
  })
  .superRefine((arch, ctx) => {
    const ids = new Set(arch.nodes.map((n) => n.id));
    if (ids.size !== arch.nodes.length) ctx.addIssue({ code: 'custom', message: 'duplicate node id' });
    const edges = new Set(arch.edges.map((e) => `${e.from}>${e.to}`));
    for (const e of arch.edges) {
      for (const end of [e.from, e.to]) {
        if (!ids.has(end)) ctx.addIssue({ code: 'custom', message: `edge references unknown node "${end}"` });
      }
    }
    for (const f of arch.flows) {
      f.path.forEach((id, i) => {
        if (!ids.has(id))
          ctx.addIssue({ code: 'custom', message: `flow "${f.name}" references unknown node "${id}"` });
        const next = f.path[i + 1];
        if (next && !edges.has(`${id}>${next}`) && !edges.has(`${next}>${id}`)) {
          ctx.addIssue({ code: 'custom', message: `flow "${f.name}" steps ${id} → ${next} with no edge` });
        }
      });
    }
  });
export type Architecture = z.infer<typeof architecture>;

// A URL, optionally followed by the placeholder tag while it is invented.
export const link = z.string().regex(/^(https?:\/\/|mailto:)\S+( \[EDIT\])?$/, 'expected a URL');

export const decision = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2),
  chose: z.string(),
  tradeoff: z.string(),
  evidence: z.string(),
});

/**
 * A media frame. Until the real file exists it is a neutral placeholder frame
 * at the right aspect ratio, captioned with exactly what belongs there.
 * `image` is Astro's image() helper, injected so this stays testable.
 */
export const media = <T extends z.ZodType>(image: T) =>
  z
    .object({
      src: image.optional(),
      alt: z.string().min(1),
      ratio: z.string().regex(/^\d+\/\d+$/, 'ratio looks like "16/9"'),
      placeholder: z.string().optional(),
    })
    .refine((m) => m.src !== undefined || m.placeholder !== undefined, {
      message: 'a frame needs either src or a placeholder caption',
    });

export const CODE_LANGS = ['ts', 'tsx', 'js', 'py', 'go', 'sql', 'yaml', 'bash', 'rust', 'java'] as const;
export const MAX_SNIPPET_LINES = 25;

/** A code highlight: at most 25 lines, with why it matters. */
export const snippet = z.object({
  title: z.string(),
  lang: z.enum(CODE_LANGS),
  code: z
    .string()
    .refine(
      (c) => c.trimEnd().split('\n').length <= MAX_SNIPPET_LINES,
      `a snippet is at most ${MAX_SNIPPET_LINES} lines`,
    ),
  why: z.string().min(20),
});

/**
 * The deep dive's prose sections, in page order. Each is an h2 in the
 * project's Markdown; the template places components between them.
 */
export const PROJECT_SECTIONS = [
  { id: 'context-and-constraints', heading: 'Context and constraints' },
  { id: 'architecture', heading: 'Architecture' },
  { id: 'evaluation', heading: 'Evaluation' },
  { id: 'deployment-and-operations', heading: 'Deployment and operations' },
  { id: 'results', heading: 'Results' },
  { id: 'what-id-do-next', heading: "What I'd do next" },
] as const;

export const projectSchema = <T extends z.ZodType>(image: T) =>
  z.object({
    title: z.string(), // an outcome, not a name
    slug: z.string().regex(/^[a-z0-9-]+$/),
    /** Short label for navigation, skill evidence and slides. */
    name: z.string().max(32),
    outcomeHeadline: z.string(),
    summary: z.string().max(280),
    areas: z.array(area).min(1),
    role: z.string(),
    team: z.string(),
    timeline: z.string(),
    myScope: z.string(),
    stack: z.array(z.string()).min(1).max(8),
    metrics: z.array(metric).min(1).max(4),
    links: z.object({ repo: link, demo: link, video: link, paper: link }).partial().default({}),
    confidential: z.boolean().default(false),
    featured: z.boolean().default(false),
    order: z.number().int(),
    cover: media(image),
    decisions: z.array(decision).min(1).max(5),
    /** The TL;DR's problem line: one or two sentences a recruiter can read in five seconds. */
    problem: z.string().max(240),
    code: z.array(snippet).min(1).max(2),
  });

const month = z.string().regex(/^\d{4}-\d{2}$/, 'use YYYY-MM');
export const experienceSchema = z.object({
  company: z.string(),
  companyNote: z.string(), // one factual line, no rankings or superlatives unless sourced
  title: z.string(),
  start: month,
  end: month.or(z.literal('present')),
  location: z.string(),
  highlights: z.array(z.string()).min(1), // "did X, measured by Y, by doing Z"
  stack: z.array(z.string()),
});

const skill = z.object({
  name: z.string(),
  // Project slugs or experience ids. content-audit warns when empty or dangling.
  evidence: z.array(z.string()),
});

export const siteSchema = z.object({
  name: z.string(),
  roleLine: z.string(),
  roleLines: z.record(area, z.string()),
  current: z.object({ title: z.string(), company: z.string() }),
  yearsExperience: z.string(),
  positioning: z.string(),
  location: z.string(),
  availability: z.string(),
  siteUrl: z.string(),
  links: z.object({
    email: z.string(),
    github: z.string(),
    linkedin: z.string(),
    leetcode: z.string().optional(),
    blog: z.string().optional(),
  }),
  impact: z.array(z.string()).min(3).max(4),
  /** About page: a short first-person story, one paragraph per entry. */
  about: z.array(z.string()).min(1).max(5),
  skills: z.object({
    sde: z.array(skill),
    llm: z.array(skill),
    ml: z.array(skill),
    mlops: z.array(skill),
  }),
  education: z.array(z.object({ degree: z.string(), school: z.string(), year: z.string() })),
  awards: z.array(z.object({ name: z.string(), detail: z.string(), year: z.string() })),
});
export type Site = z.infer<typeof siteSchema>;
