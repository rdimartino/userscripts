import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { readScripts, versionLine } from './userscripts.ts';

const args = process.argv.slice(2);
const push = !args.includes('--no-push');
const [target, bump = 'patch', ...extra] = args.filter(
  (arg) => arg !== '--no-push',
);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { stdio: 'inherit' });
const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

let bumped = false;
let committed = false;

try {
  if (!target || extra.length || !['patch', 'minor', 'major'].includes(bump)) {
    throw new Error(
      'Usage: npm run release -- <script|all> [patch|minor|major] [--no-push]',
    );
  }
  const scripts = await readScripts();
  const selected = scripts.filter(
    (script) => target === 'all' || script.slug === target,
  );
  if (!selected.length) {
    throw new Error(
      `Unknown script "${target}". Available: ${scripts.map((script) => script.slug).join(', ')}`,
    );
  }

  if (push) {
    if (git('branch', '--show-current') !== 'main') {
      throw new Error(
        'Publish from main, or use --no-push to make a release commit on this branch.',
      );
    }
    git('remote', 'get-url', 'origin');
  }

  // Require the working tree to match the index so validation covers exactly
  // what will be committed. Generated dist/ is ignored by Git.
  const status = execFileSync('git', ['status', '--porcelain=v1', '-z'], {
    encoding: 'utf8',
  }).split('\0');
  for (let index = 0; index < status.length; index++) {
    const entry = status[index];
    if (!entry) continue;
    if (entry[1] !== ' ' || !'AMDRCT'.includes(entry[0])) {
      throw new Error(
        'Stage your changes with git add first; unstaged or untracked files remain.',
      );
    }
    if (entry[0] === 'R' || entry[0] === 'C') index++;
  }

  run(npm, ['exec', 'lint-staged']);
  run(npm, ['run', 'check']);

  // Read again because lint-staged may have formatted the entry points.
  const releases = (await readScripts()).filter((script) =>
    selected.some((selectedScript) => selectedScript.slug === script.slug),
  );
  const labels: string[] = [];
  for (const script of releases) {
    const parts = script.version.split('.').map(BigInt);
    const position = { major: 0, minor: 1, patch: 2 }[bump]!;
    parts[position]++;
    for (let index = position + 1; index < parts.length; index++)
      parts[index] = 0n;
    const nextVersion = parts.join('.');
    const header = script.header.replace(
      versionLine,
      (_, prefix: string, suffix: string) => `${prefix}${nextVersion}${suffix}`,
    );
    await writeFile(
      script.path,
      header + script.source.slice(script.header.length),
    );
    bumped = true;
    labels.push(`${script.slug} v${nextVersion}`);
  }

  run(npm, ['run', 'build']);
  run('git', ['add', '--', ...releases.map((script) => script.path)]);
  run('git', ['commit', '-m', `chore: release ${labels.join(', ')}`]);
  committed = true;

  if (push) {
    run('git', ['push', '-u', 'origin', 'main']);
    console.log(
      'Pushed. The GitHub Actions Pages workflow will publish the scripts.',
    );
  } else {
    console.log('Release committed locally. Push main to publish.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (committed) {
    console.error(
      'The release commit exists. Retry git push -u origin main; do not bump again.',
    );
  } else if (bumped) {
    console.error(
      'Version edits are saved. Fix the error, then build, stage, commit, and push without bumping again.',
    );
  }
  process.exitCode = 1;
}
