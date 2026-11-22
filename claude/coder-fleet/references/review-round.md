The lead's body, step 4, sends you here before you run `review-round`, and whenever a review result carries something that step does not explain.

# Running and reading review rounds

## Where the gates run

A `reviewer` runs the declared gates read-only, never changing the diff or its dependencies, in a worktree at the reviewed head and never in the main checkout or whatever checkout your shell is in. `review-round` reads the coder's clean worktree at that head or cuts one it removes after; a `reviewer` you spawn gets the coder's worktree and head in its brief.

On a change with no break mode, `review-round`'s verdict reviewer runs the gates once a round at the pinned head, with `refute: false` passed when `fix: true` is; outside `review-round`, you run them once in the coder's worktree with the output captured to a file, and read the summary. Before calling the review complete, read the result's `gates`, and on a change someone else built run the gates yourself when anything is under `gatesMissing`. A `refuter` or `evaluator` entry under `disabledAgents` switches nothing off, since both are reviewer modes and the reviewer cannot be disabled; `review-round` logs it and goes on, and you tell the human the entry can go.

## Reading findings by phase

Build asks whether the card's criteria hold for the inputs a person will give the product; harden asks what input they would not give. A build-phase finding that answers the second question is a Low and is dropped, and in build a `must fix:` or `survived:` bullet with no user-reachable path is read as one. In build, `review-round`'s `refutation skipped by build phase` stop counts as the review being complete. What harden adds is in `${CLAUDE_PLUGIN_ROOT}/references/break-mode.md`.

## How a failing gate line is matched

A round with anything under `gatesFailed` - a gate line with a non-zero exit, and the head it ran at - is not approved, whatever the verdict says. `review-round` makes each one that matches a gate the main checkout's `gates` block declares a blocking finding carrying the declared command: under `fix: true` in harden it commissions a fix for the gate and the next round runs the gates again, and otherwise it comes back in `fixRequest`. A line matches when its command, less a leading `cd <dir> &&`, starts with a declared command, so a narrowed rerun still fails its gate; but a gate counts as run only from a line that is its whole command, with at most one note in brackets such as (rerun), so a narrowed green line leaves it under `gatesMissing`. A failing line that matches nothing, or any failing line when the project declares no gates or the block could not be read, is under `gatesUnactionable` and commissions nothing, because a gate line is the reviewer's text and a coder never runs it; with no failing declared gate beside it, the round stops as `failing gate not declared`. Read why it failed before anything else; a pass on a rerun is an intermittent failure, not a pass.

## The round after a fix

The round after an accepted fix is narrow: the reviewer alone, over the fix commit, against what the round before asked for. When git says the fix changed prose alone, `review-round` runs no such round and stops with `prose-only fix`: no round reviewed the fix and no gate ran at its head, and `gatesMissing` names that head. Read the fix's diff against each finding yourself, and call the review complete only when the gates pass at that commit - run by someone other than the builder, or CI's result on it - and each finding is answered; one that is not takes the next round. What is never prose is `review-round`'s `proseOnly` rule, kept in the workflow and nowhere else, and a fix for a failing gate is never skipped; either gets the narrow round. In harden, where a break lane would have run on that round, decide from the triggers in `${CLAUDE_PLUGIN_ROOT}/references/break-mode.md` whether to spawn a break-mode `reviewer`. Neither shortcut applies on an authentication or credential path, whose every round is the full, deeper one.

When commits land on a pull request after an approval, review only those, in one narrow round, which licenses no further fixes on the first findings.

## Counting rounds

Pass `round` with each `review-round` run's number so its cap, three by default, counts every round on the change rather than starting again; a narrow round is one, and so is a `reviewer` you spawn over a fix commit in its place. An authentication or credential diff is under the same cap, with every round the deeper review.

## Pull requests and fix branches

Pass `pr: <n>` to `review-round`, which turns the pull request back to a draft itself when a round asks for changes, and marks it ready only when an approval is of the pull request's own head. A fix `review-round` made is on its own `review-round/` branch, so the approval is not of the pull request's head: bring the fix onto its branch, and mark it ready yourself only once its head is a commit a round approved.
