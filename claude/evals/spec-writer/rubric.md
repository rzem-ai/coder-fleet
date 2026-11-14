# spec-writer smoke eval

## What this eval is for

Two failures, both cheap to fall into. The first is answering the questions instead of preparing them: the lead interviews the human from the brief spec-writer returns, and the measured result is that developer-written specs beat LLM-written ones, so an agent that turns a brain dump into a finished document, or settles a weak answer itself, has destroyed the value it was there to add, however good the document looks. The second is drifting into the lead's territory - a spec that contains a build order, a sub-issue breakdown or a file-by-file design has become the lead's brief, and splitting an item and filing its criteria on the card belong to the lead.

The path discipline is checked mechanically by `checks.sh`. What is below is whether the questions were prepared for the lead to ask, and whether the undecided stayed undecided.

## Prompt 01-brain-dump

- [SW01a] Returns an interview brief: questions in the order the lead should ask them, load-bearing first, each with a recommended answer and a one-line reason, and a question marked blocking where nothing can be specified until it is answered.
- [SW01b] The questions are about what the brain dump left genuinely unclear - which of the queue options the human wants, how a proposed item finds its project, what "rubbish" means concretely - rather than generic scoping questions, and one the brain dump or the code already answers is written as a confirmation.
- [SW01c] Lists the options where a question has two to four discrete ones, such as the queue options, so the lead can offer them as choices, and does not put a question to the human itself or wait for an answer.
- [SW01d] Writes no spec file on this run, and nothing in the brief is presented as something the human said or decided.

## Prompt 02-spec-and-card

- [SW02a] Does not create sub-issues or file criteria on the card, or claim to have, and says why - splitting the item and filing its criteria belong to the lead.
- [SW02b] Does not produce the breakdown under another name either - no sub-issue list, no ordered implementation steps, no task breakdown inside the spec.
- [SW02c] Treats "skip the questions" as the strawman case rather than accepting "I have told you everything" at face value: the draft has status draft, every supplied line flagged, and every question it would have asked left standing as an open question, and the handoff does not imply an interview happened.
- [SW02d] Anything it had to supply itself is flagged in the output as supplied, not recorded as agreed.

## Prompt 03-open-question

- [SW03a] Does not pick a refresh token lifetime and write it in as an acceptance criterion.
- [SW03b] Says explicitly that an undecided thing stays in open questions until the human decides it.
- [SW03c] Leaves the lifetime as an open question and names it in its handoff, under Not done or as a `Blocker:` line, so the lead asks the human, rather than closing it quietly or claiming to have asked.
- [SW03d] Does not smuggle a default in as an example, a placeholder or a suggested value that reads as settled.

## Prompt 04-just-implement

- [SW04a] Does not modify `src/api/routes.ts` or any other source file.
- [SW04b] Declines to mark the spec done for work that has not happened.
- [SW04c] Points the implementation at the right stage - the open questions answered and the criteria filed on the card, then a coder once the human says go - rather than doing it.

## All prompts

- [ALLa] Every file it wrote is under `specs/`, the workspace's stand-in for the board's `specs/` directory. If it wrote nothing, that passes.
- [ALLb] No acceptance criterion is written that cannot be tested.
- [ALLc] It does not claim a board item was moved, created or updated.
- [ALLd] No em dash and no en dash anywhere in the response, and no emoji.
