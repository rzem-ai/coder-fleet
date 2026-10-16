#!/usr/bin/env bash
#
# install-home.sh - put the fleet's user-scope settings on this machine.
#
# Optional. The plugin runs without it: the TODO-tools flag is written into each
# project by /init, the board binary is downloaded by the plugin itself, and the
# fleet needs no credentials on the machine. What this adds is protection for
# every Claude Code session on the machine, fleet project or not (design
# sections 10 and 12):
#
#   1. Merge home/settings.json into ~/.claude/settings.json - the credential
#      deny list, the bash sandbox and its network allowlist. Merged, never
#      copied, and copies rather than symlinks: Cowork skips a symlinked
#      ~/.claude/CLAUDE.md (section 8).
#   2. Repoint the rzem marketplace for a machine still on the old
#      claudecode-agents name.
#
# What it never touches: ~/.claude/projects/, sessions, history, todos, debug,
# logs, shell snapshots and plugins/cache. Those are per-machine state and this
# script has no business in them. The guard is enforced, not just documented -
# see is_protected() below.
#
# The plugin itself is not installed here. That is
#   claude plugin marketplace add rzem-ai/coder-fleet
#   claude plugin install coder-fleet@rzem
# once per machine, at user scope - the only enable point, so there is one
# install record and one version. Projects carry only the marketplace and the
# agent (claude/coder-fleet/templates/project-settings.json); a project-scope
# enable mints a record per path, worktrees included, and pins old versions.
#
# Usage:
#   scripts/install-home.sh             install the settings
#   scripts/install-home.sh --dry-run   show what would change, change nothing
#   scripts/install-home.sh --help
#
# A per-box overlay, if one is wanted, goes in home/hosts/<short-hostname>/ and
# is copied over the base tree after it.
#
# Safe to re-run. Identical files are left alone, and anything about to be
# overwritten is backed up first.

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

SCRIPT_NAME=$(basename "$0")
HARNESS_ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

HOME_SRC="$HARNESS_ROOT/home"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="${CODER_FLEET_BACKUP_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/coder-fleet/backups/$STAMP}"

DRY_RUN=0

# Counters, reported at the end.
N_CREATED=0
N_UPDATED=0
N_UNCHANGED=0
N_SKIPPED=0
BACKUP_USED=0

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

say()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '%s: warning: %s\n' "$SCRIPT_NAME" "$*" >&2; }
die()  { printf '%s: error: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

usage() {
    sed -n '3,/^$/p' "$0" | sed -e '/^$/d' -e 's/^# \{0,1\}//'
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--dry-run)  DRY_RUN=1 ;;
        -h|--help)     usage; exit 0 ;;
        *)             die "unknown argument: $1 (try --help)" ;;
    esac
    shift
done

# ---------------------------------------------------------------------------
# Host overlay. No box is named here: the overlay directory is looked up by
# this machine's short hostname and is simply absent on a box that has none.
# ---------------------------------------------------------------------------

HOSTNAME_SHORT=$(hostname -s 2>/dev/null || uname -n 2>/dev/null || echo unknown)
HOSTNAME_SHORT=${HOSTNAME_SHORT%%.*}
HOST_OVERLAY="$HOME_SRC/hosts/$HOSTNAME_SHORT"

# ---------------------------------------------------------------------------
# The protected-path guard
# ---------------------------------------------------------------------------
#
# Nothing this script writes may land in per-machine state. The list is checked
# against the relative path under ~/.claude, so a stray file committed into
# home/ cannot smuggle itself into sessions or the plugin cache.

is_protected() {
    case "$1" in
        projects|projects/*) return 0 ;;
        sessions|sessions/*) return 0 ;;
        history|history/*|history.jsonl) return 0 ;;
        todos|todos/*) return 0 ;;
        debug|debug/*) return 0 ;;
        logs|logs/*) return 0 ;;
        statsig|statsig/*) return 0 ;;
        shell-snapshots|shell-snapshots/*) return 0 ;;
        file-history|file-history/*) return 0 ;;
        ide|ide/*) return 0 ;;
        worktrees|worktrees/*) return 0 ;;
        plugins/cache|plugins/cache/*) return 0 ;;
        .credentials.json) return 0 ;;
        *) return 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# File installation
# ---------------------------------------------------------------------------

backup_file() {
    # $1 destination path, $2 relative path under ~/.claude
    local dest="$1" rel="$2" target
    target="$BACKUP_DIR/$rel"
    # A host overlay can replace a file the base tree installed a moment ago.
    # The first backup holds the machine's original; a second would overwrite
    # it with the base tree's copy, so keep the first.
    if [ -e "$target" ]; then
        return 0
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
        info "would back up  $rel -> $target"
        return 0
    fi
    mkdir -p "$(dirname "$target")"
    cp -p "$dest" "$target"
    BACKUP_USED=1
}

install_settings() {
    # settings.json is merged, never copied. The live file carries machine state
    # the repository has never heard of - model, enabled plugins, statusLine, a
    # deny rule added by hand - and a copy deletes all of it. See
    # scripts/merge-settings.py for the merge policy and what it deliberately
    # will not do (it never removes a managed entry that the repo has dropped).
    local src="$1" rel="$2" dest="$CLAUDE_DIR/$2" tmp staged
    command -v python3 >/dev/null 2>&1 || die 'python3 is required to merge settings.json'
    if [ -L "$dest" ]; then
        die "'$rel' is a symlink; refusing to merge into it. Replace it with a real file first."
    fi

    tmp=$(mktemp "${TMPDIR:-/tmp}/fleet-settings.XXXXXX") || die 'cannot create a temporary file for the settings merge'
    chmod 0600 "$tmp"
    if ! python3 "$HARNESS_ROOT/scripts/merge-settings.py" "$dest" "$src" "$tmp"; then
        rm -f "$tmp"
        die "merging '$rel' failed; the existing file has not been touched"
    fi

    if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
        rm -f "$tmp"
        N_UNCHANGED=$((N_UNCHANGED + 1))
        return 0
    fi

    if [ -e "$dest" ]; then
        backup_file "$dest" "$rel"
        N_UPDATED=$((N_UPDATED + 1))
    else
        N_CREATED=$((N_CREATED + 1))
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        info "would merge    $rel (unrelated settings preserved)"
        rm -f "$tmp"
        return 0
    fi

    mkdir -p "$(dirname "$dest")"
    # Stage beside the destination so the final rename stays on one filesystem.
    staged=$(mktemp "$(dirname "$dest")/.fleet-settings.XXXXXX") || {
        rm -f "$tmp"; die 'cannot stage the merged settings'; }
    if ! cp "$tmp" "$staged" || ! chmod 0644 "$staged" || ! mv "$staged" "$dest"; then
        rm -f "$tmp" "$staged"
        die 'cannot install the merged settings'
    fi
    rm -f "$tmp"
    info "merged         $rel"
}

install_one() {
    # $1 source path, $2 relative path under ~/.claude
    local src="$1" rel="$2" dest mode
    dest="$CLAUDE_DIR/$rel"

    if is_protected "$rel"; then
        warn "refusing to install '$rel': that path is per-machine state and is never touched."
        N_SKIPPED=$((N_SKIPPED + 1))
        return 0
    fi

    if [ "$rel" = 'settings.json' ]; then
        install_settings "$src" "$rel"
        return
    fi

    if [ -x "$src" ]; then mode=0755; else mode=0644; fi

    if [ -L "$dest" ]; then
        # Cowork skips a symlinked ~/.claude/CLAUDE.md, so a symlink here is a
        # bug even when it points at the right content. Replace it with a copy.
        warn "'$rel' is a symlink; replacing it with a real file (Cowork ignores symlinked config)."
        if [ "$DRY_RUN" -eq 0 ]; then rm -f "$dest"; fi
    fi

    if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
        N_UNCHANGED=$((N_UNCHANGED + 1))
        return 0
    fi

    if [ -e "$dest" ]; then
        backup_file "$dest" "$rel"
        if [ "$DRY_RUN" -eq 1 ]; then
            info "would update   $rel"
        else
            mkdir -p "$(dirname "$dest")"
            cp "$src" "$dest"
            chmod "$mode" "$dest"
            info "updated        $rel"
        fi
        N_UPDATED=$((N_UPDATED + 1))
    else
        if [ "$DRY_RUN" -eq 1 ]; then
            info "would create   $rel"
        else
            mkdir -p "$(dirname "$dest")"
            cp "$src" "$dest"
            chmod "$mode" "$dest"
            info "created        $rel"
        fi
        N_CREATED=$((N_CREATED + 1))
    fi
}

install_tree() {
    # $1 source directory, $2 label for the log, then any number of relative
    # prefixes to skip. The base tree passes "hosts/" so per-box overlays are not
    # installed wholesale - the overlay for this box is applied afterwards, on
    # its own.
    local src="$1" label="$2" file rel skip
    shift 2
    [ -d "$src" ] || return 0
    say ""
    say "$label ($src -> $CLAUDE_DIR)"

    while IFS= read -r -d '' file; do
        rel=${file#"$src"/}
        case "$(basename "$rel")" in
            .gitkeep|.DS_Store) continue ;;
        esac
        for skip in "$@"; do
            case "$rel" in
                "$skip"*) continue 2 ;;
            esac
        done
        install_one "$file" "$rel"
    done < <(find "$src" -type f -print0)
}

# ---------------------------------------------------------------------------
# Migrating a machine still on the old name
# ---------------------------------------------------------------------------
#
# A machine that ran claudecode-agents before the rename has a marketplace
# source pointing at the old repo. This repoints it, before the backup and the
# settings merge below ever run. The design is the "Machines already running
# the fleet" section of docs/plans/coder-fleet-migration.md, which CF-58
# deleted along with docs/plans; git history keeps it.

repoint_marketplace() {
    # Read-only check, in both modes: this never writes, so a settings.json
    # already on the new name or carrying no rzem entry at all is untouched,
    # byte for byte, whether or not a rewrite would otherwise apply.
    local s="$CLAUDE_DIR/settings.json"
    if [ -f "$s" ] && python3 - "$s" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
repo = data.get("extraKnownMarketplaces", {}).get("rzem", {}).get("source", {}).get("repo")
sys.exit(0 if repo == "rzem-ai/claudecode-agents" else 1)
PY
    then
        if [ "$DRY_RUN" -eq 1 ]; then
            say "would repoint marketplace rzem to rzem-ai/coder-fleet"
        else
            local tmp; tmp=$(mktemp "${TMPDIR:-/tmp}/settings.XXXXXX")
            python3 - "$s" "$tmp" <<'PY'
import json, sys
path, tmp = sys.argv[1], sys.argv[2]
data = json.load(open(path))
data["extraKnownMarketplaces"]["rzem"]["source"]["repo"] = "rzem-ai/coder-fleet"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
            # This is the first write to settings.json in the run, so back it
            # up now: backup_file keeps the first copy, and the merge later in
            # the run would otherwise back up the already-repointed file. Write
            # through the existing file so it keeps its mode.
            backup_file "$s" settings.json
            cat "$tmp" > "$s" || die "could not repoint marketplace rzem in $s - the original is at $BACKUP_DIR/settings.json"
            rm -f "$tmp"
            say "repointed marketplace rzem to rzem-ai/coder-fleet"
        fi
    fi
}

# A test sources this script to call its functions without running the main
# flow below. Nothing above this line runs conditionally on it, so the
# functions and constants a test needs are always defined by the time it
# returns here.
[ -n "${INSTALL_HOME_LIB:-}" ] && return 0

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

say "$SCRIPT_NAME"
say "  repo        $REPO_ROOT"
say "  host        $HOSTNAME_SHORT"
say "  ~/.claude   $CLAUDE_DIR"
if [ "$DRY_RUN" -eq 1 ]; then
    say "  mode        DRY RUN - nothing is written"
else
    say "  backups     $BACKUP_DIR"
fi

[ -d "$HOME_SRC" ] || die "no claude/home directory in $REPO_ROOT - is this the coder-fleet repo?"
command -v python3 >/dev/null 2>&1 || die 'python3 is required to merge settings.json - nothing has been changed.'

repoint_marketplace

if [ ! -f "$HOME_SRC/CLAUDE.md" ]; then
    warn "home/CLAUDE.md does not exist yet, so ~/.claude/CLAUDE.md will not be installed."
fi
if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$CLAUDE_DIR"
fi
install_tree "$HOME_SRC" "Base tree" "hosts/"
if [ -d "$HOST_OVERLAY" ]; then
    install_tree "$HOST_OVERLAY" "Host overlay for $HOSTNAME_SHORT"
fi

say ""
say "Summary"
say "  files     created $N_CREATED, updated $N_UPDATED, unchanged $N_UNCHANGED, skipped $N_SKIPPED"
if [ "$BACKUP_USED" -eq 1 ]; then
    say "  backups   $BACKUP_DIR"
fi
if [ "$DRY_RUN" -eq 1 ]; then
    say ""
    say "Dry run. Re-run without --dry-run to apply."
fi
say ""
say "What comes next"
say "  claude plugin install coder-fleet@rzem"
say "  the renames map moves your enabledPlugins key; this one install fills"
say "  the cache under the new name"
