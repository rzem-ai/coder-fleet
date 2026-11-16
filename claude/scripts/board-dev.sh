#!/usr/bin/env bash
#
# board-dev.sh - start the board's web UI on a seeded dev board, from anywhere.
#
# Runs claude/boards/scripts/web-dev.ts: a throwaway sandbox board, DEV, seeded
# across all eight columns in a private directory under ~/.cache
# ($XDG_CACHE_HOME), served from source, with Vite and hot reload in front of
# it. It never touches the real boards under ~/.config/boards. A sandbox that
# exists is reused, edits and all.
#
# Installs the boards package's and the web UI's dependencies from their
# lockfiles first, when either has none.
#
# Usage:
#   claude/scripts/board-dev.sh                     reuse the sandbox, or seed it
#   claude/scripts/board-dev.sh --reseed            throw the sandbox away and seed it fresh
#   claude/scripts/board-dev.sh --port <n>          Vite's port (default 5173)
#   claude/scripts/board-dev.sh --api-port <n>      the sandbox server's port (default 4577)
#   claude/scripts/board-dev.sh --help
#
# Ctrl-C stops both the server and Vite.

set -euo pipefail

case "${1:-}" in
	-h | --help)
		sed -n '3,21p' "$0" | sed 's/^# \{0,1\}//'
		exit 0
		;;
esac

for arg in "$@"; do
	case "$arg" in
		--reseed | --port | --api-port | [0-9]*) ;;
		*)
			echo "board-dev.sh: unknown argument '$arg' (see --help)" >&2
			exit 2
			;;
	esac
done

command -v bun >/dev/null || {
	echo "board-dev.sh: bun is not on PATH" >&2
	exit 1
}

boards="$(cd "$(dirname "${BASH_SOURCE[0]}")/../boards" && pwd)"

for dir in "$boards" "$boards/web"; do
	if [ ! -d "$dir/node_modules" ]; then
		echo "Installing dependencies in $dir" >&2
		(cd "$dir" && bun install --frozen-lockfile)
	fi
done

cd "$boards/web"
exec bun ../scripts/web-dev.ts "$@"
