import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const script = process.argv[2];

if (!script) {
  console.error('Usage: node scripts/run-existing-workspaces.mjs <script>');
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appsDirectory = join(root, 'apps');

function containsSource(directory) {
  if (!existsSync(directory)) return false;

  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? containsSource(path) : /\.[cm]?[jt]sx?$/.test(entry.name);
  });
}

for (const entry of readdirSync(appsDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const workspaceDirectory = join(appsDirectory, entry.name);
  const packagePath = join(workspaceDirectory, 'package.json');
  if (!existsSync(packagePath) || !containsSource(join(workspaceDirectory, 'src'))) continue;

  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (!manifest.scripts?.[script]) continue;

  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', script, '--workspace', manifest.name],
    { cwd: root, stdio: 'inherit' },
  );

  if (result.status !== 0) process.exit(result.status ?? 1);
}
