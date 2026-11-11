# The lead's procedures live in a skill

`claude/coder-fleet/agents/lead.md` states the decision the lead makes at each of its six steps, and the preloaded `claude/coder-fleet/skills/lead-procedures/SKILL.md` carries how each is carried out, one section per topic. This record says why, and why each contract check that fixes the lead's shape changed (CF-193.5).

## Why a skill

The body has a 60-line cap and a no-hard-wrap rule (`docs/agent-contract.md` sections 3 and 4), so every new rule made an existing line longer. Steps 3, 4 and 5 had grown to 1066, 1301 and 1298 words, each one paragraph, where a rule's scope and priority were signalled only by its place in a sentence. Current guidance for the models that run the lead is that prescriptive single-paragraph walls reduce quality, most on Fable 5.2, and that a rule lands better stated once with its scope and reason. A skill has no line cap, so the mechanics can sit in short paragraphs under a heading the lead can find, while the body stays a policy a reader takes in at a glance. A preloaded skill is injected whole, so the token cost is about the same; the gain is structure.

The rejected alternative was exempting `lead.md` from the 60-line cap. It keeps one file, but gives the contract a second lead exception beside `tools`, and leaves nothing to stop the body re-accreting.

The board's own mechanics - focus, binding, completion, the `Board-Item:` line, the task tools and Actions for Human - stay in `help-boards`, which the lead already preloads, and the skill points there rather than copying them.

## The checks

- `claude/evals/lib/roster-contract.sh`, the 60-line cap and the four sections: unchanged. The body still fits, which is the point.
- `roster-contract.sh`, new: the lead preloads `lead-procedures`; no `How you work` step of the lead runs past 250 words; the skill exists and has its ten sections in order; no paragraph of the skill runs past 250 words. The section list catches a skill that loses a topic the body points at, and the word caps stop either file growing back into walls under the no-wrap rule. Each was shown failing on a mutant before it was committed. `claude/evals/lib/roster-readme-fixture.sh` sets `LEAD_SKILL_OVERRIDE` to a copy of the skill with a section dropped and to one with a paragraph over 250 words, and requires each to fail the check that guards it.
- `claude/evals/lib/requirements-source-contract.sh`: unchanged. Step 2 keeps `2. Route by job:` and the five phrases it pins, because routing on a requirements source is a decision rather than a mechanic, and the six-step count still catches a lead that loses a step.
- `claude/evals/lib/workflow-logic.mjs`, `challenge-same-script-in-lead`: unchanged. Step 3 keeps the exact challenge-gate command, since when to run it is the step's decision; the verdict handling is in the skill.
- `workflow-logic.mjs`, `mutant-cap-one-phrase`: before, it required `at most eight mutants` in `agents/lead.md`; now in `skills/lead-procedures/SKILL.md`. The break-mode brief is a mechanic and moved with the rest of Review and escalation, so the check follows the phrase rather than pinning a duplicate in the body.
