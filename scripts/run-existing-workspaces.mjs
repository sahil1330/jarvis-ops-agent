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
const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workspacePatterns = Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : [];

function containsSource(directory) {
  if (!existsSync(directory)) return false;

  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? containsSource(path) : /\.[cm]?[jt]sx?$/.test(entry.name);
  });
}

for (const pattern of workspacePatterns) {
  const match = pattern.match(/^(.+)\/\*$/);
  if (!match) {
    console.error(`Unsupported workspace pattern: ${pattern}`);
    process.exit(1);
  }

  const workspaceParent = join(root, match[1]);
  if (!existsSync(workspaceParent)) continue;

  for (const entry of readdirSync(workspaceParent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const workspaceDirectory = join(workspaceParent, entry.name);
    const packagePath = join(workspaceDirectory, 'package.json');
    if (!existsSync(packagePath) || !containsSource(join(workspaceDirectory, 'src'))) {
      console.log(`Skipping ${pattern.replace('*', entry.name)}: no implemented source`);
      continue;
    }

    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (!manifest.scripts?.[script]) {
      console.log(`Skipping ${manifest.name}: no ${script} script`);
      continue;
    }

    console.log(`Running ${script} in ${manifest.name}`);
    const result = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', script, '--workspace', manifest.name],
      { cwd: root, stdio: 'inherit' },
    );

    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
