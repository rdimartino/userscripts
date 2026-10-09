import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));

test('version hooks and releases', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'userscripts-test-'));
  const repo = join(temp, 'work');
  mkdirSync(repo);
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  for (const path of [
    'package.json',
    'package-lock.json',
    '.npmrc',
    '.nvmrc',
    '.gitignore',
    '.prettierrc.json',
    '.prettierignore',
    '.husky/pre-commit',
    'tsconfig.json',
    'README.md',
    'tooling',
  ]) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    cpSync(join(project, path), join(repo, path), { recursive: true });
  }
  symlinkSync(join(project, 'node_modules'), join(repo, 'node_modules'), 'dir');
  const options = {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      HUSKY: '1',
      PAGES_BASE_URL: 'https://test.github.io/scripts/',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  const run = (command, args) => {
    const result = spawnSync(command, args, options);
    assert.equal(
      result.status,
      0,
      `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
    );
    return result.stdout.trim();
  };
  const git = (...args) => run('git', args);
  const read = (path) => readFileSync(join(repo, path), 'utf8');
  const write = (path, content) => writeFileSync(join(repo, path), content);
  const edit = (path, from, to) => write(path, read(path).replace(from, to));
  const check = () => run(process.execPath, ['tooling/check-staged.ts']);
  const reject = (pattern) => {
    const result = spawnSync(
      process.execPath,
      ['tooling/check-staged.ts'],
      options,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
  };
  const example = 'src/scripts/example.user.ts';
  const second = 'src/scripts/second.user.ts';
  const bump = (path) => edit(path, '0.1.0', '0.1.1');

  // Keep release fixtures independent of the real collection of userscripts.
  mkdirSync(join(repo, 'src/scripts'), { recursive: true });
  mkdirSync(join(repo, 'src/shared'), { recursive: true });
  write(
    'src/shared/dom.ts',
    `export function addStyle(css: string) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
}
`,
  );
  write(
    example,
    `// ==UserScript==
// @name         Example userscript
// @namespace    local.userscripts
// @version      0.1.0
// @match        https://example.com/*
// @grant        none
// ==/UserScript==

import { addStyle } from '../shared/dom';

addStyle('body { border-top: 4px solid rebeccapurple; }');
`,
  );

  git('init', '-b', 'main');
  git('config', 'user.name', 'Userscripts test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  write(
    second,
    read(example).replace('Example userscript', 'Second userscript'),
  );
  run('npm', ['run', 'prepare']);
  run('npm', ['run', 'format']);
  git('add', '.');
  git('commit', '-m', 'Initial scripts'); // A real hook must accept the first commit.
  const baseline = git('rev-parse', 'HEAD');
  t.beforeEach(() => {
    git('reset', '--hard', baseline);
    git('clean', '-fd');
  });

  await t.test(
    'unrelated commits need no script bump and still run Prettier',
    () => {
      write('note.json', '{"ok":true}\n');
      git('add', 'note.json');
      git('commit', '-m', 'Add note');
      assert.equal(read('note.json'), '{ "ok": true }\n');
      assert.equal(git('status', '--porcelain'), '');
    },
  );

  await t.test('tooling and install-page edits need no script bump', () => {
    edit(
      'tooling/build.ts',
      '<title>Userscripts</title>',
      '<title>Install userscripts</title>',
    );
    write(
      'tooling/check-staged.ts',
      read('tooling/check-staged.ts') + '\n// Tooling-only change.\n',
    );
    git('add', 'tooling');
    git('commit', '-m', 'Update install page and tooling');
    assert.equal(git('diff', baseline, 'HEAD', '--', 'src'), '');
    assert.equal(git('status', '--porcelain'), '');
  });

  await t.test('TypeScript tests need no script bump', () => {
    mkdirSync(join(repo, 'test'));
    write('test/helper.ts', 'export const fixture={ok:true};\n');
    git('add', 'test');
    git('commit', '-m', 'Add test helper');
    assert.equal(
      read('test/helper.ts'),
      'export const fixture = { ok: true };\n',
    );
    assert.equal(git('diff', baseline, 'HEAD', '--', 'src'), '');
    assert.equal(git('status', '--porcelain'), '');
  });

  await t.test('script edits require a strictly higher staged version', () => {
    edit(example, 'rebeccapurple', 'purple');
    git('add', example);
    const index = git('write-tree');
    reject(/example: @version 0\.1\.0 must be greater than 0\.1\.0/);
    assert.equal(git('write-tree'), index);
    bump(example); // An unstaged bump must not let the original index pass.
    reject(/example: @version 0\.1\.0/);
    git('add', example);
    check();
    edit(example, '0.1.1', '0.0.9');
    git('add', example);
    reject(/must be greater than 0\.1\.0/);
  });

  await t.test(
    'a mixed tooling and script commit rejects a missing bump',
    () => {
      edit(example, 'rebeccapurple', 'purple');
      edit(
        'tooling/build.ts',
        '<title>Userscripts</title>',
        '<title>Install userscripts</title>',
      );
      git('add', example, 'tooling/build.ts');
      const result = spawnSync(
        'git',
        ['commit', '-m', 'Missing bump'],
        options,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /Version check failed/);
      assert.equal(git('rev-parse', 'HEAD'), baseline);
    },
  );

  await t.test('a valid partial commit preserves unstaged source', () => {
    bump(example);
    git('add', example);
    const staged = git('show', `:${example}`);
    write(example, read(example) + '\n// Unstaged work stays local.\n');
    const working = read(example);
    check();
    git('commit', '-m', 'Bump example');
    assert.equal(read(example), working);
    assert.equal(git('show', `HEAD:${example}`), staged);
  });

  await t.test(
    'shared changes require all existing scripts to increase',
    () => {
      write(
        'src/shared/dom.ts',
        read('src/shared/dom.ts') + '\n// Shared change.\n',
      );
      bump(example);
      git('add', 'src');
      reject(/second: @version 0\.1\.0/);
      bump(second);
      git('add', second);
      check();
    },
  );

  for (const change of ['add', 'delete', 'move']) {
    await t.test(
      `${change} runtime helper requires all scripts to increase`,
      () => {
        if (change === 'add') {
          write('src/scripts/helper.ts', 'export const enabled = true;\n');
          git('add', 'src/scripts/helper.ts');
        } else if (change === 'delete') {
          git('rm', 'src/shared/dom.ts');
        } else {
          git('mv', 'src/shared/dom.ts', 'tooling/dom.ts');
        }
        bump(example);
        git('add', example);
        reject(/second: @version 0\.1\.0/);
        bump(second);
        git('add', second);
        check();
      },
    );
  }

  await t.test(
    'new scripts need only an initial version; renames preserve history',
    () => {
      write(
        'src/scripts/new.user.ts',
        read(example).replace('Example userscript', 'New userscript'),
      );
      git('add', 'src/scripts/new.user.ts');
      check();
      git('mv', example, 'src/scripts/renamed.user.ts');
      reject(/renamed: @version 0\.1\.0/);
      bump('src/scripts/renamed.user.ts');
      git('add', 'src/scripts/renamed.user.ts');
      check();
    },
  );

  await t.test(
    'releases bump, build, commit source, and push without tracking dist',
    () => {
      const remote = join(temp, 'origin.git');
      run('git', ['init', '--bare', remote]);
      git('remote', 'add', 'origin', remote);
      edit(example, 'rebeccapurple', 'purple');
      git('add', example);
      run(process.execPath, ['tooling/release.ts', 'example']);
      assert.match(read(example), /@version\s+0\.1\.1/);
      assert.match(read(second), /@version\s+0\.1\.0/);
      assert.equal(git('ls-files', 'dist'), '');
      assert.equal(git('status', '--porcelain'), '');
      assert.equal(
        run('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main']),
        git('rev-parse', 'HEAD'),
      );
      assert.match(
        read('dist/example.user.js'),
        /@downloadURL\s+https:\/\/test.github.io\/scripts\/example.user.js/,
      );
      assert.match(read('dist/example.user.js'), /function addStyle/);
      assert.doesNotMatch(
        read('dist/example.user.js'),
        /^\s*(?:import|export) /m,
      );
      run(process.execPath, [
        'tooling/release.ts',
        'all',
        'minor',
        '--no-push',
      ]);
      assert.match(read(example), /@version\s+0\.2\.0/);
      assert.match(read(second), /@version\s+0\.2\.0/);
    },
  );
});
