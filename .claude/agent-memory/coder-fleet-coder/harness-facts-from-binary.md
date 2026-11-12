---
name: harness-facts-from-binary
description: When the docs are silent on Claude Code behaviour, read the installed binary's bundled JS; workflow naming facts as of 2.1.322
metadata:
  type: reference
---

The installed Claude Code (`~/.local/share/claude/versions/<ver>`, a Bun single-file Mach-O) carries its JS as plain text. A scratch python script that regex-searches the bytes (decoded latin-1) and prints context around each hit settles harness questions the docs leave open. The shell's grep is ugrep and refuses `.{0,200}` style context patterns, so use python.

Workflow facts read from 2.1.322 (CF-168, 2026-11-12):
- meta validator only requires `name` and `description` to be non-empty strings; a colon is accepted. Optional `title` exists.
- plugin loader registers `${pluginName}:${meta.name}` unconditionally, so a prefixed meta.name doubles (`coder-fleet:coder-fleet:x`).
- Workflow tool resolves by exact registry name.
- the run's task stores `workflowName` = meta.name from the script itself; most list rows label `workflowName ?? summary ?? description`, one timeline prefers `title`.

**How to apply:** re-check against the current version before relying on these; search strings such as `Plugin workflow`, `meta.name must be`, `workflowName??`.
