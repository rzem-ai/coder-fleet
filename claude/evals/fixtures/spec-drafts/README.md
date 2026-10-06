# sample-sessions

A small session service used by the spec-editor eval. `src/session.js` is the whole of the code; the drafts under `docs/specs/` are specs about it.

Line numbers are load-bearing here: `docs/specs/EX-24.md` cites `src/session.js` lines 2 and 8, and rubric criterion SE03b in `claude/evals/spec-editor/rubric.md` cites line 2. Moving a line of `src/session.js` turns the sound draft into one with a wrong citation, so update all three together.
