import { execFileSync, spawnSync } from 'node:child_process';
import { parseScript } from './userscripts.ts';

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' });
const paths = (output: string) => output.split('\0').filter(Boolean);
const isScript = (path: string) => /^src\/scripts\/[^/]+\.user\.ts$/.test(path);
const compareVersions = (next: string, previous: string) => {
  const a = next.split('.').map(BigInt);
  const b = previous.split('.').map(BigInt);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
};

try {
  // Read the index directly: an unstaged version bump cannot satisfy the hook.
  const scripts = paths(git('ls-files', '-z', '--', 'src/scripts'))
    .filter(isScript)
    .map((path) => parseScript(path, git('show', `:${path}`)));
  const hasHead =
    spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
      stdio: 'ignore',
    }).status === 0;
  const previousScripts = hasHead
    ? paths(
        git('ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', 'src/scripts'),
      )
        .filter(isScript)
        .map((path) => parseScript(path, git('show', `HEAD:${path}`)))
    : [];
  const changed = new Set(
    paths(git('diff', '--cached', '--name-only', '--no-renames', '-z')),
  );
  // Shared/helper and tooling TypeScript use the simple "bump all" policy.
  const sharedChange = [...changed].some(
    (path) => path.endsWith('.ts') && !isScript(path),
  );
  const errors: string[] = [];

  for (const script of scripts) {
    const previous =
      previousScripts.find((old) => old.path === script.path) ??
      previousScripts.find(
        (old) => old.name === script.name && old.namespace === script.namespace,
      );
    if (!previous) continue; // New scripts just need a valid initial version.
    const needsBump =
      sharedChange || changed.has(script.path) || changed.has(previous.path);
    const comparison = compareVersions(script.version, previous.version);
    if (comparison < 0 || (needsBump && comparison === 0)) {
      errors.push(
        `${script.slug}: @version ${script.version} must be greater than ${previous.version}`,
      );
    }
  }
  if (errors.length) {
    throw new Error(
      `Version check failed:\n${errors.join('\n')}\nBump and stage the affected headers, or use npm run release -- <script|all>.`,
    );
  }
  console.log('Staged script versions are valid.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
