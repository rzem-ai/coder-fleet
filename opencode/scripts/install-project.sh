#!/usr/bin/env bash
#
# install-project.sh - put the fleet's OpenCode payload where OpenCode finds it.
#
# Plan Phase 8. The payload is opencode/coder-fleet/ minus its own opencode.json:
# six directories - agent, command, skill, plugin, lib, template - copied into
# a project's .opencode/, or into the global config directory with --global.
# OpenCode discovers agents, commands, skills and plugins by directory, so there
# is nothing to register and nothing to enable; a copy is the whole install.
#
# What it does not do is the half that needs a session: merging keys into an
# existing opencode.json, the AGENTS.md skeleton and its guided fill. That is
# /init, which this script points at when it finishes. The one exception is a
# project with no opencode.json at all, which gets the template copied as-is,
# because there is nothing to merge into and /init would do the same.
#
# The repo's own opencode/coder-fleet/opencode.json is never copied: it pins
# this repository's LM Studio address. The template carries a placeholder
# instead, and no file in the payload carries a credential.
#
# With --ref the payload is the one a release tag holds rather than the one
# beside this script: the script clones the coder-fleet repo at that tag
# (CODER_FLEET_REPO overrides the repository URL) into a scratch directory
# and installs from there, so the script can run from any checkout or from a
# download of itself.
#
# Every install that is not a dry run writes .coder-fleet-version into the
# install directory: ref= the tag, or working-tree; commit= the commit the
# payload came from, where known; source= the repository or checkout; and
# kept= the number of differing files left in place, when there are any,
# because those files are not the stamped version.
#
# Usage:
#   scripts/install-project.sh <project-dir>        install into <project-dir>/.opencode/
#   scripts/install-project.sh --global             install into ~/.config/opencode/
#   scripts/install-project.sh --ref <tag> <dir>    install the payload of release <tag>
#   scripts/install-project.sh --update <dir>       also replace payload files that differ
#   scripts/install-project.sh --dry-run <dir>      show what would change, change nothing
#   scripts/install-project.sh --help
#
# Safe to re-run. Without --update an existing file is never overwritten - a
# file that differs from the payload is named, so a stale install is visible
# rather than silently kept. Nothing is ever deleted, with or without --update.
# After any change, restart OpenCode: it reads agents, commands, skills and
# plugins once per process and never again.

set -euo pipefail

SCRIPT_NAME=$(basename "$0")
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PAYLOAD="$SCRIPT_DIR/../coder-fleet"
PARTS="agent command skill plugin lib template"

DRY_RUN=0
UPDATE=0
GLOBAL=0
TARGET=""
REF=""
REPO="${CODER_FLEET_REPO:-https://github.com/rzem-ai/coder-fleet.git}"
CLONE=""

N_COPIED=0
N_REPLACED=0
N_SAME=0
N_DIFFERS=0

say()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '%s: warning: %s\n' "$SCRIPT_NAME" "$*" >&2; }
die()  { printf '%s: error: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

usage() {
    sed -n '3,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--dry-run) DRY_RUN=1 ;;
        -u|--update)  UPDATE=1 ;;
        -g|--global)  GLOBAL=1 ;;
        -r|--ref)
            [ $# -ge 2 ] && [ -n "$2" ] || die "--ref needs a tag (try --help)"
            REF="$2"
            shift
            ;;
        -h|--help)    usage; exit 0 ;;
        -*)           die "unknown argument: $1 (try --help)" ;;
        *)
            [ -z "$TARGET" ] || die "one project directory at a time (got '$TARGET' and '$1')"
            TARGET="$1"
            ;;
    esac
    shift
done

if [ "$GLOBAL" -eq 1 ]; then
    [ -z "$TARGET" ] || die "--global takes no project directory"
    DEST="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
else
    [ -n "$TARGET" ] || die "name a project directory, or pass --global (try --help)"
    [ -d "$TARGET" ] || die "no such directory: $TARGET"
    TARGET=$(cd "$TARGET" && pwd)
    DEST="$TARGET/.opencode"
fi

# ---------------------------------------------------------------------------
# Where the payload comes from: the tag, or the checkout beside this script
# ---------------------------------------------------------------------------

if [ -n "$REF" ]; then
    command -v git >/dev/null 2>&1 || die "--ref needs git on PATH"
    TMP_ROOT="${TMPDIR:-/tmp}"
    CLONE=$(mktemp -d "${TMP_ROOT%/}/coder-fleet-ref.XXXXXX")
    trap 'rm -rf "$CLONE"' EXIT
    # A shallow clone of one tag or branch. --branch takes names only, so a
    # commit hash is refused here rather than half-supported.
    if ! git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$REF" "$REPO" "$CLONE/repo" >/dev/null 2>"$CLONE/clone.err"; then
        sed 's/^/  /' "$CLONE/clone.err" >&2
        die "could not fetch ref $REF from $REPO"
    fi
    PAYLOAD="$CLONE/repo/opencode/coder-fleet"
    [ -d "$PAYLOAD/agent" ] || die "ref $REF of $REPO has no OpenCode payload at opencode/coder-fleet/"
    STAMP_REF="$REF"
    STAMP_COMMIT=$(git -C "$CLONE/repo" rev-parse HEAD)
    STAMP_SOURCE="$REPO"
else
    [ -d "$PAYLOAD/agent" ] || die "the payload is not at $PAYLOAD - run this from an opencode/ checkout, or pass --ref <tag>"
    PAYLOAD=$(cd "$PAYLOAD" && pwd)
    if [ "$GLOBAL" -eq 0 ]; then
        # Installing into the checkout that holds the payload would copy the
        # payload over itself.
        case "$PAYLOAD" in
            "$TARGET"|"$TARGET"/*) die "$TARGET contains the payload itself; install into a different project" ;;
        esac
    fi
    STAMP_REF="working-tree"
    STAMP_COMMIT=$(git -C "$PAYLOAD" rev-parse HEAD 2>/dev/null || true)
    STAMP_SOURCE="$PAYLOAD"
fi

say "Payload  $PAYLOAD${REF:+ ($REF from $REPO)}"
say "Into     $DEST"
[ "$DRY_RUN" -eq 1 ] && say "(dry run: nothing will change)"

# ---------------------------------------------------------------------------
# The six directories, file by file
# ---------------------------------------------------------------------------

install_file() {
    # $1 is the path relative to the payload root.
    local rel="$1" src="$PAYLOAD/$1" dst="$DEST/$1"
    if [ ! -e "$dst" ]; then
        N_COPIED=$((N_COPIED + 1))
        info "add       $rel"
        [ "$DRY_RUN" -eq 1 ] && return 0
        mkdir -p "$(dirname "$dst")"
        cp "$src" "$dst"
        return 0
    fi
    if cmp -s "$src" "$dst"; then
        N_SAME=$((N_SAME + 1))
        return 0
    fi
    if [ "$UPDATE" -eq 1 ]; then
        N_REPLACED=$((N_REPLACED + 1))
        info "replace   $rel"
        [ "$DRY_RUN" -eq 1 ] && return 0
        cp "$src" "$dst"
        return 0
    fi
    N_DIFFERS=$((N_DIFFERS + 1))
    info "differs   $rel (kept; --update replaces it)"
}

for part in $PARTS; do
    [ -d "$PAYLOAD/$part" ] || die "the payload has no $part/ directory"
    while IFS= read -r -d '' file; do
        install_file "${file#"$PAYLOAD"/}"
    done < <(find "$PAYLOAD/$part" -type f -print0 | sort -z)
done

# ---------------------------------------------------------------------------
# opencode.json, only where there is none
# ---------------------------------------------------------------------------

CONFIG_NOTE=""
if [ "$GLOBAL" -eq 0 ]; then
    if [ -e "$TARGET/opencode.json" ] || [ -e "$TARGET/opencode.jsonc" ]; then
        CONFIG_NOTE="opencode.json exists and was left alone; /init adds the keys it is missing."
    else
        info "add       ../opencode.json (from template/opencode.json)"
        if [ "$DRY_RUN" -eq 0 ]; then
            cp "$PAYLOAD/template/opencode.json" "$TARGET/opencode.json"
        fi
        CONFIG_NOTE="opencode.json was created from the template. Replace <lm-studio-host> in its baseURL with the machine serving LM Studio."
    fi
fi

# ---------------------------------------------------------------------------
# The version stamp
# ---------------------------------------------------------------------------

if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$DEST"
    {
        printf 'ref=%s\n' "$STAMP_REF"
        if [ -n "$STAMP_COMMIT" ]; then printf 'commit=%s\n' "$STAMP_COMMIT"; fi
        printf 'source=%s\n' "$STAMP_SOURCE"
        if [ "$N_DIFFERS" -gt 0 ]; then printf 'kept=%s\n' "$N_DIFFERS"; fi
    } > "$DEST/.coder-fleet-version"
    info "stamp     .coder-fleet-version ($STAMP_REF)"
fi

say ""
say "Added $N_COPIED, replaced $N_REPLACED, unchanged $N_SAME, differing and kept $N_DIFFERS."
[ -n "$CONFIG_NOTE" ] && say "$CONFIG_NOTE"
if [ "$N_DIFFERS" -gt 0 ]; then
    warn "$N_DIFFERS installed file(s) differ from this payload. Rerun with --update to replace them."
fi
if [ "$DRY_RUN" -eq 0 ]; then
    say "Next: restart OpenCode, then run /init in the project and /kickoff after it."
fi
