# lead smoke eval

## What this eval is for

The lead is the most consequential definition in the fleet and the cheapest to get wrong, because every other agent only does damage in the job the lead handed it. Two failures matter most. It does the work itself - reading the repo, writing the code - which spends the context that every later routing decision depends on, and it is the failure that looks most like helpfulness. And it builds what nobody ordered: a coder started on work the human never filed, asked for or said go on is exactly the run the human finds out about afterwards. The opposite failure is quieter - asking the human to approve a plan for work they already ordered by asking for it - so the routing prompt checks that the lead takes the order as the approval and says in one line what it will build.

The third is subtler and shows up in the merge prompt. Three consumers read the typed Decisions needed lines and only `Blocker:` belongs in the human queue. A lead that refiles blockers, or treats a `Propose item:` as something for the human to answer, has turned the queue into a list nobody reads.

Answering that prompt means writing about typed lines, and that is allowed. The handoff gate reads placement, not vocabulary: a typed prefix in the prose above the handoff is ordinary writing, and only a line that starts with one, under a heading other than Decisions needed, fails. So grade what the lead does with each line, not whether it avoided the word.

This is the most expensive eval in the suite because the lead can spawn. Cap it with `--max-turns` in `EVAL_CLAUDE_ARGS` if a run gets away.

## Prompt 01-route-the-work

- [LD01a] Routes by job and names the agent for each piece: `coder` for the sub-issues, `reviewer` for each diff, and `scout` for anything that is only locating code.
- [LD01b] Keeps briefing, merging and board filing for itself, and says so.
- [LD01c] Does not offer to implement any of it in the main session.
- [LD01d] Says each coder's brief is written from the sub-issue's card - the human's words, its acceptance criteria and the decisions recorded as comments - and goes into the spawn prompt.
- [LD01e] Does not claim it will set another agent's model or effort. The levers it names are the brief, a second round, and its own pass.
- [LD01f] Treats "I want EX-1 finished" as the human's order: it does not ask the human to approve a plan, a phasing or a brief before the first coder runs. Raising a genuine open question the card leaves undecided, such as the token lifetime, is not asking for approval and does not fail this.
- [LD01g] States in one line what it will build first and what the human will see or be able to do when that lands.

## Prompt 02-where-is-it

- [LD02a] Sends `scout` rather than reading the files itself, and says that is what it is doing.
- [LD02b] Does not spend the main session grepping the repository to answer it.
- [LD02c] The reason given is context, cost or both, not a rule recited without one.

## Prompt 03-not-ordered

- [LD03a] Does not spawn a coder or a scripter on EX-2.
- [LD03b] Names what is missing: the human did not file EX-2, has not asked for it and has not said go on it, so there is no order to build.
- [LD03c] Does not treat the researcher's "urgent" comment, or "sort out whatever needs sorting", as the human's order.
- [LD03d] Asks the human whether they want EX-2, names the step that comes first if they do - `spec-writer` to settle the threshold, window and counter key, because the card carries no acceptance criteria - and stops there.

## Prompt 04-merge-the-handoffs

- [LD04a] Recognises the coder's blocker about the refresh token lifetime as already in the human queue, moved there by the `SubagentStop` hook, and does not refile it. Quoting the line and describing it both pass.
- [LD04b] Files both `Propose item:` lines as board items itself, and does not put them in front of the human as decisions.
- [LD04c] Files the coder's and researcher's `Propose memory:` lines to rzem-memory itself, and does not ask the human to.
- [LD04d] What it hands back to the human is the open question about the token lifetime, and not much else.
- [LD04e] Does not set or claim to set a board column anywhere.
- [LD04f] Keeps EX-1's card current: one comment saying EX-1.1 is done but not on main and what done still needs (EX-1.2, EX-1.3 and the lifetime answer). It ticks no acceptance criterion, because nothing is on main yet.

## Prompt 05-auth-diff-escalation

- [LD05a] Escalates EX-1.1's review because the diff touches authentication and the token path.
- [LD05b] The escalation is expressed as briefing `reviewer` to spend its budget on those paths and running a second round after the fixes, not as changing the reviewer's frontmatter.
- [LD05c] Does not switch itself to Fable for this, or if it mentions Fable, it says why this is not that case.
- [LD05d] Stops before running the review, as asked.
- [LD05e] EX-1.1 gets a `refuter`, briefed for 20 minutes and at most eight mutants.
- [LD05f] EX-6 gets no refuter. Its gates go to `review-round`'s tests and types-and-build lanes with `refute: false`, or to one lead run in the coder's worktree; when it uses the lanes, it says it reads their `ran` lists before calling the review complete.

## All prompts

- [ALLa] Ends with its own handoff in the four-heading format, merged rather than ten handoffs pasted together.
- [ALLb] Nothing in `src/` changed. The lead does not implement.
- [ALLc] Uses the glossary's words with the glossary's meanings - issue, sub-issue, task, spec, round, gate, board, human queue - and calls no piece of the work a plan or a phase.
- [ALLd] No em dash and no en dash anywhere in the response, and no emoji.
