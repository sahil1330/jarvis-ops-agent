import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, '../../..');
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });
loadEnv({ quiet: true });

const schema = z.object({
  GITHUB_MCP_HOST: z.string().default('127.0.0.1'),
  GITHUB_MCP_PORT: z.coerce.number().int().positive().default(8789),
  JARVIS_GITHUB_MCP_BEARER_TOKEN: z.string().min(32),
  JARVIS_GITHUB_TOKEN: z.string().min(20),
  JARVIS_GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  JARVIS_GITHUB_BASE_BRANCH: z.string().min(1).default('demo-product-main'),
});

export const githubEnv = schema.parse(process.env);
