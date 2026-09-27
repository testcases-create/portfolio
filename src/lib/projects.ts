// Project queries shared by pages. Everything here runs at build time.
import { getCollection, type CollectionEntry } from 'astro:content';
import { AREAS, type Area } from './schemas';

export type Project = CollectionEntry<'projects'>;

export const AREA_LABEL: Record<Area, string> = { sde: 'SDE', llm: 'LLM', ml: 'AI/ML' };
/** The heading a group of projects gets on Home, by area. */
export const AREA_HEADING: Record<Area, string> = {
  ml: 'Models trained and shipped',
  llm: 'Language systems',
  sde: 'Services that stay up',
};

export async function allProjects(): Promise<Project[]> {
  return (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
}

/** A project's primary area: the first one listed. */
export const primaryArea = (p: Project): Area => p.data.areas[0] ?? 'sde';

/**
 * Featured projects grouped by primary area. With a lens, that area comes
 * first; otherwise the order follows the Home scroll: AI/ML, LLM, SDE.
 */
export async function featuredByArea(lens?: Area): Promise<{ area: Area; projects: Project[] }[]> {
  const featured = (await allProjects()).filter((p) => p.data.featured);
  const order: Area[] = lens
    ? [lens, ...(['ml', 'llm', 'sde'] as Area[]).filter((a) => a !== lens)]
    : ['ml', 'llm', 'sde'];
  return order
    .map((area) => ({ area, projects: featured.filter((p) => primaryArea(p) === area) }))
    .filter((g) => g.projects.length > 0);
}

export { AREAS };
