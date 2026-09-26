#!/bin/bash
# Shared safety guards for the GPTA-1.1 codex-hooks harness scripts.
#
# resolve_scratch_dir "$1" turns a script's first argument into a checked,
# physically-resolved absolute path (`pwd -P` on every comparison, not the
# logical `pwd` a symlink could spoof), refusing the empty string, "/",
# $HOME, a codex-home under the given directory that resolves to the real
# ~/.codex, and this harness's own repo toplevel. It does NOT decide
# whether the directory is safe to adopt or safe to delete from - that is
# setup_or_refuse_dir's and require_scratch_shape's job respectively.
#
# GPTA_SPIKE_MARKER is the name of a marker file setup.sh writes the first
# time it successfully sets up (or adopts) a scratch directory. Its
# presence is what makes a directory this harness's own, not merely a
# directory that happens to contain files with familiar names - a
# directory setup.sh has never touched never gets the marker, and no
# script here treats it as its own without one.

GPTA_SPIKE_MARKER=".gpta-spike-scratch"

resolve_scratch_dir() {
  local input="$1"
  if [ -z "$input" ]; then
    echo "usage: <script> <scratch-dir>" >&2
    return 1
  fi

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

  local real_codex_home=""
  if [ -d "$HOME/.codex" ]; then
    real_codex_home="$(cd "$HOME/.codex" && pwd -P)"
  fi
  if [ -n "$real_codex_home" ]; then
    # Resolve $resolved/codex-home itself with pwd -P whenever it exists,
    # so a codex-home that is a symlink to the real ~/.codex is caught by
    # comparing physical paths, not by comparing the un-resolved string.
    local codex_home_candidate="$resolved/codex-home"
    if [ -e "$codex_home_candidate" ]; then
      codex_home_candidate="$(cd "$codex_home_candidate" 2>/dev/null && pwd -P)"
    fi
    if [ "$resolved" = "$real_codex_home" ] || [ "$codex_home_candidate" = "$real_codex_home" ]; then
      echo "refusing: scratch dir resolves to the real ~/.codex ($real_codex_home)" >&2
      return 1
    fi
  fi

  local repo_toplevel=""
  repo_toplevel="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$repo_toplevel" ]; then
    repo_toplevel="$(cd "$repo_toplevel" && pwd -P)"
    if [ "$resolved" = "$repo_toplevel" ]; then
      echo "refusing: scratch dir is this harness's own repo toplevel ($repo_toplevel)" >&2
      return 1
    fi
  fi

  echo "$resolved"
}

# setup_or_refuse_dir "$SP" refuses unless "$SP" is either empty or already
# carries the marker from a previous setup.sh run. This is the structural
# fix for a directory that resolve_scratch_dir's identity checks would
# happily pass but that setup.sh should never write into: a directory that
# already holds someone else's data. setup.sh is the only script that
# calls this, and only before it writes anything.
setup_or_refuse_dir() {
  local sp="$1"
  if [ -f "$sp/$GPTA_SPIKE_MARKER" ]; then
    return 0
  fi
  if [ -z "$(ls -A "$sp" 2>/dev/null)" ]; then
    return 0
  fi
  echo "refusing: $sp is not empty and has no $GPTA_SPIKE_MARKER marker - not adopting a directory that might hold other data. Point this at an empty directory, or one this script already set up." >&2
  return 1
}

# write_scratch_marker "$SP" stamps "$SP" as belonging to this harness.
# setup.sh calls this as one of its first actions in a directory it has
# just confirmed is either empty or already its own, so the marker exists
# even if the rest of setup.sh fails partway through.
write_scratch_marker() {
  local sp="$1"
  date -u +"%Y-%m-%dT%H:%M:%SZ setup.sh" > "$sp/$GPTA_SPIKE_MARKER"
}

# require_scratch_shape "$SP" is the check every script that is about to
# act on an existing scratch directory - run-*.sh, features-list.sh,
# teardown.sh - calls immediately after resolve_scratch_dir and before any
# other action. It refuses unless "$SP" carries the marker AND has a
# codex-home/hooks.json, i.e. unless it is both this harness's own
# directory and one setup.sh actually finished building.
require_scratch_shape() {
  local sp="$1"
  if [ ! -f "$sp/$GPTA_SPIKE_MARKER" ]; then
    echo "refusing: $sp has no $GPTA_SPIKE_MARKER marker - it was not set up by this harness's setup.sh, or setup.sh never finished in it. Not touching it." >&2
    return 1
  fi
  if [ ! -f "$sp/codex-home/hooks.json" ]; then
    echo "refusing: $sp/codex-home/hooks.json is missing - setup.sh has not finished building a CODEX_HOME here. Not touching it." >&2
    return 1
  fi
  return 0
}
