#!/usr/bin/env python3
"""Second batch of trusted_hash candidates. See README.md in this directory
for what this tries and what it does not. Usage: hash-test2.py <scratch-dir>
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
        print("usage: hash-test2.py <scratch-dir>", file=sys.stderr)
        sys.exit(1)
    sp = sys.argv[1].rstrip("/")
    config_path = f"{sp}/codex-home/config.toml"
    hooks_json_path = f"{sp}/codex-home/hooks.json"

    targets = load_targets(config_path)
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
        handler = doc["hooks"][event_name][0]["hooks"][0]
        cmd = handler["command"]
        script_path = f"{sp}/codex-home/hooks/{script_name}"
        with open(script_path, "rb") as f:
            script_bytes = f.read()
        target = targets[key]

        candidates = {}
        candidates["event_name_lower_cmd"] = sha(f"{key}:{cmd}")
        candidates["cmd_only_bytes"] = sha(cmd)
        candidates["cmd_plus_type_command_json"] = sha(json.dumps({"command": cmd, "type": "command"}))
        candidates["path_event_idx_cmd"] = sha(f"{hooks_json_path}:{key}:0:0:{cmd}")
        candidates["script_sha256_of_hex"] = sha(sha(script_bytes))
        candidates["hooks_json_path_bytes"] = sha(hooks_json_path)
        candidates["script_bytes_utf8_plus_newline"] = sha(script_bytes + b"\n")

        print(f"=== {key} (target {target}) ===")
        match_found = False
        for name, h in candidates.items():
            marker = "  <== MATCH" if h == target else ""
            if marker:
                match_found = True
            print(f"  {name}: {h}{marker}")
        if not match_found:
            print("  NO MATCH")
        print()


if __name__ == "__main__":
    main()
