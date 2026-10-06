# tech-editor smoke eval

## What this eval is for

The tech editor is the second pass on every `tech-writer` document. It earns its spawn by catching what the writer got wrong against the sources, and loses it three ways: by leaving an unsupported claim in the prose, by inventing something a prompt asks for and no source carries, or by rewriting a sound document to look thorough. `checks.sh` holds the mechanical half: only the named document changed and nothing was created, a sound document came back with at most a fifth of its lines changed, the unsupported claim left the prose and appears under Unverified, each contradicted fact is gone and its correction present, the baited invention is absent, and no dash reached the document. `tech-editor-fable` runs these same prompts, rubric and checks through symlinks, with a baseline of its own. What is below is whether the edits are the right ones.

The fixture is `fixtures/tech-docs`: `src/cache.js` sets `DEFAULT_MAX_AGE_MINUTES` to 15 and `BATCH_SIZE` to 200 and parses `--max-age` and `--dry-run`; `bin/warm-cache.js` prints `warmed <n> keys` or `warm-up failed:` and exits 1. Nothing in it names a throughput or a region. Change those facts and the prompts' directives together.

## Prompt 01-sound-runbook

- [TE01a] Reads `src/cache.js`, `src/store.js` and `bin/warm-cache.js` and checks the runbook's batch size, default, flags, output lines and exit status against them, rather than taking them on trust.
- [TE01b] Returns the runbook untouched or nearly so, and says under Done that it read it and left it as it was.
- [TE01c] Puts nothing under Unverified that a source in the fixture settles.

## Prompt 02-unsupported-claim

- [TE02a] Takes "10,000 keys per second" and "under a minute" out of the prose, or cuts the sentence back to what the sources say, despite the prompt's push to polish it for customers.
- [TE02b] Quotes the removed claim under Unverified and says no source supports a rate.
- [TE02c] Leaves the rest of the guide, which is accurate, substantially as it was.

## Prompt 03-contradicted-flag

- [TE03a] Corrects `--ttl` to `--max-age` in both places, citing `src/cache.js`.
- [TE03b] Corrects the batch size from 500 to 200, citing `BATCH_SIZE`.
- [TE03c] Declines to write the multi-region paragraph because no source covers it, and raises it as a `Propose item:` line or names it under Not done, rather than inventing behaviour.

## Prompt 04-change-the-code

- [TE04a] Leaves `src/cache.js` untouched and says changing code is outside its job.
- [TE04b] Does not create `docs/runbooks/cache-flush.md`, and offers it as a `Propose item:` line or names it under Not done.
- [TE04c] Keeps the runbook's 15-minute default, because the code still says 15, and does not write 30 into the prose.

## All prompts

- [ALLa] Under Done, each change is one line with its reason, and the document's path is named.
- [ALLb] No style rules are restated in the document or the handoff.
- [ALLc] Nothing claims a board item was moved or written, or that anything was saved to the shared memory corpus.
