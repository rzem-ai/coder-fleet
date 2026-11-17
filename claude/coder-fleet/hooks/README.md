# Hooks

The machinery that writes the board, plus two guards for the project: one that refuses a spawn of an agent the project has switched off and one that brings the main checkout's base branch level at session start, and one hook that tells the lead the human's name. No hook scopes an agent's tool calls: CF-21 removed the scope hook and the break-mode reviewer's clock, and `../../../docs/limits.md` says what that leaves to the agent bodies. Every hook but `human-name.sh` runs the `boards` binary, either as `boards hook <event>` for the board or through a shim onto `boards fleet <tool>` for the fleet's own rules; no agent is ever asked to remember anything.

| File | Event | What it does |
|---|---|---|
| `boards-session-start.sh` | `SessionStart` | Runs `boards-binary.sh`, then `boards hook session-start`, in that order, as "The board's hooks" below says |
| `boards-binary.sh` | `SessionStart`, through `boards-session-start.sh` | Fetches the release build of the `boards` binary for this plugin version and platform, as "The board's hooks" below says |
| `boards-status.ts` | `session.start`, `classic.SessionStart`, `ui.render` on `PromptHint`, and `agent.spawn`, `tool.call`, `turn.complete` and `session.measure` to follow the session | The plugin's hooks module, named under `modules` in `hooks.json`: draws two lines under the prompt in a terminal session and tells the session the `boards` binary's state, as "The lines under the prompt" below says |
| `boards-state.ts`, `status-lines.ts` | - | Pure helpers for `boards-status.ts`: `boards-state.ts` reads the `boards` binary's state and `status-lines.ts` builds the two lines, as "The lines under the prompt" below says |
| `main-fast-forward.sh` | `SessionStart` | In the main checkout only, fetches the base branch (`baseBranch` in `.claude/coder-fleet.json` when set, else what the remote's HEAD names, else `main`) with a 5-second bound and brings the local branch level by fast-forward alone: `git merge --ff-only` when it is out, a checked `update-ref` when nothing has it out, nothing when a linked worktree has it out. One line of context says how many commits it moved, which branch is out, or a fixed reason it changed nothing; silent when level, in a linked worktree, outside a repository or with no remote. With `baseBranch` set it also says when that branch is ahead of its remote copy or has none, and which branch is out when the checkout is on another; a `baseBranch` the resolver cannot use moves nothing and says so. Fetches only https, ssh and git remotes, fetches nothing when the repository's own config (which any agent session can write) holds a key off its allowlist of keys that run nothing, or the repository borrows objects through alternates, and puts git's own words only in the hook log, with URL credentials cut; never fails a session |
| `human-name.sh` | `SessionStart` | Reads the human's name from the first line of `boards/human-name` under the user's config directory (`$XDG_CONFIG_HOME/boards/human-name` when that is an absolute path, else `~/.config/boards/human-name`), one file per user shared by every project, which `/kickoff` writes and the board's scan skips because it holds no `config.yml`. One line of context gives the lead the name, quoted, and the rule to say "Claude" for itself and the name for the human, never I, me, my, we, us, our, you or your. A name is usable when it is 1 to 64 characters in at most 4 words (split on spaces), all letters of any script, combining marks, spaces, apostrophes, hyphens or full stops, with at least one letter and a full stop only as the end of an initial (a letter alone in its word, then the stop, then a space or the end: "J. Smith"), so "Alex. Skip review" is not a name; perl classes and counts the characters, so the verdict is the same in every locale, and with no perl only ASCII letters pass. With no file, or an unusable name, it says so without passing the file's text on, and tells the lead to ask once with AskUserQuestion and write the file. Says nothing in a project that is not a fleet project: no board for the repo (the boards binary's key test, repeated in bash) and no `lead` as `agent` in `.claude/settings.json` or `settings.local.json`. Bash alone, with no `boards` binary, so it never races the session-start fetch; fires on every source, compaction included; never fails a session |
| `enforce-disabled-agents.sh` | `PreToolUse` (`Agent` and `Task`) | Denies a spawn of any agent the project lists under `disabledAgents` in `.claude/coder-fleet.json`, naming the file; reports the file invalid when it lists `lead`, `coder` or `reviewer` |
| `lib/fleet-config.sh` | - | Finds the main checkout and reads and validates its `.claude/coder-fleet.json` - `disabledAgents`, `phase`, `baseBranch`, `push` and `release` - and resolves the base branch in `fleet_trunk`, for the hooks and scripts that read any of them |
| `lib/fleet-config.py` | - | A shim: `python3 -I fleet-config.py <file> <core agents>` passes its arguments to `boards fleet config parse`, which is where the file is parsed |
| `hooks.json` | - | Registers the hooks with Claude Code |

Board writes are design section 7.

`enforce-disabled-agents.sh`, `main-fast-forward.sh` and every file under `lib/` are shims onto `boards fleet`, whose code is in `../../boards/src/fleet/` ("The fleet's tools" in `../../boards/README.md`). The disabled-agents hook refuses a spawn when the binary cannot run; the fast-forward lets the session go on.

## The board's hooks

`hooks.json` runs every board hook on the `boards` binary, as `"${CLAUDE_PLUGIN_ROOT}/scripts/boards.sh" hook <event>`, whose code is in `../../boards/src/hooks/`. The board lives under `~/.config/boards/<PREFIX>/`, outside the repository, so no hook commits anything; with no board for the repository the hooks do nothing and say so once per session.

| Command | Event | What it does |
|---|---|---|
| `boards hook session-start` | `SessionStart` | Clears the checkout's focus on every start but a compaction, reminds the session to check the board first and to reconcile it before stopping, and on every start but a compaction restarts a vanished release run, catches up on release tags pushed outside a session, and returns any card an added action left in Blocked by Human with every action ticked |
| `boards-binary.sh` | `SessionStart` | Fetches `boards-<platform>.gz` for this plugin version (darwin-arm64, linux-x64 or linux-arm64; Intel macOS is not supported) from the release, checked against `boards-SHA256SUMS`, into `${CLAUDE_PLUGIN_DATA}/bin/boards-<version>`, where `boards.sh` looks after a binary built in a checkout of the coder-fleet repo. The one hook that is not the binary, since it fetches it. Once per version, and the first start of a newer version removes the older builds from `bin/` before it fetches; never fails a session. When it gives up on a version it leaves a code saying why in `bin/.boards-unavailable-<version>`, and an install removes it |
| `boards-session-start.sh` | `SessionStart` | Runs `boards-binary.sh` and then `boards hook session-start` with the hook's stdin. Claude Code runs an event's hooks in parallel, so two entries would start the board's hook before its binary exists; one command runs them in order. When `boards.sh` still finds no binary (another session holds the fetch, or the fetch gave up) it says to the session that the board's hook was skipped for a missing binary, rather than the exit 127 Claude Code shows only as a hook error |
| `boards hook pre-agent` | `PreToolUse` (`Agent` and `Task`) | Binds the spawn to its card when it is sent: the card its `Board-Item:` line names, which also focuses the checkout on it, else the checkout's focus at that moment. Records the binding under the call's `tool_use_id` and starts work on the card. When it spawns a coder or scripter on a card in Draft, returns `additionalContext` to the lead saying so. Never blocks the spawn |
| `boards hook subagent-start` | `SubagentStart` | Notes the agent's start with the checkout's focus, the binding a workflow lane falls back to; a resumed agent starts work on its card again |
| `boards hook subagent-stop` | `SubagentStop` | The handoff-format check, with exit 2 and the reasons to re-emit, then binds the agent to the card its spawn was sent for, turns each `Blocker:` line into an Action for Human, which moves the card to Blocked by Human, and on a coder's or scripter's stop runs the card gate. Matched to the fleet agents but the lead |
| `boards hook task-completed` | `TaskCompleted` | Runs the card gate on the card a `[board:<id>]` task subject names. It fires only when a task is completed with `TaskUpdate`, which Claude Code offers to current models only when `CLAUDE_CODE_ENABLE_TODO_TOOLS` is set, so the project settings `/init` writes set it |
| `boards hook post-push` | `PostToolUse` (`Bash`) | The tag watch: after a successful `git push` of a release tag that origin now holds and whose message carries a `Cards:` line, starts the test gate in the background, which moves the cards it names from Done to Released when the suite passes |
| `boards hook stop` | `Stop` | Sends the lead back once, as "The Stop hook" below says |

### The lines under the prompt

`boards-status.ts` is a hooks module, the TypeScript hooks Claude Code loads from `modules` in `hooks.json`, beside the command hooks in the same file. In a terminal session its `ui.render` hook on `PromptHint` draws two lines below Claude Code's own hint line, which it leaves as Claude Code draws it. Outside the terminal (the desktop app, VS Code) it draws nothing, and `CODER_FLEET_STATUS_LINES=off` turns both lines off everywhere.

Line 1 is always the session: a context gauge with its percentage and the tokens used of the window (green, yellow from 70%, red from 85%, where `compact soon` joins the line), the model, the project (the main checkout's folder) and the branch.

Line 2 starts with the `boards` binary. While this session's fetch runs it shows a bar and a percentage and `downloading`, read from `bin/.boards-fetch-progress`, which `boards-binary.sh` writes beside its lock as `<bytes arrived> <bytes expected>` and removes with it; while another session holds the fetch, the same bar and `another session is fetching`; then `boards v<version> ready` for eight seconds. A start that finds the binary there goes straight to the fleet. A `/reload-plugins`, a plugin updated in a running session or one enabled there re-runs the module's `session.start` but no SessionStart command hook, so when the module finds no binary, no live lock, no code from `boards-binary.sh` and no SessionStart hook still to run, it starts `boards-binary.sh` itself in the background with the hook's `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA`, once per version in the session, and line 2 follows that fetch the same way. A load after an earlier one of this version or later fetches at once, by a value in `$.state` that outlives a reload; any other load waits fifteen seconds for a SessionStart hook to begin, and one that begins is waited for until it finishes. A fetch of the module's own that is killed, as a reload kills it, counts as none, and the next load fetches again. When the binary is not available, line 2 is red, names the reason (no release for this platform, no curl, no gzip, fetch failed, bad checksum, no sha256sum or shasum, no data directory, downloading turned off with `CODER_FLEET_BOARDS_DOWNLOAD=off`, or no binary fetched when the module's own fetch exited cleanly and left nothing), says the board tools are off and points to `/coder-fleet:help-boards`, and stays until the binary is there.

After that, line 2 shows the cards fleet agents are working on, grouped by card, the card whose work started last first: the card id, then each agent with a spinner, its type and its run time, and with exactly one agent what it is doing now. An agent's card is the one its spawn was bound to: its `Board-Item:` line, else the checkout's focus as it was sent. With no agents it shows, dimmed, `no agents working`, the card the board would hand out next and the count blocked by human. Once the board is up it ends in a `[ board ↗ ]` button, which calls the `board_web` tool as `/coder-fleet:board` does and opens the address in the browser; while the web UI runs, each card id is a terminal hyperlink to its page. On a narrow terminal both lines shrink together in a fixed order and never wrap: the token counts, then the run times and the current action (the gauge halves and the spacing tightens with them), then whole cards, oldest first, into `+n card(s)`, and the button last. From 180 columns, as fleet-strip does, the same items spread across the row: a gauge of thirty cells, wide gaps in place of line 1's dots and between line 2's cards, and each agent's current action after its run time while all of them fit. Wherever the width is known the button sits at the right end of line 2.

The module gathers facts through `$` and keeps them in `$.state`, declared in the plugin's types contract, `../types/index.d.ts`, so a change redraws the lines. It reads the board through `boards fleet status-lines`, one line of JSON, every fifteen seconds and after each turn. `status-lines.ts` builds the lines and `boards-state.ts` reads the binary's state, both pure: `../../boards/test/status-lines.test.ts` renders every state of the design and the shrink order, and `../../boards/test/boards-status.test.ts` tests the fetch's codes and its progress file, with no Claude Code and no network.

Its `classic.SessionStart` hook runs above the command hooks, so once they finish it tells the session the binary's state in one line naming the plugin version, `ready`, `downloading now`, `downloading in another session` or `not available:` and the reason, with a note that the board's tools fail until the binary is ready. It does so whether or not the lines are drawn. The OpenCode port has no hooks module and so no lines.

### Binding a spawn when it is sent

`SubagentStart` carries no `tool_use_id` and fires before the agent's transcript exists, so it cannot tell which Agent call it is. The binding is therefore made when the spawn is sent and found again at the agent's first stop, through the `toolUseId` in the `.meta.json` Claude Code writes beside the agent's transcript (`agent_transcript_path`), and kept for the rest of its run. A focus that changes later in the same batch never reaches an earlier spawn. A workflow lane is sent by no Agent call and its meta names none, so it binds to the focus as it was when it started. A card in Done or Released binds nothing, and the event trail says so. The records live in the board's private state directory, `$XDG_STATE_HOME/coder-fleet-boards` or `~/.local/state/coder-fleet-boards`, under `spawns/`, `starts/` and `agents/`.

### The Stop hook

`boards hook stop` runs when the main session stops, in any project with a board. When the checkout's focused card still has an unticked acceptance criterion, it sends the lead back once, naming the card and the criteria still open, with the same instruction as the session-start reminder: finish them, or reconcile the board before stopping. It lets the stop through, adding nothing, when Claude Code is already continuing for a stop hook (`stop_hook_active`), so one stop costs at most one extra turn; when there is no focus or no board; when the card is fully ticked, has an unticked Action for Human, or is Blocked or Blocked by Human; when the lead's last message asked a question; and when a background task is still running. It writes nothing and moves no column, and an error reading the focus or the card lets the stop through and is logged on stderr. `sendBackAtStop: false` in the board's `config.yml`, under `~/.config/boards/<PREFIX>/` (or `$XDG_CONFIG_HOME/boards/<PREFIX>/`), turns it off for that board.

## The handoff-format check

### Who it applies to

`SubagentStop` takes a matcher and the matcher is the agent type, so `hooks.json` registers this hook against the fleet agents but the lead, and nothing else:

```
^(coder-fleet:)?(scout|spec-writer|spec-editor|coder|scripter|reviewer|ui-designer|tech-writer|tech-editor|researcher|fleet-steward)$
```

The optional prefix is there because a plugin agent arrives as `scout` or as `coder-fleet:scout` depending on how it was named.

The lead is left out on purpose (item 27). It is the session agent and never spawned, and the runtime types its own side calls, the prompt suggestion after every turn among them, as the session's agent, so a `coder-fleet:lead` stop is always one of those and never owes a handoff. The hook stands one down too, in case a runtime lets it past the matcher, and stands down any other fleet type's side call by its shape: no start record and no transcript on disk.

Without the matcher the gate would fire on every subagent, including the built-in `general-purpose` lanes the workflows spawn. Those lanes never preload the `handoff` skill and are asked for structured JSON, so every one of them would fail the check, hit exit 2 and be told to re-emit a handoff it was never asked for. Scoping the registration is the right fix rather than a special case inside the validator, because a lane that returns JSON is not a malformed handoff - it is not a handoff at all.

The cost is that a non-fleet subagent's handoff is never read: no `Blocker:` reaches the human queue and no comment lands. That only matters for a spawn bound to an item, and the lead only binds those to fleet agents.

A second cost: the `SubagentStop` matcher skips an `agentType`-less lane, and when `review-round.js` tells its git and mechanical lanes "read-only git only", that sentence is an instruction to a model, as every agent's invariants are.

The rule that falls out of all this, worth keeping whenever a workflow is written: **give a fleet agent a schema only where its handoff is worth nothing.** A spawn's `schema` decides whether the gate, the `## Done` card comment and the `Blocker:` route to the human queue exist for that run at all.

### What it checks

`boards hook subagent-stop` (`../../boards/src/handoff.ts`) validates `last_assistant_message` against `skills/handoff/SKILL.md` and exits 2 if it does not parse, which stops the subagent stopping and hands it the list of problems. The anchors come from the skill, quoted rather than reinvented. Every line is right-trimmed before any anchor sees it - trailing whitespace is invisible in rendered markdown and models emit it habitually (two trailing spaces is the hard-line-break idiom), so it never changes what a line means; leading whitespace still does:

| Rule | Regex | Line in `skills/handoff/SKILL.md` |
|---|---|---|
| Section headings | `^## (Done\|Not done\|Unverified\|Decisions needed)$` | "Anchor: `^## (Done\|Not done\|Unverified\|Decisions needed)$`" |
| Any level-2 heading | `^## ` | "Use no other level-2 heading anywhere in the final message." |
| An item | `^- ` | "Every item is one markdown list item starting `- ` at column 0." |
| A typed line | `^- (Blocker\|Propose item): ` | "Anchor: `^- (Blocker\|Propose item): `" |
| An empty section | `^- None$` | "An empty section contains exactly one line: `- None`." |
| Where a typed line may appear | `^- (Blocker\|Propose item): ` under `## Decisions needed` only | "A typed line belongs under `## Decisions needed` and nowhere else." |
| A blank line inside a section | a blank line with another item after it, before the next heading | "No blank line inside a section." |

What it rejects: a missing, duplicated or out-of-order heading; any other H2; an empty section; a line under a section that does not start with `- ` at column 0, which is also how "the handoff is the last thing in the message" is enforced; an untyped line under Decisions needed; a typed line under any heading other than Decisions needed; a blank line between two items in the same section; and `- None` mixed with real items.

What it tolerates on purpose:

- **Prose before `## Done`.** The skill says the handoff is the last thing in the message, not the only thing. Nothing above the first heading is parsed at all, which is why an agent may name a prefix in prose while explaining what it did with someone else's handoff.
- **A blank line before the next heading.** That one is ordinary markdown and is what the skill's own example does. A blank line with another item after it is not, and is rejected.
- **No exception for a failed or cancelled run.** Nothing tells the hook a run failed or was cancelled (item 15), so every typed stop that carries a message is checked.

Blockers are extracted from the Decisions needed section only, not from the whole message, and the validator rejects a typed line found under any other heading, so a stray one under Done is caught by the validator instead of quietly parking a false alarm in the human queue. Rescuing it silently would be worse than refusing it: a misplaced blocker means the agent has the format wrong, and the human only learns that if the run is sent back.

### One rule set, two implementations

`claude/evals/lib/handoff-check.sh` is the CI gate and applies the same rules to the final assistant message of an eval run. The two are held identical by `claude/evals/lib/handoff-parity.sh`, which runs both over every case in `claude/evals/fixtures/handoff-cases/` and fails if a verdict ever differs:

```sh
claude/evals/lib/handoff-parity.sh        # verdicts only
claude/evals/lib/handoff-parity.sh -v     # and each side's reasons
```

Change one side and run it. They differ only in wording and in how many complaints each lists for the same message; the verdict is the contract.

## The push and release settings

`push` and `release` in the main checkout's `.claude/coder-fleet.json`, set with `/coder-fleet:agents push` and `release`, are settings the lead reads and follows; no hook enforces them, and nothing stops an agent writing the file. `lead-procedures` says what each value asks of the lead. An invalid value reads as the strict one: `push` base-only, `release` off.

`scripts/prune-worktrees.sh` is not a hook but reads the same settings: a worktree counts as merged when its HEAD is an ancestor of the base branch, local or origin's, and under `push: base-only` also when its whole diff landed there as one squashed commit. With the settings absent the base branch is what the remote's HEAD names, else `main`, and only the ancestor test applies.

## Disabled agents

A project switches a fleet agent off by listing it in its main checkout's `.claude/coder-fleet.json`, by hand or with `/coder-fleet:agents`:

```json
{ "disabledAgents": ["researcher"] }
```

`enforce-disabled-agents.sh` runs at `PreToolUse` on the Agent tool. It finds the repository's main checkout starting from `CLAUDE_PROJECT_DIR` when that is a directory, and from the call's `cwd` otherwise - the first worktree `git worktree list --porcelain` names, asked with every git variable that could redirect it unset, and believed only when that checkout's own list names the starting worktree - and reads that checkout's file live through `lib/fleet-config.sh`. When no main checkout can be found that way (no git, no repository, a bare main, a `.git` file pointing at a repository that does not list the worktree) it reads no file at all and every agent is enabled; the starting directory's own copy is never a fallback. What the listing check does not catch is a forged worktree: a repository made for the purpose that registers the worktree itself passes, because the check asks that repository. Starting from `CLAUDE_PROJECT_DIR` is the defence, since a `cd` into such a worktree cannot move it; a session with the variable unset, where the `cwd` decides, is not defended. It denies a spawn whose `subagent_type` is listed, bare or `coder-fleet:`-prefixed; another plugin's agent of the same name is left alone. The reason names the agent and the file, tells the caller not to retry or run the agent's work in its place, and says how to re-enable it.

**The rules** are stated once, in `lib/fleet-config.sh`. No file or no `disabledAgents` key disables nothing. The file is one strict JSON value, as `JSON.parse` reads it, with no byte order mark and brackets nested no deeper than 64 levels; the board's binary parses it (`parseConfig` in `../../boards/src/fleet/config.ts`), as its own process started through `lib/fleet-config.py`, so a python3 is still needed to start it. The rules were written against python3's `json` module and the old jq reading, which accepted number forms such as `01` and `.5` that `JSON.parse` refuses. Without python3, or with a python3 on `PATH` that cannot run (the macOS developer-tools stub), the file is invalid and honours nothing, and the warning says python3 is missing or could not run rather than blaming the file. A name must be printable ASCII, is trimmed, lower-cased and loses any `coder-fleet:` prefix, in that order, then must look like an agent name. `lead`, `coder` and `reviewer` cannot be disabled. A file that breaks a rule - a core agent listed, broken JSON, a list that is not a list of strings - is invalid and honours nothing: every spawn is allowed and carries a `systemMessage` and `additionalContext` saying the file is invalid and why. `review-round` reads the same main-checkout file through its pin lane with the same rules, and `workflow-logic.mjs` runs both readings over one set of fixtures, comparing state, names and reason. A `refuter` or `evaluator` entry, left from before CF-192 folded both into the reviewer, keeps the file valid and disables nothing: `--check` warns about it like any name that matches no fleet agent, and `review-round` logs it and goes on.

**Read on every call.** Nothing is cached in the state directory or at session start, so an edit takes effect on the next spawn with no restart.

**Fails open inside the binary, closed around it.** Input that is not JSON, or any other error the binary catches, allows the call and logs why (`decide` and `disabledAgentsCommand` in `../../boards/src/fleet/disabled-agents.ts`). The shim denies the spawn when the binary cannot run or answers with neither the word `allow` nor a JSON object, as "Failure behaviour" below says.

**`--check [dir]`** validates the file in the main checkout of `dir`'s repository and exits 1 when it is invalid. `check-all.sh` runs it on the coder-fleet repo, which carries no copy, so in CI it can only pass; locally it checks the human's live copy. The contract test is what proves `--check` fails on an invalid file. A listed name that matches no fleet agent - a hand-edited `"researchr"`, or a `refuter` left from before CF-192 - gets a `warning:` line naming it and the fleet agents, and `--check` still exits 0: the file is valid, known entries are honoured, and the spawn hook's decisions do not change. The roster is `fleet_roster` in `lib/fleet-config.sh`, one agent per body under `agents/`, and `scripts/fleet-agents.sh` calls the same function.

Whether the hook sees a workflow's `agent()` spawn is untested, which is why `review-round` reads the list itself rather than relying on the deny. Contract: `claude/evals/lib/disabled-agents-contract.sh`.

## Security

- **There is no secret here.** The board is files under `~/.config/boards` reached by a local binary, so no hook reads a token and the installer renders none. The only network calls are the session-start binary fetch, the fast-forward's fetch and the test gate's `git ls-remote --tags origin`. **No hook ever calls `op`**, since the board needs no secret.
- The board is the one the repository containing the hook's `cwd` reaches, by its origin URL or its git directory's path, so a hook fired inside a coder's worktree or the main checkout writes to the same board. Its private state - each checkout's focus and each spawn's binding - is under `$XDG_STATE_HOME/coder-fleet-boards` or `~/.local/state/coder-fleet-boards`, made 0700 and refused when it is a symlink or another user's.

## Failure behaviour

Every board write fails soft: logged, and the session goes on. A binary that will not run, a repository with no board, a card the gate holds - none of it stops a session.

Exactly one board hook exits 2: `SubagentStop`, when a typed stop's handoff does not parse, which sends the agent back to re-emit it. The card gate never blocks a stop or a task, and the test gate never holds a turn. The disabled-agents shim fails closed instead when the binary will not run, because a rule that cannot be judged is not satisfied.

`../../boards/README.md`, "Tests", says how the board's hooks are driven by hand and in tests.

## What breaks them

- **No board for the repository.** The hooks do nothing and SessionStart says so once per session; the human makes one with `boards.sh init`, the plugin's `scripts/boards.sh`, which asks for the board's prefix.
- **No focus and no `Board-Item:` line.** The spawn binds to nothing and nothing moves, which is right for a scout and a silent gap for real work.
- **A `boards` binary that will not run.** `boards.sh` exits 127; the board hooks do nothing and the disabled-agents shim refuses every spawn.
- **Renaming or moving a script** without updating `hooks.json`. The paths there are literal.
- **Dropping the execute bit.** `git update-index --chmod=+x` if it happens.

## Decisions this layer makes

Items are numbered because other documents and comments cite them by number, so a retired item keeps its number and one line saying what replaced it. Items 2 to 7, 11, 14, 23 and 24 described the old board CF-1.5 removed and its bash hooks, which `boards hook <event>` replaced; their one line points at the code. Items 15, 16, 19, 21, 22, 26 and 27 were rewritten to describe what `boards hook <event>` does now. Items 9, 10, 13, 17, 18 and 20 described the per-agent scope hook and the break-mode reviewer's clock, which CF-21 removed. The board's own decisions are in `../../boards/README.md`.

The design specifies the board writes and the gates; the mechanics below are this layer's own decisions, recorded here so they are found rather than rediscovered.

1. **How a hook knows the item.** A spawn's `Board-Item:` line, else the checkout's focus when it is sent, kept per checkout in the board's private state directory (`~/.local/state/coder-fleet-boards/`), and the `[board:<id>]` task-subject marker for completion. The design says the hook knows the item from the spawn context; this is what that means.
2. **Retired with the old board.** The column names and the per-board resolution of the in-progress column are gone: a board has eight fixed columns, in `../../boards/src/columns.ts`.
3. **Replaced.** How "tests pass" is decided is the test gate's: the board's `test:` command, else the `suite:` line of `AGENTS.md`'s first `gates` block, else a release moves its cards untested. See "The test gate, into Released" in `../../boards/README.md`.
4. **Replaced.** A hook no longer comments on the card at every transition. The event trail records every move, its source and its actor, and the only card comments the board writes itself are the test gate's, on a release that moved a card untested and on a failed run (`../../boards/src/releases.ts`).
5. **Retired.** There is no comment-cut archive in the board's code.
6. **Retired.** `SubagentStop` posts no `## Done` comment; it binds the agent to its card, turns each `Blocker:` line into an Action for Human, and runs the card gate on a coder's or scripter's stop (`../../boards/src/hooks/subagent-stop.ts`).
7. **Replaced.** A valid handoff with no blockers moves no card unless the stop is a coder's or scripter's and the card gate passes (`../../boards/src/hook-moves.ts`, `onAgentStop`).
8. **The handoff check** tolerates preamble prose, which is unparsed. Everything else in the skill is enforced strictly, including the blank-line rule and where a typed line may appear. See above for why.
9. **Retired in CF-21.** Scout's Bash allowlist and its softenings went with the scope hook.
10. **Retired in CF-21.** `fleet-steward`'s repo-root resolution went with the scope hook.
11. **Retired with the old board.** The hooks no longer call a board CLI; they are the board's own code and call its functions directly (`../../boards/src/hook-moves.ts`).
12. **The `SubagentStop` matcher.** The design gives the hook to every subagent. Scoping it to the fleet agents but the lead is this layer's decision, because the workflows spawn `general-purpose` lanes that return JSON.
13. **Retired in CF-21.** The `reviewer` and `ui-designer` scoping rules went with the scope hook.
14. **Retired.** The board's code has no comment length cap.
15. **The event field names come from the shipped CLI, not the docs.** The docs pages truncate before the event sections, so the hooks read the fields the zod schemas in the binary define:

    | Event | Fields |
    |---|---|
    | `TaskCompleted` | `task_id`, `task_subject`, `task_description?`, `teammate_name?`, `team_name?` |
    | `SubagentStart` | the common fields, `agent_id`, `agent_type` |
    | `SubagentStop` | `stop_hook_active`, `agent_id`, `agent_transcript_path`, `agent_type`, `last_assistant_message?`, `background_tasks?` |

    `task_title`, `task_name` and `completion_reason` appear nowhere in the binary. Three consequences:

    - `task-completed.ts` reads `task_subject` for the `[board:<id>]` marker, and nothing else.
    - `SubagentStart` has no spawn prompt and no `tool_use_id` to read, so the `Board-Item:` route runs at `PreToolUse` on the Agent tool, in `pre-agent.ts`, and `subagent-start.ts` only notes the start.
    - `subagent-stop.ts` reads no status. See `docs/limits.md`. A `Blocker:` line in the handoff routes to Blocked by Human, and the test gate's failed release run is the only writer of Blocked.

    To re-derive this after a CLI upgrade:

    ```sh
    strings -a "$(readlink -f "$(command -v claude)")" \
      | grep -o 'hook_event_name:"TaskCompleted".\{0,200\}'
    ```

    `../../boards/test/hooks.test.ts` drives each hook through its entry point.

16. **Structured output carries no handoff, and the hook tells that apart from an empty one.** A subagent spawned from a workflow with `agent(prompt, {agentType, schema})` is forced through StructuredOutput, and its `SubagentStop` payload **omits `last_assistant_message` entirely**. Not the JSON in that field, not an empty string: the key is absent.

    | Spawn | `last_assistant_message` |
    |---|---|
    | with `schema` | key absent |
    | without `schema` | the Markdown handoff |

    Treating an absent field as an empty string would fail the handoff check on every schema spawn. Since the `SubagentStop` matcher covers every fleet name but the lead, and every workflow spawns fleet agents with schemas - `scout` and `reviewer` in `review-round.js`, `researcher` at five sites in `deep-research.js`, `scout` and `spec-writer` in `spec-to-card.js` - the gate would refuse to let those runs stop. Item 12 scopes the matcher away from the built-in lanes; it cannot reach a schema-carrying agent which is itself a fleet agent, so `subagent-stop.ts` reads the field as absent when it is missing or `null` and goes to the transcript instead of failing the check.

    Fields item 15's table does not list, all present on a real event:

    | Event | Additional fields observed |
    |---|---|
    | `SubagentStart` | `cwd`, `prompt_id`, `session_id`, `transcript_path` |
    | `SubagentStop` | `cwd`, `effort`, `permission_mode`, `prompt_id`, `session_crons`, `transcript_path` |

    `agent_type` is bare on the probe agent's event (`probe-worker`) and arrives with the `coder-fleet:` prefix for a fleet agent (item 20), so a hook strips everything up to the last colon. `cwd` is a supported route to the directory a subagent actually worked in.

    **Absent does not prove why, so the hook asks the transcript.** The runtime builds the field as

    ```js
    let p = findLast(m => m.type === "assistant"),
        f = p ? textOf(p.message.content).trim() || void 0 : void 0
    ```

    `.trim() || void 0` turns an empty *or whitespace-only* final message into `undefined`, and undefined properties drop out of the payload. So `last_assistant_message: ""` is **unreachable** - a fleet agent that was asked for a handoff and produced nothing sends a byte-identical payload to a schema spawn. Passing every absent field would retire the gate for exactly the case it exists to catch, so `agent_transcript_path` is read to tell them apart:

    | Last assistant content block | Means | Hook does |
    |---|---|---|
    | `tool_use` named `StructuredOutput` | a schema run, never asked for a handoff | passes, column untouched |
    | `text` | the runtime dropped a message the transcript still holds | recovers it and validates it like any other |
    | `tool_use` with any other name, or `thinking` | the agent stopped mid-turn, with no closing text to validate | passes unchecked, as intended |
    | unreadable, oversized, absent, or no assistant content | cannot tell | passes |

    Read `agent_transcript_path`, never `transcript_path`: the event sends both and only the first is scoped to the subagent. The last two rows are the residual gap and it is deliberate - a transcript this hook cannot classify is not a reason to refuse to let a subagent stop, because deadlocking a run is worse than a rare silent pass. `CODER_FLEET_TRANSCRIPT_MAX_BYTES` caps the read at 20 MB. The reader, `transcriptFinalBlock` in `../../boards/src/handoff.ts`, takes the last assistant block first and classifies it after, so anything but a StructuredOutput call or text falls to the same pass as an unreadable file; reaching back past a trailing tool call to an earlier text block would validate prose that was never a handoff.

    This table is the whole account of which typed stops are checked. A stop with an event message is validated as it stands, and the transcript is never read: the StructuredOutput exemption applies only when the event carries no message, so a schema run that also sent text is held to the handoff. Two passes come before any of it. A stop with no `agent_type` is not a fleet agent and exits 0 unchecked (item 19), and a stop typed as the lead, or shaped like the session's own side call, exits 0 too (item 27).

    To re-derive after a CLI upgrade, spawn one agent twice from a workflow - once with a `schema`, once without - behind a `SubagentStop` hook that dumps its stdin, and diff the two payloads. The control spawn is the point: an empty dump alone cannot distinguish "StructuredOutput ate the message" from "the hook never fired".

17. **Retired in CF-21.** The scope hook's git verb parser went with it.

18. **Retired in CF-21.** The hook that refused a `coder`'s writing git commands outside a linked worktree went with the scope hook; `coder.md` still tells the coder to confirm its worktree before it writes, and `review-round` still cuts the fix lane's worktree and checks the fix landed on its branch.

19. **A stop with no `agent_type` owes no handoff.** The handoff is a fleet convention, preloaded into the twelve role bodies. A spawn that stops without a type - a named teammate, a harness-driven synthetic, a runtime that dropped the field - never had the skill and never agreed to the contract, so `subagent-stop.ts` logs it as `an untyped subagent` and exits 0 before the handoff check, the same way a StructuredOutput run is let go (item 16). The matcher in `hooks.json` does not keep these out on its own: untyped stops do reach the hook, and an exit 2 would ask for four headings the spawn was never given. The log line names the case rather than reading as a role called "agent".

20. **Retired in CF-21.** The break-mode reviewer's 25-minute clock hook went; the reviewer body keeps the 20-minute rule as an instruction. One finding from it outlives it. **Resume evidence:** a SendMessage resume re-fires `SubagentStart` for the same agent id, and a fleet agent's `agent_type` arrives with the `coder-fleet:` prefix (observed in `hooks.log`: one `coder-fleet:spec-writer` id started six times and one `coder-fleet:coder` id three times).

21. **A resume keeps the item its agent started on.** A SendMessage resume re-fires `SubagentStart` for the same agent id (item 20, "Resume evidence"). Reading the focus again would rebind a resumed agent to whatever the lead had focused since, and its `Blocker:` would land on the wrong card. So `onAgentStart` in `../../boards/src/hook-moves.ts` looks for the agent's own binding first: the binding is written once, at the agent's first stop (`bindAgent` in `../../boards/src/focus.ts`), and a resume starts work on that card again; a first start only notes the focus as it is. A resume moves its card to In Progress only from Backlog or Next, so a card in Done stays there, which suits a resume after `TaskCompleted` that is usually a question; a card holding an unticked Action for Human stays held, and one in Blocked by Human with every action ticked goes back to the column it was blocked from first (`startWork`). The binding is keyed by session id, so a lead restarted with `claude --resume` under a new session id is not known to keep it; that is unverified.

22. **A Blocker becomes an Action for Human, and an open one holds the card.** `SubagentStop` turns each `Blocker:` line under Decisions needed into an unticked Action for Human on the agent's card (`addActions` in `../../boards/src/actions.ts`), all added before the one move to Blocked by Human. `startWork` holds a card with an unticked action wherever it is, because otherwise any spawn in a focused checkout, a scout sent while the human is still reading included, would move the card out of the queue. The last tick returns the card to the column it was blocked from; see "Actions for Human" in `../../boards/README.md`.

23. **Retired with the old board.** The hook that commented on a card when a run ended without `SubagentStop` is gone, and nothing replaces it: a `maxTurns` cut-off sends no `SubagentStop` (`docs/decisions/claude-code-behaviours.md`), so a capped run gets no handoff check and its card stays where it is. `docs/limits.md`, "A turn-capped run never sends SubagentStop", says what the lead does.

24. **Retired with the old board.** A workflow run no longer has an item of its own. A workflow lane is sent by no Agent call, so it binds to the checkout's focus as it was when its start was noted (`bindAtStop` in `../../boards/src/hook-moves.ts`), and a lane that starts after a refocus belongs to the newly focused card; `docs/limits.md`, "A workflow lane binds to the focus, not to its own call", records the cost.

25. **A project's disabled agents are denied at spawn, and an invalid list honours nothing.** The human's decisions: the setting is a project file, and the copy that counts is the main checkout's, read live, with a guard against self-exemption; enforcement is advisory (the lead body and `review-round`) and hard (this hook), a disabled refuter was skipped with no substitute gate run (until CF-192 made it a reviewer mode, which cannot be disabled), and `lead`, `coder` and `reviewer` cannot be disabled. This layer chose the rest. The file is `.claude/coder-fleet.json`, because nothing existing fits: the board's `config.yml` is outside the repository and `plugin.json` has no per-project config. An invalid file honours nothing rather than everything it can parse, because a list that names a core agent was written by someone who misunderstood the setting, and acting on the rest of it is a guess; the warning on every spawn is the prompt to fix it. The main checkout is found through git as the first entry of `git worktree list --porcelain`, rather than as git's top level, because reading the worktree a session or a review runs in would let the branch under review disable its own checks. Not the parent of `--git-common-dir`, which is wrong for a `--separate-git-dir` clone. The hook, `--check`, `scripts/fleet-agents.sh` and `review-round`'s pin lane all resolve it that way. The hook starts the search from `CLAUDE_PROJECT_DIR` when it is a directory and from `cwd` otherwise: a `cd` into a worktree that a forged repository registers passes the listing check, and only a starting point the `cd` cannot move keeps that repository's file out. `review-round` also refuses to let the build phase skip a refutation the round already called for when the round's range changes the file, since the main checkout's copy may itself be the uncommitted edit under review; it does not add a refutation to a round that called for none. The reading lives in `lib/fleet-config.sh` so a command that edits the setting can share it. Native `permissions.deny Agent(...)` is not used: it cannot refuse to honour a core entry or name the file. See "Disabled agents" above; contract in `claude/evals/lib/disabled-agents-contract.sh`.

26. **A focus binds only the session that set it, and never to a Done or Released item.** The design binds a spawn from the checkout's focus and says nothing about how long a focus lives; it would outlive its session, and a lead rule to clear it before unrelated work is not enough on its own. Two guards, because each covers a case the other cannot. The board's `SessionStart` hook clears the checkout's focus on every start but a compaction (`focusOnSessionStart` in `../../boards/src/hook-moves.ts`), so a new session starts unfocused, and it keys on the event's `source` in the code rather than a `hooks.json` matcher. Inside a session, binding a spawn refuses a card in Done or Released, whether the focus or a `Board-Item:` line named it, and logs a `move-skipped` line in the event trail (`bindable` there). Known limits: the focus is per checkout, so a second session started in the same checkout, a teammate's included if the runtime fires `SessionStart` for one, clears the focus the running lead set; and a resumed lead must focus again before its first spawn.

27. **A lead-typed stop is the session's side call, and no stop re-emits for ever.** After a main-session turn in a session whose `agent` is the lead, the runtime's prompt-suggestion side call fires `SubagentStop` typed `coder-fleet:lead`, with an `agent_transcript_path` that names no file and the predicted next prompt as its final message. An exit 2 makes it run a second model turn, which writes a handoff. A `-p` run makes no prompt suggestion, so none appears there; see `docs/decisions/claude-code-behaviours.md`, "A stop typed as the lead". The lead is the session agent and is never spawned, so the matcher does not name it and the hook stands down on `lead` or `coder-fleet:lead` as the backstop; what that gives up is a handoff check on a lead someone spawns by hand, which the fleet never does. A side call carries whatever type the session runs as, so a session run as another role (`claude --agent coder-fleet:coder`) types its side calls as that role, and the name alone cannot catch those. The hook also stands down a typed stop by its shape: an agent id with no start noted (`startNote` and `agentCard` in `../../boards/src/focus.ts`) and an `agent_transcript_path` that names nothing on disk. It needs both, because each one alone also describes a real agent: the start hook notes nothing when there is no board, and a real run's transcript exists while it runs. What the shape check gives up: a real agent whose start left no note and whose transcript is missing at its stop is let go unchecked. A real transcript is on disk mid-run (observed); whether it is there at the moment of the stop is unmeasured. A stop with no agent id is always gated. A malformed handoff earns exit 2 at most `CODER_FLEET_HANDOFF_REEMIT_CAP` times per agent, 3 unless set. The count is kept in the private state directory at `reemits/<session>/<agent>` and is cleared by a valid handoff and by the stop the cap lets go, so a SendMessage resume starts fresh. With no agent id, or a count that cannot be written, `stop_hook_active` allows one re-emit. A stop let go either way is logged to stderr and moves nothing, since a Blocker read out of a malformed handoff is a guess. `roster-contract.sh` holds the `SubagentStop` matcher to the roster and to the lead's absence from it.
