import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audit, evidenceWarnings, findEmptyFrames, findTags, isBlocking } from './content-audit';

const fixture = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'audit-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
};

const site = (skills = {}) => JSON.stringify({ skills: { sde: [], llm: [], ml: [], mlops: [], ...skills } });

describe('findTags', () => {
  it('reports 1-based lines', () => {
    expect(findTags('a.md', 'ok\nname: X [EDIT]\n')).toEqual([
      { file: 'a.md', line: 2, text: 'name: X [EDIT]' },
    ]);
  });
});

describe('findEmptyFrames', () => {
  it('finds placeholder captions only', () => {
    const src = 'cover:\n  alt: A\n  placeholder: Screenshot of X\n  src: ./x.avif';
    expect(findEmptyFrames('p.md', src).map((f) => f.line)).toEqual([3]);
  });
});

describe('evidenceWarnings', () => {
  const projects = new Map<string, Record<string, unknown>>([
    ['gw', { links: { repo: 'https://x' } }],
    ['secret', { confidential: true }],
    ['bare', { links: {} }],
  ]);

  it('warns on skills without evidence, dangling ids, and projects with no links', () => {
    const warnings = evidenceWarnings(
      {
        skills: {
          sde: [{ name: 'Go', evidence: [] }],
          ml: [{ name: 'CV', evidence: ['nope', 'gw', 'job'] }],
        },
      },
      projects,
      new Set(['job']),
    );
    expect(warnings).toEqual([
      'Skill "Go" (sde) links to no project or role.',
      'Skill "CV" (ml) cites "nope", which is not a project or role.',
      'Project "bare" is not confidential but has no public evidence links.',
    ]);
  });
});

describe('audit', () => {
  it('passes clean content', () => {
    const root = fixture({
      'src/data/site.json': site(),
      'src/content/projects/a/index.md': '---\nlinks: { repo: https://x }\n---\nText',
    });
    const result = audit(root);
    expect(isBlocking(result)).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('blocks on tags and empty frames, and skips test files', () => {
    const root = fixture({
      'src/data/site.json': site(),
      'src/content/projects/a/index.md': '---\ntitle: T [EDIT]\ncover:\n  placeholder: Photo\n---\n',
      'public/notes.txt': 'x [EDIT]',
      'src/lib/thing.test.ts': "expect('[EDIT]')",
    });
    const result = audit(root);
    expect(result.placeholders.map((f) => `${f.file}:${f.line}`)).toEqual([
      'public/notes.txt:1',
      'src/content/projects/a/index.md:2',
    ]);
    expect(result.emptyFrames).toHaveLength(1);
    expect(isBlocking(result)).toBe(true);
  });
});
