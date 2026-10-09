import { mkdir, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { pagesUrl, readScripts } from './userscripts.ts';

async function buildScripts() {
  const scripts = await readScripts();
  const baseUrl = pagesUrl();
  const files = new Map<string, string>();

  for (const script of scripts) {
    let header = script.header.replace(/\r/g, '');
    if (baseUrl) {
      header = header
        .replace(/^\/\/\s+@(?:updateURL|downloadURL)\s+.*\n/gm, '')
        .replace(
          '// ==/UserScript==',
          `// @updateURL    ${baseUrl}${script.slug}.meta.js\n` +
            `// @downloadURL  ${baseUrl}${script.slug}.user.js\n` +
            '// ==/UserScript==',
        );
    }
    const result = await build({
      absWorkingDir: process.cwd(),
      entryPoints: [script.path],
      outfile: `dist/${script.slug}.user.js`,
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
      preserveSymlinks: true,
      write: false,
      banner: { js: header },
      logLevel: 'silent',
    });
    files.set(`${script.slug}.user.js`, result.outputFiles[0].text);
    files.set(`${script.slug}.meta.js`, `${header}\n`);
  }

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

  files.set(
    'index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Userscripts</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { max-width: 42rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; }
      li { margin-block: 1rem; }
    </style>
  </head>
  <body>
    <h1>Userscripts</h1>
    <p>Install <a href="https://www.tampermonkey.net/index.php">Tampermonkey</a>, then select a script to install it.</p>
    <ul>
${scripts
  .map(
    (script) =>
      `      <li><a href="./${script.slug}.user.js">${escapeHtml(script.name)}</a> ` +
      `<small>v${script.version}</small><br>${escapeHtml(script.description)}</li>`,
  )
  .join('\n')}
    </ul>
  </body>
</html>
`,
  );
  files.set('.nojekyll', '');
  return { scripts, files };
}

const { files } = await buildScripts();
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const [name, content] of files) await writeFile(`dist/${name}`, content);
console.log(`Built ${files.size} files in dist/.`);
