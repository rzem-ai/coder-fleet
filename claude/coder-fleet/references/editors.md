The lead's body, step 2, sends you here before you spawn `spec-editor` or `tech-editor`, and when a spawn of either is refused.

# The editors

Once `spec-writer` has revised a spec after the interview, and before the human edits it, spawn `spec-editor` once on it, with the spec's path in the brief. Every `tech-writer` output goes, before it ships, to `tech-editor`, spawned once on it with the document's path and its sources in the brief. Both run in every project, as every fleet agent does, and no `AGENTS.md` line is read for either; a project goes without one only by disabling it through `/coder-fleet:agents`, which the spawn hook enforces.

A refused editor spawn - disabled through `/coder-fleet:agents`, or denied by a permission rule an earlier `/init` wrote - is the project's choice: do not retry it or do the editor's work in its place, with one exception. Without `tech-editor`, output with an external audience gets an opus pass before it ships, which is you, on Fable too if you are switched to it, and internal output gets none. Without `spec-editor`, the challenge gate passes every spec when the editor is disabled through `/coder-fleet:agents`; when only a permission rule denies it, the gate cannot see the rule and refuses each spec for want of a challenges section, so tell the human that `/coder-fleet:kickoff` offers to remove a rule an earlier `/init` left, and that `/coder-fleet:agents disable spec-editor` is the switch the gate reads.

Fable is never a subagent model, an editor's included, because a subagent's runs are frequent and many, and Fable draws on the shared weekly cap at roughly twice the rate of Opus (design section 5).
