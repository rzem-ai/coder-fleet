# Codex was dropped as a supported harness

The human dropped Codex as a supported harness on 2026-10-22 and ordered the `codex/` tree deleted. The coder-fleet repo is now one fleet on two harnesses, Claude Code and OpenCode.

The port never got past a spec (GPTA-1) and a hooks spike, so there was nothing installable to retire. Git history keeps the tree: the last commit with `codex/` in it is `10162719126a4cefc68c1f362811fcce0cc5a7f5`, and `git checkout 10162719126a4cefc68c1f362811fcce0cc5a7f5 -- codex` restores it.
