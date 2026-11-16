import { createProject } from '@server-planner/model';
import { afterEach, describe, expect, it } from 'vitest';
import { type FileHandle, getFileLink, saveToNewFile, syncLinkedFile } from './fileLink';

/** PRJ-09 save to a file on disk, with a fake File System Access handle. */

function fakeHandle(permission: PermissionState = 'granted') {
  const writes: string[] = [];
  const handle: FileHandle = {
    name: 'lab.json',
    getFile: async () => new File([writes.at(-1) ?? ''], 'lab.json'),
    createWritable: async () => ({
      write: async (data) => {
        writes.push(typeof data === 'string' ? data : await data.text());
      },
      close: async () => {},
    }),
    queryPermission: async () => permission,
    requestPermission: async () => 'granted',
  };
  return { handle, writes };
}

function fakeRepo() {
  const settings = new Map<string, unknown>();
  return {
    getSetting: async <T>(key: string) => settings.get(key) as T | undefined,
    setSetting: async (key: string, value: unknown) => {
      settings.set(key, value);
    },
    listSnapshots: async () => [],
  };
}

const win = window as unknown as Record<string, unknown>;
afterEach(() => {
  delete win.showSaveFilePicker;
});

describe('save to file (PRJ-09)', () => {
  it('writes the project file and remembers the file for later saves', async () => {
    const { handle, writes } = fakeHandle();
    win.showSaveFilePicker = async () => handle;
    const repo = fakeRepo();
    const project = createProject('Lab');
    const link = await saveToNewFile(repo, project);
    expect(link?.name).toBe('lab.json');
    expect(JSON.parse(writes[0] ?? '{}')).toMatchObject({
      format: 'server-planner/project',
      project: { name: 'Lab' },
    });
    expect((await getFileLink(repo, project.id))?.name).toBe('lab.json');
    expect(await syncLinkedFile(repo, { ...project, name: 'Lab 2' })).toBe('synced');
    expect(JSON.parse(writes[1] ?? '{}').project.name).toBe('Lab 2');
  });

  it('does not write without the permission until the user allows it again', async () => {
    const { handle, writes } = fakeHandle('prompt');
    win.showSaveFilePicker = async () => handle;
    const repo = fakeRepo();
    const project = createProject('Lab');
    await saveToNewFile(repo, project);
    expect(await syncLinkedFile(repo, project)).toBe('permission');
    expect(writes).toHaveLength(1);
    expect(await syncLinkedFile(repo, project, true)).toBe('synced');
    expect(writes).toHaveLength(2);
  });

  it('a cancelled picker links nothing', async () => {
    win.showSaveFilePicker = async () => {
      throw new DOMException('aborted', 'AbortError');
    };
    const repo = fakeRepo();
    const project = createProject('Lab');
    expect(await saveToNewFile(repo, project)).toBeUndefined();
    expect(await getFileLink(repo, project.id)).toBeUndefined();
  });
});
