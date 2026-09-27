#!/bin/bash
# Shared safety guards for the CF-12.1 spike harness scripts, modelled on
# codex/scripts/spike/codex-hooks/lib/guard.sh.
#
# resolve_scratch_dir "$1" turns a script's first argument into a checked,
# physically-resolved (`pwd -P`, not the logical `pwd` a symlink could spoof)
# absolute path, refusing the empty string, a relative path, "/", "$HOME",
# and any path under this repository's main checkout root - including
# .claude/worktrees/, so a scratch directory can never be pointed at another
# session's worktree. It does NOT decide whether the directory is safe to
# adopt or safe to delete from - that is setup_or_refuse_dir's and
# require_scratch_shape's job respectively.
#
# CF12_SPIKE_MARKER is the name of a marker file setup.sh writes the first
# time it successfully sets up (or adopts) a scratch directory. Its presence
# is what makes a directory this harness's own, not merely a directory that
# happens to contain files with familiar names.

CF12_SPIKE_MARKER=".cf12-spike-scratch"

resolve_scratch_dir() {
  local input="$1"
  if [ -z "$input" ]; then
    echo "usage: <script> <scratch-dir> (absolute path required)" >&2
    return 1
  fi

  case "$input" in
    /*) ;;
    *)
      echo "refusing: $input is a relative path. Pass an absolute path." >&2
      return 1
      ;;
  esac

  mkdir -p "$input" 2>/dev/null
  if [ ! -d "$input" ]; then
    echo "error: $input is not a directory and could not be created" >&2
    return 1
  fi

  local resolved
  resolved="$(cd "$input" && pwd -P)"
  if [ -z "$resolved" ]; then
    echo "error: could not resolve scratch dir to an absolute path" >&2
    return 1
  fi

  if [ "$resolved" = "/" ]; then
    echo "refusing: scratch dir resolves to / ($resolved)" >&2
    return 1
  fi

  local real_home=""
  if [ -n "$HOME" ] && [ -d "$HOME" ]; then
    real_home="$(cd "$HOME" && pwd -P)"
  fi
  if [ -n "$real_home" ] && [ "$resolved" = "$real_home" ]; then
    echo "refusing: scratch dir is \$HOME ($real_home)" >&2
    return 1
  fi

  # This harness's own repository - the main checkout root, not any one
  # worktree - so a scratch directory can never resolve under the repo,
  # .claude/worktrees/ included. Uses git-common-dir rather than
  # show-toplevel precisely because show-toplevel from inside a worktree
  # returns the worktree, not the main checkout.
  local guard_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local common_dir="" main_root=""
  common_dir="$(git -C "$guard_dir" rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -n "$common_dir" ]; then
    case "$common_dir" in
      /*) ;;
      *) common_dir="$guard_dir/$common_dir" ;;
    esac
    main_root="$(cd "$(dirname "$common_dir")" 2>/dev/null && pwd -P || true)"
  fi
  if [ -n "$main_root" ]; then
    case "$resolved/" in
      "$main_root/"*)
        echo "refusing: scratch dir ($resolved) is under this repository's main checkout root ($main_root), .claude/worktrees/ included" >&2
        return 1
        ;;
    esac
  fi

  echo "$resolved"
}

# setup_or_refuse_dir "$SP" refuses unless "$SP" is either empty or already
# carries the marker from a previous setup.sh run.
setup_or_refuse_dir() {
  local sp="$1"
  if [ -f "$sp/$CF12_SPIKE_MARKER" ]; then
    return 0
  fi
  if [ -z "$(ls -A "$sp" 2>/dev/null)" ]; then
    return 0
  fi
  echo "refusing: $sp is not empty and has no $CF12_SPIKE_MARKER marker - not adopting a directory that might hold other data. Point this at an empty directory, or one this script already set up." >&2
  return 1
}

# write_scratch_marker "$SP" stamps "$SP" as belonging to this harness.
write_scratch_marker() {
  local sp="$1"
  date -u +"%Y-%m-%dT%H:%M:%SZ setup.sh" > "$sp/$CF12_SPIKE_MARKER"
}

# require_scratch_shape "$SP" refuses unless "$SP" carries the marker AND has
# a state directory that setup.sh actually finished building.
require_scratch_shape() {
  local sp="$1"
  if [ ! -f "$sp/$CF12_SPIKE_MARKER" ]; then
    echo "refusing: $sp has no $CF12_SPIKE_MARKER marker - it was not set up by this harness's setup.sh, or setup.sh never finished in it. Not touching it." >&2
    return 1
  fi
  if [ ! -d "$sp/state" ] || [ ! -d "$sp/logs" ]; then
    echo "refusing: $sp/state or $sp/logs is missing - setup.sh has not finished building a scratch area here. Not touching it." >&2
    return 1
  fi
  return 0
}
