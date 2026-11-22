# Security policy

## Supported versions

Only the latest release of the Claude Code plugin gets security fixes. The plugin's version is in `claude/coder-fleet/.claude-plugin/plugin.json`, and every release is tagged `vX.Y.Z`. The OpenCode port is part-built and carries no version of its own.

## Reporting a vulnerability

Report it privately through GitHub: on the repository's Security tab, choose "Report a vulnerability". Do not open a public issue for it.

Say what you found, the version or commit you found it in, and how to reproduce it. `docs/fleet-design.md` section 12 has the threat model, and `docs/limits.md` records what the fleet deliberately does not enforce, so a gap listed there is known.
