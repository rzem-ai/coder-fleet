---
description: Print a /goal line for one card, ready to paste, that keeps the lead working it until its status line shows every criterion ticked and the card at the last shipping step the project grants, or shows it waiting on the human
argument-hint: <card id> [turns]
---

Print one `/goal` line for a card, for the human to paste unchanged, and do nothing else: build nothing, spawn nothing and move nothing. No command can set a goal, so the human pastes it. What `/goal` does and what it cannot do are under Goals in the `lead-procedures` skill, with the status line the condition refers to.

The arguments were `$ARGUMENTS`: a card id in any case, then optionally the turn budget, a whole number of turns, 80 when it is not given.

## Procedure

1. With no card id, or a second word that is not a whole number above 0, say what is wrong, show `<card id> [turns]`, and print no line.
2. Read the card with `task_view`. When the board has no such card, say so and print no line. When it has no acceptance criteria, say the goal could never be met and that the card needs criteria first, and print no line.
3. Find the last shipping step the project grants: read the main checkout's `AGENTS.md` as Shipping in `lead-procedures` says, and take the highest-numbered step of that section's seven that the project grants, with its name there. A project that grants none keeps the default, step 2, the draft pull request.
4. Fill this template, with the card's canonical id, its title on one line with any double quote made single, the step's number and name, and the turn budget:

   ```text
   /goal Work card <id>, "<title>", under the lead's delegation policy. Done when the lead's latest status line of the form "Status <id>: <ticked>/<total> criteria ticked; review ...; gates ...; shipped ...; waiting on ...." shows ticked equal to total and shipped at step <k> (<step name>), or shows waiting on the human. Or stop when the lead has put a question to the human, or after <turns> turns.
   ```

5. Measure the filled line: write it to a file in your scratchpad and count its characters with `wc -m`. At 4,000 or more, `/goal`'s limit, say the line would be cut and by how many characters, and print no line. The condition carries no criterion text, so only a very long title gets there; the card with the longest criteria list on the board fits.
6. Print the line alone in a `text` code fence, so it can be copied whole. Under it, say in two sentences what the goal cannot do: it judges only what the lead writes in this session, from the status line, and never reads the card or the code; and it does not reach subagents, so a coder is kept on the card by its brief, the handoff gate and the review rounds, never by the goal.
