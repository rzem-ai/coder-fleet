#!/usr/bin/env bash
#
# prune-worktrees.sh - remove the agent worktrees whose work has been adopted,
# then remove the memory hook's records and sweep the scratch directories of
# worktrees that no longer exist.
#
# A shim since CF-1.2 onto `boards fleet prune-worktrees`,
# boards/src/fleet/prune-worktrees.ts, which states the rules: a worktree goes
# only when it is under .claude/worktrees/, not the state worktree, not the
# current one, unlocked, clean, and an ancestor of the trunk or, under push
# base-only, landed there as one squashed commit. Nothing is ever forced.
#
# Exit 0 whenever it ran, refusals included; 1, having changed nothing, when
# the resolver finds no trunk; 2 on a usage error or outside a git repository;
# 127 when the binary will not run, having changed nothing.
#
# Usage:  prune-worktrees.sh [--dry-run]

exec bash "$(cd "$(dirname "$0")/.." && pwd)/boards/boards.sh" fleet prune-worktrees "$@"
