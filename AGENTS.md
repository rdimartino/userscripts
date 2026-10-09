# Repository instructions

## Versioning and releases

- **Do not manually bump an existing userscript's `@version` during development.**
  `tooling/release.ts`, invoked through `npm run release`, owns version increments.
  Only set an initial version for a new script or manually change a version when
  the user explicitly requests that exception.
- Keep versions unchanged while implementing, reviewing, testing, or building
  changes. The pre-commit hook validates versions; its requirement for a higher
  version is not an instruction to pre-bump the header. A manual bump followed by
  the release command would increment the version twice.
- Before releasing, read the release instructions in `README.md` and inspect
  `tooling/release.ts`. Check the working tree and staged diff: the release command
  commits **all staged changes**, and requires no unstaged or untracked files.
  Do not include unrelated work to satisfy that requirement.
- Use `npm run release -- <script>` for an authorized release and publication.
  It bumps, builds, commits, and pushes `main`. Use
  `npm run release -- <script> patch --no-push` only for an authorized local
  release without publication; it still bumps the version and creates a release
  commit. A request to edit, test, or commit code alone does not authorize a
  release.
- Use `all` instead of a script name when releasing helper TypeScript changes
  under `src/` that require every script's version to increase.
- Tooling, webpage, test, and documentation changes do not automatically require
  version bumps. Commit those changes with the hooks enabled. If a build or
  configuration change affects shipped userscripts, release the affected scripts
  explicitly.
- If a release fails after changing a version, inspect its output, the diff, and
  commit history. Finish the remaining build/commit/push steps using the existing
  bump; do not rerun the release command and increment again. If only the push
  failed, retry the push.
- Before handing off ordinary development changes, check that you have not
  introduced a version bump. Preserve version changes that already belonged to
  the user or a release in progress.

## Validation

- `npm run check` checks types and formatting; `npm run build` verifies bundling.
  Neither requires a version bump. Run `npm test` when relevant to the change.
- `dist/` is generated and ignored. Do not edit or commit generated bundles.
