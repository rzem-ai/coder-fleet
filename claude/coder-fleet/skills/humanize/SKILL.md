---
name: humanize
description: The house style for prose the fleet writes or edits - Australian English, punctuation and formatting, the constraints on an edit, and the sentence-level habits that make text read as machine-written. Use when drafting or editing a document, or when text sounds robotic or AI-generated.
---

# Humanize

## Australian English

generalise, colour, behaviour, metres, optimising, recognise - not the -ize/-or/-er forms.

## Punctuation and Formatting

- Prefer commas for asides and mid-sentence pivots, and reserve a dash for the occasional genuine pivot. When one is warranted it is a standard hyphen with a space each side ( - ), never an em dash or an en dash.
- Contractions preferred ("doesn't", "can't", "it's").
- No emojis, ever, in any context.
- Prose paragraphs, not bullet points, unless the content really is a list.
- Bold only when structurally necessary. Lead with the direct answer, then context, and end clean with no restating summary.

## Constraints (Non-Negotiable)

- Preserve meaning, factual claims, and intent.
- Preserve coverage: don't drop list items, options, or qualifiers unless they're truly redundant.
- Do not add new facts, dates, quotes, or citations that are not already present or user-provided, and do not imply a source ("according to...") you cannot name from the input.
- Keep genre and audience intact. Voice goes only where the genre wants it, such as an essay, a post or a personal note; a README, an ADR, a runbook or a reference page keeps its neutral register.
- Don't rewrite quoted material unless asked to rewrite the quote itself.
- Don't introduce new patterns: the rewrite must pass the same rules. Common traps are "Here's the thing:" and hooks that try to sound casual.

## Sentence Architecture

These structural defaults give machine-written prose away even when the vocabulary is clean. Suppress them.

- Ration the antithesis reversal ("It's not X, it's Y"): once per piece at most. State Y plainly without staging X as a foil.
- Cut "it turns out" on sight. Just say the thing.
- One orphan fragment per piece. The standalone punch-line sentence earns its weight only when rare.
- Break the rule of three. Use two, or four, or an uneven list; three should be a choice, not a tic.
- Stop coining tidy terms. One genuine term of art per piece.
- Don't always zoom out to land. Sometimes stop on the concrete point.
- Vary sentence length harder: some very short, some sprawling, fewer in the comfortable middle.
- Watch the comma splices that preferring commas invites. Use a full stop sometimes.
- No throat-clearing openers, hedging stacks, corporate filler ("leverage", "it's important to note") or sign-offs ("Hope that helps!").

## Output

When you were given a file, edit it in place and name the notable changes where your work is reported, such as your handoff's Done section. When the text came in the conversation, return the rewritten text and a brief summary of the changes. Do not score the text.
