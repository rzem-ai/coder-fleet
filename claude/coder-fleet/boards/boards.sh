#!/usr/bin/env bash
# boards.sh - the one way the plugin's shims and commands reach the boards
# binary. It runs, in order:
#   1. bin/boards-<platform> beside this script, built by scripts/build.ts
#   2. bun on src/main.ts, when Bun is on PATH and nothing is built
# and exits 127 with a one-line reason otherwise, which a shim for a
# rule-enforcing piece treats as a refusal.
#
# CODER_FLEET_PLUGIN_ROOT is set to the plugin this script sits in, so the
# fleet's tools find its agents, rules and hook files from source and from the
# binary alike.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODER_FLEET_PLUGIN_ROOT="$(cd "$here/.." && pwd)"
export CODER_FLEET_PLUGIN_ROOT
case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) os="" ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) arch="" ;; esac
if [ -n "$os" ] && [ -n "$arch" ] && [ -x "$here/bin/boards-$os-$arch" ]; then
  exec "$here/bin/boards-$os-$arch" "$@"
fi
if command -v bun >/dev/null 2>&1; then
  exec bun "$here/src/main.ts" "$@"
fi
printf 'boards: no binary at %s/bin/boards-%s-%s and no bun on PATH to run it from source\n' "$here" "${os:-unknown}" "${arch:-unknown}" >&2
exit 127
