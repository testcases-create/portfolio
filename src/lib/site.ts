import raw from '../data/site.json';
import { siteSchema } from './schemas';

/** Site data, validated at build time: a malformed site.json fails the build. */
export const site = siteSchema.parse(raw);
