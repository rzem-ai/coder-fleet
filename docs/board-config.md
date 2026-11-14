# Board config

Every key in a board's `config.yml` and whether the fleet depends on it. The file is `~/.config/boards/<PREFIX>/config.yml`, or `$XDG_CONFIG_HOME/boards/<PREFIX>/config.yml` when that is set, outside the repository; it is never committed, and it exists on the machine that made the board only. `boards init` writes the first four keys when the human makes the board; the rest are set by hand, and the board reads the file each time it needs a key, so a change takes effect at once. `claude/coder-fleet/boards/README.md` is the reference for what the board does with each.

| Key | Written by | What it does | The fleet depends on it |
|---|---|---|---|
| `prefix` | `boards init` | The id prefix the human chose: cards are `<prefix>-<n>`, and the board's directory is named by it. Never changes | Yes: every card id |
| `key` | `boards init` | The repository's normalised origin URL, or its git directory's path when it has no origin; a checkout finds its board by matching its own key against this | Yes: no checkout reaches a board without it |
| `keyKind` | `boards init` | `url` or `path`, which kind of key `key` is | Yes, with `key` |
| `created` | `boards init` | When the board was made | No |
| `test` | The human, by hand; `/coder-fleet:init` offers it | The project's test command, run with `sh -c` against a release's tagged commit in a temporary worktree. Without it no release moves a card to Released | Yes, for Released |
| `defaults.criteria` | The human, by hand | Project-wide acceptance criteria every open card shows, after its own, read live | No, but each one holds every card out of Done until ticked |
| `defaults.dod` | The human, by hand; `/coder-fleet:init` offers a starting list | The project-wide Definition of Done, the same way | No, the same way |
| `sendBackAtStop` | The human, by hand | `false` turns off the Stop hook that sends the lead back once when its focused card still has unticked criteria | No |

A card's tick on a default is kept on the card by the item's text, so editing a default's text shows it unticked on every card, and a new default shows unticked. A change to the defaults moves no card. A key the board does not know is kept and ignored.
