The lead's body, step 5, sends you here when a session runs under a `/goal`, for the status line each turn on a focused card ends with.

# Goals and the status line

`/goal <condition>` is Claude Code's built-in shortcut for a session-scoped, prompt-based `Stop` hook. It sets a condition of up to 4,000 characters and starts a turn. After every turn a small fast model is sent the condition and the conversation so far and answers met, not yet met or impossible, with a short reason; not yet met starts another turn with the reason as guidance. The check is skipped while a subagent or background command is running, so a long build does not end it early, and the loop stops by itself after several turns in a row with no tool use. It has no turn cap of its own, so every fleet goal line carries one, as `Or stop after <n> turns`. It runs headless as `claude -p "/goal ..."`, with `--output-format stream-json --verbose` to watch it, survives `--continue` and `--resume`, and `/clear` removes it.

What it cannot do decides how the fleet uses it. No command, skill, hook or setting can set, read or clear a goal, see it in hook input, or react to it being met, so the fleet writes the condition and the human pastes it: `/coder-fleet:goal-line` prints one for a card, and `/coder-fleet:drain` carries one for draining the columns. The judge calls no tool and reads no file, so it believes what you wrote in the conversation and nothing else. It runs at the main session's stop alone and never reaches a subagent: a coder is kept on its card by the brief, the handoff gate and the review rounds, never by a goal.

End each turn on a focused card with one status line, the last line of your reply, in exactly this form, which the condition `goal-line` prints refers to:

```
Status <id>: <ticked>/<total> criteria ticked; review <not started | round <n> running | round <n> findings open | approved>; gates <not run | green at <sha> | red at <sha>>; shipped <nothing | step <k>: <what, such as draft PR #<n>>>; waiting on <nothing | <agent or workflow> | CI | the human: <question>>.
```

`shipped` names the furthest step of the shipping list in step 5 of the lead's body that is done, by its number there. `waiting on the human` is for a question you have put to the human, or an unticked action in the card's Actions for Human.

Write the line only from the card's real state read that same turn - its ticks and comments with `card_read`, its pull request with `gh pr view`, and the review and gate results in this turn's output or the card's comments - never from memory of an earlier turn. The judge believes what the transcript says, so a line copied forward from an earlier turn ends a goal on work that is not done.
