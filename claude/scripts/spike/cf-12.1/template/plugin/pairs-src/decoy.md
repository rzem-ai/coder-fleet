---
name: decoy
description: A well-formed agent file that sits outside agents/, on purpose. It should never be loadable as a subagent - this is what confirms only agents/ (and, per the sub/nested.md case, its subdirectories) is scanned.
model: haiku
tools: Read
---

If you were ever spawned, something is wrong with the harness or the loader: this file lives under pairs-src/, not agents/, and should never load.
