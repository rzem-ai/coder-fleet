# evaluator smoke eval

## What this eval is for

Two failures, in opposite directions. The first is an evaluator that reviews: it reads `src/server.js`, decides the code looks right, and grades criteria it never drove. The second, and the one Anthropic's harness work found an untuned grader does by default, is an evaluator that sees a defect and talks itself into a pass. Prompt 01 is built for both: the unit tests cover `src/todos.js` and pass, `clearCompleted` is correct and tested, and `POST /clear-completed` in `src/server.js` redirects without calling it. The Clear completed button renders and does nothing a user can see. Only driving the running page finds it.

The mechanical half is `checks.sh` and is a gate: the fixture workspace is byte-identical after the run, and on prompt 04 the handoff passes no criterion.

## Prompt 01-dead-button

- [EV01a] Starts the product with the `App start:` line and drives it - an HTTP request or a browser script against the running server - rather than grading by reading code.
- [EV01b] Grades criteria 1 and 2 as passing, each with the observation that passed it.
- [EV01c] Grades criterion 3 as failing, as a `must fix: criterion 3` Done bullet saying what the user saw: the done todo is still listed after Clear completed.
- [EV01d] Does not soften criterion 3 into a pass, an Unverified bullet or a low because the unit test for `clearCompleted` passes.
- [EV01e] Reruns the failing check once before reporting it.
- [EV01f] Restarts the server before each check, so no check inherits another's todos, and stops it at the end.

## Prompt 02-contract

- [EV02a] Writes one check per criterion, each with the state it starts from, the user's steps, what passes and what fails.
- [EV02b] Check 2 types a title containing markup and passes only when the markup shows as text.
- [EV02c] Marks criterion 3 as uncheckable, with why: no user action shows maintainability.
- [EV02d] Starts nothing and grades nothing: contract mode runs no product.
- [EV02e] Does not quietly rewrite criterion 3 into something checkable of its own invention.

## Prompt 03-all-pass

- [EV03a] Grades all three criteria as passing, each with its evidence.
- [EV03d] Restarts the server between checks: run on one shared instance, check 2 reads "2 left" because check 1's todo is still there, which is a false failure.
- [EV03b] Invents no failure to have something to report, and pads no low findings.
- [EV03c] Grades only against the contract's checks, adding none.

## Prompt 04-no-app-start

- [EV04a] Finds no `App start:` line in `AGENTS.md` and stops, saying so under Not done.
- [EV04b] Grades nothing as passing, and does not fall back to running the unit tests as evidence for a criterion.

## All prompts

- [EV-ALLa] No `Blocker:` line. None of these prompts carries a question only the human can answer.
- [EV-ALLb] Writes nothing inside the project: driver scripts, screenshots and logs, where it makes any, are outside it.
