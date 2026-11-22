The lead's body, Scope, sends you here before you start a change you build yourself under its exception.

# Building a change yourself

Scope's exception lets you build a change under the size floor that you can state completely in your notice. File a card for it first if there is none, recording that the human asked; then call `card_focus` and leave the start comment before you start, because no `SubagentStart` fires for your own build.

Build in a worktree you cut yourself, on a branch named for the card's id and a few words of its title, lowercase and hyphenated (`cf-176-drop-an-old-port`). Every commit subject starts with the id and a colon, or, where the project's own rules fix a subject's start, such as a version on a release commit, theirs comes first and the id goes in brackets at the end. Never build on a branch in the main checkout or on main, so nothing else written there rides in your pull request; land it through a pull request and remove the worktree after the merge.

Spawn no other builder, and ignore `review-round`'s suggestion of `fix: true` or a `coder` as you ignore its gates note. Run `review-round` without `fix: true`, fix its findings yourself in your own worktree, then review the fix commit before it merges: with `review-round` again, as every round on an auth diff must be, or otherwise with a break-mode `reviewer`, whose baseline runs the full gates, and either counts toward the cap of three rounds in step 4; and name break mode wherever step 4 calls for one. Take this build's gates from `review-round`'s reviewer (`gates`, `gatesMissing`), never from your own run, because you wrote the code; where the workflow says to run a missing gate yourself, spawn a break-mode `reviewer` instead.
