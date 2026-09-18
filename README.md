# Userscripts

Small TypeScript Tampermonkey scripts, bundled individually with esbuild and
built/published by GitHub Actions to GitHub Pages. Each script owns its version.
Shared helpers are bundled into each script; `dist/` is generated and ignored by Git.

## Setup

```sh
nvm install
nvm use
npm install
npm run build
```

Node 26 is selected by `.nvmrc`. Build and release tools are also TypeScript,
executed directly by Node. Installing dependencies enables the Git hooks.

## Development

- `src/scripts/*.user.ts` — one entry point per script, with a Tampermonkey header.
- `src/shared/` — reusable helpers imported by scripts.
- `dist/` — standalone `.user.js` files, `.meta.js` update headers, and an install page.

Copy `src/scripts/example.user.ts` to add a script. Use a lowercase, hyphenated
filename such as `clean-links.user.ts`. Edit its name, namespace, description,
match patterns, and grants. Versions use `major.minor.patch`. Keep each script's
namespace/name combination unique and stable for updates. The example adds a
purple border on `https://example.com/`.

Import shared helpers normally:

```ts
import { addStyle } from '../shared/dom';
```

Tampermonkey API types are available. Add appropriate `@grant` entries when using
privileged APIs.

```sh
npm run dev          # Rebuild when source or tooling changes
npm run build        # Build all standalone scripts locally
npm run format       # Format the project
npm run check        # Type-check and verify formatting
npm run check:staged # Check versions in the Git index
npm test             # Exercise hooks and releases in a temporary Git repository
```

Prettier formats staged files on commit. VS Code also formats on save with the
recommended Prettier extension. `npm run dev` rebuilds files but does not reload
Tampermonkey. For local testing, paste `dist/example.user.js` into the Tampermonkey
editor and reload the matching page.

## Version checks on commit

The pre-commit hook checks **staged** headers against `HEAD`:

- Editing an existing script requires a strictly higher `@version`, including
  comment-only edits. Version downgrades are rejected.
- Changing shared/helper or tooling TypeScript requires bumps for all existing
  scripts. This simple rule covers added, modified, and deleted helpers.
- New scripts need a valid initial version. Renaming a script while retaining its
  namespace/name preserves version history.
- Unrelated changes, such as documentation, do not require version bumps.

An unstaged bump cannot satisfy the check. The hook validates versions; it does
not automatically choose a new version. Edit and stage the header yourself, or
use the release command below. No local build or committed `dist/` is required
for a normal commit; Actions runs checks, tests, and a fresh build.

## Release changes

Stage your edits, then name the script without `.user.ts`:

```sh
git add src/scripts/example.user.ts
npm run release -- example          # Patch bump, commit, push main
npm run release -- example minor
npm run release -- example major
```

The command formats staged files, checks the project, bumps the selected header,
builds locally to verify it, and commits the bump **and all staged changes**.
It then pushes `main` to `origin`, triggering the Actions build and deployment.
Generated files are not committed. Unstaged/untracked source must be staged first.

For shared changes, bump all scripts:

```sh
git add src/shared/dom.ts
npm run release -- all
```

Use `--no-push` to create a release commit locally, including on a feature branch:

```sh
npm run release -- example patch --no-push
```

Merge/push to `main` to publish. If pushing fails after the commit, retry
`git push -u origin main` instead of releasing again. If a later build or commit
fails after the version edit, the edits remain available: fix the issue, build,
stage, and commit without bumping a second time.

## GitHub Pages

1. Create a GitHub repository and add it as `origin`.
2. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. Commit the project and push `main`:

   ```sh
   git add .
   git commit -m "Set up userscripts"
   git push -u origin main
   ```

Actions installs dependencies, runs checks and tests, builds the scripts, and
publishes `dist/`. Pull requests run checks, tests, and builds without deploying.
Watch the **Actions** tab for completion. The Pages site lists installation links;
click a `.user.js` link with Tampermonkey installed.

The workflow supplies the actual Pages URL, including custom domains, for
`@updateURL` and `@downloadURL`. Local builds infer the default URL from a GitHub
`origin`, or you can override it:

```sh
PAGES_BASE_URL=https://scripts.example.com/ npm run build
```

Without an origin or override, local builds omit generated update URLs. Nothing
is deployed by running a local build.
