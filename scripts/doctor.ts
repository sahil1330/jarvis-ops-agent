import { config as loadEnv } from 'dotenv';
import { printResults, redactError, runDoctor } from './doctor-core.js';

loadEnv({ quiet: true });

async function main(): Promise<void> {
  const allowDemo = process.argv.includes('--allow-demo');
  const results = await runDoctor(process.env, allowDemo);
  printResults(results);
  if (results.some((item) => item.status === 'fail')) process.exitCode = 1;
}

void main().catch((reason) => {
  console.error(`Doctor failed unexpectedly: ${redactError(reason)}`);
  process.exitCode = 1;
});
