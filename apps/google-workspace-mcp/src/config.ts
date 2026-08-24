import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
loadEnv({ quiet: true });

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value === 'true');

const schema = z.object({
  MCP_PORT: z.coerce.number().int().positive().default(8788),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_USER_EMAIL: z.string().default('me'),
  JARVIS_DEMO_MODE: booleanFromString,
});

export const env = schema.parse(process.env);

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
