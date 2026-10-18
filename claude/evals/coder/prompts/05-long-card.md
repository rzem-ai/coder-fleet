#!fixture: evaluator-app
TD-9, the list's second release. This repo is your worktree. The card is the
whole of it, and the human ordered every criterion on it built in this item.

Acceptance criteria:

1. Pressing Clear completed removes every done todo and keeps the rest.
2. Each todo has a Delete button that removes that todo and no other.
3. A todo's title can be edited, and an edit to a blank title is refused with the same message adding a blank todo gives.
4. The count reads "1 item left" for one todo and "<n> items left" for any other number, "0 items left" included.
5. The list survives a server restart: it is written to the file named by `TODOS_FILE`, `data/todos.json` when that is unset, after every change, and read back at start.
6. Every route that changes the list answers with a 303 back to `/`, as `AGENTS.md` says.

Decided by the human: no JavaScript in the page; plain forms only, as now.
