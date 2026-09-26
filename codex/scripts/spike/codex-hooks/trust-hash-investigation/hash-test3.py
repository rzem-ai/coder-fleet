#!/usr/bin/env python3
"""Third batch of trusted_hash candidates: raw hooks.json file bytes, and
handler objects with plausible default fields filled in. See README.md in
this directory for what this tries and what it does not, including the
families not tried at all. Usage: hash-test3.py <scratch-dir>
"""
import hashlib
import json
import re
import sys


def sha(s):
    if isinstance(s, str):
        s = s.encode()
    return hashlib.sha256(s).hexdigest()


def load_targets(config_path):
    with open(config_path) as f:
        content = f.read()
    targets = {}
    for m in re.finditer(
        r'\[hooks\.state\."[^"]*hooks\.json:([a-z_]+):(\d+):(\d+)"\]\s*\n\s*trusted_hash = "sha256:([0-9a-f]+)"',
        content,
    ):
        event, group_idx, hook_idx, digest = m.groups()
        targets[event] = digest
    return targets


DEFAULT_FIELD_SETS = [
    {"matcher": ""},
    {"matcher": "*"},
    {"timeout": 30},
    {"statusMessage": None},
    {"statusMessage": ""},
    {"async": False},
    {"additionalContextLimit": None},
    {"matcher": "", "timeout": 30, "statusMessage": None, "async": False},
    {"matcher": "*", "timeout": 30, "statusMessage": "", "async": False, "additionalContextLimit": None},
]


def main():
    if len(sys.argv) != 2:
        print("usage: hash-test3.py <scratch-dir>", file=sys.stderr)
        sys.exit(1)
    sp = sys.argv[1].rstrip("/")
    config_path = f"{sp}/codex-home/config.toml"
    hooks_json_path = f"{sp}/codex-home/hooks.json"

    targets = load_targets(config_path)

    with open(hooks_json_path, "rb") as f:
        raw_bytes = f.read()
    doc = json.loads(raw_bytes)

    raw_hash = sha(raw_bytes)
    print(f"raw hooks.json file bytes: {raw_hash}")
    print(f"  matches any target? {raw_hash in targets.values()}")
    print()

    events = {
        "pre_tool_use": ("PreToolUse", "pretooluse-log.sh"),
        "subagent_start": ("SubagentStart", "subagent-start-context.sh"),
        "subagent_stop": ("SubagentStop", "subagent-stop-block-once.sh"),
    }

    for key, (event_name, script_name) in events.items():
        if key not in targets:
            continue
        handler = doc["hooks"][event_name][0]["hooks"][0]
        target = targets[key]
        print(f"=== {key} (target {target}) ===")
        match_found = False
        for extra in DEFAULT_FIELD_SETS:
            candidate_obj = dict(handler)
            candidate_obj.update(extra)
            for form_name, dumped in [
                ("compact", json.dumps(candidate_obj, separators=(",", ":"))),
                ("sorted_compact", json.dumps(candidate_obj, sort_keys=True, separators=(",", ":"))),
            ]:
                h = sha(dumped)
                marker = "  <== MATCH" if h == target else ""
                if marker:
                    match_found = True
                print(f"  +{extra} [{form_name}]: {h}{marker}")
        if not match_found:
            print("  NO MATCH among default-field variants tried")
        print()

    print(
        "Families named but not tried here, because trying them exhaustively\n"
        "would mean re-implementing Codex's own Rust JSON serialisation rather\n"
        "than guessing at it in Python - see this directory's README.md."
    )


if __name__ == "__main__":
    main()
