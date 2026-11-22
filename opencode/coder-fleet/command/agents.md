---
description: List or configure fleet agents, phase, base branch, push policy and release setting
agent: lead
---

The arguments are `$ARGUMENTS`. Call `fleet_control` with action `agents` and the arguments as literal argv words, never shell text. Supported forms: no args or `list`; `enable <agent>`; `disable <agent>`; `phase [build|harden]`; `base [<branch>|--unset]`; `push [all|base-only|--unset]`; `release [off|tag|github|--unset]`. Reject any other form before calling it. Report its output without making a manual edit when it refuses. The file is `.opencode/coder-fleet.json` in the main checkout, read live; core agents lead, coder and reviewer cannot be disabled. Model selection is separate: use native `agents.<role>.model` configuration, not this file.
