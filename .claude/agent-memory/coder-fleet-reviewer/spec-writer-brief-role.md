---
name: spec-writer-brief-role
description: From CF-193.2 (2026-11-12) spec-writer never talks to the human; it builds the interview brief and drafts, and the lead interviews. brainstorming preload is gone for good
metadata:
  type: project
---

Since CF-193.2 (reviewed 2026-11-12), `spec-writer` builds the interview brief and drafts the spec, and the lead puts the questions to the human in its own session (spec-to-card.js:26). `brainstorming` is no longer preloaded anywhere, and roster-contract.sh lost its exemption, so any preloaded name outside the plugin's skills/ fails the suite.

**Why:** a subagent has no question tool, so the old "interview the human, use an option picker" text described something it could not do.

**How to apply:** do not raise "spec-writer should ask the human" as a finding. Prose that still says spec-writer interviews (kickoff.md both ports, help-boards SKILL.md:88, the spec-writer eval rubric) was left stale at that merge and routed as follow-ups; check whether a later card closed them before raising them again. See [[cf-192-reviewer-modes-settled]] for the other CF-19x settlements.
