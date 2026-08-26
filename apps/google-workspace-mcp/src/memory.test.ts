import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStore, writeMemoryFileAtomically } from './memory.js';

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ store: MemoryStore; filePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-memory-'));
  temporaryDirectories.push(directory);
  const filePath = join(directory, 'memory.json');
  return { store: new MemoryStore(filePath), filePath };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('MemoryStore', () => {
  it('persists explicit memories across store instances', async () => {
    const { store, filePath } = await createStore();
    await store.remember('preference.meeting.start_after', '11:00 AM', 'preference');

    const restarted = new MemoryStore(filePath);
    expect(await restarted.recall('meeting after')).toMatchObject([
      { key: 'preference.meeting.start_after', value: '11:00 AM', category: 'preference' },
    ]);

    const onDisk = await readFile(filePath, 'utf8');
    expect(onDisk).toContain('preference.meeting.start_after');
  });

  it('updates a stable key and can forget it', async () => {
    const { store } = await createStore();
    await store.remember('profile.timezone', 'UTC', 'profile');
    await store.remember('profile.timezone', 'Asia/Kolkata', 'profile');

    expect(await store.recall('timezone')).toHaveLength(1);
    expect((await store.recall('timezone'))[0]?.value).toBe('Asia/Kolkata');
    expect(await store.forget('profile.timezone')).toBe(true);
    expect(await store.recall('timezone')).toEqual([]);
  });

  it('serializes concurrent writes from separate store instances that share one file', async () => {
    const { store, filePath } = await createStore();
    const second = new MemoryStore(filePath);
    const third = new MemoryStore(filePath);

    await Promise.all([
      store.remember('preference.one', 'one', 'preference'),
      second.remember('preference.two', 'two', 'preference'),
      third.remember('profile.three', 'three', 'profile'),
    ]);

    const restarted = new MemoryStore(filePath);
    const memories = await restarted.recall('', 20);
    expect(memories.map((memory) => memory.key).sort()).toEqual([
      'preference.one',
      'preference.two',
      'profile.three',
    ]);
  });

  it('removes a generated temp file when the atomic rename fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jarvis-memory-failure-'));
    temporaryDirectories.push(directory);
    const destination = join(directory, 'memory.json');
    await mkdir(destination);
    await writeFile(join(destination, 'keep.txt'), 'force rename failure');

    await expect(writeMemoryFileAtomically(destination, { version: 1, memories: [] })).rejects.toThrow();

    const entries = await readdir(directory);
    expect(entries.filter((entry) => entry.startsWith('memory.json.') && entry.endsWith('.tmp'))).toEqual([]);
  });
});
