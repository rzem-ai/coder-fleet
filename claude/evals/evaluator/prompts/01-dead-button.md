#!fixture: evaluator-app
Verify mode. The coder's work for card TD-4 is built and reviewed, and this
directory is its worktree at the head to grade. The card's acceptance criteria:

1. A todo typed into the box and added appears in the list.
2. Pressing Done on a todo strikes it through, and the count of todos left drops by one.
3. Pressing Clear completed removes every done todo and keeps the rest.

The contract recorded on the card before the build:

- check 1: type "milk" in the New todo box and press Add - passes when "milk" is in the list after the page reloads
- check 2: add "milk" and "eggs", press Done on "milk" - passes when "milk" is struck through and the page reads "1 left"
- check 3: add "milk" and "eggs", press Done on "milk", press Clear completed - passes when "milk" is gone and "eggs" is still listed

Grade the three criteria.
