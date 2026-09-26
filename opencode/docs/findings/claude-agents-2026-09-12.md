# Findings against claude-agents, gathered while porting it to OpenCode

Evidence gathered on 2026-09-11 and 2026-09-12 while using the `claude-agents` fleet to build `opencode-agents`, a port of itself. Every claim below was checked against the source fleet, now `claude/coder-fleet/` (read-only), at commit `705ce4d35a29c6468a9289c830ba4ff642fbb8ab` (`v0.12.0: kickoff learns to set the table`, 2026-09-12 00:22:41 +1000) of its former repository, unless a claim states otherwise. This matters here more than it usually would: the repository shipped three tagged versions - v0.11.0, v0.11.1, v0.12.0 - in the twenty-four hours this document covers, so a claim checked against one is not automatically true of the next. Each finding below that turned on a since-changed line says which commit it was checked against.

The fleet's most valuable properties - scope enforcement, the handoff contract, tool grants - are exactly the ones whose failures are silent. A body can declare an invariant it has no way to enforce, and nothing in the run tells you the declaration was empty. That is worse than an absent invariant, because an absent one at least does not tell the agent, and whoever is reading the agent's output, that a lock is holding when it is not. The findings below are instances of that one class, ordered by how much damage the instance can do, followed by two findings of a different shape: contention for a shared resource the delegation policy never mentions, and the specific way a silently-failed agent looks identical to a successful one.

## Finding 1 - `coder` declares an invariant its definition cannot enforce, and the fleet's own changelog says the same thing

`claude-agents/agents/coder.md:6` carries the frontmatter comment `# isolation is set because this is the only agent that writes code`, and line 10 sets `isolation: worktree`. The body's opening line asserts the consequence as settled fact:

> You run in your own git worktree, which is why parallel coders do not trample each other and why a bad run is one `git worktree remove` away.

`isolation` is not a property the agent definition enforces. It is a parameter on the spawn call - the plan and the agent contract both say so. `docs/agent-contract.md:25` lists it as `| isolation | string | worktree | no | Only coder sets it |`, and `docs/agent-contract.md:106` repeats it as a checklist item: `memory` and `isolation` are absent unless the roster row genuinely asks for `worktree`. Nothing in that table, or anywhere else in the contract, says what makes `isolation: worktree` actually put `coder` in a worktree at spawn time. `agents/lead.md` - the only body that spawns agents - never mentions passing `isolation` when it routes work to `coder`; its own frontmatter comment (`agents/lead.md:5-6`) explains only why the field is absent from `lead` itself.

Observed directly: three `coder` agents were spawned concurrently for Phases 0, 1 and 2 of the port. `git worktree list` in the target repo returned a single tree - the main checkout, nothing under `.claude/worktrees/`. Commit `6c95eac1c4e4f09b8548dbdb023fb76b2f1e23e2` in the former opencode-agents repository, now `opencode/`, whose subject and body are entirely about the handoff skill (Phase 2's work), carries this in its diff stat:

```
 .opencode/skill/handoff/SKILL.md | 10 ++++++----
 opencode.json                    | 33 +++++++++++++++++++++++++++++++++
```

`opencode.json` is Phase 1's file. It was committed inside a message describing neither Phase 1's work nor itself, by whichever `coder` happened to be running when the commit was made. No error was raised, before or during. This is precisely the trampling the frontmatter comment exists to prevent, and nothing in the run told the human it had happened - it was found by reading the diff stat afterward.

What I have not been able to establish, and am flagging rather than guessing at: whether a newer defence already closes this. `CHANGELOG.md`'s `[0.12.0]` entry (commit `705ce4d`, 2026-09-12 00:22:41 +1000) describes a `PreToolUse` hook, `enforce-agent-scope.sh`, that refuses any writing git command from `coder` whose target directory git cannot show to be a linked worktree, including a directory that is not a repository at all - and by timestamp, that commit landed roughly twenty minutes *before* the trample commit below (`6c95eac`, 00:42:31), so the hook already existed in the source repository when the trample happened:

> **`coder` writes in its own worktree, or it does not write.** The only preventive check in the fleet... A writing git verb is refused unless its target... can be shown to be one [a linked worktree]... Not being able to tell is not permission, because the case this exists for is isolation silently not happening. Know the cost: if isolation does not hold, coder now stops rather than leaking commits into whatever checkout it is in.

This is a real answer to the invariant, but a different one than the frontmatter claims: not "coder runs in its own worktree" but "coder is blocked from writing git history anywhere that is not a linked worktree." The fleet's own `docs/TODO.md` says the underlying question is still open: "Worktree isolation for a workflow-spawned coder still has not been observed" - the hook has never been exercised against a live spawn where isolation was supposed to hold and didn't. Whether `enforce-agent-scope.sh` was active in the session that produced `6c95eac` is unverified; a session loads the plugin at its own start, and the hook landed in the source repository twenty minutes before that commit, so the more likely explanation is that the session had already loaded an earlier version and never picked the hook up mid-run - but I have not confirmed which plugin version that session was actually running, so I am stating the likelier read rather than a settled one. Either the hook was not active for that session, in which case the trample above is exactly the failure the fleet had not yet defended against for that run, or it was active and did not fire, in which case the fleet's own preventive check has a gap worth its own investigation. I can't tell which from here, and the document should not pretend to.

What would fix the underlying claim, and what each costs:

- **The plugin honours the frontmatter at spawn time**, so `isolation: worktree` on the agent definition is itself what puts `coder` in a worktree, with no separate step for the lead to remember. This is the only fix that makes the body's own sentence ("You run in your own git worktree") true rather than aspirational. Cost: this is a change to how Claude Code's `Agent` tool consumes agent definitions, outside the fleet's control - the fleet can request it but cannot build it.
- **`agents/lead.md` documents that spawning `coder` requires passing `isolation: "worktree"` on the call**, closing the gap by convention rather than by construction. Cost: cheapest, one sentence in `lead.md`'s spawn step - but it is a convention, and every convention decays the moment someone spawns `coder` a different way (a workflow, a script, a future orchestrator that does not read `lead.md`).
- **An eval or a live-fire probe asserts a spawned `coder` is actually in its own worktree**, per the open item in `docs/TODO.md`. This catches a regression once the mechanism exists, and it is also what would finally confirm or falsify whether `enforce-agent-scope.sh` fires when it should. It does not catch the first occurrence, and it does not by itself make the invariant hold - it only proves whether the other two fixes do.

Second and third are compatible and cheap; ship them together. First is the one that removes the gap rather than papering it, and it is the one worth escalating.

## Finding 2 - MCP tool names fail exactly as silently as the fleet already knows they do

`docs/agent-contract.md` section 6 states the failure mode outright, in its own words:

> A `tools` line grants an MCP server by the name Claude Code registered it under - `mcp__<server>` for the whole server, `mcp__<server>__<tool>` for one tool. The name is case-sensitive and nothing normalises it. A body naming a server that does not exist grants nothing, raises no error and prints no warning: the agent just runs without those tools, and the first sign of trouble is a `researcher` that cannot reach Hugging Face or a `spec-writer` that cannot read the board.

The same section records that this has already happened in this repository: "The earlier spellings `mcp__rzem-memory__`, `mcp__Notion` and `mcp__Hugging_Face` were transcribed from display names and granted nothing." The fleet documents its own silent-failure class in exact, specific language, then ships six agent bodies (`coder`, `reviewer`, `researcher`, `spec-writer`, `fleet-steward`, `lead`) that depend on MCP tool names it has no way to verify against the environment a given session actually has. The contract's own mitigation is manual and slow: someone runs `claude mcp list` on one machine, records the string, and every future session trusts that the string still matches.

What would fix it: a startup check, even a cheap one, that diffs the identifiers a `tools` line names against what `claude mcp list` actually returns for the session, and surfaces the mismatch as visible text rather than as an agent that quietly can't do part of its job. Cost: this needs either a hook with API access the fleet does not currently have (no `SessionStart` check does this today, per the hooks inventory), or a manual step added to onboarding that the contract does not currently ask for. Cheapest partial fix: add "run `claude mcp list` and confirm every name in this table matches" to `fleet-steward`'s weekly sweep, since it already audits installed plugins and already has `Bash`.

## Finding 3 - twelve skills are named in frontmatter with no SKILL.md behind them

The plugin ships eight skills: `board`, `compound`, `glossary`, `handoff`, `humanize`, `looping`, `migration-checklist`, `run-article` (`ls claude-agents/skills`). Agent frontmatter across the roster names twenty: the eight above plus `brainstorming`, `cyber-identity-docs`, `design-studio`, `docwright`, `drizzle`, `electron`, `fastify`, `react`, `review-checklist`, `tailwind`, `tdd`, `using-memory`. Twelve names resolve to nothing in this plugin.

`coder.md` names five of them under a comment that gives away the intent - `# the stack suite, named as in the roster` - listing `electron`, `react`, `drizzle`, `fastify`, `tailwind`, `tdd`, `using-memory` as preloaded skills. `reviewer.md` names `review-checklist` as the second numbered step of its entire procedure: "2. Work the `review-checklist` skill over the diff." If any of these are meant to arrive from a different, separately-installed plugin, that dependency is not stated anywhere I could find in `docs/agent-contract.md`, the plugin manifest, or the README. An install of `claude-agents` on its own leaves `reviewer` instructed to run a procedure step that does not exist, and - per the same silent-failure shape as Finding 2 - nothing says so. The agent either skips the step or improvises one, and either way the fleet's own review procedure was never actually followed.

What would fix it: either ship the twelve skills, or state the external dependency explicitly in the contract (which plugin, which version) so `fleet-steward`'s plugin audit has something to check against, or - cheapest and most honest for now - remove the twelve names from frontmatter until the skills exist, so a body's step list matches what a fresh install actually has. The third option costs the least and is reversible; the others are the real fix but require someone to decide where those twelve skills are supposed to come from, which this findings document cannot decide on its own.

## Finding 4, closed - the handoff parser was brittle on trailing whitespace, was measured, and was fixed the same day

I was briefed to report that trailing whitespace breaks the handoff's heading anchor, citing a measurement of twenty runs against a local model with a 60 percent failure rate on two trailing spaces. Checked against the tip of the repository (`705ce4d`, v0.12.0), the claim does not hold - but checked against its history, the reason is better than "the brief was wrong." The measurement was accurate when it was taken, it reached Alex, and a separate session fixed it within hours. This is now a closed finding, not a refuted one.

`git log -S "right-trim"` over `hooks/board-subagent-stop.sh` and `skills/handoff/SKILL.md` finds exactly one commit: `e13251679add6c57099e86a8c8ea6b52e3a1bc21`, `v0.11.1: strict about meaning, tolerant about invisible bytes`, 2026-09-12 00:03:28 +1000. Its message names the exact defect the measurement found:

> Handoff headings failed on two trailing spaces - the markdown hard-line-break idiom - while the None filter already tolerated a trailing tab and the CRLF strip was the same normalisation half-done. All three readers now right-trim every line before any anchor sees it, the docs say so, and a fixture pins it.

Before this commit, `^## (Done|Not done|Unverified|Decisions needed)$` was matched against the raw line, and a model closing a heading with the markdown hard-line-break idiom - two trailing spaces - failed the anchor: exactly the 60 percent-of-twenty-runs result reported. After it, `hooks/board-subagent-stop.sh:55-61` right-trims every line before any anchor sees it - `line="${line%"${line##*[![:space:]]}"}"` runs ahead of the heading regex - and `skills/handoff/SKILL.md` states the same rule in the docs the model reads. Two trailing spaces after `## Done` cannot fail this parser as of v0.11.1. Leading whitespace stays deliberately significant throughout ("`-  None`, two spaces after the dash, is a real item, and an indented dash is not an item" - `hooks/board-subagent-stop.sh:60-61`) - the fix is about invisible bytes that never change meaning, not about loosening the format generally.

I was also asked to check the other failure mode the same measurement would have hit: a stray sign-off line after the final item - literally `Handoff.` on its own line, violating "the handoff is the last thing in the message." Traced through the validator's loop (`hooks/board-subagent-stop.sh:90-140`): once a heading has set `sec`, every subsequent non-blank line is required to match `^- ` or the run fails with "line under `## <sec>` does not start with `- ` at column 0"; a blank line before it instead trips "blank line inside `## <sec>`". A trailing `Handoff.` line lands under whichever section was last open - there is no heading after it to close that section - so it hits one of those two checks either way. This was already true at v0.11.1 and is unrelated to the trailing-whitespace fix. Both failure modes the original measurement would have exercised are caught by the current validator, so the whole class is closed, not just the trailing-whitespace half of it.

What this episode demonstrates belongs on its own, separate from the specific fix: a finding produced by actually using the fleet on real work - not by running the eval suite - reached the maintainer and was fixed the same day, before this document was even finished. That is the argument for stress-testing a system by building something real with it rather than only running its own smoke tests against it: the eval suite tests what the fleet's authors thought to test, and this defect was found by a model hitting the format in the way models actually write, which is not the same set of cases.

## Finding 5 - nothing in the delegation policy accounts for contention over a shared, finite endpoint

The fleet's delegation policy (`agents/lead.md`, step 6: "Spawn only what the work needs") reasons about context economy and role boundaries. It says nothing about subagents competing for one external resource with finite capacity.

Observed while building the port: three agents ran concurrently against one LM Studio instance on `trillian`, configured for four parallel slots. The failure did not look like contention - it looked like a context-size error on a prompt three tokens long:

```
[2026-09-12 00:50:54][ERROR][qwen3-coder-next] Engine protocol predict stream returned an error: {"code":500,"message":"Context size has been exceeded.","type":"server_error"}
```

A three-token prompt cannot exceed a 64768-token window. The error names the state of a shared KV cache that has nothing left to give, not the size of the request that happened to land while it was full - confirmed against the log lines immediately preceding it, `failed to find free space in the KV cache` and `failed to find a memory slot for batch of size 1`. Anyone who meets this message will trim their prompt, measure their system prompt, or lower `limit.context`; none of that touches the actual cause. Full measurement is in `opencode/docs/measurements/runtime.md`.

This generalises past this one local model. Any subagent fan-out against a shared rate limit - a hosted API with a per-account concurrency cap, a single database connection pool, a shared browser session - has the same shape: the failure surfaces as something else, at the boundary furthest from the actual cause, and nothing in the fleet's current policy asks "how many of these can run against this resource at once" before it spawns them.

What would fix it: a line in `agents/lead.md`'s delegation policy that names resource contention as a second axis alongside context economy - concretely, that concurrent spawns hitting the same external endpoint should be capped or serialised, and that a diagnostic step (check the endpoint's own logs, not just the client-side error) belongs in the fleet's incident-reading habits before trusting an error message's stated cause. Cost: one policy sentence, cheap to write, and it does not by itself fix any given deployment's actual concurrency limit - that stays a per-environment number nobody but the operator running the endpoint knows.

## Finding 6 - a silently-failed agent and a successful one are indistinguishable, and this is also the handoff contract's best argument for itself

The most dangerous failure mode observed while building the port was an agent returning as though it succeeded, having done nothing. Three unrelated causes produced the same symptom:

- A reasoning model burning its entire token budget on hidden reasoning returns HTTP 200 with empty content. Observed on `nemotron-3-nano-4b`: 120 tokens consumed, no content, per the spec's own recorded measurement.
- A saturated endpoint under the contention described in Finding 5 retried silently for roughly five minutes, then exited 0 with an empty assistant message and nothing on stdout - visible only under `--print-logs --log-level DEBUG`, per `docs/measurements/runtime.md`: "An agent that fails this way inside a pipeline looks like an agent that had nothing to say."
- A tool name that resolves to nothing, per Finding 2, grants nothing and says nothing.

A missing `Blocker:` line under `## Decisions needed` reads identically whether the agent genuinely had nothing to flag or was never meaningfully reached at all. The handoff contract, on its own, cannot tell these apart - and I want to be fair to the contract rather than only list this as a gap, because there is a real defence built into its own shape. A conforming handoff - four exact headings, in order, each section populated, typed lines only where the format allows them - cannot be produced by a model that was never reached. Producing one at all is evidence of a functioning turn, independent of what it says. That means the four-heading check is doing double duty as a liveness check, not only a formatting one, and it is an argument against ever loosening the contract to make it more convenient to emit - the strictness is what makes an absent or malformed handoff mean something.

What that argument does not cover, and what has to be added as an operational rule rather than left to the contract: an agent run that exits 0 with no assistant text has failed, full stop, and must never be treated as a success just because nothing crashed. `docs/measurements/runtime.md` states this as the first of three checks the port needs to carry, and it belongs in `claude-agents` too, not only in the port: "An `opencode run` that exits 0 with no assistant text has failed. This is one condition and it catches the whole class." The fleet-side equivalent is a `lead` invariant: a subagent result with no handoff at all - not a malformed one, an entirely absent one - is a failed run, not a `Not done` line to write around.

## Finding 7, minor - the evals claim a CI gate that does not exist

`skills/glossary/SKILL.md` defines an eval as "A smoke test for one agent: three to five prompts, a rubric, a baseline score. Run in CI on every definition change," and maps it to `` `claude -p` in `claude-agents` CI``. `agents/fleet-steward.md:31` repeats the claim as an instruction: "Run the smoke evals on that pull request with `claude -p` in CI." There is no CI configuration anywhere in the repository - no `.github/workflows/`, no `.yml` or `.yaml` file of any kind. The evals run by hand, via `evals/run.sh`.

This is minor because nothing depends on the claim being true the way Finding 1 and Finding 6 do, but it is the same shape in small: a definition (the glossary entry) and an instruction (`fleet-steward`'s own procedure) both assert an enforcement mechanism that is not there, and a new maintainer reading either one has no way to know from the text that it is aspirational rather than actual. Fix: either add the CI workflow the two documents already describe, or change both to say the evals are run manually via `evals/run.sh` today, with CI as a stated future step rather than a present-tense claim.

## What this whole night argues, beyond any one finding

Finding 4 is the one instance here of the loop actually closing: a real defect, found by using the fleet rather than by testing it in the abstract, reached its maintainer and was fixed within the same day this document was being written. That is worth stating as its own conclusion, not folded into the finding it came from. An eval suite tests what its authors already thought to check. Building something real with the fleet - a full port, under time pressure, with concurrent agents and a flaky local model - surfaces the cases nobody wrote a test for, because the format broke in exactly the way a model actually writes rather than the way a fixture author imagined. The other six findings in this document are still open, and Finding 1 in particular shows the same organisation moving fast enough that a defence can land in source twenty minutes before the failure it was meant to prevent, with no way from here to say whether it was too late for that one run. The fix for that is not caution about building real things - it is the same thing that fixed Finding 4: keep building real things with the fleet, and keep this kind of document current enough that what gets found reaches Alex before the next version ships past it.

## Handoff

### Done

- Verified Finding 1 (`coder` isolation) against `claude-agents/agents/coder.md:6-10`, `docs/agent-contract.md:25,38,106`, `agents/lead.md:1-13`, `CHANGELOG.md` `[0.12.0]`, and `docs/TODO.md`; cross-checked against the observed `git worktree list` output and commit `6c95eac1c4e4f09b8548dbdb023fb76b2f1e23e2` in the former opencode-agents repository, now `opencode/`.
- Verified Finding 2 (MCP silent no-op) against `docs/agent-contract.md` section 6, quoted exactly.
- Verified Finding 3 (twelve unshipped skills) by diffing `ls claude-agents/skills` against every `skills:` frontmatter block in `claude-agents/agents/*.md`; confirmed the count is exactly twelve and confirmed `reviewer.md`'s dependency on `review-checklist` as a named procedure step.
- Closed Finding 4 (handoff trailing-whitespace claim): found via `git log -S "right-trim"` that commit `e132516` (v0.11.1, 2026-09-12 00:03:28 +1000) fixed the exact defect the measurement found, confirmed the fix against `hooks/board-subagent-stop.sh:55-61` and `skills/handoff/SKILL.md`, and traced the validator's item-prefix check (`hooks/board-subagent-stop.sh:90-140`) to confirm the second failure mode from the same measurement - a stray sign-off line after the last item - is also caught, so the whole class is closed as of `e132516`.
- Verified Finding 5 (resource contention) and Finding 6 (silent success) against `opencode/docs/measurements/runtime.md`, quoting its log excerpts directly.
- Verified Finding 7 (CI claim) against `skills/glossary/SKILL.md`, `agents/fleet-steward.md:31`, and confirmed no `.yml`/`.yaml` file or `.github/workflows/` exists anywhere in the `claude-agents` repository.
- Saved this document to `opencode/docs/findings/claude-agents-2026-09-12.md`.

### Not done

- Did not establish whether `enforce-agent-scope.sh`'s worktree check (landed in commit `705ce4d`, v0.12.0, twenty minutes before the trample commit) was actually loaded into the session that produced commit `6c95eac` - a running session need not have reloaded the plugin mid-run, and I had no way to check which version that session had loaded.
- Did not locate the original "twenty runs, 60 percent" measurement artifact itself; I confirmed the defect it describes and its fix by commit history rather than by finding the raw run log.

### Unverified

- Whether the twelve skill names missing from Finding 3 are meant to arrive from another, separately installed plugin. I found no statement of such a dependency in the contract, manifest or README, but absence of a statement is not proof no such plugin is expected.
- Whether `claude mcp list` server names (Finding 2) still match what a fresh session actually registers today; the contract's own table is dated 9 September 2026 and says as much about itself.

### Decisions needed

- Propose item: land the `agents/lead.md` documentation fix from Finding 1 (state explicitly that spawning `coder` requires passing `isolation: "worktree"`) - it is the cheapest of the three candidate fixes and closes the gap by convention immediately, without waiting on the harness-level fix.
- Propose item: resolve Finding 3 one way or the other - either ship the twelve missing skills, document the external plugin dependency in `docs/agent-contract.md`, or strip the twelve names from frontmatter so a fresh install's agent bodies match what they actually have.
- Propose item: correct Finding 7 by either adding the CI workflow `skills/glossary/SKILL.md` and `fleet-steward.md:31` both describe, or rewriting both to describe the manual `evals/run.sh` process that actually exists today.
