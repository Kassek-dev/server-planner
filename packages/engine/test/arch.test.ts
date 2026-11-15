import { describe, expect, it } from 'vitest';
import { analyze, buildContext } from '../src';
import { homeLab } from './support';

/** SW-12: OS and container image architectures against the CPU (VAL_ARCH, VAL_ARCH_OS). */
describe('architecture compatibility (SW-12)', () => {
  const lab = homeLab();
  const ctx = buildContext(lab);
  const container = Object.values(lab.workloads).find((w) => w.kind === 'container');
  if (container?.kind !== 'container') throw new Error('no container');
  const device = ctx.deviceOfWorkload.get(container.id);
  const arch = device?.hardware.cpus[0]?.arch;
  if (!device || !arch) throw new Error('no cpu');
  const other = arch === 'amd64' ? 'arm64' : 'amd64';
  const codes = (result: ReturnType<typeof analyze>) => result.issues.map((i) => i.code);

  it('flags an image published only for another architecture', () => {
    const result = analyze(lab, { imageArch: { [container.image]: [other] } });
    const found = result.issues.find((i) => i.code === 'VAL_ARCH');
    expect(found?.params).toMatchObject({ container: container.name, arch, supported: other });
    expect(found?.targets).toContainEqual({ type: 'workload', id: container.id });
  });

  it('accepts multi-arch and unknown images', () => {
    expect(
      codes(analyze(lab, { imageArch: { [container.image]: ['amd64', 'arm64'] } })),
    ).not.toContain('VAL_ARCH');
    expect(codes(analyze(lab))).not.toContain('VAL_ARCH');
  });

  it('flags a host OS that does not install on the CPU', () => {
    if (!device.os) throw new Error('no os');
    const result = analyze(lab, { osArch: { [device.os.osId]: [other] } });
    expect(result.issues.find((i) => i.code === 'VAL_ARCH_OS')?.params).toMatchObject({
      host: device.name,
      arch,
    });
  });
});
