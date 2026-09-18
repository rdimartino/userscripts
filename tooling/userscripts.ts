import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

export interface Userscript {
  slug: string;
  path: string;
  source: string;
  header: string;
  name: string;
  namespace: string;
  description: string;
  version: string;
}

export const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const versionLine = /^(\/\/\s+@version\s+)\S+([ \t]*)$/m;

export async function readScripts(): Promise<Userscript[]> {
  const files = (await readdir('src/scripts'))
    .filter((file) => file.endsWith('.user.ts'))
    .sort();
  if (!files.length) throw new Error('No src/scripts/*.user.ts files found.');

  return Promise.all(
    files.map(async (file) => {
      return parseScript(
        `src/scripts/${file}`,
        await readFile(`src/scripts/${file}`, 'utf8'),
      );
    }),
  );
}

export function parseScript(path: string, source: string): Userscript {
  const file = path.split('/').at(-1)!;
  const slug = file.slice(0, -'.user.ts'.length);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`${file}: use lowercase names separated by hyphens.`);
  }
  const header = source.match(
    /^\/\/ ==UserScript==\r?\n[\s\S]*?^\/\/ ==\/UserScript==[ \t]*\r?$/m,
  );
  if (!header || header.index !== 0) {
    throw new Error(`${path}: start the file with a userscript header.`);
  }
  const field = (key: string) =>
    header[0].match(new RegExp(`^//\\s+@${key}\\s+(.+)$`, 'm'))?.[1].trim() ??
    '';
  const version = field('version');
  if (!versionPattern.test(version)) {
    throw new Error(`${path}: @version must be a major.minor.patch version.`);
  }
  for (const key of ['name', 'namespace']) {
    if (!field(key)) throw new Error(`${path}: missing @${key}.`);
  }
  if (!field('match') && !field('include')) {
    throw new Error(`${path}: add at least one @match or @include.`);
  }
  return {
    slug,
    path,
    source,
    header: header[0],
    name: field('name'),
    namespace: field('namespace'),
    description: field('description'),
    version,
  };
}

export function pagesUrl(): string | undefined {
  if (process.env.PAGES_BASE_URL) {
    const url = new URL(process.env.PAGES_BASE_URL);
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('PAGES_BASE_URL must be an HTTP(S) URL.');
    }
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '') + '/';
  }

  let repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      repository = remote.match(
        /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/,
      )?.[1];
    } catch {
      // An origin is optional for local builds.
    }
  }
  if (!repository) return undefined;
  const [owner, name] = repository.split('/');
  if (!owner || !name) throw new Error('Expected a GitHub owner/repository.');
  const host = `${owner.toLowerCase()}.github.io`;
  return `https://${host}/${name.toLowerCase() === host ? '' : `${name}/`}`;
}
