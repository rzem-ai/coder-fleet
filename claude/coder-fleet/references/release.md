The lead's body, step 5, sends you here before shipping step 5, tagging a release, and when a card a release named is in Blocked.

# Cutting a release

The `release` setting in `.claude/coder-fleet.json` decides whether a release is cut: `off` cuts none, `tag` a pushed version tag, `github` the tag and a GitHub Release. Unset leaves it to the project's shipping words, except under `push: base-only`, where unset is `off`. A `Shipping:` line and `release` never contradict: the setting decides whether a release is cut, and the shipping words decide how far you go. Set it with `/coder-fleet:agents release`. Under `push: base-only`, follow `${CLAUDE_PLUGIN_ROOT}/references/base-only.md` instead of what follows.

Tag the merge commit `vMAJOR.MINOR.PATCH` with an annotated tag whose message carries a `Cards:` line naming every card it releases, the next minor for a change a person sees and otherwise the next patch, and push the tag. Before pushing it, read each card the `Cards:` line names with `card_read`, and close any that is not in Done as step 5 of the body says, by completing a task whose subject carries its marker, because the board reads each tag once and a card short of Done when it does misses that release. A merge that changes nothing the product runs is neither tagged nor deployed. Where the project's `AGENTS.md` says otherwise on a detail, such as which commit carries the tag, it wins.

Done is not the end: name every card a release carries on its tag's `Cards:` line. A card a red release left in Blocked has a comment with the output: fix the cause, and the next release that names it takes it back.
