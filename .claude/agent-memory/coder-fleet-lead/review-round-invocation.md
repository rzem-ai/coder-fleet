---
name: review-round-invocation
description: How to call the review-round workflow - JSON args with target or base/head, and what a "fix handoff required" stop means
metadata:
  type: reference
---

Call `Workflow({name: "coder-fleet:review-round", args: {...}})` with a JSON object, never a prose string: a string is read as `range` and unknown keys are refused. Accepted keys: range, base, head, target, issue, maxRounds, fix, refute, round.

- First round on a branch: `{"target": "<branch>", "issue": "<id>", "fix": true, "refute": false}`.
- Narrow round on a fix commit: `{"base": "<reviewed head sha>", "head": "<fix sha>", "issue": "<id>", "round": 2, "fix": false}`.
- A stacked Polish sub-issue: base is the parent branch's head, not main, so the review sees only its own commit.

`stopped: "fix handoff required"` with `approved: false` means the workflow did not commission the fix itself: the lead sends the findings back to the builder (SendMessage resumes it on the same card) for the one fix round.

The workflow binds to the checkout's focus at launch, so set `task_focus` before each launch when several items are in flight; refocusing afterwards is safe.

Related: [[cwd-decides-which-tree]].
