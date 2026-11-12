import { createFromTemplate, PROJECT_TEMPLATES, ProjectSchema } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { analyze } from './support';

describe('starter templates (PRJ-08)', () => {
  it.each(PROJECT_TEMPLATES)('%s is a valid project without errors', (template) => {
    const project = createFromTemplate(template, 'Lab');
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    const errors = analyze(project).issues.filter((i) => i.severity === 'error');
    expect(errors.map((i) => [i.code, i.params])).toEqual([]);
  });

  it('segmentation template gives IoT internet but no LAN access', () => {
    const project = createFromTemplate('iot-segmentation', 'Lab');
    expect(
      Object.values(project.zones)
        .map((z) => z.name)
        .sort(),
    ).toEqual(['Guest', 'IoT', 'LAN', 'Mgmt', 'WAN']);
  });
});
