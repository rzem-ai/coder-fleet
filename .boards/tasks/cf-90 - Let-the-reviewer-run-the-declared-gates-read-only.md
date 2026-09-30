---
id: CF-90
title: Let the reviewer run the declared gates read-only
status: To Do
assignee: []
created_date: '2026-09-30 08:32'
labels:
  - hooks
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/45'
  - claude/coder-fleet/hooks/enforce-agent-scope.sh
  - claude/coder-fleet/agents/reviewer.md
priority: Medium
type: enhancement
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #45, filed by the human on 2026-09-30 from the Fathom lead session. The reviewer's scope hook (REVIEWER_ALLOWED_CMDS) allows only reads, and reviewer.md says never run tests, builds or installs, so every verdict takes typecheck and tests on trust, and independent gates need a second mechanism (review-round's lanes, the refuter baseline, the lead by hand). Those caused three problems in Fathom on 30 Sep: a lane's `git checkout --detach` in the main checkout let a board hook commit onto a detached HEAD; the lead's `pnpm --filter ... typecheck` silently ran `pnpm install` against symlinked node_modules; verdicts couldn't tell a real failure from a known load-sensitive test. The invariant is "never change the diff under review", and a read-only gate doesn't. Proposal: the reviewer runs the project's declared gates (a `gates:` list in project settings or AGENTS.md) read-only, against the pinned head, in a clean linked worktree, calling binaries from node_modules/.bin directly, never through a package manager. Denied whatever the list says: package-manager verbs (pnpm/npm/yarn/bun, since `pnpm --filter x <script>` may install), installs, snapshot updates, --fix, --write, watch mode, in-repo build output (allow --noEmit or an --outDir under scratchpad/TMPDIR), network tools, and any command in the main checkout. The verdict gains a `gates` block (command, exit code, pass/fail counts) in the shape review-round reads. Folding review-round's tests and types-and-build lanes into the reviewer is a separate decision. lead.md step 4 ("A reviewer can never run the change's gates") is edited in the lead.md track after CF-51, CF-24.1 and CF-53, so this card's coder does not touch lead.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reviewer can run each command in a project's declared gate list, and a single-file or single-test form of its test runner, in the review worktree; each is covered by a scope-hook test that allows it
- [ ] #2 Every command in the denied list is refused for the reviewer, with a scope-hook test per class: package manager verbs, including `pnpm --filter x typecheck`; snapshot update; `--fix`; watch; in-repo build output; network; and the main checkout as the working directory
- [ ] #3 agents/reviewer.md states the new boundary (run the declared gates read-only, never change the diff or its dependencies) in place of 'never run tests, builds or installs', and its handoff reports each gate's command, exit code and counts
- [ ] #4 An eval prompt shows the reviewer running the gates on a diff with a failing test and reporting the failure as a finding
- [ ] #5 lead.md step 4 and the fleet design describe the reviewer running declared gates, landed in the lead.md track after CF-51, CF-24.1 and CF-53
- [ ] #6 bash claude/evals/lib/check-all.sh passes; migration-checklist run over reviewer.md and lead.md
<!-- AC:END -->
