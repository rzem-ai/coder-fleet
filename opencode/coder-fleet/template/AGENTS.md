# <FILL: project name>

<FILL: one sentence saying what this project is and who it serves.>

Every `<FILL: ...>` marker below is a placeholder. Replace it or delete the line. A marker left in place is a line the session reads literally on every turn.

This file holds only what must be true on every turn and fits in a sentence: stack, conventions, the glossary pointer, and where specs and plans live. It stays under 200 lines. Procedures are skills, not entries here. Conventions that apply only to some files belong in `.claude/rules/<name>.md`, which `opencode.json` loads through its `instructions` glob - note that OpenCode loads every matching file on every turn, so a rule that applies to a handful of files costs the same as one that applies to all of them.

## Stack

- Language and runtime: <FILL: e.g. TypeScript on Node 22>
- Framework: <FILL: e.g. Electron plus React 19>
- Data: <FILL: e.g. Drizzle over SQLite>
- API: <FILL: e.g. Fastify>
- Styling: <FILL: e.g. Tailwind>
- Tests: <FILL: e.g. Vitest, run with npm test>
- Build and run: <FILL: the one command that builds and the one that runs>

## Conventions

<FILL: the handful of rules that must hold on every turn. One sentence each, no procedures. Examples of the shape: tests go beside the code they cover; no default exports; every database change ships with a migration; never edit generated files.>

Never edit `.env` or any file holding a credential.

## Glossary

The fleet's glossary is vendored at `.opencode/skill/glossary/SKILL.md` and `.opencode/plugin/fleet.ts` pushes it into every fleet agent's system prompt, so it is in context without anyone going looking for it. Use its words with its meanings, and if a term you need is missing, say so rather than inventing one. It is a hand-maintained copy that deliberately diverges from the fleet's generated original, so edit it here rather than regenerating over it.

## Where work lives

Specs live at `docs/specs/<issue>.md`, one file per issue, written by `spec-writer`.

Plans live at `docs/plans/<issue>.md`, one file per issue, written by the `lead` and approved by the human before any code is written.

An issue number in a branch name, a commit or a handoff refers to the same issue as those two files. If a spec or a plan is missing, say so rather than proceeding from a guess.

<FILL: anything else with a fixed home, e.g. ADRs in docs/adr/, runbooks in docs/runbooks/.>

## Writing conventions

Australian English: organise, behaviour, colour, recognise, analyse.

Standard hyphens for asides - like this. Never an em dash, never an en dash. This is a hard rule and the most common thing to get wrong.

No emojis, anywhere, in code, comments, commits or prose.

Never hard-wrap prose. One line per paragraph: markdown renderers collapse a single newline, so filling to a column changes nothing a reader sees while making every later edit rewrap the whole paragraph. Code fences, tables and ASCII trees are structure rather than prose and stay as they are.

Say the thing once. Prefer the shorter sentence.

<FILL: project-specific writing rules, e.g. commit message format, changelog style.>
