#!/usr/bin/env bash
#
# memory-symlink/run.sh - prove subagent memory works through a symlinked
# .claude/agent-memory (CF-207 spec criterion 0).
#
# Claude Code documents `memory: project` as `.claude/agent-memory/<agent>/`
# under the project, with no setting to move it. The new board relies on an
# undocumented behaviour instead: a session-start hook replaces the repo's
# `.claude/agent-memory` with a symlink to `~/.config/boards/<key>/memory`
# (`$XDG_CONFIG_HOME/boards/<key>/memory` when that is set), and agents keep
# `memory: project`. This script proves or disproves that behaviour.
#
# It builds a throwaway git repo with a linked worktree under a temp directory,
# points XDG_CONFIG_HOME at a temp directory, and in each checkout makes the
# symlink, seeds a fresh token in the board's memory index, and has a main
# session spawn a `memory: project` subagent through the Agent tool. The
# subagent quotes the token and writes a note. A checkout passes when:
#
#   - the symlink is still there afterwards and still resolves to the board
#   - the main session called the Agent tool and no other tool
#   - the harness loaded the memory index into the subagent's system prompt and
#     left its memory writable, as the subagent's transcript records
#   - the subagent used no tool that reads files, so the token came from that
#     index, and its reply carried it
#   - the subagent called Write, the note is in the board's memory directory,
#     and no real file in the checkout carries the note's token
#
# Claude Code 2.1.323 fails it: it refuses a memory folder that is a link, and
# says so in the subagent's prompt, which this script prints.
#
# It calls `claude -p` twice (one run per checkout) on the cheapest model, so
# it costs money and is in neither check-all.sh nor check-slow.sh. It never
# touches the real ~/.config or ~/.claude/agent-memory. Run it outside any
# sandbox that blocks the network or writes to ~/.claude.
#
# Usage:   claude/evals/memory-symlink/run.sh [--keep]
#   --keep   keep the temp directory on success too (it is always kept on failure)
#
# Environment:
#   PROOF_CLAUDE_BIN   claude binary (default: claude)
#   PROOF_MODEL        model for the session and the subagent (default: haiku)
#   PROOF_BUDGET_USD   --max-budget-usd per run (default: 0.50)
#
# Exit: 0 both checkouts pass, 1 a check failed, 2 the proof could not run.

set -uo pipefail

CLAUDE_BIN=${PROOF_CLAUDE_BIN:-claude}
MODEL=${PROOF_MODEL:-haiku}
BUDGET=${PROOF_BUDGET_USD:-0.50}
KEEP=0
case "${1:-}" in
    --keep) KEEP=1 ;;
    -h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    "") ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac

for tool in git python3 "$CLAUDE_BIN"; do
    command -v "$tool" >/dev/null 2>&1 || { printf 'needs %s on PATH\n' "$tool" >&2; exit 2; }
done

AGENT=memprobe
KEY=memory-proof
TMP=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/cf-memory-proof.XXXXXX")" && pwd -P) || exit 2
REPO="$TMP/repo"
WT="$TMP/repo-wt"
export XDG_CONFIG_HOME="$TMP/xdg"
BOARD_MEM="$XDG_CONFIG_HOME/boards/$KEY/memory"
OUT="$TMP/out"
mkdir -p "$BOARD_MEM/$AGENT" "$OUT" "$REPO"

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
g() { git -C "$1" -c user.name=proof -c user.email=proof@example.invalid -c commit.gpgsign=false "${@:2}"; }

# The throwaway repo: the probe agent and the allow rules /init would write
# (spec criterion 51) are committed, so the worktree carries them too.
g "$REPO" init -q -b main || exit 2
mkdir -p "$REPO/.claude/agents"
cat >"$REPO/.claude/agents/$AGENT.md" <<EOF
---
name: $AGENT
description: Memory probe for the CF-207 symlink proof. Use only when asked to run $AGENT.
model: $MODEL
memory: project
tools: Write
---

You are a memory probe. Do exactly what the prompt asks and nothing else. Never read, list or search files: everything you need is in this prompt and in your memory index above.
EOF
cat >"$REPO/.claude/settings.json" <<EOF
{
  "permissions": {
    "allow": [
      "Write(/$XDG_CONFIG_HOME/boards/**)",
      "Edit(/$XDG_CONFIG_HOME/boards/**)"
    ]
  }
}
EOF
printf 'memory symlink proof\n' >"$REPO/README.md"
g "$REPO" add -A || exit 2
g "$REPO" commit -qm "proof fixture" || exit 2
g "$REPO" worktree add -q "$WT" -b wt || exit 2

# Checks one run's stream-json transcript. Prints one ok/FAIL line per check.
check_stream() { # $1 stream file, $2 seed token, $3 label
    python3 - "$1" "$2" "$3" <<'PY'
import glob, json, os, re, sys
path, seed, label = sys.argv[1], sys.argv[2], sys.argv[3]
READERS = {"Read", "Glob", "Grep", "Bash", "LS", "NotebookRead"}
main_tools, sub_tools, agent_results = [], [], []
agent_ids = set()
session = None
for line in open(path):
    line = line.strip()
    if not line.startswith("{"):
        continue
    ev = json.loads(line)
    session = session or ev.get("session_id")
    parent = ev.get("parent_tool_use_id")
    content = (ev.get("message") or {}).get("content")
    if not isinstance(content, list):
        continue
    for b in content:
        if b.get("type") == "tool_use":
            (sub_tools if parent else main_tools).append((b.get("name"), b.get("input")))
            if not parent and b.get("name") in ("Agent", "Task"):
                agent_ids.add(b.get("id"))
        elif b.get("type") == "tool_result" and not parent and b.get("tool_use_id") in agent_ids:
            c = b.get("content")
            text = c if isinstance(c, str) else "".join(x.get("text", "") for x in c or [] if isinstance(x, dict))
            agent_results.append(text)
def say(ok, msg):
    print(("ok    " if ok else "FAIL  ") + label + ": " + msg)
names = [n for n, _ in main_tools]
say(bool(agent_ids), "the main session spawned the subagent through the Agent tool")
say(all(n in ("Agent", "Task") for n in names), "the main session used no tool but Agent (used: %s)" % (", ".join(names) or "none"))
say(any(seed in t for t in agent_results), "the subagent's reply quotes the seeded token %s" % seed)
for t in agent_results:
    print("info  %s: subagent reply: %s" % (label, " | ".join(t.strip().splitlines())))

# The subagent's own transcript: its tool calls, and the system prompt the
# harness gave it. Claude Code says there when it refused to load the memory
# index, which names the cause better than the subagent's reply can.
home = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
ids = set(re.findall(r"agentId: ([0-9a-f]+)", "\n".join(agent_results)))
prompt, transcript = None, None
for f in glob.glob(os.path.join(home, "projects", "*", session or "-", "subagents", "agent-*.jsonl")):
    if ids and not any(i in f for i in ids):
        continue
    transcript = f
    for line in open(f):
        ev = json.loads(line)
        snap = ev.get("attachment") or {}
        if snap.get("type") == "prompt_snapshot" and prompt is None:
            prompt = snap.get("systemPrompt") or []
        content = (ev.get("message") or {}).get("content") if ev.get("type") == "assistant" else None
        for b in content if isinstance(content, list) else []:
            if b.get("type") == "tool_use":
                sub_tools.append((b.get("name"), b.get("input")))
if transcript is None:
    say(False, "the subagent's transcript was found under %s" % home)
    sys.exit(0)
print("info  %s: subagent transcript %s" % (label, transcript))
sub_names = [n for n, _ in sub_tools]
print("info  %s: subagent tool calls: %s" % (label, ", ".join("%s %s" % (n, (i or {}).get("file_path", "")) for n, i in sub_tools) or "none"))
say("Write" in sub_names, "the subagent called Write")
say(not any(n in READERS for n in sub_names), "the subagent used no tool that reads files")
text = "\n".join(prompt or [])
for m in re.finditer(r"memory system at `[^`]*`[^\n]*", text):
    print("info  %s: harness says: %s" % (label, m.group(0)))
for part in prompt or []:
    if "## MEMORY.md" in part:
        print("info  %s: harness says under ## MEMORY.md: %s" % (label, part.split("## MEMORY.md", 1)[1].strip().replace("\n", " | ")))
say(seed in text, "the harness loaded the memory index into the subagent's prompt")
say("read-only this session" not in text, "the harness left the subagent's memory writable")
PY
}

prove() { # $1 label, $2 checkout
    local label=$1 dir=$2 seed note stream link rc
    seed="SEED-$label-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')"
    note="NOTE-$label-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')"
    stream="$OUT/$label.jsonl"
    printf '\n== %s: %s\n' "$label" "$dir"

    # What the session-start hook will do: replace .claude/agent-memory with
    # a symlink to the board's memory directory.
    rm -rf "$dir/.claude/agent-memory"
    ln -s "$BOARD_MEM" "$dir/.claude/agent-memory"
    # Seed the memory index with this run's token, in the board's directory.
    printf -- '- [Proof seed](seed.md) - the token for this run is %s\n' "$seed" >"$BOARD_MEM/$AGENT/MEMORY.md"
    printf 'The token for this run is %s\n' "$seed" >"$BOARD_MEM/$AGENT/seed.md"

    local sub="Step 1: your memory index names a token starting SEED-. Reply first with that whole token, copied exactly from your memory index, without using any tool. Step 2: use the Write tool once to create the file proof-$label.md in your memory directory, containing exactly the text $note. Do not edit MEMORY.md. Finish with the token, the absolute file_path you passed to Write, and the memory directory path your instructions name."
    local prompt="Use the Agent tool once, with subagent_type $AGENT and run_in_background false, so it runs in the foreground and you wait for its reply, passing it exactly this prompt: \"$sub\". Use no other tool. Then reply with the subagent's reply verbatim."

    (cd "$dir" && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_PROJECT_DIR -u CLAUDE_CODE_DISABLE_AUTO_MEMORY \
        "$CLAUDE_BIN" -p "$prompt" --model "$MODEL" --setting-sources project --strict-mcp-config \
        --permission-mode acceptEdits --output-format stream-json --verbose --max-budget-usd "$BUDGET" \
        >"$stream" 2>"$OUT/$label.stderr")
    rc=$?
    printf 'info  claude -p exit %s, transcript %s\n' "$rc" "$stream"
    [ "$rc" -eq 0 ] || fail "$label: claude -p exited $rc (stderr: $(head -c 400 "$OUT/$label.stderr"))"

    if [ -L "$dir/.claude/agent-memory" ]; then
        link=$(cd "$dir/.claude/agent-memory" && pwd -P)
        if [ "$link" = "$BOARD_MEM" ]; then pass "$label: .claude/agent-memory is still a symlink to $BOARD_MEM"
        else fail "$label: .claude/agent-memory resolves to $link, not $BOARD_MEM"; fi
    else
        fail "$label: .claude/agent-memory is no longer a symlink"
    fi

    local out
    out=$(check_stream "$stream" "$seed" "$label")
    printf '%s\n' "$out"
    grep -q '^FAIL' <<<"$out" && FAILED=1

    if [ -f "$BOARD_MEM/$AGENT/proof-$label.md" ] && grep -qF "$note" "$BOARD_MEM/$AGENT/proof-$label.md"; then
        pass "$label: the written note is in the board's memory directory: $BOARD_MEM/$AGENT/proof-$label.md"
    else
        fail "$label: no note carrying $note at $BOARD_MEM/$AGENT/proof-$label.md"
    fi
    # find does not follow symlinks, so this lists only real files in the checkout.
    local stray
    stray=$(find "$dir" -name .git -prune -o -type f -print0 | xargs -0 grep -lF "$note" 2>/dev/null)
    if [ -z "$stray" ]; then pass "$label: no real file in the checkout carries $note"
    else fail "$label: the note landed in the checkout: $stray"; fi
    printf 'info  %s: real files under .claude in the checkout: %s\n' "$label" \
        "$(cd "$dir" && find .claude -type f | tr '\n' ' ')"
}

prove main "$REPO"
prove worktree "$WT"

printf '\n== the board memory directory after both runs\n'
(cd "$BOARD_MEM" && find . -type f | sort | while read -r f; do printf '%s: %s\n' "$f" "$(head -c 200 "$f" | tr '\n' ' ')"; done)

if [ "$FAILED" -ne 0 ]; then
    printf '\nmemory-symlink: FAILED. Kept %s for inspection.\n' "$TMP"
    exit 1
fi
if [ "$KEEP" -eq 1 ]; then
    printf '\nmemory-symlink: both checkouts pass. Kept %s.\n' "$TMP"
else
    rm -rf "$TMP"
    printf '\nmemory-symlink: both checkouts pass.\n'
fi
exit 0
