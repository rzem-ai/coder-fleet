# CF-28 tag back-fill

Prepared 2026-10-07 on branch `cf-28-release-tags`. Nothing here is pushed: the tags below exist only in the builder's worktree repository (tags are shared across worktrees, so they are visible in the main checkout too), and the lead reviews and pushes.

## How the list was built

Every version that ever appeared in `claude/coder-fleet/.claude-plugin/plugin.json` on origin/main, found with `git log origin/main --full-history -m -p -G'"version"' -- claude/coder-fleet/.claude-plugin/plugin.json`, compared with `git ls-remote --tags origin`. For each untagged version, the commit to tag is the commit on main's first-parent history where plugin.json first carries it. The `vX.Y.Z:` subject commit is the branch head merged by that commit; it is listed so the lead can choose between them.

Existing tags are mostly annotated (40 of 51 on origin); only v0.28.0 and v0.37.6 onward are lightweight. The new tags are annotated, with the message form the older tags use.

## Created locally

| Version | Tag on (first-parent) | Subject commit | Agreement | Found by |
|---|---|---|---|---|
| v0.27.18 | 1b20329 `Merge pull request #40 from rzem-ai/cf-3-review-round-input` | 6813a48 `v0.27.18: review-round refuses unknown input keys and accepts a branch as target (CF-3)` | The merge's second parent is the subject commit | First-parent scan of plugin.json |
| v0.28.1 | 6190b58 `Merge pull request #42 from rzem-ai/release-v0.28.1` | 01db94e `v0.28.1: remove the dead Task Resolution Strategy setting from the board (CF-73)` | The merge's second parent is the subject commit | First-parent scan of plugin.json |

Both follow the placement of the older tags (v0.27.17 is on its PR merge d681632). If the lead prefers the subject commit, which the card comment names, retag with `git tag -f -a <version> <subject commit>` before pushing.

## Already tagged locally, not on origin

| Version | Local tag on | First-parent release commit | Note |
|---|---|---|---|
| v0.28.2 | 654d078 `v0.28.2: release CF-48, CF-80 and CF-84 ...` (the subject commit) | fbf51e5 `Merge pull request #47 from rzem-ai/release-v0.28.2` | Annotated, made by the lead, never pushed. Left as it is. It sits on the subject commit while v0.27.18 and v0.28.1 above sit on the merge, so the lead should pick one placement for the three before pushing. |

## Left untagged

| Version | Why |
|---|---|
| v0.24.3 | Only the import commit c094a3d (`import the three fleet repos into one tree, contents verbatim`) carries it, with no `v0.24.3:` subject. It is the pre-migration number of the imported tree, not a release of this repository. No single clear release commit. |
| v0.34.1 | Set on branch commit 54024ac (`v0.34.1: the board web server refuses DNS-rebinding requests (CF-139)`) and renumbered to 0.35.1 by the time it reached main. Never in main's first-parent history. The release shipped as v0.35.1, which is tagged. |
| v0.35.3 | Set on branch commit 8b43eb6 (`v0.35.3: task_edit and task_create return a short acknowledgement (CF-146)`), renumbered to v0.36.1 on merge. Never on main's first-parent history. v0.36.1 is tagged. |
| v0.35.4 | Set on branch commit a89e2fb (`v0.35.4: give check-all a 180-second budget and the gate 360 (CF-56)`), then superseded by a merge that moved the file to 0.36.1 and later 0.36.2. Never on main's first-parent history. v0.36.2 is tagged. |
| v0.37.0 | Set on branch commit ea18436 (`v0.37.0: build and harden phases, and no phrase checks on instruction prose (CF-145)`), renumbered to v0.37.2 on merge. Never on main's first-parent history. v0.37.2 is tagged. |

## Observations for the lead

- v0.28.0 is a lightweight tag on 64beed6; its subject commit is 1fd6a1d. Not changed.
- To push the two new tags and the v0.28.2 tag: `git push origin v0.27.18 v0.28.1 v0.28.2`.

## Pushed, 2026-10-07

The lead moved `v0.27.18` and `v0.28.1` from the merge commits to their release commits before pushing, so all three follow the rule in AGENTS.md: the tag goes on the branch head carrying the bump. `v0.27.18` is on 6813a48, `v0.28.1` on 01db94e and `v0.28.2` on 654d078, each annotated with its release subject, each an ancestor of main, and all three pushed to origin. Every release on main's first-parent history now has a tag; the numbers listed above as never released stay untagged.
