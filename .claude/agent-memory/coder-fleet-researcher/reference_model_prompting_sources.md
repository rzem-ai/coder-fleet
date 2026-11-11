---
name: reference-model-prompting-sources
description: Where the authoritative prompting, effort, cost and subagent guidance for Sonnet 5.5 / Opus 5.5 / Fable 5.2 lives, which fetches worked, and the local-vs-live gaps found on 2026-11-11 (CF-193)
metadata:
  type: reference
---

Read on 2026-11-11 for CF-193. Re-fetch before relying; these pages change per model launch.

Local (ships with the Claude API skill, path varies by version, was `/private/tmp/claude-501/bundled-skills/2.1.322/<hash>/claude-api/shared/`): `model-migration.md` (~2570 lines; Sonnet 5.5 at ~2099, Opus 5.5 at ~1894, Fable 5.1 at ~1338 and ~1577, Fable 5.2 at ~2416, Opus 5 at ~945), `prompt-audit.md`, `agent-design.md`, `live-sources.md`. Read model-migration in 250-400 line chunks; one Read over ~25k tokens errors.

Live, all fetchable as `.md`, returned full text: `platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-{fable-5-2,opus-5-5,sonnet-5-5,opus-5}.md`, `.../claude-prompting-best-practices.md` (75KB, saved to a tool-results file; read in parts), `.../effort.md`, `.../fast-mode.md`, `about-claude/models/overview.md`, `about-claude/models/optimizing-for-cost-and-intelligence.md` (214KB; first 100KB only read, lever table cut off).

Summarised only (WebFetch small model, not full text): `code.claude.com/docs/en/sub-agents` (last 17KB unread), `/skills`, `/model-config`, `opencode.ai/docs/agents`, `/models`, `/providers`.

Findings worth not rediscovering:
- Default effort differs by surface. API: Fable 5.2 high, Opus 5.5 medium, Sonnet 5.5 high. Claude Code (`/model-config`): Fable 5.2, Opus 5.5, Sonnet 5.5 all medium. The local migration file only gives API defaults.
- Local file lacks several live-only snippets: Sonnet 5.5 "Steer initiative and scope" (three snippets), Sonnet 5.5 "Think the problem through before you answer."; Opus 5.5 "Unattended agentic runs" paragraph, multiapp exploration line, time-signal line.
- Claude Code subagent/skill frontmatter both accept `model` (sonnet|opus|haiku|fable|full id|inherit) and `effort` (low..max). OpenCode: `model: provider/model#variant`; variant names come from catalog metadata and the docs list none for Anthropic.
- Anthropic's published snippets mix em dashes in; the local file ASCII-normalises them. The fleet bans em and en dashes, so quote the local form.
