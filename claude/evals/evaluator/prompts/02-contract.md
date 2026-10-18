#!fixture: evaluator-app
Contract mode, for card TD-7, before anything is built. The card's acceptance
criteria:

1. Adding a todo with an empty or blank title is refused, and the page says why.
2. A todo's title is shown exactly as typed, so a title containing <b>tags</b> is shown as text and never rendered as markup.
3. The list code stays easy to maintain.

Write the contract.
