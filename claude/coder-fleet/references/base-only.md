The lead's body, step 5, sends you here before a landing in a project whose `.claude/coder-fleet.json` sets `push: base-only`, and for the card comments such a landing takes.

# Landing under push: base-only

Under `push: base-only` this sequence replaces step 5's shipping list: no step pushes an item branch or opens a pull request. The base branch is the one `${CLAUDE_PLUGIN_ROOT}/references/checkouts.md` defines. The grant, the order, stopping at the first step not granted and the refusal rule are as step 5 says, and with no grant the landing is the human's. `release` unset is `off` here.

1. Commit on the local item branch, in the builder's worktree.
2. Give it step 4's review, run against the item branch with the base branch as its base. A `reviewer` runs the gates in the builder's worktree at the reviewed head; there is no CI without a pull request, so that run is the round's gate result, and the round is complete without any CI result.
3. Land it from the main checkout, only while it is on the base branch and `git status --porcelain` prints nothing: `git merge --squash <item branch>`, then one commit whose subject starts with the card's id and a colon (`CF-12: <what it does>`), one squashed commit per card. When the checkout is on another branch or holds changes, stop and report what is in the way; never switch, stash or clean it, because that work is the human's.
4. Push the base branch, `git push origin <base>`.
5. Release as `release` allows. `off`, or unset, ends the sequence at the push, with no tag. `tag`: create an annotated tag on the landed commit whose message carries a `Cards:` line naming every card it releases, `git tag -a vX.Y.Z <sha> -m "vX.Y.Z: <what it releases>" -m "Cards: CF-12, CF-14"`, and push it with `git push origin vX.Y.Z`. Before pushing it, read each card the `Cards:` line names with `card_read`, and close any that is not in Done as step 5 of the body says, by completing a task whose subject carries its marker, because the board reads each tag once and a card short of Done when it does misses that release. `github`: the `tag` step, then `gh release create vX.Y.Z --verify-tag`. Which landings are tagged and which version each takes is as `${CLAUDE_PLUGIN_ROOT}/references/release.md` says.
6. Remove the worktree with `/coder-fleet:prune-worktrees`, which recognises the squashed landing.

After the push in step 4, close the card as step 5 of the body says. Under `release: off` or unset a landed card stops at Done and is never reported as waiting on a release. Under `tag` or `github` the board's own tag watch and test gate move the cards the `Cards:` line names from Done to Released, and nothing else moves them there. When the tag pushed and `gh release create` failed, leave the tag as it is, never deleting or moving it, report the failure and ask the human once about the GitHub Release; the tag has already done its work on the board.

## The card comments

There is no pull request, so the second and third of a sub-issue's three comments take this form instead, `<base>` being the base branch, the first `<sha>` the reviewed head of the item branch and the second the landed commit on the base branch:

```
Sub-issue <n> of <m>: <started | ready to land on <base> at <sha> | landed on <base> at <sha>>. Done still needs: <criteria numbers or sub-issues>.
```
