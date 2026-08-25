import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, '../../..');

loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });
loadEnv({ quiet: true });

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value === 'true');

const optionalString = z.string().optional().transform((value) => value || undefined);

const schema = z.object({
  MCP_HOST: z.string().default('127.0.0.1'),
  MCP_PORT: z.coerce.number().int().positive().default(8788),
  JARVIS_MCP_BEARER_TOKEN: optionalString,
  JARVIS_MEMORY_PATH: z.string().default(resolve(repositoryRoot, '.jarvis/memory.json')),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  JARVIS_DEMO_MODE: booleanFromString,
});

export const env = schema.parse(process.env);

export function requireMcpBearerToken(): string {
  if (!env.JARVIS_MCP_BEARER_TOKEN || env.JARVIS_MCP_BEARER_TOKEN.length < 32) {
    throw new Error('JARVIS_MCP_BEARER_TOKEN must contain at least 32 characters');
  }
  return env.JARVIS_MCP_BEARER_TOKEN;
}

export function assertGoogleCredentials(): void {
  if (env.JARVIS_DEMO_MODE) return;

  const missing = [
    ['GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID],
    ['GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET],
    ['GOOGLE_REFRESH_TOKEN', env.GOOGLE_REFRESH_TOKEN],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing Google OAuth configuration: ${missing.join(', ')}`);
  }
}
