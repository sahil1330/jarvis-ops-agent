import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { env } from './config.js';
import { MemoryStore, type MemoryCategory } from './memory.js';

const store = new MemoryStore(env.JARVIS_MEMORY_PATH);

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

function looksLikeSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return /(?:password|passcode|api[_ -]?key|secret|refresh[_ -]?token|access[_ -]?token|private[_ -]?key)/.test(normalized);
}

export function registerMemoryTools(server: McpServer): void {
  server.registerTool(
    'recall_memories',
    {
      title: 'Recall personal memory',
      description: 'Retrieve explicit user facts and preferences that were previously saved for Jarvis across sessions.',
      inputSchema: {
        query: z.string().max(500).default(''),
        limit: z.number().int().min(1).max(20).default(12),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ query, limit }) => textResult({ memories: await store.recall(query, limit) }),
  );

  server.registerTool(
    'remember_fact',
    {
      title: 'Remember a user fact',
      description: 'Persist a fact only when the user explicitly asks Jarvis to remember it. Never save credentials, authentication secrets, or inferred sensitive information.',
      inputSchema: {
        key: z.string().trim().min(2).max(120).regex(/^[a-z0-9_.-]+$/),
        value: z.string().trim().min(1).max(1_000),
        category: z.enum(['profile', 'relationship', 'preference', 'fact']).default('fact'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ key, value, category }) => {
      if (looksLikeSecret(`${key} ${value}`)) {
        throw new Error('Jarvis memory refuses to store credentials or authentication secrets');
      }
      const memory = await store.remember(key, value, category as MemoryCategory);
      return textResult({ remembered: true, memory });
    },
  );

  server.registerTool(
    'forget_memory',
    {
      title: 'Forget a saved memory',
      description: 'Delete a persistent Jarvis memory when the user explicitly asks to forget it.',
      inputSchema: { key: z.string().trim().min(2).max(120) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ key }) => textResult({ forgotten: await store.forget(key), key }),
  );
}
