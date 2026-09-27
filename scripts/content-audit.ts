// Finds every [EDIT] placeholder and every empty media frame in the content,
// plus evidence warnings (skills with no proof, projects with no public links).
// Used by scripts/check-content.ts and by the build integration in astro.config.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { EDIT_TAG } from '../src/lib/placeholders.ts';

export { EDIT_TAG };

/** Files and folders that hold owner-facing facts. Paths are relative to the project root. */
export const SCAN_ROOTS = ['src', 'public'];
const SCAN_EXTENSIONS = /\.(md|mdx|json|ya?ml|astro|ts|toml|txt|svg|html)$/;
// Code that mentions the tag itself, rather than carrying a placeholder.
const IGNORED = [/\.test\.ts$/, /^src\/lib\/placeholders\.ts$/, /^src\/components\/Edit(Prose)?\.astro$/];

export interface Finding {
  file: string;
  line: number;
  text: string;
}

export interface Audit {
  placeholders: Finding[];
  emptyFrames: Finding[];
  warnings: string[];
}

function walk(root: string, rel: string): string[] {
  const path = join(root, rel);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  if (stat.isFile()) return [rel];
  return readdirSync(path).flatMap((name) => walk(root, join(rel, name)));
}

/** Every line containing the tag, with 1-based line numbers. */
export function findTags(file: string, source: string): Finding[] {
  return source
    .split('\n')
    .flatMap((text, i) => (text.includes(EDIT_TAG) ? [{ file, line: i + 1, text: text.trim() }] : []));
}

/** Media frames with a placeholder caption and no source file are empty frames. */
export function findEmptyFrames(file: string, source: string): Finding[] {
  return source
    .split('\n')
    .flatMap((text, i) =>
      /^\s*placeholder:\s*\S/.test(text) ? [{ file, line: i + 1, text: text.trim() }] : [],
    );
}

function frontmatter(source: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  return match?.[1] ? ((parseYaml(match[1]) as Record<string, unknown>) ?? {}) : {};
}

interface SkillData {
  name: string;
  evidence: string[];
}

/** Evidence rules from BRIEF.md section 4. */
export function evidenceWarnings(
  site: { skills: Record<string, SkillData[]> },
  projects: Map<string, Record<string, unknown>>,
  experienceIds: Set<string>,
): string[] {
  const warnings: string[] = [];
  for (const [group, skills] of Object.entries(site.skills)) {
    for (const skill of skills) {
      if (skill.evidence.length === 0) {
        warnings.push(`Skill "${skill.name}" (${group}) links to no project or role.`);
      }
      for (const id of skill.evidence) {
        if (!projects.has(id) && !experienceIds.has(id)) {
          warnings.push(`Skill "${skill.name}" (${group}) cites "${id}", which is not a project or role.`);
        }
      }
    }
  }
  for (const [slug, data] of projects) {
    const links = (data.links ?? {}) as Record<string, unknown>;
    if (!data.confidential && Object.values(links).every((v) => !v)) {
      warnings.push(`Project "${slug}" is not confidential but has no public evidence links.`);
    }
  }
  return warnings;
}

export function audit(root: string): Audit {
  const files = SCAN_ROOTS.flatMap((r) => walk(root, r))
    .map((f) => relative(root, join(root, f)).replaceAll('\\', '/'))
    .filter((f) => SCAN_EXTENSIONS.test(f) && !IGNORED.some((re) => re.test(f)))
    .sort();

  const result: Audit = { placeholders: [], emptyFrames: [], warnings: [] };
  const projects = new Map<string, Record<string, unknown>>();

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    result.placeholders.push(...findTags(file, source));
    if (file.startsWith('src/content/')) result.emptyFrames.push(...findEmptyFrames(file, source));
    const project = /^src\/content\/projects\/([^/]+)\/index\.md$/.exec(file);
    if (project?.[1]) projects.set(project[1], frontmatter(source));
  }

  const experienceIds = new Set(
    walk(root, 'src/content/experience')
      .filter((f) => f.endsWith('.md'))
      .map((f) => basename(f, '.md')),
  );
  const site = JSON.parse(readFileSync(join(root, 'src/data/site.json'), 'utf8'));
  result.warnings = evidenceWarnings(site, projects, experienceIds);
  return result;
}

export function formatAudit({ placeholders, emptyFrames, warnings }: Audit): string {
  const lines: string[] = [];
  const byFile = Map.groupBy(placeholders, (f) => f.file);
  lines.push(`${placeholders.length} ${EDIT_TAG} placeholder(s) in ${byFile.size} file(s)`);
  for (const [file, findings] of byFile) {
    lines.push(`\n${file}`);
    for (const f of findings) lines.push(`  ${file}:${f.line}  ${f.text}`);
  }
  lines.push(`\n${emptyFrames.length} empty media frame(s)`);
  for (const f of emptyFrames) lines.push(`  ${f.file}:${f.line}  ${f.text}`);
  lines.push(`\n${warnings.length} evidence warning(s)`);
  for (const w of warnings) lines.push(`  ${w}`);
  return lines.join('\n');
}

export const isBlocking = (a: Audit) => a.placeholders.length > 0 || a.emptyFrames.length > 0;
