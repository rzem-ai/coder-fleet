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
# because those files are not the stamped version. Credentials in the
# repository URL are removed before it is printed or stamped.
#
# Nothing is written through a symlink: a symlink at .opencode, at any path
# below it the install would write, or a dangling one at opencode.json, stops
# the install before it copies anything.
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

# A fixed name: on the curl | bash route $0 is "bash" and there is no file.
SCRIPT_NAME=install-project.sh
SCRIPT_FILE="${BASH_SOURCE[0]:-}"
SCRIPT_DIR=$(cd "$(dirname "${SCRIPT_FILE:-.}")" && pwd)
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
    # The help is this file's header. Read from a pipe, there is no file to
    # read it from, so a synopsis and a pointer stand in.
    if [ -n "$SCRIPT_FILE" ] && [ -f "$SCRIPT_FILE" ]; then
        sed -n '3,/^set -euo/p' "$SCRIPT_FILE" | sed '$d' | sed 's/^# \{0,1\}//'
        return
    fi
    say "Usage: $SCRIPT_NAME [--ref <tag>] [--update] [--dry-run] (<project-dir> | --global)"
    say "The full help is the header of opencode/scripts/install-project.sh in the coder-fleet repo."
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

# The repository URL as it may be shown or written down. All userinfo is
# removed, whatever the form: scheme://user:token@host/path and scp-style
# user:token@host:path alike, up to the LAST @ before the first /, so a
# password holding an @ goes whole. A bare git@ username goes too: telling it
# apart from a token is guesswork, and nothing needs it shown. The clone
# itself uses the URL as given. REPO_USERINFO is what was removed.
redact_url() {
    local url="$1" scheme="" rest authority path=""
    case "$url" in
        *://*) scheme="${url%%://*}://"; rest="${url#*://}" ;;
        *) rest="$url" ;;
    esac
    authority="${rest%%/*}"
    [ "$authority" != "$rest" ] && path="/${rest#*/}"
    case "$authority" in
        *@*) REPO_USERINFO="${authority%@*}"; authority="${authority##*@}" ;;
    esac
    REPO_SHOWN="$scheme$authority$path"
}
REPO_USERINFO=""
redact_url "$REPO"

# A copy of stdin with every occurrence of the userinfo, its password half
# and its user half removed as literal strings, then anything left between a
# scheme:// and the last @ before the host. A failed clone's output goes
# through it, because git does not redact enough: it splits userinfo at the
# first @, so a password holding an @ is echoed from there on, and ssh echoes
# user@host when it fails. A userinfo of plain "git" is left alone: it is no
# secret, and removing it would mangle every mention of git.
scrub() {
    if [ -z "$REPO_USERINFO" ] || [ "$REPO_USERINFO" = git ]; then cat; return; fi
    local pass=""
    case "$REPO_USERINFO" in *:*) pass="${REPO_USERINFO#*:}" ;; esac
    SCRUB_A="$REPO_USERINFO" SCRUB_B="$pass" SCRUB_C="${REPO_USERINFO%%:*}" awk '
        function cut(line, s,   i) {
            if (s == "") return line
            while ((i = index(line, s)) > 0) line = substr(line, 1, i - 1) substr(line, i + length(s))
            return line
        }
        { line = cut($0, ENVIRON["SCRUB_A"]); line = cut(line, ENVIRON["SCRUB_B"]); print cut(line, ENVIRON["SCRUB_C"]) }' \
        | sed -E "s#([a-zA-Z][a-zA-Z0-9+.-]*://)[^/[:space:]'\"]*@#\\1#g"
}

if [ "$GLOBAL" -eq 1 ]; then
    [ -z "$TARGET" ] || die "--global takes no project directory"
    DEST="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
    # The global config directory is the human's own, and a symlinked one is
    # a common dotfiles arrangement, so it is followed once, here, and
    # everything below it is held to the no-symlink rule.
    if [ -d "$DEST" ]; then DEST=$(cd -P "$DEST" && pwd); fi
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
    if ! git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$REF" -- "$REPO" "$CLONE/repo" >/dev/null 2>"$CLONE/clone.err"; then
        scrub < "$CLONE/clone.err" | sed 's/^/  /' >&2
        die "could not fetch ref $REF from $REPO_SHOWN"
    fi
    PAYLOAD="$CLONE/repo/opencode/coder-fleet"
    [ -d "$PAYLOAD/agent" ] || die "ref $REF of $REPO_SHOWN has no OpenCode payload at opencode/coder-fleet/"
    STAMP_REF="$REF"
    STAMP_COMMIT=$(git -C "$CLONE/repo" rev-parse HEAD)
    STAMP_SOURCE="$REPO_SHOWN"
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

say "Payload  $PAYLOAD${REF:+ ($REF from $REPO_SHOWN)}"
say "Into     $DEST"
[ "$DRY_RUN" -eq 1 ] && say "(dry run: nothing will change)"

# ---------------------------------------------------------------------------
# No write may follow a symlink
# ---------------------------------------------------------------------------
#
# A project is often a clone of someone else's repository, and a symlink it
# carries at .opencode, at any directory below it, at a payload file's path or
# at the stamp would send a copy wherever it points. Every path the install
# could write is checked before anything is written, so a refusal leaves the
# project as it was.

refuse_symlinks() {
    # $1 is a path relative to $DEST; every component from $DEST down is checked.
    local path="$DEST" part rest="$1"
    [ -L "$path" ] && die "$path is a symlink; refusing to write through it"
    while [ -n "$rest" ]; do
        part="${rest%%/*}"
        if [ "$part" = "$rest" ]; then rest=""; else rest="${rest#*/}"; fi
        path="$path/$part"
        [ -L "$path" ] && die "$path is a symlink; refusing to write through it"
    done
    return 0
}

FILES=()
for part in $PARTS; do
    [ -d "$PAYLOAD/$part" ] || die "the payload has no $part/ directory"
    while IFS= read -r -d '' file; do
        FILES+=("${file#"$PAYLOAD"/}")
    done < <(find "$PAYLOAD/$part" -type f -print0 | sort -z)
done

for rel in "${FILES[@]}" .coder-fleet-version; do
    refuse_symlinks "$rel"
done
if [ "$GLOBAL" -eq 0 ]; then
    for config in opencode.json opencode.jsonc; do
        if [ -L "$TARGET/$config" ] && [ ! -e "$TARGET/$config" ]; then
            die "$TARGET/$config is a symlink to nothing; refusing to write through it"
        fi
    done
fi

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

for rel in "${FILES[@]}"; do
    install_file "$rel"
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
    # Written beside its final name and renamed over it. A symlink to a file
    # planted since the check above is replaced rather than followed; one to
    # a directory is not, since mv moves the file into it and macOS mv has no
    # -T. The check above is the guarantee; the rename only narrows the gap.
    STAMP_TMP=$(mktemp "$DEST/.coder-fleet-version.XXXXXX")
    {
        printf 'ref=%s\n' "$STAMP_REF"
        if [ -n "$STAMP_COMMIT" ]; then printf 'commit=%s\n' "$STAMP_COMMIT"; fi
        printf 'source=%s\n' "$STAMP_SOURCE"
        if [ "$N_DIFFERS" -gt 0 ]; then printf 'kept=%s\n' "$N_DIFFERS"; fi
    } > "$STAMP_TMP"
    chmod 644 "$STAMP_TMP"
    mv -f "$STAMP_TMP" "$DEST/.coder-fleet-version"
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
