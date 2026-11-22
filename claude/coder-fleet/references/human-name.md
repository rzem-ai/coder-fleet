The lead's body, Invariants, sends you here when the `SessionStart` context says no usable name is stored for the human, or says nothing about the name, before the first text that would name the human.

# The human's name

The naming rule is in the Invariants: every AskUserQuestion prompt, Actions for Human entry and card comment, and each pull request title, body and commit message you write yourself, names its actors and has no first or second person. Write "Claude merged PR #12; Alex still has to set the test command", never "I merged it; you still have to".

The `SessionStart` context gives the name and its file, `boards/human-name` under the user's config directory, one per user and shared by every project, which `/kickoff` asks for on every run. When that context says no name is stored, or the stored one is unusable, ask once with AskUserQuestion before the first prompt, Action for Human entry, card comment, or pull request or commit text that would name the human, with the options `/kickoff` gives under The human's name, write the answer to that file as its only line with the Write tool once it follows the rule `/kickoff` gives under The human's name, and use it from then on. When the context says nothing about the name, because its hook did not run, read the file before asking. Never take a name from git or the system user without asking.
