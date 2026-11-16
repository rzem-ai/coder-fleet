# Board config

Every key in a board's `config.yml` and whether the fleet depends on it. The file is `~/.config/boards/<PREFIX>/config.yml`, or `$XDG_CONFIG_HOME/boards/<PREFIX>/config.yml` when that is set, outside the repository; it is never committed, and it exists on the machine that made the board only. `boards.sh init`, the plugin's `scripts/boards.sh`, writes the first four keys when the human makes the board; the rest are set by hand, and the board reads the file each time it needs a key, so a change takes effect at once. `claude/boards/README.md` is the reference for what the board does with each.

| Key | Written by | What it does | The fleet depends on it |
|---|---|---|---|
| `prefix` | `boards.sh init` | The id prefix the human chose: cards are `<prefix>-<n>`, and the board's directory is named by it. Never changes | Yes: every card id |
| `key` | `boards.sh init` | The repository's normalised origin URL, or its git directory's path when it has no origin; a checkout finds its board by matching its own key against this | Yes: no checkout reaches a board without it |
| `keyKind` | `boards.sh init` | `url` or `path`, which kind of key `key` is | Yes, with `key` |
| `created` | `boards.sh init` | When the board was made | No |
| `test` | The human, by hand; `/coder-fleet:init` offers it | The project's test command, run with `sh -c` against a release's tagged commit in a temporary worktree. Without it the gate runs the `suite:` line of the first `gates` block in the project's AGENTS.md at that commit, and with neither it moves the cards to Released at once and comments on each that no test ran | No |
| `defaults.criteria` | The human, by hand | Project-wide acceptance criteria every open card shows, after its own, read live | No, but each one holds every card out of Done until ticked |
| `defaults.dod` | The human, by hand; `/coder-fleet:init` offers a starting list | The project-wide Definition of Done, the same way | No, the same way |
| `sendBackAtStop` | The human, by hand | `false` turns off the Stop hook that sends the lead back once when its focused card still has unticked criteria | No |
| `listen` | The human, by hand | The address the web UI listens on: `127.0.0.1`, the default, or `0.0.0.0`, every IPv4 address of the machine. Any other value is refused, naming the key. On `0.0.0.0` anyone on the network can read and change the board (`docs/limits.md`) | No |
| `port` | The human, by hand | A fixed port for the web UI, from 1 to 65535. Left out, the server takes a free port each time it starts, so the page's saved column choices last only as long as its address does. Any other value is refused, naming the key | No |

A card's tick on a default is kept on the card by the item's text, so editing a default's text shows it unticked on every card, and a new default shows unticked. A change to the defaults moves no card. A key the board does not know is kept and ignored. A change to `listen` or `port` takes effect the next time the web UI starts, and a running server that no longer matches is retired and replaced by that start.
