#!/usr/bin/env bash
#
# fleet-agents.sh - list, enable and disable fleet agents for a project by
# editing `disabledAgents` in its .claude/coder-fleet.json.
#
# Run by /coder-fleet:agents (CF-111.1), from anywhere in the repository, a
# linked worktree included; the file it edits is the one in the main checkout
# (fleet_config_root), the same file the spawn hook enforce-disabled-agents.sh
# and review-round read. Reading and validating the file is
# hooks/lib/fleet-config.sh, shared with that hook, so this script and the hook
# never disagree about what the file says. What this script adds is the edit:
#
#   - The roster is the plugin's agents/ directory, one agent per body, with a
#     -fable editor variant folded into its base name - fleet_roster in the
#     shared helper, the same source roster-contract.sh checks.
#   - A name is accepted bare or coder-fleet:-prefixed, in any case, and stored
#     bare. Another plugin's prefix is not a fleet agent.
#   - lead, coder and reviewer cannot be disabled, and a name not on the roster
#     cannot be disabled either. Enabling a listed name always works, so an
#     agent that has since left the roster can still be taken off the list.
#   - An invalid or unreadable file is never edited: the script says why and
#     leaves it for the human to fix.
#   - The write is a temporary file in .claude/ moved over the old one, keeps
#     every other top-level key, and leaves the list sorted, deduplicated and
#     bare. Enabling the last agent leaves an empty list. A refusal or a no-op
#     does not touch the file at all.
#   - Nothing is committed. The hook reads the file on every spawn, so a change
#     applies from the next spawn with no restart.
#
# Exit 0 when it listed, changed or found nothing to change; 1 when it refused
# (a core agent, a name not on the roster, an invalid file, a failed write) or
# when list found the file invalid; 2 on a usage error.
#
# Written for bash 3.2. Needs jq to write the file, and python3 for the shared
# helper to read it; without python3 the file reads as invalid and is not edited.
#
# CF-145 adds `phase`, which shows the build or harden phase review-round
# works in, and `phase build` / `phase harden`, which set `phase` in the same
# file with the same write rules: other keys kept, an invalid file never
# written, a no-op when the file already says it.
#
# Usage:  fleet-agents.sh [list | disable <agent> | enable <agent> | phase [build | harden]]

set -uo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=../hooks/lib/fleet-config.sh
. "$PLUGIN_ROOT/hooks/lib/fleet-config.sh"

usage() {
    printf 'usage: fleet-agents.sh [list | disable <agent> | enable <agent> | phase [build | harden]]\n' >&2
    exit 2
}

verb="${1:-list}"
case "$verb" in
    list) [ "$#" -le 1 ] || usage ;;
    disable|enable) [ "$#" -eq 2 ] && [ -n "$2" ] || usage ;;
    phase)
        case "$#" in
            1) ;;
            2) case "$2" in build|harden) ;; *) usage ;; esac ;;
            *) usage ;;
        esac
        ;;
    *) usage ;;
esac

ROSTER="$(fleet_roster "$PLUGIN_ROOT")"
if [ -z "$ROSTER" ]; then
    printf 'No agents found under %s/agents, so the roster is unknown and nothing was changed.\n' "$PLUGIN_ROOT"
    exit 1
fi

in_list() {
    # $1 name, $2 space-separated list
    case " $2 " in *" $1 "*) return 0 ;; esac
    return 1
}
is_core() { in_list "$1" "$FLEET_CORE_AGENTS"; }
on_roster() { in_list "$1" "$ROSTER"; }

root="$(fleet_config_root "$PWD")" || root=""
if [ -z "$root" ]; then
    printf 'No main checkout could be found through git from %s, so there is no %s to read or edit and nothing was changed. Run this from inside the project'"'"'s repository.\n' "$PWD" ".claude/coder-fleet.json"
    exit 1
fi
fleet_config_read "$root"
TAIL="This applies from the next spawn, with no restart. The file is written but not committed; commit it to keep the setting for the project."

refuse_invalid() {
    printf '%s is %s: %s. This command never overwrites it, so nothing was changed. Fix the file by hand, then run the command again.\n' \
        "$FLEET_CONFIG_PATH" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_REASON"
    exit 1
}

if [ "$verb" = list ]; then
    case "$FLEET_CONFIG_STATE" in
        absent) printf 'No %s in %s, so every fleet agent is enabled.\n' "$FLEET_CONFIG_REL" "$root" ;;
        ok) printf 'Fleet agents for %s, from %s:\n' "$root" "$FLEET_CONFIG_REL" ;;
        *) printf '%s is %s: %s. Nothing in it is honoured, so every fleet agent is enabled until it is fixed.\n' \
               "$FLEET_CONFIG_PATH" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_REASON" ;;
    esac
    for a in $ROSTER; do
        if is_core "$a"; then
            printf '  %-15s enabled (core, cannot be disabled)\n' "$a"
        elif fleet_agent_disabled "$a"; then
            printf '  %-15s disabled\n' "$a"
        else
            printf '  %-15s enabled\n' "$a"
        fi
    done
    strays=""
    for d in $FLEET_CONFIG_DISABLED; do
        on_roster "$d" || strays="$strays $d"
    done
    [ -z "$strays" ] || printf 'Listed under disabledAgents but not a fleet agent:%s. /coder-fleet:agents enable <name> takes one off the list.\n' "$strays"
    printf 'Change one with /coder-fleet:agents disable <agent> or /coder-fleet:agents enable <agent>.\n'
    case "$FLEET_CONFIG_STATE" in absent|ok) exit 0 ;; *) exit 1 ;; esac
fi

# CF-145: `phase` shows the phase review-round works in, `phase build` or
# `phase harden` sets it. The phase is read by the shared helper, judged apart
# from disabledAgents, so a file whose list is invalid can still show a phase;
# it is never written, as no invalid file is.
if [ "$verb" = phase ] && [ "$#" -eq 1 ]; then
    rc=0
    case "$FLEET_CONFIG_PHASE_STATE" in
        ok) printf 'The phase is %s, set in %s.\n' "$FLEET_CONFIG_PHASE" "$FLEET_CONFIG_PATH" ;;
        invalid)
            printf '%s sets a phase this fleet does not know: %s. review-round reads it as build until it is fixed.\n' "$FLEET_CONFIG_PATH" "$FLEET_CONFIG_PHASE_REASON"
            rc=1
            ;;
        unread)
            printf 'The phase is harden: %s. A failed read never removes a refuter or a fix round.\n' "$FLEET_CONFIG_PHASE_REASON"
            rc=1
            ;;
        *)
            if [ "$FLEET_CONFIG_STATE" = absent ]; then
                printf 'No %s in %s, so the phase is build, the default.\n' "$FLEET_CONFIG_REL" "$root"
            else
                printf 'The phase is build, the default: %s sets none.\n' "$FLEET_CONFIG_PATH"
            fi
            ;;
    esac
    case "$FLEET_CONFIG_STATE" in
        absent|ok) ;;
        *)
            printf '%s is %s: %s. Until it is fixed nothing in its disabledAgents is honoured, and this command will not write it.\n' "$FLEET_CONFIG_PATH" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_REASON"
            rc=1
            ;;
    esac
    if [ "$FLEET_CONFIG_PHASE" = harden ]; then
        printf 'Harden: review-round runs the full loop of fix rounds, Low fixes and refutation.\n'
    else
        printf 'Build: review-round runs one round, commissions no fix round, reports Low findings without fixing them, spawns a refuter only on authentication or credential paths, and reports proposals without filing them.\n'
    fi
    printf 'Change it with /coder-fleet:agents phase build or /coder-fleet:agents phase harden.\n'
    exit "$rc"
fi

write_phase() {
    # $1 build or harden. Sets phase, keeping every other key, through a temp
    # file and a mv, as write_list does.
    local dir tmp
    dir="$(dirname "$FLEET_CONFIG_PATH")"
    mkdir -p "$dir" || return 1
    tmp="$(mktemp "$dir/.coder-fleet.json.XXXXXX")" || return 1
    if [ "$FLEET_CONFIG_STATE" = absent ]; then
        chmod 644 "$tmp" &&
            jq -n --arg p "$1" '{phase: $p}' > "$tmp"
    else
        cp -p "$FLEET_CONFIG_PATH" "$tmp" &&
            jq --arg p "$1" '.phase = $p' "$FLEET_CONFIG_PATH" > "$tmp"
    fi
    if [ "$?" -ne 0 ] || ! jq -e 'type == "object"' "$tmp" >/dev/null 2>&1 || ! mv -f "$tmp" "$FLEET_CONFIG_PATH"; then
        rm -f "$tmp"
        return 1
    fi
    return 0
}

if [ "$verb" = phase ]; then
    want="$2"
    case "$FLEET_CONFIG_STATE" in absent|ok) ;; *) refuse_invalid ;; esac
    if [ "$FLEET_CONFIG_PHASE_STATE" = ok ] && [ "$FLEET_CONFIG_PHASE" = "$want" ]; then
        printf 'The phase is already %s in %s. Nothing was changed.\n' "$want" "$FLEET_CONFIG_PATH"
        exit 0
    fi
    write_phase "$want" || { printf 'Could not write %s, so it was left as it was.\n' "$FLEET_CONFIG_PATH"; exit 1; }
    printf 'The phase is now %s: %s sets it. review-round reads it at the start of each run, so it applies from the next run, with no restart. The file is written but not committed; commit it to keep the setting for the project.\n' "$want" "$FLEET_CONFIG_PATH"
    exit 0
fi

raw="$2"
name="$(fleet_config_normalise "$raw")"
# The agent-name shape fleet-config.sh enforces. Normalising drops only this
# plugin's prefix, so another plugin's "other:refuter" keeps its colon and fails
# here.
shape_ok=1
case "$name" in ''|[!a-z0-9]*|*[!a-z0-9_-]*) shape_ok=0 ;; esac
not_fleet() {
    printf '%s is not a fleet agent, so nothing was changed. The fleet agents are:%s\n' "$raw" " $ROSTER"
    exit 1
}
[ "$shape_ok" -eq 1 ] || not_fleet

write_list() {
    # $1 the new space-separated list. Writes it as disabledAgents, sorted and
    # deduplicated, keeping every other key, through a temp file and a mv.
    local list json dir tmp
    list="$(printf '%s\n' $1 | sed '/^$/d' | sort -u | tr '\n' ' ')"
    json="$(jq -n -c --arg s "$list" '$s | split(" ") | map(select(length > 0))')" || return 1
    dir="$(dirname "$FLEET_CONFIG_PATH")"
    mkdir -p "$dir" || return 1
    tmp="$(mktemp "$dir/.coder-fleet.json.XXXXXX")" || return 1
    if [ "$FLEET_CONFIG_STATE" = absent ]; then
        chmod 644 "$tmp" &&
            jq -n --argjson l "$json" '{disabledAgents: $l}' > "$tmp"
    else
        cp -p "$FLEET_CONFIG_PATH" "$tmp" &&
            jq --argjson l "$json" '.disabledAgents = $l' "$FLEET_CONFIG_PATH" > "$tmp"
    fi
    if [ "$?" -ne 0 ] || ! jq -e 'type == "object"' "$tmp" >/dev/null 2>&1 || ! mv -f "$tmp" "$FLEET_CONFIG_PATH"; then
        rm -f "$tmp"
        return 1
    fi
    return 0
}

write_failed() {
    printf 'Could not write %s, so it was left as it was.\n' "$FLEET_CONFIG_PATH"
    exit 1
}

if [ "$verb" = disable ]; then
    if is_core "$name"; then
        printf '%s cannot be disabled: lead, coder and reviewer are the core of the fleet. Nothing was changed.\n' "$name"
        exit 1
    fi
    on_roster "$name" || not_fleet
    case "$FLEET_CONFIG_STATE" in absent|ok) ;; *) refuse_invalid ;; esac
    if in_list "$name" "$FLEET_CONFIG_DISABLED"; then
        printf '%s is already disabled in %s. Nothing was changed.\n' "$name" "$FLEET_CONFIG_PATH"
        exit 0
    fi
    write_list "$FLEET_CONFIG_DISABLED $name" || write_failed
    printf '%s is now disabled: %s lists it under disabledAgents. %s\n' "$name" "$FLEET_CONFIG_PATH" "$TAIL"
    exit 0
fi

# enable
if is_core "$name"; then
    printf '%s is a core agent and is always enabled. Nothing was changed.\n' "$name"
    exit 0
fi
case "$FLEET_CONFIG_STATE" in absent|ok) ;; *) refuse_invalid ;; esac
if ! in_list "$name" "$FLEET_CONFIG_DISABLED"; then
    on_roster "$name" || not_fleet
    printf '%s is not disabled, so there was nothing to enable. Nothing was changed.\n' "$name"
    exit 0
fi
rest=""
for d in $FLEET_CONFIG_DISABLED; do
    [ "$d" = "$name" ] || rest="$rest $d"
done
write_list "$rest" || write_failed
printf '%s is enabled again: it is no longer listed under disabledAgents in %s. %s\n' "$name" "$FLEET_CONFIG_PATH" "$TAIL"
exit 0
