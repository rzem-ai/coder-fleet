# The challenge notation and the gate

`spec-editor` writes its challenges into a spec draft in a notation the challenge gate reads mechanically, so the notation is exact. `claude/coder-fleet/scripts/challenge-gate.py` implements the gate and the close; `lead.md` step 3 runs it before the first build spawn on an item, and `spec-to-card`'s card stage runs it before it files any criterion. `review-round` and `deep-research` do not run it: one reviews a diff that already exists and the other builds nothing.

## The notation

- **The section** is headed by a line that is exactly `## Challenges (spec-editor)` and runs to the next line starting `## `, or to the end of the file. A heading inside a fenced code block is documentation, not the section.
- **One line per challenge**: `- C3 [must resolve] [open] Acceptance criterion 4 cannot fail: it passes whether or not the hook fires.`
  - The id is `C` and a number.
  - The severity is `[must resolve]` (a coder could not build from the card as it stands), `[should resolve]` (a coder could, but the build would carry the flaw) or `[note]`.
  - `spec-editor` always writes the state as `[open]`.
- **Closing a challenge** is the human's: replace `[open]` with `[resolved]` (the edit fixed it) or `[struck: <reason>]`, whose reason must not be empty.
- **An inline marker** is a single space and `[challenge C3]` appended to the end of the line it points at. Markers help the human edit and play no part in the gate. A marker on an acceptance-criterion line is part of that line until the close strips it, which is why the close runs before `spec-to-card` files criteria.
- **The closed marker** is a line that is exactly `## Challenges (spec-editor): closed in <sha>`, where `<sha>` is a hexadecimal commit id of 7 to 40 characters with nothing after it.

## The gate

The record is the first line of the project's `AGENTS.md` beginning `Spec editor:`, whose value is `opus`, `fable` or `neither`.

- No record, or a `<placeholder>` value: the gate passes and suggests `/kickoff`, and no spec editor is spawned. Any other unknown value refuses, so a typo cannot switch the gate off.
- `neither`: no section and no gate.
- The closed marker is present: the gate passes, with no strip and no commit. A closed marker typed by hand passes too; the gate guards against skipping by accident, not against a deliberate override.
- The intact section is present: the gate refuses if any `[must resolve]` line carries neither `[resolved]` nor a `[struck: ...]` with a reason. A line still `[open]`, or one whose state tag was deleted, fails. `[should resolve]` and `[note]` never block. A refusal names every blocking id.
- Neither the section nor the closed marker, in a project that records an editor: the gate refuses. A section deleted by hand is not a passed gate.

The gate reads only the spec and `AGENTS.md`, never git history, so a closed marker passes in a shallow clone or a cloud session.

## The close

Only after the gate passes on an intact section:

1. If the spec's working copy differs from its last commit, commit the spec alone first, so `<sha>` names a commit that holds the section the gate passed.
2. Replace the whole section, heading to the next `## ` line or the end of the file, with the closed marker naming that commit.
3. Strip every ` [challenge C<n>]` marker from every other line, and change nothing else.
4. Commit the spec alone as "Close the challenges on <issue>".
5. Build from, or file the criteria of, the closed spec.

The section, every challenge and the human's resolutions stay readable at the commit the marker names.
