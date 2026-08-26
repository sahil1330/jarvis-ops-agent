import { config as loadEnv } from 'dotenv';
import { printResults, redactError, runDoctor } from './doctor-core.js';
import { runGithubDoctor } from './doctor-github.js';

loadEnv({ quiet: true });

async function main(): Promise<void> {
  const allowDemo = process.argv.includes('--allow-demo');
  const [coreResults, githubResults] = await Promise.all([
    runDoctor(process.env, allowDemo),
    runGithubDoctor(process.env),
  ]);
  const results = [...coreResults, ...githubResults];
  printResults(results);
  if (results.some((item) => item.status === 'fail')) process.exitCode = 1;
}

void main().catch((reason) => {
  console.error(`Doctor failed unexpectedly: ${redactError(reason)}`);
  process.exitCode = 1;
});