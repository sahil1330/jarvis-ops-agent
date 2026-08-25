import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
loadEnv({ quiet: true });

const optionalString = z.string().optional().transform((value) => value || undefined);

export const env = z
  .object({
    ORCHESTRATOR_PORT: z.coerce.number().int().positive().default(8787),
    CONTROL_CENTER_ORIGIN: z.string().default('http://localhost:5173'),
    TRUEFORGE_BASE_URL: z.url().default('http://localhost:8790'),
    TRUEFORGE_TOKEN: optionalString,
    JARVIS_AGENT_NAME: z.string().default('jarvis-personal-ops'),
    OPENAI_API_KEY: optionalString,
    OPENAI_STT_MODEL: z.string().default('gpt-4o-mini-transcribe'),
    OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
    OPENAI_TTS_VOICE: z.string().default('cedar'),
    JARVIS_DEMO_MODE: z
      .string()
      .optional()
      .transform((value) => value === 'true'),
  })
  .parse(process.env);
