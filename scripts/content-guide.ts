// Writes CONTENT_GUIDE.md (BRIEF.md section 10): every remaining [EDIT]
// placeholder grouped by file, what real information belongs in that file
// with one example of a strong answer, the ten items to fill first, and a
// checklist for confidential work. The lists come from the same audit the
// build uses, so the guide can't drift from the content.
//
//   npm run content-guide
//
// scripts/content-guide.test.ts fails when the guide is out of date.
import { writeFileSync } from 'node:fs';
import { EDIT_TAG, audit, type Finding } from './content-audit.ts';

interface Guidance {
  match: RegExp;
  title: string;
  belongs: string;
  example: string;
}

// Most specific first: the first match wins.
const GUIDANCE: Guidance[] = [
  {
    match: /^src\/data\/site\.json$/,
    title: 'Site facts',
    belongs:
      'Your name, current title and company, years of experience, one positioning line, location and availability, contact links, three or four impact lines, skills with the work that proves each, education and awards. Every page and the résumé read from this file.',
    example:
      '"I cut checkout p95 latency from 1.4 s to 380 ms for 2 million monthly users, measured by RUM over 30 days, by moving pricing to an edge cache." One sentence, one number with its measurement, one cause.',
  },
  {
    match: /^src\/content\/experience\//,
    title: 'Roles',
    belongs:
      'The real company, your exact title, start and end months, one factual line about the company (no rankings or superlatives unless sourced), and highlights in the form "did X, measured by Y, by doing Z".',
    example:
      '"Cut nightly batch runtime from 6 h to 50 min, measured on the scheduler\'s run history for a month, by partitioning the job by region and caching reference data."',
  },
  {
    match: /^src\/content\/projects\/predictive-maintenance\//,
    title: 'Confidential project',
    belongs:
      'Work you can describe only in general terms. Keep the outcome and the method; drop the customer, internal names, exact volumes and anything a competitor could use. Run the confidential checklist below before publishing.',
    example:
      '"Cut false maintenance alarms by 30% at the same recall, on a held-out six-month period" says what changed and how it was measured without naming the customer or the plant.',
  },
  {
    match: /^src\/content\/projects\/this-site\//,
    title: 'This site',
    belongs:
      'Its numbers are measured, so they carry no placeholders. What remains is yours to supply: the public repository link, the upstream three.js issue link once filed, and a cover still captured from the high tier on a machine with a GPU.',
    example: '`repo: https://github.com/<you>/portfolio` and the issue URL from docs/upstream/.',
  },
  {
    match: /^src\/content\/projects\//,
    title: 'Project',
    belongs:
      'Replace the seed with one of your own projects, or delete the folder. The title is the outcome. Every metric needs its baseline and how it was measured. Decisions need real options, the trade-off you accepted and the evidence. Link the code, a demo or a write-up; if none can be public, mark the project confidential.',
    example:
      'Title: "Cut invoice processing time from 3 days to 4 hours". Metric: value "4 h", baseline "3 days", measuredBy "median over 1,200 invoices in May, from the queue timestamps".',
  },
  {
    match: /^src\/pages\/contact\.astro$/,
    title: 'Contact page',
    belongs: 'How and how quickly you reply, in your own words.',
    example: '"Email is the quickest way to reach me; I reply within two working days."',
  },
  {
    match: /^public\/lab\/attention\.json$/,
    title: 'Lab attention data',
    belongs:
      'Real attention from distilgpt2 in place of the rule-based sample. Run `pip install torch transformers`, then `npm run precompute-attention`, which overwrites the file (about a 350 MB model download, once).',
    example: 'The regenerated file has `"source": "model"` and no note.',
  },
];

/** The ten placeholders to fill first, in order: what a recruiter sees in the first 30 seconds. */
export const TOP_TEN: { what: string; where: string }[] = [
  { what: 'Your name', where: 'src/data/site.json `name` (also the site URL, `siteUrl`)' },
  { what: 'Your email address', where: 'src/data/site.json `links.email`' },
  { what: 'GitHub and LinkedIn', where: 'src/data/site.json `links.github`, `links.linkedin`' },
  { what: 'Current title and company', where: 'src/data/site.json `current`, and `yearsExperience`' },
  { what: 'Your positioning line', where: 'src/data/site.json `positioning`' },
  { what: 'Three impact lines with measured numbers', where: 'src/data/site.json `impact`' },
  { what: 'Availability and location', where: 'src/data/site.json `availability`, `location`' },
  {
    what: 'Your current role: title, dates, highlights',
    where: 'src/content/experience/halden-systems.md (rename the file to your company)',
  },
  {
    what: 'Your three strongest projects: outcome title and headline metric',
    where: 'src/content/projects/<slug>/index.md, starting with the featured ones',
  },
  {
    what: 'The public repository link for this site',
    where: 'src/content/projects/this-site/index.md `links.repo`',
  },
];

const CONFIDENTIAL = [
  'No customer, partner or product names unless they are already public and you have permission.',
  'No internal system, service or team names, and no code or configuration copied from work.',
  'No exact volumes, revenue, prices or headcounts; use relative changes ("cut false alarms by 30%").',
  'Screenshots: no real data, dashboards with real values, URLs, or people. Recreate them with synthetic data.',
  'Architecture: generic component names ("model server", "queue"), not product or cluster names.',
  'Check your employment agreement and ask your manager if unsure; leave the project out if in doubt.',
  'Set `confidential: true` and leave `links` empty, so the build expects no public evidence.',
];

const excerpt = (f: Finding) => {
  const text = f.text.length > 150 ? `${f.text.slice(0, 147)}…` : f.text;
  return text.replaceAll('|', '\\|');
};

export function renderGuide(root = process.cwd()): string {
  const result = audit(root);
  const byFile = Map.groupBy(result.placeholders, (f) => f.file);
  const frames = Map.groupBy(result.emptyFrames, (f) => f.file);
  const files = [...new Set([...byFile.keys(), ...frames.keys()])].sort();
  const out: string[] = [];

  out.push('# Content guide');
  out.push('');
  out.push(
    `Generated by \`npm run content-guide\` from the same audit the build uses. It lists every remaining ${EDIT_TAG} placeholder (${result.placeholders.length} in ${byFile.size} files) and every empty media frame (${result.emptyFrames.length}). A production build fails until both lists are empty; preview builds show each placeholder as a badge.`,
  );
  out.push('');
  out.push(
    'After editing: `npm run check-content` to see what is left, `npm run resume-pdf` and `npm run og-images` to regenerate the résumé and social cards (both read the content), then `npm run content-guide` to refresh this file.',
  );
  out.push('');
  out.push('## Fill these ten first');
  out.push('');
  TOP_TEN.forEach((t, i) => out.push(`${i + 1}. **${t.what}.** ${t.where}.`));
  out.push('');
  out.push('## Confidential work checklist');
  out.push('');
  for (const c of CONFIDENTIAL) out.push(`- [ ] ${c}`);
  out.push('');
  out.push('## Every placeholder, by file');

  for (const file of files) {
    const g = GUIDANCE.find((x) => x.match.test(file));
    const tags = byFile.get(file) ?? [];
    const empty = frames.get(file) ?? [];
    out.push('');
    out.push(`### ${file}`);
    out.push('');
    if (g) {
      out.push(`**${g.title}.** ${g.belongs}`);
      out.push('');
      out.push(`A strong answer: ${g.example}`);
      out.push('');
    }
    if (tags.length) {
      out.push(`${tags.length} placeholder${tags.length === 1 ? '' : 's'}:`);
      out.push('');
      out.push('| Line | Currently |');
      out.push('|---|---|');
      for (const f of tags) out.push(`| ${f.line} | ${excerpt(f)} |`);
      out.push('');
    }
    if (empty.length) {
      out.push(
        `${empty.length} empty media frame${empty.length === 1 ? '' : 's'} (add the file and its alt text):`,
      );
      out.push('');
      for (const f of empty) out.push(`- line ${f.line}: ${excerpt(f)}`);
      out.push('');
    }
  }
  if (result.warnings.length) {
    out.push('');
    out.push('## Evidence warnings');
    out.push('');
    for (const w of result.warnings) out.push(`- ${w}`);
  }
  return `${out.join('\n').trimEnd()}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync('CONTENT_GUIDE.md', renderGuide());
  console.log('Wrote CONTENT_GUIDE.md');
}
