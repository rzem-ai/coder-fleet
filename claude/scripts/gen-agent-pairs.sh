#!/usr/bin/env bash
#
# gen-agent-pairs.sh - render each editor pair from one body source.
#
# CF-12 spec Q17: an editor role (spec-editor, tech-editor, and so on) ships
# as two agent definitions that differ only in name, model and description -
# the unsuffixed Opus one and the `-fable` Fable one. Hand-maintaining both
# would let them drift; this generator renders both from one source under
# claude/agent-pairs/<role>.md, the way gen-glossary-rule.sh renders the
# glossary rule from the glossary skill.
#
#   source  claude/agent-pairs/<role>.md          (canonical, hand edited)
#   targets claude/coder-fleet/agents/<role>.md         (opus, generated)
#           claude/coder-fleet/agents/<role>-fable.md   (fable, generated)
#
# Source format: three header lines, `role:`, `description.opus:` and
# `description.fable:`, then a complete agent-file template starting with its
# own `---` line. The template carries exactly three placeholders, each the
# whole value of its own frontmatter key: `name: {{name}}`, `model: {{model}}`
# and `description: {{description}}`. Everything else is copied byte for
# byte. The generator inserts frontmatter line 2, a marker identical in both
# files of a pair: how an orphan (a generated file with no source) is
# recognised.
#
# Usage:
#   scripts/gen-agent-pairs.sh                     regenerate every pair
#   scripts/gen-agent-pairs.sh --check              exit 1 if a pair is stale, drifted or orphaned
#   scripts/gen-agent-pairs.sh --sources DIR        override the sources directory
#   scripts/gen-agent-pairs.sh --agents DIR         override the agents directory
#   scripts/gen-agent-pairs.sh --help
#
# With no sources (directory missing or empty) and no marker-bearing agent
# file, --check prints "nothing to check" and exits 0.

set -uo pipefail

SCRIPT_NAME=$(basename "$0")
HARNESS_ROOT=$(cd "$(dirname "$0")/.." && pwd)

SOURCES_DIR="$HARNESS_ROOT/agent-pairs"
AGENTS_DIR="$HARNESS_ROOT/coder-fleet/agents"
MODE="generate"

die() { printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

usage() {
    cat <<EOF
Usage:
  $SCRIPT_NAME                     regenerate every pair
  $SCRIPT_NAME --check             exit 1 if a pair is stale, drifted or orphaned
  $SCRIPT_NAME --sources DIR       override the sources directory
  $SCRIPT_NAME --agents DIR        override the agents directory
  $SCRIPT_NAME --help
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --check)
            MODE="check"
            ;;
        --sources)
            [ $# -ge 2 ] || die "--sources requires a value"
            SOURCES_DIR="$2"
            shift
            ;;
        --agents)
            [ $# -ge 2 ] || die "--agents requires a value"
            AGENTS_DIR="$2"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "unknown argument: $1 (try --help)"
            ;;
    esac
    shift
done

MARKER_PREFIX='# GENERATED FROM AGENT-PAIR SOURCE '
MARKER_SUFFIX=' BY gen-agent-pairs.sh - DO NOT EDIT. Edit the source and regenerate.'

marker_for() {
    # $1 role
    printf '%s%s.md%s' "$MARKER_PREFIX" "$1" "$MARKER_SUFFIX"
}

# role_of_marker_line PREFIX SUFFIX LINE -> the role name, or empty if LINE is
# not a marker line at all.
role_of_marker_line() {
    local line="$1"
    case "$line" in
        "$MARKER_PREFIX"*".md$MARKER_SUFFIX")
            line="${line#"$MARKER_PREFIX"}"
            line="${line%".md$MARKER_SUFFIX"}"
            printf '%s' "$line"
            ;;
        *)
            printf ''
            ;;
    esac
}

# The sources directory must never sit inside the agents directory, or
# inside any directory named agents/ below it, because Claude Code scans
# agents/ recursively, and a source there would load as an agent (CF-12.2
# finding). SOURCES_DIR is resolved to an absolute path first, so a
# relative --sources value is caught too, and only the part of the path at
# or below where SOURCES_DIR and AGENTS_DIR diverge counts, so an ancestor
# directory that happens to be named agents for reasons that have nothing
# to do with this generator (a clone checked out under one, say) does not
# trigger a false refusal.

# resolve_abs PATH -> an absolute path. PATH need not exist.
resolve_abs() {
    case "$1" in
        /*) printf '%s' "$1" ;;
        *) printf '%s' "$PWD/$1" ;;
    esac
}

# has_agents_segment PATH -> 0 if any '/'-separated component of PATH
# (no leading slash) is exactly "agents".
has_agents_segment() {
    local rest="$1" seg
    while [ -n "$rest" ]; do
        case "$rest" in
            */*) seg="${rest%%/*}"; rest="${rest#*/}" ;;
            *) seg="$rest"; rest="" ;;
        esac
        [ "$seg" = "agents" ] && return 0
    done
    return 1
}

# common_prefix A B -> the longest leading sequence of path components A
# and B share, with no trailing slash, empty if they share none.
common_prefix() {
    local rest_a="${1#/}" rest_b="${2#/}" prefix="" seg_a seg_b
    while [ -n "$rest_a" ] && [ -n "$rest_b" ]; do
        case "$rest_a" in */*) seg_a="${rest_a%%/*}" ;; *) seg_a="$rest_a" ;; esac
        case "$rest_b" in */*) seg_b="${rest_b%%/*}" ;; *) seg_b="$rest_b" ;; esac
        [ "$seg_a" = "$seg_b" ] || break
        prefix="$prefix/$seg_a"
        case "$rest_a" in */*) rest_a="${rest_a#*/}" ;; *) rest_a="" ;; esac
        case "$rest_b" in */*) rest_b="${rest_b#*/}" ;; *) rest_b="" ;; esac
    done
    printf '%s' "$prefix"
}

ABS_SOURCES_DIR=$(resolve_abs "$SOURCES_DIR")
ABS_AGENTS_DIR=$(resolve_abs "$AGENTS_DIR")

case "$ABS_SOURCES_DIR" in
    "$ABS_AGENTS_DIR"|"$ABS_AGENTS_DIR"/*)
        die "sources directory must not sit inside the agents directory: $SOURCES_DIR"
        ;;
esac

SHARED_PREFIX=$(common_prefix "$ABS_SOURCES_DIR" "$ABS_AGENTS_DIR")
if [ -n "$SHARED_PREFIX" ]; then
    SOURCES_SUFFIX="${ABS_SOURCES_DIR#"$SHARED_PREFIX"/}"
else
    SOURCES_SUFFIX="${ABS_SOURCES_DIR#/}"
fi
if has_agents_segment "$SOURCES_SUFFIX"; then
    die "sources directory must not sit inside an agents/ directory: $SOURCES_DIR"
fi

# ---------------------------------------------------------------------------
# Phase 1: validate and render every source, into a scratch directory. If any
# source is bad, or a target exists without the marker, die here - nothing in
# AGENTS_DIR is touched before every source has passed.
# ---------------------------------------------------------------------------

RENDER_TMP=$(mktemp -d "${TMPDIR:-/tmp}/gen-agent-pairs.XXXXXX") || die "could not create a scratch directory"
trap 'rm -rf "$RENDER_TMP"' EXIT

# render_member SOURCE ROLE MEMBER -> writes the rendered file to stdout.
# MEMBER is "opus" or "fable".
render_member() {
    local src="$1" role="$2" member="$3"
    local name model desc marker
    if [ "$member" = "opus" ]; then
        name="$role"
        model="opus"
        desc=$(sed -n '2p' "$src" | sed -n 's/^description\.opus: //p')
    else
        name="$role-fable"
        model="fable"
        desc=$(sed -n '3p' "$src" | sed -n 's/^description\.fable: //p')
    fi
    marker=$(marker_for "$role")
    NAME="$name" MODEL="$model" DESC="$desc" MARKER="$marker" awk '
        NR == 1 { print; print ENVIRON["MARKER"]; next }
        /^name: / { print "name: " ENVIRON["NAME"]; next }
        /^model: / { print "model: " ENVIRON["MODEL"]; next }
        /^description: / { print "description: " ENVIRON["DESC"]; next }
        { print }
    ' <(tail -n +4 "$src")
}

# validate_source SOURCE ROLE -> dies on any violation. Silent on success.
validate_source() {
    local src="$1" role="$2" line1 line2 line3 template first_line desc_opus desc_fable
    local name_line model_line desc_line curly_count

    line1=$(sed -n '1p' "$src")
    line2=$(sed -n '2p' "$src")
    line3=$(sed -n '3p' "$src")

    case "$line1" in
        "role: "*) ;;
        *) die "$role: header line 1 is not 'role: <value>'" ;;
    esac
    case "$line2" in
        "description.opus: "*) ;;
        *) die "$role: header line 2 is not 'description.opus: <value>'" ;;
    esac
    case "$line3" in
        "description.fable: "*) ;;
        *) die "$role: header line 3 is not 'description.fable: <value>'" ;;
    esac

    local header_role
    header_role=$(printf '%s' "$line1" | sed -n 's/^role: //p')
    [ "$header_role" = "$role" ] || die "$role: role: $header_role does not match the filename"

    desc_opus=$(printf '%s' "$line2" | sed -n 's/^description\.opus: //p')
    desc_fable=$(printf '%s' "$line3" | sed -n 's/^description\.fable: //p')

    for pair in "opus:$desc_opus" "fable:$desc_fable"; do
        local which="${pair%%:*}" desc="${pair#*:}"
        [ -n "$desc" ] || die "$role: description.$which is empty"
        case "$desc" in
            *": "*) die "$role: description.$which contains ': ', which would break the YAML plain scalar" ;;
        esac
        case "$desc" in
            *" #"*) die "$role: description.$which contains ' #', which would break the YAML plain scalar" ;;
        esac
    done

    template=$(tail -n +4 "$src")
    first_line=$(printf '%s\n' "$template" | sed -n '1p')
    [ "$first_line" = "---" ] || die "$role: the template after the header does not start with ---"

    name_line=$(printf '%s\n' "$template" | grep -c '^name: ')
    [ "$name_line" -eq 1 ] || die "$role: the template does not have exactly one name: line"
    printf '%s\n' "$template" | grep -qx 'name: {{name}}' || die "$role: name: is not the whole-value placeholder {{name}} (hard-coded or missing)"

    model_line=$(printf '%s\n' "$template" | grep -c '^model: ')
    [ "$model_line" -eq 1 ] || die "$role: the template does not have exactly one model: line"
    printf '%s\n' "$template" | grep -qx 'model: {{model}}' || die "$role: model: is not the whole-value placeholder {{model}} (hard-coded or missing)"

    desc_line=$(printf '%s\n' "$template" | grep -c '^description: ')
    [ "$desc_line" -eq 1 ] || die "$role: the template does not have exactly one description: line"
    printf '%s\n' "$template" | grep -qx 'description: {{description}}' || die "$role: description: is not the whole-value placeholder {{description}} (hard-coded or missing)"

    curly_count=$(printf '%s\n' "$template" | grep -oF '{{' | wc -l | tr -d ' ')
    [ "$curly_count" -eq 3 ] || die "$role: {{ appears $curly_count times; only the three placeholder values may carry it"
}

if [ ! -d "$SOURCES_DIR" ]; then
    SOURCE_FILES=""
else
    SOURCE_FILES=$(find "$SOURCES_DIR" -maxdepth 1 -type f -name '*.md' | sort)
fi

ROLES=""
for src in $SOURCE_FILES; do
    [ -n "$src" ] || continue
    role=$(basename "$src" .md)
    validate_source "$src" "$role"
    render_member "$src" "$role" "opus" > "$RENDER_TMP/$role.md" || die "$role: could not render the opus definition"
    render_member "$src" "$role" "fable" > "$RENDER_TMP/$role-fable.md" || die "$role: could not render the fable definition"
    ROLES="$ROLES $role"
done

# Guard against overwriting a hand-written agent, before anything is written.
# Only in generate mode: --check never writes, and reports a mismatch as
# STALE instead, which is informative on its own.
if [ "$MODE" = "generate" ]; then
    for role in $ROLES; do
        for target in "$AGENTS_DIR/$role.md" "$AGENTS_DIR/$role-fable.md"; do
            if [ -f "$target" ]; then
                existing_line2=$(sed -n '2p' "$target")
                expected=$(marker_for "$role")
                [ "$existing_line2" = "$expected" ] || die "target exists without the generated marker: $target (would overwrite a hand-written agent)"
            fi
        done
    done
fi

# ---------------------------------------------------------------------------
# No sources at all: report and exit, unless an orphan is still present.
# ---------------------------------------------------------------------------

if [ -z "$SOURCE_FILES" ]; then
    orphan_found=0
    if [ -d "$AGENTS_DIR" ]; then
        while IFS= read -r f; do
            [ -n "$f" ] || continue
            line2=$(sed -n '2p' "$f")
            orphan_role=$(role_of_marker_line "$line2")
            if [ -n "$orphan_role" ]; then
                orphan_found=1
                say "$SCRIPT_NAME: ORPHAN - $(basename "$f") carries the generated marker but $SOURCES_DIR/$orphan_role.md does not exist."
            fi
        done < <(find "$AGENTS_DIR" -maxdepth 1 -type f -name '*.md' | sort)
    fi
    if [ "$orphan_found" -eq 1 ]; then
        exit 1
    fi
    if [ "$MODE" = "check" ]; then
        say "$SCRIPT_NAME: no pair sources under $SOURCES_DIR; nothing to check."
    else
        say "$SCRIPT_NAME: no pair sources under $SOURCES_DIR; nothing to generate."
    fi
    exit 0
fi

# ---------------------------------------------------------------------------
# Phase 2: generate, or check.
# ---------------------------------------------------------------------------

if [ "$MODE" = "generate" ]; then
    mkdir -p "$AGENTS_DIR"
    for role in $ROLES; do
        for suffix in "" "-fable"; do
            target="$AGENTS_DIR/$role$suffix.md"
            rendered="$RENDER_TMP/$role$suffix.md"
            if [ -f "$target" ] && cmp -s "$rendered" "$target"; then
                say "$SCRIPT_NAME: unchanged - $role$suffix.md is already current."
            else
                cp "$rendered" "$target" || die "$role$suffix.md: could not write to $target"
                chmod 0644 "$target"
                say "$SCRIPT_NAME: wrote $role$suffix.md."
            fi
        done
    done
    exit 0
fi

# --check
CHECK_FAILED=0

for role in $ROLES; do
    opus_target="$AGENTS_DIR/$role.md"
    fable_target="$AGENTS_DIR/$role-fable.md"
    opus_rendered="$RENDER_TMP/$role.md"
    fable_rendered="$RENDER_TMP/$role-fable.md"

    for pair in "opus:$opus_target:$opus_rendered" "fable:$fable_target:$fable_rendered"; do
        which="${pair%%:*}"
        rest="${pair#*:}"
        target="${rest%%:*}"
        rendered="${rest#*:}"
        if [ ! -f "$target" ]; then
            say "$SCRIPT_NAME: STALE - $(basename "$target") does not exist."
            say "$SCRIPT_NAME: run scripts/$SCRIPT_NAME and commit the result."
            CHECK_FAILED=1
        elif ! cmp -s "$rendered" "$target"; then
            say "$SCRIPT_NAME: STALE - $(basename "$target") does not match its source."
            say ""
            diff -u "$target" "$rendered" | sed "s|$rendered|(regenerated)|" || true
            say ""
            say "$SCRIPT_NAME: run scripts/$SCRIPT_NAME and commit the result."
            CHECK_FAILED=1
        fi
    done

    if [ -f "$opus_target" ] && [ -f "$fable_target" ]; then
        strip_three() {
            grep -v -e '^name: ' -e '^model: ' -e '^description: ' "$1"
        }
        if ! diff -u <(strip_three "$opus_target") <(strip_three "$fable_target") > "$RENDER_TMP/$role.drift" 2>&1; then
            say "$SCRIPT_NAME: PAIR DRIFT - $role.md and $role-fable.md differ in more than name, model and description."
            say ""
            cat "$RENDER_TMP/$role.drift"
            say ""
            CHECK_FAILED=1
        fi
    fi
done

# Orphans: any marker-bearing file in AGENTS_DIR whose role has no source.
if [ -d "$AGENTS_DIR" ]; then
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        line2=$(sed -n '2p' "$f")
        orphan_role=$(role_of_marker_line "$line2")
        if [ -n "$orphan_role" ]; then
            case " $ROLES " in
                *" $orphan_role "*) ;;
                *)
                    say "$SCRIPT_NAME: ORPHAN - $(basename "$f") carries the generated marker but $SOURCES_DIR/$orphan_role.md does not exist."
                    CHECK_FAILED=1
                    ;;
            esac
        fi
    done < <(find "$AGENTS_DIR" -maxdepth 1 -type f -name '*.md' | sort)
fi

if [ "$CHECK_FAILED" -ne 0 ]; then
    exit 1
fi
say "$SCRIPT_NAME: every pair matches its source, and no pair drifts or is orphaned."
exit 0
