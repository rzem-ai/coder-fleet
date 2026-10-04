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
#     -fable editor variant folded into its base name - the same source
#     roster-contract.sh checks.
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
# Written for bash 3.2. Needs jq.
#
# Usage:  fleet-agents.sh [list | disable <agent> | enable <agent>]

set -uo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=../hooks/lib/fleet-config.sh
. "$PLUGIN_ROOT/hooks/lib/fleet-config.sh"

usage() {
    printf 'usage: fleet-agents.sh [list | disable <agent> | enable <agent>]\n' >&2
    exit 2
}

verb="${1:-list}"
case "$verb" in
    list) [ "$#" -le 1 ] || usage ;;
    disable|enable) [ "$#" -eq 2 ] && [ -n "$2" ] || usage ;;
    *) usage ;;
esac

ROSTER=""
for body in "$PLUGIN_ROOT"/agents/*.md; do
    [ -f "$body" ] || continue
    base="$(basename "$body" .md)"
    ROSTER="$ROSTER
${base%-fable}"
done
ROSTER="$(printf '%s\n' "$ROSTER" | sed '/^$/d' | sort -u | tr '\n' ' ')"
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

root="$(fleet_config_root "$PWD")"
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
