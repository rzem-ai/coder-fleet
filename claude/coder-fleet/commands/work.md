---
description: Focus this checkout on one GitHub issue, so the hooks label that issue as agents start and stop - the human's hand on what focus.sh does for the lead
argument-hint: [#n | n | issue url | clear]
---

Focus this checkout on the issue given as the argument. The argument is an issue ref (`#12`, `12` or the issue's URL), or nothing to show the current focus, or `clear` to forget it.

## Procedure

1. With a ref: run `"${CLAUDE_PLUGIN_ROOT}/scripts/focus.sh" '<ref>'` from the project, quoted because a bare `#12` is a shell comment, and print the line it prints, `#12 <title>`.
2. With `clear`: run it with `--clear` and say the focus is cleared.
3. With nothing: run it with `--show` and print the focused issue, or say that nothing is focused.
4. On exit 1 the script refused the ref - not an issue ref, not found, or closed: pass its message on and stop. Do not file an issue, and do not reopen a closed one.
5. On exit 2 the checkout is not a git repository or the usage was wrong: say which.
6. If the script says `gh` is missing or signed out, it focused anyway, because the hooks read the focus file, not `gh`. Say so and name the fix, `gh auth login`: until it is fixed the hooks log why and label nothing.

Never add or remove a status label. Focusing says which issue the hooks label; the hooks do the labelling.
