---
name: ci-green-before-ready
description: Wait for a PR's CI to finish green before writing "ready to merge" on the card - local and reviewer gates on macOS can pass while CI's Linux runner fails
metadata:
  type: feedback
---

Before the `ready to merge in PR #<n>` comment, wait for `gh pr checks <n> --watch` to finish green. A reviewer's green gates in a macOS worktree are not CI.

**Why:** On 13 Nov 2026 a /drain marked CF-204 ready while CI was still running; the human merged PR #184 with CI red. A new test pinned `answered 500`, and Linux CI saw 502. The release PR then failed on main, and a follow-up fix PR (#187) was needed before v0.57.0. Same lesson as "CI-only failures are real" in [[shipping-a-stack-overnight]].

**How to apply:** In /drain and in ordinary shipping, run the CI wait in the background after opening the PR. Write the ready comment only once CI is green. If CI is red, read the failure and take it into the item's one fix round.
