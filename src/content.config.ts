import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { architecture, experienceSchema, projectSchema } from './lib/schemas';

// One folder per project: index.md holds the frontmatter and prose,
// architecture.yaml holds the diagram data (rendered as SVG and in 3D).
const folderId = ({ entry }: { entry: string }) => entry.split('/', 1)[0] ?? entry;

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '*/index.md', generateId: folderId }),
  schema: ({ image }) => projectSchema(image()).extend({ architecture: reference('architectures') }),
});

const architectures = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '*/architecture.yaml', generateId: folderId }),
  schema: architecture,
});

const experience = defineCollection({
  loader: glob({ base: './src/content/experience', pattern: '*.md' }),
  schema: experienceSchema,
});

export const collections = { projects, architectures, experience };
