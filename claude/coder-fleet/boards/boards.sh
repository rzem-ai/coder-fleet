#!/usr/bin/env bash
# boards.sh - the one way the plugin's shims and commands reach the boards
# binary. It runs, in order:
#   1. bin/boards-<platform> beside this script, built by scripts/build.ts
#   2. ${CLAUDE_PLUGIN_DATA}/bin/boards-<version>, the release build that
#      hooks/boards-binary.sh fetches at session start
#   3. bun on src/main.ts, when Bun is on PATH and nothing is built
# and exits 127 with a one-line reason otherwise, which a shim for a
# rule-enforcing piece treats as a refusal.
#
# Run it, and it passes its arguments on. Source it, as the hook libraries'
# shims do, and it defines boards_run, which a hook can call a dozen times
# before it acts: each call then starts only the binary or Bun, with no bash
# of its own, and the platform comes from bash's OSTYPE and HOSTTYPE.
#
# CODER_FLEET_PLUGIN_ROOT is set, for the binary alone, to the plugin this
# script sits in, so the fleet's tools find its agents, rules and hook files.
#
# Hooks run with their cwd inside whatever repository the human opened, and
# Bun reads bunfig.toml (which can preload code) and .env from its cwd. So the
# source fallback runs bun from this package's own directory with .env loading
# off, and hands it the caller's directory in BOARDS_CALLER_CWD, which
# src/main.ts moves back into before anything else. The binary is compiled
# with both autoloads off (scripts/build.ts).
_boards_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "${OSTYPE:-}" in darwin*) _boards_os=darwin ;; linux*) _boards_os=linux ;; *) _boards_os="" ;; esac
case "${HOSTTYPE:-}" in arm64|aarch64) _boards_arch=arm64 ;; x86_64|amd64) _boards_arch=x64 ;; *) _boards_arch="" ;; esac
_boards_bin=""
if [ -n "$_boards_os" ] && [ -n "$_boards_arch" ] && [ -x "$_boards_here/bin/boards-$_boards_os-$_boards_arch" ]; then
  _boards_bin="$_boards_here/bin/boards-$_boards_os-$_boards_arch"
elif [ -n "${CLAUDE_PLUGIN_DATA:-}" ] && [ -r "$_boards_here/../.claude-plugin/plugin.json" ]; then
  # The release build hooks/boards-binary.sh fetched for this plugin version,
  # found with bash alone so a hook's call starts no other process.
  _boards_version=""
  while IFS= read -r _boards_line; do
    case "$_boards_line" in
      *'"version"'*) _boards_version="${_boards_line#*\"version\"*:*\"}"; _boards_version="${_boards_version%%\"*}"; break ;;
    esac
  done < "$_boards_here/../.claude-plugin/plugin.json"
  if [ -n "$_boards_version" ] && [ -x "$CLAUDE_PLUGIN_DATA/bin/boards-$_boards_version" ]; then
    _boards_bin="$CLAUDE_PLUGIN_DATA/bin/boards-$_boards_version"
  fi
fi

boards_run() {
  if [ -n "$_boards_bin" ]; then
    CODER_FLEET_PLUGIN_ROOT="${_boards_here%/*}" "$_boards_bin" "$@"
    return
  fi
  if command -v bun >/dev/null 2>&1; then
    (
      BOARDS_CALLER_CWD="$PWD"
      CODER_FLEET_PLUGIN_ROOT="${_boards_here%/*}"
      export BOARDS_CALLER_CWD CODER_FLEET_PLUGIN_ROOT
      cd "$_boards_here" || exit 127
      exec bun --no-env-file "$_boards_here/src/main.ts" "$@"
    )
    return
  fi
  printf 'boards: no binary at %s/bin/boards-%s-%s and no bun on PATH to run it from source\n' "$_boards_here" "${_boards_os:-unknown}" "${_boards_arch:-unknown}" >&2
  return 127
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  boards_run "$@"
  exit $?
fi
