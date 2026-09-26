#!/usr/bin/env python3
"""First batch of trusted_hash candidates. See README.md in this directory
for what this tries and what it does not. Usage: hash-test.py <scratch-dir>
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


def main():
    if len(sys.argv) != 2:
        print("usage: hash-test.py <scratch-dir>", file=sys.stderr)
        sys.exit(1)
    sp = sys.argv[1].rstrip("/")
    config_path = f"{sp}/codex-home/config.toml"
    hooks_json_path = f"{sp}/codex-home/hooks.json"

    targets = load_targets(config_path)
    if not targets:
        print(f"no [hooks.state...] trusted_hash entries found in {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(hooks_json_path) as f:
        doc = json.load(f)

    events = {
        "pre_tool_use": ("PreToolUse", "pretooluse-log.sh"),
        "subagent_start": ("SubagentStart", "subagent-start-context.sh"),
        "subagent_stop": ("SubagentStop", "subagent-stop-block-once.sh"),
    }

    for key, (event_name, script_name) in events.items():
        if key not in targets:
            continue
        target = targets[key]
        group = doc["hooks"][event_name][0]
        handler = group["hooks"][0]
        script_path = f"{sp}/codex-home/hooks/{script_name}"
        with open(script_path, "rb") as f:
            script_bytes = f.read()

        candidates = {}
        candidates["handler_compact"] = sha(json.dumps(handler, separators=(",", ":")))
        candidates["handler_sorted_compact"] = sha(json.dumps(handler, sort_keys=True, separators=(",", ":")))
        candidates["handler_default"] = sha(json.dumps(handler))
        candidates["handler_sorted_default"] = sha(json.dumps(handler, sort_keys=True))
        candidates["group_compact"] = sha(json.dumps(group, separators=(",", ":")))
        candidates["group_sorted_compact"] = sha(json.dumps(group, sort_keys=True, separators=(",", ":")))
        candidates["command_string"] = sha(handler["command"])
        candidates["script_bytes"] = sha(script_bytes)
        candidates["script_bytes_plus_command"] = sha(script_bytes + handler["command"].encode())
        candidates["whole_doc_compact"] = sha(json.dumps(doc, separators=(",", ":")))
        candidates["whole_doc_sorted_compact"] = sha(json.dumps(doc, sort_keys=True, separators=(",", ":")))
        candidates["event_array_compact"] = sha(json.dumps(doc["hooks"][event_name], separators=(",", ":")))
        candidates["key_plus_command"] = sha(f"{hooks_json_path}:{key}:0:0:{handler['command']}")
        candidates["command_plus_type"] = sha(f"command:{handler['command']}")
        candidates["type_command_string"] = sha(f'type=command,command={handler["command"]}')

        print(f"=== {key} (target {target}) ===")
        match_found = False
        for name, h in candidates.items():
            marker = "  <== MATCH" if h == target else ""
            if marker:
                match_found = True
            print(f"  {name}: {h}{marker}")
        if not match_found:
            print("  NO MATCH among candidates")
        print()


if __name__ == "__main__":
    main()
