import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type MemoryCategory = 'profile' | 'relationship' | 'preference' | 'fact';

export type MemoryRecord = {
  key: string;
  value: string;
  category: MemoryCategory;
  updatedAt: string;
};

export type MemoryFile = { version: 1; memories: MemoryRecord[] };

const pathQueues = new Map<string, Promise<unknown>>();

function normalizedTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

export async function writeMemoryFileAtomically(filePath: string, file: MemoryFile): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

export class MemoryStore {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<MemoryFile> {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<MemoryFile>;
      return {
        version: 1,
        memories: Array.isArray(payload.memories) ? payload.memories.filter((item): item is MemoryRecord => (
          typeof item?.key === 'string' &&
          typeof item?.value === 'string' &&
          typeof item?.category === 'string' &&
          typeof item?.updatedAt === 'string'
        )) : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, memories: [] };
      throw error;
    }
  }

  private async write(file: MemoryFile): Promise<void> {
    await writeMemoryFileAtomically(this.filePath, file);
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = pathQueues.get(this.filePath) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(() => undefined, () => undefined);
    pathQueues.set(this.filePath, settled);
    void settled.finally(() => {
      if (pathQueues.get(this.filePath) === settled) pathQueues.delete(this.filePath);
    });
    return next;
  }

  async remember(key: string, value: string, category: MemoryCategory): Promise<MemoryRecord> {
    return this.serialized(async () => {
      const file = await this.read();
      const record: MemoryRecord = { key, value, category, updatedAt: new Date().toISOString() };
      const withoutPrevious = file.memories.filter((item) => item.key !== key);
      await this.write({ version: 1, memories: [...withoutPrevious, record].slice(-200) });
      return record;
    });
  }

  async forget(key: string): Promise<boolean> {
    return this.serialized(async () => {
      const file = await this.read();
      const next = file.memories.filter((item) => item.key !== key);
      if (next.length === file.memories.length) return false;
      await this.write({ version: 1, memories: next });
      return true;
    });
  }

  async recall(query = '', limit = 12): Promise<MemoryRecord[]> {
    const file = await this.read();
    const terms = normalizedTerms(query);
    if (terms.length === 0) return file.memories.slice(-limit).reverse();

    return file.memories
      .map((memory) => {
        const haystack = `${memory.key} ${memory.value} ${memory.category}`.toLowerCase();
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { memory, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.memory.updatedAt.localeCompare(left.memory.updatedAt))
      .slice(0, limit)
      .map((item) => item.memory);
  }
}
