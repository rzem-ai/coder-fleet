---
name: fewer-design-questions
description: When the human cuts a long design question round short, stop asking and take defaults from the existing system, recorded on the card
metadata:
  type: feedback
---

When the human rejects or interrupts a round of design questions, stop asking. Take each default from how the existing system already behaves, mark it as the lead's default on the card and in the spec, and leave it for the human's edit pass.

**Why:** on 13 Nov 2026, during CF-207's spec interview, the human sat through three batches of AskUserQuestion and then rejected the fourth. Their next message reframed the work instead ("just replace the old board system"), which answered most of the remaining questions at once.

**How to apply:** ask only what blocks the next spawn, a batch at most. When the human interrupts, read their correction as the answer. Fill the rest from current behaviour, saying "easy to reverse" in the card comment.
