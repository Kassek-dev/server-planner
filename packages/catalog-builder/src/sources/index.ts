import { awesomeSelfhostedSource } from './awesomeSelfhosted';
import { blenderSource } from './blender';
import { communityScriptsSource } from './communityScripts';
import { linuxserverSource } from './linuxserver';
import type { SourceAdapter } from './types';

/** All sources with their request budgets per weekly run (docs/06 § 4). */
export const SOURCES: { adapter: SourceAdapter; budget: number }[] = [
  { adapter: linuxserverSource, budget: 3 },
  { adapter: awesomeSelfhostedSource, budget: 3 },
  { adapter: communityScriptsSource, budget: 3 },
  { adapter: blenderSource, budget: 3 },
];
