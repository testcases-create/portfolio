import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import raw from '../data/site.json';
import { architecture, experienceSchema, metric, projectSchema, siteSchema } from './schemas';

// Stand-in for Astro's image() helper: a path string.
const project = projectSchema(z.string());

const arch = {
  nodes: [
    { id: 'a', label: 'A', kind: 'client' },
    { id: 'b', label: 'B', kind: 'service' },
    { id: 'c', label: 'C', kind: 'store' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ],
  flows: [{ name: 'read', path: ['a', 'b', 'c'] }],
};

const frontmatter = (path: string) =>
  parseYaml(/^---\n([\s\S]*?)\n---/.exec(readFileSync(path, 'utf8'))?.[1] ?? '');

describe('architecture', () => {
  it('accepts a connected graph', () => {
    expect(architecture.safeParse(arch).success).toBe(true);
  });

  it('rejects an edge to a node that does not exist', () => {
    const r = architecture.safeParse({ ...arch, edges: [...arch.edges, { from: 'a', to: 'ghost' }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain('"ghost"');
  });

  it('rejects a flow step with no edge between the nodes', () => {
    const r = architecture.safeParse({ ...arch, flows: [{ name: 'jump', path: ['a', 'c'] }] });
    expect(r.error?.issues[0]?.message).toBe('flow "jump" steps a → c with no edge');
  });

  it('rejects duplicate node ids', () => {
    const r = architecture.safeParse({ ...arch, nodes: [...arch.nodes, arch.nodes[0]] });
    expect(r.success).toBe(false);
  });
});

describe('metric', () => {
  it('requires a measurement note', () => {
    expect(metric.safeParse({ label: 'p95', value: '190 ms', measuredBy: 'k6' }).success).toBe(false);
  });
});

describe('seed content', () => {
  const dirs = readdirSync('src/content/projects');

  it.each(dirs)('project %s matches the schema and its folder name', (dir) => {
    const data = frontmatter(`src/content/projects/${dir}/index.md`);
    const parsed = project.extend({ architecture: z.string() }).parse(data);
    expect(parsed.slug).toBe(dir);
    expect(parsed.architecture).toBe(dir);
  });

  it.each(dirs)('project %s has valid architecture data', (dir) => {
    const data = parseYaml(readFileSync(`src/content/projects/${dir}/architecture.yaml`, 'utf8'));
    expect(architecture.parse(data).nodes.length).toBeGreaterThan(1);
  });

  it.each(readdirSync('src/content/experience'))('experience %s matches the schema', (file) => {
    expect(() => experienceSchema.parse(frontmatter(`src/content/experience/${file}`))).not.toThrow();
  });

  it('site.json matches the schema', () => {
    expect(() => siteSchema.parse(raw)).not.toThrow();
  });
});
