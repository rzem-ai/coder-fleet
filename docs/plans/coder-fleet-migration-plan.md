# Coder-fleet migration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `rzem-ai/coder-fleet`, a public repo holding the Claude Code plugin renamed to `coder-fleet` plus the OpenCode and Codex ports, with the suite green and a working install on this machine.

**Architecture:** Task 1 builds the new tree from verbatim copies and commits it once, so every later diff is a rename or an edit and nothing else. Tasks 2 to 7 each land one concern on a branch: re-rooting paths, the mechanical rename, the installer migration, the AGENTS.md change, the prose, the board. Task 8 reviews the branch; Task 9 releases, installs, verifies and archives.

**Tech Stack:** bash, python3, node, jq, bun (board binary), gh CLI, the Claude Code plugin marketplace.

**Spec:** `docs/plans/coder-fleet-migration.md` in the same directory, which travels into the new repo in Task 1.

## Global Constraints

- New repo path on this machine: `/Users/alex/Dev/Work/extensions/coder-fleet`. GitHub: `rzem-ai/coder-fleet`, public, default branch `main`.
- Layout: `<harness>/coder-fleet/` is the installable unit; `claude/evals/`, `claude/home/`, `claude/scripts/`, `opencode/test/`, `<harness>/docs/` sit beside it; `docs/` at the root is the shared design.
- Plugin name `coder-fleet`, version `0.25.0`, marketplace name `rzem` unchanged, `renames: {"claudecode-agents": "coder-fleet"}` at the top level of marketplace.json.
- Environment variable prefix `CLAUDECODE_AGENTS_` becomes `CODER_FLEET_`, suffixes unchanged. Secrets directory `~/.config/claudecode-agents` becomes `~/.config/coder-fleet`. No compatibility shim.
- The project instruction file the fleet writes and checks is `AGENTS.md`, never `CLAUDE.md`.
- The deterministic suite runs as `bash claude/evals/lib/check-all.sh` from the repo root, once per shell command, output captured to a file and grepped. Never run it twice in one command.
- Writing conventions from AGENTS.md: Australian English, hyphens for asides, no em or en dash, no emoji, no hard-wrapped prose, "the human" never a name, the repo calls itself "the coder-fleet repo".
- Fresh history: no `git subtree`, no `filter-repo`, no copying of `.git`, `.remember`, `.claude/worktrees`, `node_modules`, `.DS_Store`, `dist`, `bin` or `evals/results`.
- Commits go on branch `migrate` after Task 1; Task 9 merges it through a pull request. Commit subjects lowercase and narrative, the release commit's subject starts `v0.25.0:`.

## Review Focus

- A machine whose user settings still say `rzem-ai/claudecode-agents` must be repointed by `install-home.sh` before the install, or `/plugin install coder-fleet@rzem` finds no such plugin. Test in Task 4.
- A project with an existing `CLAUDE.md` at the root, or one above it, must not end up with an `AGENTS.md` that never loads. Tests in Task 5.
- The SubagentStop matcher must accept both `coder-fleet:coder` and bare `coder` or the handoff gate never fires. The roster contract covers it in Task 3.
- The `versions` check must find marketplace.json two levels above the plugin, not one. Test in Task 2.
- A secrets directory that already exists at the new path must never be overwritten by the move. Test in Task 4.

---

### Task 1: Build the new tree and commit it once

Owner: the lead, in this session. Nothing here needs judgement, only exactness.

**Files:**
- Create: `/Users/alex/Dev/Work/extensions/coder-fleet/` and everything under it

- [ ] **Step 1: Scaffold**

```bash
set -euo pipefail
NEW=/Users/alex/Dev/Work/extensions/coder-fleet
OLD=/Users/alex/Dev/Work/extensions/claudecode-agents
OC=/Users/alex/Dev/Work/extensions/opencode-agents
CX=/Users/alex/Dev/Work/extensions/gptcode-agents
test ! -e "$NEW"
mkdir -p "$NEW"/{claude,opencode/coder-fleet,codex/coder-fleet,docs}
EX=(--exclude .git --exclude .remember --exclude node_modules --exclude .DS_Store --exclude '.claude/worktrees' --exclude dist --exclude bin --exclude 'evals/results')
rsync -a "${EX[@]}" "$OLD/claudecode-agents/" "$NEW/claude/coder-fleet/"
rsync -a "${EX[@]}" "$OLD/evals/"   "$NEW/claude/evals/"
rsync -a "${EX[@]}" "$OLD/home/"    "$NEW/claude/home/"
rsync -a "${EX[@]}" "$OLD/scripts/" "$NEW/claude/scripts/"
rsync -a "${EX[@]}" "$OLD/docs/"    "$NEW/docs/"
rsync -a "${EX[@]}" "$OLD/.claude-plugin" "$OLD/.github" "$OLD/.boards" "$OLD/README.md" "$OLD/AGENTS.md" "$OLD/LICENSE" "$NEW/"
rsync -a "${EX[@]}" "$OC/.opencode/" "$NEW/opencode/coder-fleet/"
cp "$OC/opencode.json" "$NEW/opencode/coder-fleet/"
rsync -a "${EX[@]}" "$OC/test/" "$NEW/opencode/test/"
rsync -a "${EX[@]}" "$OC/docs/" "$NEW/opencode/docs/"
rsync -a "${EX[@]}" "$CX/docs/" "$NEW/codex/docs/"
touch "$NEW/codex/coder-fleet/.gitkeep"
```

- [ ] **Step 2: Root .gitignore**

Write `$NEW/.gitignore` with the old entries re-rooted:

```
/tmp
_to_delete/
.DS_Store
**/.DS_Store
__pycache__/
claude/evals/results/
claude/coder-fleet/board/node_modules/
claude/coder-fleet/board/bin/
claude/coder-fleet/board/dist/
opencode/coder-fleet/node_modules/
```

Remove `$NEW/opencode/coder-fleet/.gitignore` if its only content is `node_modules`, otherwise fold its lines in.

- [ ] **Step 3: Verify the copy is complete**

```bash
diff -rq --exclude=.git --exclude=node_modules --exclude=.DS_Store --exclude=results --exclude=bin --exclude=dist "$OLD/claudecode-agents" "$NEW/claude/coder-fleet" && echo plugin-identical
diff -rq --exclude=results "$OLD/evals" "$NEW/claude/evals" && echo evals-identical
diff -rq --exclude=node_modules --exclude=.DS_Store --exclude=.gitignore "$OC/.opencode" "$NEW/opencode/coder-fleet" | grep -v 'Only in .*opencode.json' ; echo opencode-checked
find "$NEW" -name .DS_Store -o -name node_modules -o -name .remember | wc -l   # expect 0
```

- [ ] **Step 4: Initial commit and remote**

```bash
cd "$NEW" && git init -b main && git add -A && git commit -q -m "import the three fleet repos into one tree, contents verbatim"
gh repo create rzem-ai/coder-fleet --public --source=. --remote=origin --description "coder-fleet: a role-shaped agent fleet for Claude Code, OpenCode and Codex" --push
git switch -c migrate
```

The GitHub description here is the only place a description is written; the READMEs come in Task 6.

- [ ] **Step 5: Give the fleet a linked worktree**

The fleet's writable agents commit only inside a linked worktree, and a spawn against another repo does not get one there. So the main checkout goes back to `main` and `migrate` gets its own worktree, which every later task uses as its working root:

```bash
git switch main
git worktree add .claude/worktrees/migrate migrate
echo '.claude/worktrees/' >> .claude/worktrees/migrate/.gitignore
```

Done on 26 September after the first Task 2 spawn stopped with that Blocker. A fix round goes to a fresh agent, not a resumed one: a resumed agent that worked outside its own isolation worktree finds that worktree removed and has no shell.

---

### Task 2: Re-root every path so the suite runs from the new layout

Owner: scripter. Names stay as they are in this task; only paths move.

**Files:**
- Modify: `claude/evals/lib/check-all.sh`, `claude/evals/lib/roster-contract.sh`, `claude/evals/lib/handoff-parity.sh`, `claude/evals/lib/handoff-extractor-parity.sh`, `claude/evals/lib/board-hook-contract.sh`, `claude/evals/lib/scope-hook-contract.sh`, `claude/evals/lib/runner-gate.sh`, `claude/evals/lib/workflow-logic.mjs`, `claude/evals/run.sh`, every `claude/evals/<agent>/checks.sh` that resolves a repo path, `claude/scripts/gen-glossary-rule.sh`, `claude/scripts/install-home.sh`, `claude/scripts/migrate-memory-board.sh`, `.github/workflows/checks.yml`

**Interfaces:**
- Produces: three shell names used by every script under `claude/`: `HARNESS_ROOT` (the `claude/` directory), `PLUGIN_ROOT` (`$HARNESS_ROOT/coder-fleet`), `REPO_ROOT` (`$HARNESS_ROOT/..`). Later tasks rely on these names, not on `REPO_ROOT/claudecode-agents`.

- [ ] **Step 1: Record the baseline failure**

```bash
cd /Users/alex/Dev/Work/extensions/coder-fleet
bash claude/evals/lib/check-all.sh > /tmp/check-before.txt 2>&1; tail -5 /tmp/check-before.txt
```

Expected: failures, because `$REPO_ROOT/claudecode-agents/hooks` does not exist from the new location.

- [ ] **Step 2: Introduce the three roots in check-all.sh**

Replace the two lines after `LIB_DIR=` with:

```bash
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
```

Then, in that file, replace every `$REPO_ROOT/claudecode-agents` with `$PLUGIN_ROOT`, `"$REPO_ROOT"/claudecode-agents` with `"$PLUGIN_ROOT"`, `$REPO_ROOT/scripts` with `$HARNESS_ROOT/scripts`, `$REPO_ROOT/evals` with `$HARNESS_ROOT/evals`. In the embedded python of the `versions` check, `f"{root}/claudecode-agents/.claude-plugin/plugin.json"` becomes `f"{plugin}/.claude-plugin/plugin.json"` with `plugin` passed as a second argument, and `f"{root}/.claude-plugin/marketplace.json"` keeps `root`, which must now be `REPO_ROOT`.

- [ ] **Step 3: Same three roots in every other script**

For each file in the Files list: find its `REPO_ROOT=` line, replace it with the three-line block above adjusted for depth (`claude/scripts/*.sh` use `HARNESS_ROOT=$(cd "$(dirname "$0")/.." && pwd)`; `claude/evals/run.sh` uses `HARNESS_ROOT=$(cd "$EVAL_ROOT/.." && pwd)`; per-agent `checks.sh` files are one level deeper than `lib/`), then apply the same four substitutions. In `gen-glossary-rule.sh` the `SOURCE_REL` and `TARGET_REL` strings lose their `claudecode-agents/` prefix and are joined to `$PLUGIN_ROOT`. In `install-home.sh` `HOME_SRC="$HARNESS_ROOT/home"` and the board package path is `$PLUGIN_ROOT/board`; the `die` message about "no home/ directory" now names `claude/home`.

```bash
grep -rn 'REPO_ROOT/claudecode-agents\|REPO_ROOT"/claudecode-agents\|REPO_ROOT/evals\|REPO_ROOT/scripts\|REPO_ROOT/home' claude/ | grep -v node_modules
```

Expected after the edits: no output.

- [ ] **Step 4: CI**

`.github/workflows/checks.yml`: `run: bash claude/evals/lib/check-all.sh`. Add a second step that runs the opencode tests only if `opencode/test` has a runner defined in `opencode/coder-fleet/package.json`; otherwise leave a comment naming that as a follow-up and do not add the step.

- [ ] **Step 5: Run the suite**

```bash
bash claude/evals/lib/check-all.sh > /tmp/check-t2.txt 2>&1; grep -E 'ok$|FAILED' /tmp/check-t2.txt
```

Expected: every label `ok`, no `FAILED`. The `board` check needs `bun`; if it fails only on a missing `bun` on this machine, say so in the handoff rather than skipping it silently.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "re-root the suite, the installer and the generator to claude/coder-fleet"
```

---

### Task 3: The mechanical rename

Owner: scripter. This is the 355 name references and the 150 environment variable references. It is scripted so that it is reproducible and reviewable as one diff.

**Files:**
- Modify: everything under `claude/`, `.claude-plugin/marketplace.json`, `.github/`, `README.md`, `AGENTS.md`, `docs/`. Not touched: `opencode/`, `codex/` (Task 6 handles their prose), the `renames` map, the three history lines in `docs/limits.md` that Task 3 identifies and leaves.

**Interfaces:**
- Produces: plugin name `coder-fleet`, MCP prefix `mcp__plugin_coder-fleet_board__`, env prefix `CODER_FLEET_`, secrets path `~/.config/coder-fleet`, board package `coder-fleet-board`.

- [ ] **Step 1: Count before**

```bash
cd /Users/alex/Dev/Work/extensions/coder-fleet
grep -rIo 'claudecode-agents' claude .claude-plugin .github README.md AGENTS.md docs | grep -v node_modules | wc -l
grep -rIo 'CLAUDECODE_AGENTS_[A-Z_]*' claude | grep -v node_modules | wc -l
```

Record both numbers in the handoff.

- [ ] **Step 2: Write the rename script to the scratchpad and run it**

```bash
set -euo pipefail
cd /Users/alex/Dev/Work/extensions/coder-fleet
FILES=$(grep -rIl 'claudecode-agents\|CLAUDECODE_AGENTS_\|Claude Code Agents' claude .claude-plugin .github README.md AGENTS.md docs | grep -v node_modules | grep -v 'docs/plans/coder-fleet-migration')
for f in $FILES; do
  perl -pi -e 's/CLAUDECODE_AGENTS_/CODER_FLEET_/g; s/claudecode-agents-board/coder-fleet-board/g; s/mcp__plugin_claudecode-agents_board__/mcp__plugin_coder-fleet_board__/g; s/\bclaudecode-agents\b/coder-fleet/g; s/Claude Code Agents/Coder Fleet/g' "$f"
done
```

The plan and spec under `docs/plans/coder-fleet-migration*` are excluded because they describe the old name on purpose.

- [ ] **Step 3: Hand-fix what the script cannot know**

- `.claude-plugin/marketplace.json`: entry `name` and `displayName` renamed by the script; set `"source": "./claude/coder-fleet"`, `"version": "0.25.0"`, `"repository": "https://github.com/rzem-ai/coder-fleet"`, description "Private marketplace for the rzem coder-fleet agents." and add at the top level, after `plugins`: `"renames": { "claudecode-agents": "coder-fleet" }`.
- `claude/coder-fleet/.claude-plugin/plugin.json`: `"version": "0.25.0"`, `homepage` and `repository` to `https://github.com/rzem-ai/coder-fleet`, description unchanged.
- `claude/coder-fleet/hooks/hooks.json`: the SubagentStop matcher now reads `^(coder-fleet:)?(lead|scout|...)$`. Confirm by eye.
- `claude/coder-fleet/templates/project-settings.json`: `"agent": "coder-fleet:lead"`, `"repo": "rzem-ai/coder-fleet"`.
- `claude/home/settings.json` and `claude/scripts/install-home.sh`: every `~/.config/claudecode-agents` became `~/.config/coder-fleet` by the word-boundary rule; confirm the `BACKUP_DIR` default now reads `.../coder-fleet/backups`.
- `docs/limits.md`: read the three lines that named `claudecode-agents`; where a line records history ("since v0.x the plugin ..."), restore the old name in that line, since history is the one place the old name is correct.
- Path strings the script rewrote to `coder-fleet/hooks` and friends inside prose and comments now need the `claude/` prefix where they describe a repo path: `grep -rn '`coder-fleet/' claude docs README.md AGENTS.md` and change each repo-path mention to `claude/coder-fleet/...`. A mention of the install id `coder-fleet@rzem` or the prefix `coder-fleet:` is not a path and stays.

- [ ] **Step 4: Regenerate the glossary rule and the board lockfile name**

```bash
bash claude/scripts/gen-glossary-rule.sh
cd claude/coder-fleet/board && bun install --frozen-lockfile 2>&1 | tail -2 && cd -
```

If `bun install` rewrites `bun.lock` for the package name only, commit that; if it changes anything else, stop and report.

- [ ] **Step 5: Verify**

```bash
grep -rIn 'claudecode-agents\|CLAUDECODE_AGENTS' claude .claude-plugin .github README.md AGENTS.md docs | grep -v node_modules | grep -v 'docs/plans/coder-fleet-migration'
```

Expected: only the `renames` line in marketplace.json and the history lines in `docs/limits.md`. List every remaining line in the handoff.

```bash
bash claude/evals/lib/check-all.sh > /tmp/check-t3.txt 2>&1; grep -E 'ok$|FAILED' /tmp/check-t3.txt
claude plugin validate . && claude plugin validate ./claude/coder-fleet
```

Expected: all `ok`, both validations pass. The `versions` check proves plugin.json and the entry agree at 0.25.0; the `roster-contract` check proves the matcher, the runner and the evals agree on the eleven names under the new prefix.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "rename the plugin, its prefixes, its environment and its secrets path to coder-fleet"
```

---

### Task 4: install-home.sh migrates a machine

Owner: scripter.

Done in ade272c, with a fix round in 8bdcd23: the first version ran under `--dry-run` and moved the secrets directory while the flag promised to change nothing, and it added a `jq` dependency the script did not otherwise have. The fix prints "would" lines under dry-run and uses python3, which the script already needs. The test has ten assertions, including the dry-run case, which was seen failing against ade272c.

**Files:**
- Modify: `claude/scripts/install-home.sh`
- Test: `claude/evals/lib/install-home-migration.sh` (new), wired into `check-all.sh` under the label `install-home-migration`

**Interfaces:**
- Consumes: `HARNESS_ROOT`, `PLUGIN_ROOT`, `SECRETS_DIR="$HOME/.config/coder-fleet"` from Tasks 2 and 3.
- Produces: a function `migrate_previous_install` in install-home.sh that runs before the settings merge, and the test script.

- [ ] **Step 1: Write the failing test**

`claude/evals/lib/install-home-migration.sh` creates a temporary `HOME` under `${TMPDIR:-/tmp}` with `set -euo pipefail`, seeds it with `~/.config/claudecode-agents/secrets.spec` (content `old`) and a `~/.claude/settings.json` containing `"extraKnownMarketplaces": {"rzem": {"source": {"source": "github", "repo": "rzem-ai/claudecode-agents"}}}` and `"enabledPlugins": {"claudecode-agents@rzem": true}`, then runs `HOME=$T bash claude/scripts/install-home.sh --dry-run` if a dry-run flag exists, otherwise sources the script with a guard variable `INSTALL_HOME_LIB=1` that makes it define functions and return, and calls `migrate_previous_install`. It asserts:

1. `$T/.config/coder-fleet/secrets.spec` exists with content `old`, mode 600, and `$T/.config/claudecode-agents` is gone.
2. Running again with `$T/.config/coder-fleet/secrets.spec` already present as `new` and a fresh `$T/.config/claudecode-agents/secrets.spec` as `old` leaves `new` in place and the old directory untouched, and prints a line containing `both exist`.
3. `jq -r '.extraKnownMarketplaces.rzem.source.repo' $T/.claude/settings.json` prints `rzem-ai/coder-fleet`.
4. The script's final "what comes next" text contains `claude plugin install coder-fleet@rzem`.

Run: `bash claude/evals/lib/install-home-migration.sh`. Expected: FAIL at assertion 1, `migrate_previous_install: command not found` or the old directory still present.

- [ ] **Step 2: Implement**

In install-home.sh, add the `INSTALL_HOME_LIB` guard at the top of the main flow (`[ -n "${INSTALL_HOME_LIB:-}" ] && return 0` placed after all function definitions), and:

```bash
migrate_previous_install() {
    local old="$HOME/.config/claudecode-agents"
    if [ -d "$old" ]; then
        if [ -e "$SECRETS_DIR" ]; then
            say "both exist: $old and $SECRETS_DIR - leaving both, merge by hand"
        else
            mv "$old" "$SECRETS_DIR" && chmod 700 "$SECRETS_DIR" && find "$SECRETS_DIR" -type f -exec chmod 600 {} + && say "moved $old to $SECRETS_DIR"
        fi
    fi
    local s="$HOME/.claude/settings.json"
    if [ -f "$s" ] && jq -e '.extraKnownMarketplaces.rzem.source.repo == "rzem-ai/claudecode-agents"' "$s" >/dev/null 2>&1; then
        local tmp; tmp=$(mktemp "${TMPDIR:-/tmp}/settings.XXXXXX")
        jq '.extraKnownMarketplaces.rzem.source.repo = "rzem-ai/coder-fleet"' "$s" > "$tmp" && mv "$tmp" "$s" && say "repointed marketplace rzem to rzem-ai/coder-fleet"
    fi
}
```

Call it first thing in the main flow, before the backup and the merge, and add `claude plugin install coder-fleet@rzem` to the closing "what comes next" text, with the sentence "the renames map moves your enabledPlugins key; this one install fills the cache under the new name".

- [ ] **Step 3: Run the test, then the suite**

```bash
bash claude/evals/lib/install-home-migration.sh && echo ok
bash claude/evals/lib/check-all.sh > /tmp/check-t4.txt 2>&1; grep -E 'ok$|FAILED' /tmp/check-t4.txt
```

Expected: `ok`; suite all `ok` including the new `install-home-migration` label, which means the `run` line was added to check-all.sh and the header comment lists it.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "install-home.sh moves the secrets directory and repoints the marketplace"
```

---

### Task 5: The project instruction file is AGENTS.md

Owner: coder.

**Files:**
- Rename: `claude/coder-fleet/templates/CLAUDE.md` to `claude/coder-fleet/templates/AGENTS.md`
- Modify: `claude/coder-fleet/commands/init.md`, `claude/coder-fleet/commands/kickoff.md`, `claude/coder-fleet/skills/compound/SKILL.md`, `claude/scripts/merge-settings.py` (comment only), `docs/fleet-design.md`, `README.md`
- Test: `claude/evals/lib/instruction-file-contract.sh` (new), wired into `check-all.sh` as `instruction-file`

- [ ] **Step 1: Write the failing test**

The test asserts, with `grep`, that:

1. `claude/coder-fleet/templates/AGENTS.md` exists and `templates/CLAUDE.md` does not.
2. `commands/init.md` contains `templates/AGENTS.md` and the phrase `rename it to AGENTS.md`, and does not contain `-> \`CLAUDE.md\``.
3. `commands/kickoff.md` contains `AGENTS.md` in its skeleton step and the word `shadow`.
4. No file under `claude/coder-fleet`, `docs`, or `README.md` contains `CLAUDE.md` except the lines in `init.md` and `kickoff.md` that handle a pre-existing one, and the design's sentence on the shadowing rule. The test whitelists by `file:pattern`, so a new stray mention fails it.

Run: `bash claude/evals/lib/instruction-file-contract.sh`. Expected: FAIL on 1.

- [ ] **Step 2: Rename the template and rewrite init**

`git mv claude/coder-fleet/templates/CLAUDE.md claude/coder-fleet/templates/AGENTS.md`. Inside the template, the heading and any self-reference say `AGENTS.md`; the sentence about `.claude/rules/<name>.md` stays.

In `init.md` step 2, the template line becomes: `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md -> AGENTS.md at the project root. If an AGENTS.md already exists, do not touch it and report which template sections it lacks. If a CLAUDE.md exists at the project root and no AGENTS.md does, offer with the AskUserQuestion tool to rename it to AGENTS.md (recommended: Claude Code reads only CLAUDE.md when both exist, so a new AGENTS.md beside it would never load) or to leave it and skip the skeleton; on rename, append the template sections the file lacks, marked, and continue to the marker walk.` The description frontmatter, step 3's skip condition, the marker walk and the closing "restart and trust the folder" text all say `AGENTS.md`.

- [ ] **Step 3: Kickoff checks for the file and for a shadow**

Kickoff step 3 becomes: `AGENTS.md exists at the project root and contains no <FILL: ...> markers. Then check for a shadow: a CLAUDE.md, .claude/CLAUDE.md or CLAUDE.local.md in the project root or any directory above it up to /. If one exists, the check fails and names the path, with the fix: rename that file to AGENTS.md or set the project-instructions setting to claude-md-and-agents-md; ~/.claude/CLAUDE.md does not count. A marker left in place is a line the session reads literally on every turn, so surviving markers are a failure, not a note.`

- [ ] **Step 4: Prose**

In `docs/fleet-design.md`, `README.md` and `skills/compound/SKILL.md`, every `CLAUDE.md` that means "the project's instruction file" becomes `AGENTS.md`. Add one sentence to the design where init is described: "Claude Code reads AGENTS.md directly from v2.1.277; a CLAUDE.md or CLAUDE.local.md at the project root or above it shadows it, which is why init offers the rename and kickoff checks for a shadow." The `merge-settings.py` comment follows if it mentions the file.

- [ ] **Step 5: Run the test and the suite**

```bash
bash claude/evals/lib/instruction-file-contract.sh && echo ok
bash claude/evals/lib/check-all.sh > /tmp/check-t5.txt 2>&1; grep -E 'ok$|FAILED' /tmp/check-t5.txt
```

Expected: `ok`, suite all `ok` with `instruction-file` listed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "the project instruction file is AGENTS.md, and init and kickoff know about shadows"
```

---

### Task 6: README, AGENTS.md and the ports' prose

Owner: coder. Originally tech-writer, changed on 26 September because the task regenerates the glossary rule, runs the suite and commits, and tech-writer has no shell.

**Files:**
- Modify: `README.md`, `AGENTS.md`, `opencode/docs/**`, `opencode/coder-fleet/skill/glossary/SKILL.md`, `codex/docs/**`, `docs/fleet-design.md`, `docs/agent-contract.md`, `docs/limits.md`, and every file under `claude/coder-fleet/` whose prose names a repo path without the `claude/` prefix (Step 2b)
- Source material: the spec `docs/plans/coder-fleet-migration.md`, the two ports' former CLAUDE.md files at `/Users/alex/Dev/Work/extensions/opencode-agents/CLAUDE.md` and `/Users/alex/Dev/Work/extensions/gptcode-agents/CLAUDE.md` (read-only), and the current README.

- [ ] **Step 1: README as the front door**

Keep the existing Claude Code content, rewritten for the new name: install is `/plugin marketplace add rzem-ai/coder-fleet` then `/plugin install coder-fleet@rzem`; the agent table's prefix column reads `coder-fleet:`. Add, above the Claude Code section, a short "Three harnesses" section with a table: harness, directory, status. Claude Code `claude/coder-fleet/` "released, v0.25.0"; OpenCode `opencode/coder-fleet/` "in port: scout, the enforcement plugin, six skills and two commands; see opencode/docs/divergence-register.md"; Codex `codex/coder-fleet/` "spec and hooks spike only, no code; see codex/docs/specs/GPTA-1.md". Add a "Migrating from claudecode-agents" section of five lines: run install-home.sh, then `/plugin install coder-fleet@rzem`, then change `agent` in each project's `.claude/settings.json` to `coder-fleet:lead`, secrets moved to `~/.config/coder-fleet`, env vars now `CODER_FLEET_*`.

- [ ] **Step 2: AGENTS.md at the root**

Update the tree in "What this is" to the new layout (copy it from the spec). Replace `bash evals/lib/check-all.sh` with `bash claude/evals/lib/check-all.sh`. Update "Where a change goes" paths. Add a section "The ports" carrying the rule from both port CLAUDE.md files, in this repo's voice: a port does not invent; every artefact under `opencode/coder-fleet/` or `codex/coder-fleet/` traces to its counterpart under `claude/coder-fleet/`; the harness wins on file layout and frontmatter, the fleet wins on behaviour and vocabulary; a deliberate divergence is a row in that port's `docs/divergence-register.md`; the Claude Code tree is read-only reference for port work. "Releasing" gains one sentence: the version is the Claude Code plugin's, the ports carry none yet. The repo's self-reference becomes "the coder-fleet repo" throughout.

- [ ] **Step 2b: Paths and names Task 3 left behind**

Task 3's rename left two kinds of stale prose, found in review of its commit:

1. About 38 mentions of `evals/`, `scripts/` and `home/` in backticks that lack the `claude/` prefix, across README.md, AGENTS.md, `docs/fleet-design.md`, `docs/agent-contract.md`, `docs/limits.md`, `claude/coder-fleet/hooks/README.md`, `claude/coder-fleet/agents/fleet-steward.md`, `claude/coder-fleet/commands/kickoff.md`, `claude/coder-fleet/skills/glossary/SKILL.md`, `claude/coder-fleet/skills/migration-checklist/SKILL.md` and `claude/coder-fleet/board/NOTICE.md`. Find them with `grep -rnE '`(evals|scripts|home)/' claude/coder-fleet docs README.md AGENTS.md --include=*.md | grep -v docs/plans/coder-fleet`. Each one that names a path in this repo gains `claude/`. One that names a path in a user's project, such as a project's own `evals/`, stays. Decide per line.
2. The three lines in `docs/limits.md` that Task 3 restored to `claudecode-agents` as history are not history: they describe the repo and its paths as they are now. Line 21's "the claudecode-agents repo" becomes "the coder-fleet repo"; lines 29 and 43's `claudecode-agents/agents/coder.md`, `claudecode-agents/workflows/review-round.js`, `claudecode-agents` and `claudecode-agents/hooks/README.md` become `claude/coder-fleet/...` paths.

The full repo-map trees in README.md, AGENTS.md and `docs/fleet-design.md` are redrawn to the layout in the spec, not patched line by line. The glossary SKILL.md is canonical and the rule under `templates/rules/` is generated, so after editing the skill run `bash claude/scripts/gen-glossary-rule.sh`, never edit the rule by hand.

After this step, the Task 3 verification grep for old names returns only the `renames` line in marketplace.json, and the grep above returns only lines about a user's project.

- [ ] **Step 3: The ports' absolute paths**

```bash
grep -rn '/Users/alex/Dev/Work' opencode codex
```

Every hit that points at the Claude Code fleet becomes the relative path `claude/coder-fleet/...`; every hit that points at the port's own old repo becomes the relative path within this repo; the three `desktop/opencode` hits are the OpenCode source checkout and stay, with a note that they are a machine path. The opencode glossary copy's first-line note names `claude/coder-fleet/skills/glossary/SKILL.md` as the canonical copy.

- [ ] **Step 4: Check the conventions**

```bash
grep -rnP '[\x{2013}\x{2014}]' README.md AGENTS.md opencode/docs codex/docs | head   # expect nothing
grep -rn 'Alex' README.md AGENTS.md | grep -v 'author\|Author\|email' | head        # expect nothing
bash claude/evals/lib/check-all.sh > /tmp/check-t6.txt 2>&1; grep -E 'ok$|FAILED' /tmp/check-t6.txt
```

Since the Task 7 follow-up, the roster check reads the README agent table, so the suite is the test for Step 1.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "the README fronts three harnesses and AGENTS.md carries the port rule"
```

---

### Task 7: One board

Owner: scripter.

What happened, 26 September. The board lists only files matching the one configured `task_prefix` and skips the rest without a message, so the fold as written below left BD-1 and the three GPTA items on disk and invisible under `CF`. The human chose to renumber: BD-1 became CF-3, GPTA-1 became CF-4, GPTA-1.1 and GPTA-1.2 became CF-4.1 and CF-4.2, each with a "Formerly" line, and log entries keep the old ids. Two things the plan missed surfaced on the way: the Codex spike harness that CF-4.2 re-runs lived only on an unmerged branch of the local gptcode-agents repo, which has no remote, so it was imported to `codex/scripts/spike/codex-hooks/` from commit 9947a27; and the board binary's auto-commit takes everything under `.boards/`, so an uncommitted `.boards` change rides into the next board write's commit.

**Files:**
- Modify: `.boards/config.yml`
- Create: `.boards/tasks/gpta-1*.md` (three files copied from `/Users/alex/Dev/Work/extensions/gptcode-agents/.boards/tasks/`)

- [ ] **Step 1: Fold**

```bash
cd /Users/alex/Dev/Work/extensions/coder-fleet
cp /Users/alex/Dev/Work/extensions/gptcode-agents/.boards/tasks/gpta-1*.md .boards/tasks/
perl -pi -e 's/^project_name: .*/project_name: "coder-fleet"/; s/^task_prefix: .*/task_prefix: "CF"/; s/CLAUDECODE_AGENTS_BOARD_NO_COMMIT/CODER_FLEET_BOARD_NO_COMMIT/' .boards/config.yml
ls .boards/tasks   # expect bd-1 and the three gpta files
```

- [ ] **Step 2: Prove the binary reads it**

```bash
CODER_FLEET_BOARD_NO_COMMIT=1 bash claude/coder-fleet/board/board.sh task list --plain 2>&1 | head -20
```

Expected: four rows, BD-1 To Do, GPTA-1 To Do, GPTA-1.1 and GPTA-1.2 Blocked by human. If the binary needs building first, `bash claude/coder-fleet/board/build.sh` then retry, and note the build in the handoff. If the binary rejects a mixed prefix, report exactly what it says and stop; do not renumber the items.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "one board for the repo, with the codex items folded in"
```

---

### Task 8: Review the branch

Owner: reviewer, on the diff `main...migrate`. Then a coder fix round for blocking findings, and one more reviewer pass on the fix commit if there was one.

Review brief: the spec's acceptance criteria are the checklist. Beyond them, look for: a path the rename script rewrote that was an install id or a prefix rather than a repo path; a `CODER_FLEET_` variable that the board binary reads under a name the hooks no longer export; an env var name in a test fixture that the perl pass missed because it was split across a line; a README table row the roster check does not read.

---

### Task 9: Release, install, verify, archive

Owner: the lead, in this session.

- [ ] **Step 1: Release commit and pull request**

The version is already 0.25.0 from Task 3. Amend nothing; add an empty release commit so the subject rule holds: `git commit --allow-empty -m "v0.25.0: the fleet is coder-fleet, on three harnesses in one repo"`. Push `migrate`, open the PR with `gh pr create`, wait for CI green, merge.

- [ ] **Step 2: Install here**

```bash
bash /Users/alex/Dev/Work/extensions/coder-fleet/claude/scripts/install-home.sh --dry-run
```

Read the "would" lines and the settings diff it prints. If they match expectations (move `~/.config/claudecode-agents`, repoint `rzem`), run it again without `--dry-run`.

Then in a Claude Code session: `/plugin marketplace update rzem`, `/plugin install coder-fleet@rzem`, `/reload-plugins`. Verify:

```bash
claude plugin details coder-fleet | sed -n '/Component inventory/,$p'
ls ~/.config/coder-fleet && test ! -e ~/.config/claudecode-agents && echo secrets-moved
jq '.enabledPlugins | keys | map(select(test("rzem")))' ~/.claude/settings.json
```

Expected: eleven agents, five commands, the skills; `secrets-moved`; the key is `coder-fleet@rzem` only.

- [ ] **Step 3: One spawn**

In the coder-fleet checkout, focus CF-3 with `/coder-fleet:work CF-3`, spawn `coder-fleet:scout` with a one-line question about the repo. Expected: the board item moves to Doing at start and back with a handoff at stop, visible in `git log -1 -- .boards`.

- [ ] **Step 4: Archive the old repos**

For `rzem-ai/claudecode-agents` and `rzem-ai/opencode-agents`: on a branch, replace README.md with a pointer of three lines: the repo has moved to `https://github.com/rzem-ai/coder-fleet`, its contents live under `claude/` (or `opencode/`), and installs migrate with `install-home.sh` there. Commit, push, merge, then `gh repo archive rzem-ai/<name> --yes`. Do not push `gptcode-agents` anywhere. Leave all three local directories in place and tell the human they can be removed.

- [ ] **Step 5: Memory**

Update the memory files that name the old repo or its layout: `claude-agents-fleet-plan-location`, `board-conventions`, `run-the-check-suite-once-per-command`, `claudecode-agents-uses-the-human-not-alex`, `plugin-enable-scope-and-version-drift`, and the MEMORY.md hooks. One new memory: the coder-fleet layout rule, `<harness>/coder-fleet/` is the installable unit.
