# <FILL: project name>

<FILL: one sentence saying what this project is and who it serves.>

Every `<FILL: ...>` marker below is a placeholder. Replace it or delete the line. A marker left in place is a line Claude reads literally on every turn.

This file holds only what must be true on every turn and fits in a sentence: stack, conventions, the glossary pointer, and where work lives. It stays under 200 lines. Procedures are skills, not entries here. Conventions that apply only to some files belong in `.claude/rules/<name>.md` with a `paths:` header, so they load when those files are open rather than always.

## Stack

- Language and runtime: <FILL: e.g. TypeScript on Node 22>
- Framework: <FILL: e.g. Electron plus React 19>
- Data: <FILL: e.g. Drizzle over SQLite>
- API: <FILL: e.g. Fastify>
- Styling: <FILL: e.g. Tailwind>
- Tests: <FILL: e.g. Vitest, run with npm test>
- Build and run: <FILL: the one command that builds and the one that runs>

## Gates

The checks that prove a change, one `name: command` per line in the `gates` block below. The coder runs them before its handoff, and the reviewer may run them and nothing else that executes code, so write each exactly as it should run: from the repository root, calling the binary directly as `./node_modules/.bin/<tool>`, never through `npm`, `pnpm`, `yarn`, `bun` or `npx`, since a package manager may install first. The reviewer's hook refuses, whatever this block says, a package manager, an install, a snapshot update, `--fix` or `--write`, watch mode, build output inside the repository (a typecheck passes `--noEmit`, or an `--outDir` under the scratchpad or `TMPDIR`), a network tool, and any run in the main checkout rather than a linked worktree. The gate named `test` is the test runner, and the only one the reviewer may also run with one relative path, one test name (`-t` for vitest and jest, `--test-name-pattern` for `node --test`), or both, after it. No `$`, quotes, globs, braces or variable assignments, except a literal `CI=true` as a gate's first word. Make every gate write nothing. Outside CI, vitest and jest write any snapshot that does not exist yet, so start the test gate with `CI=true`: vitest 3 resolves `updateSnapshot: isCI && !UPDATE_SNAPSHOT ? 'none' : ...` (v3.2.4, `packages/vitest/src/node/config/resolveConfig.ts`), vitest 4 treats an unset `update` as `'none'` in CI (vitest.dev/config/update), and jest defaults `ci: isCI` (v29.7.0, `packages/jest-config/src/Defaults.ts`), under which "it will fail the test" rather than store a new snapshot (jestjs.io/docs/cli). Do not use vitest's `--update=none`, which the hook refuses: vitest 4.x reads the value (checked in 4.1.10; 4.0 was not checked), but vitest 3.x declares `--update` with no value, reads `none` as a file filter and rewrites every snapshot. A typecheck with `incremental` set writes its `tsBuildInfoFile` even under `--noEmit`. The reviewer reads this block from the main checkout's working tree, so an edit to it takes effect for reviews as soon as it is there, committed or not. Go, Rust, Deno, bun and uv projects cannot declare gates, because `go`, `cargo`, `deno`, `bun` and `uv` are refused as package managers. A script or task runner as a gate (`make check`, `bash scripts/check.sh`) runs a recipe the diff under review can rewrite, so prefer the tool itself. Delete the block if the project has no gates, and the reviewer runs nothing.

```gates
<FILL: e.g. typecheck: ./node_modules/.bin/tsc --noEmit>
<FILL: e.g. test: CI=true ./node_modules/.bin/vitest run>
<FILL: e.g. lint: ./node_modules/.bin/eslint src>
```

## Conventions

<FILL: the handful of rules that must hold on every turn. One sentence each, no procedures. Examples of the shape: tests go beside the code they cover; no default exports; every database change ships with a migration; never edit generated files.>

Never edit `.env` or any file holding a credential.

## Glossary

The project glossary is `.claude/rules/glossary.md` and loads on every turn. Use its words with its meanings, and if a term you need is missing, say so rather than inventing one. That file is generated from the `glossary` skill in `coder-fleet`, so never edit it here - change the skill and regenerate.

## Where work lives

Specs live at `docs/specs/<issue>.md`, one file per issue, written by `spec-writer`. Their acceptance criteria go on the board card.

Requirements source: <FILL: the path to the project's approved requirements, e.g. docs/requirements.md; delete this line if there are none>

With that line, no spec is written: an item's acceptance criteria are the requirement clauses it answers, in clause order, and each decision they leave open is a question on the card, answered before building starts. A path that does not exist stops intake until the line is fixed or deleted. Without the line, specs apply as above.

Work is built from the board card: the human's words, its acceptance criteria and the decisions recorded as comments. The human's order on an item is the approval to build it.

An issue number in a branch name, a commit or a handoff refers to the same issue as its spec and its card. If the card has no acceptance criteria, say so rather than proceeding from a guess.

<FILL: anything else with a fixed home, e.g. ADRs in docs/adr/, runbooks in docs/runbooks/.>

## Worktree setup

Agent worktrees hold only tracked files, so a fresh one has no dependencies. Coders and scripters follow this section before building.

<FILL: how a fresh worktree gets its dependencies - the command or the symlinks, run from the worktree root; or "none needed". Example: `pnpm install --frozen-lockfile`.>

## Writing conventions

Australian English: organise, behaviour, colour, recognise, analyse.

Standard hyphens for asides - like this. Never an em dash, never an en dash. This is a hard rule and the most common thing to get wrong.

No emojis, anywhere, in code, comments, commits or prose.

Never hard-wrap prose. One line per paragraph: markdown renderers collapse a single newline, so filling to a column changes nothing a reader sees while making every later edit rewrap the whole paragraph. Code fences, tables and ASCII trees are structure rather than prose and stay as they are.

Say the thing once. Prefer the shorter sentence.

<FILL: project-specific writing rules, e.g. commit message format, changelog style.>
