---
name: gates-and-card-stub
description: Since CF-205 the test and card gates live in hooks/lib/gates.sh; release-close-contract.sh has a per-card JSON board stub reusable for any hook that reads cards; PostToolUse fires only on tool success (2.1.323)
metadata:
  type: reference
---

Any hook that must reach Done sources `hooks/lib/gates.sh` (`gate_test_verdict`, `gate_card_check`), shared by board-task-completed.sh and board-release-close.sh. Never copy the gate logic into a new hook.

For a contract that needs cards with differing status, ticks and comments, copy the stub board from `claude/evals/lib/release-close-contract.sh`: one `.task` JSON file per card under `$STUB_CARDS`, served through `BOARD_SHIM`, no bun. board-hook-contract's stub answers every id with the same card, so it cannot do mixed boards.

Harness fact read from the 2.1.323 binary: PostToolUse runs after a successful tool only, PostToolUseFailure after a failed one, so a Bash hook sees non-zero exits only when the command masks them (`git push ...; true`).

**How to apply:** check the gates file and binary behaviour still hold before relying on them; see [[harness-facts-from-binary]].
