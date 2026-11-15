#!/usr/bin/env bash
# boards.sh - the one way the plugin's shims and commands reach the boards
# binary. The boards package is not part of the plugin: in a checkout of the
# coder-fleet repo it sits beside the plugin at claude/boards, and an install
# has only this script. It runs, in order:
#   1. claude/boards/bin/boards-<platform>, in a checkout, built there by
#      `bun run build` in claude/boards (scripts/build.ts)
#   2. <data>/bin/boards-<version>, the release build that
#      hooks/boards-binary.sh fetches at session start, where <data> is
#      ${CLAUDE_PLUGIN_DATA}, or, run from the human's own terminal, the data
#      directory worked out from the install's own path
# and exits 127 with a one-line reason otherwise, which a shim for a
# rule-enforcing piece treats as a refusal. It never starts Bun and never
# reads the board's source, even in a checkout with Bun on PATH: a checkout
# with no build gets the line that says how to make one.
#
# Run it, and it passes its arguments on. Source it, as the hook libraries'
# shims do, and it defines boards_run, which a hook can call a dozen times
# before it acts: each call then starts only the binary, with no bash of its
# own, and the platform comes from bash's OSTYPE and HOSTTYPE.
#
# CODER_FLEET_PLUGIN_ROOT is set, for the binary alone, to the plugin this
# script sits in, so the fleet's tools find its agents, rules and hook files.
# A hook runs with its cwd inside whatever repository the human opened; the
# binary is compiled with bunfig.toml and .env loading off (scripts/build.ts),
# so neither is read from there.
_boards_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_boards_pkg=""
if [ -f "${_boards_root%/*}/boards/scripts/build.ts" ]; then
  _boards_pkg="${_boards_root%/*}/boards"
fi
case "${OSTYPE:-}" in darwin*) _boards_os=darwin ;; linux*) _boards_os=linux ;; *) _boards_os="" ;; esac
case "${HOSTTYPE:-}" in arm64|aarch64) _boards_arch=arm64 ;; x86_64|amd64) _boards_arch=x64 ;; *) _boards_arch="" ;; esac
_boards_bin=""
_boards_version=""
if [ -r "$_boards_root/.claude-plugin/plugin.json" ]; then
  # The plugin's version, read with bash alone so a hook's call starts no
  # other process.
  while IFS= read -r _boards_line; do
    case "$_boards_line" in
      *'"version"'*) _boards_version="${_boards_line#*\"version\"*:*\"}"; _boards_version="${_boards_version%%\"*}"; break ;;
    esac
  done < "$_boards_root/.claude-plugin/plugin.json"
fi
# The plugin's data directory: CLAUDE_PLUGIN_DATA when Claude Code set it,
# else, run from the human's own terminal, the one Claude Code gives an
# install at <config>/plugins/cache/<marketplace>/<plugin>/<version>, which is
# <config>/plugins/data/<plugin>-<marketplace>. Any other path gives none.
_boards_data="${CLAUDE_PLUGIN_DATA:-}"
if [ -z "$_boards_data" ]; then
  _boards_pdir="${_boards_root%/*}"   # <config>/plugins/cache/<marketplace>/<plugin>
  _boards_mdir="${_boards_pdir%/*}"   # <config>/plugins/cache/<marketplace>
  _boards_cdir="${_boards_mdir%/*}"   # <config>/plugins/cache
  case "$_boards_cdir" in
    */plugins/cache)
      if [ -n "${_boards_root##*/}" ] && [ -n "${_boards_pdir##*/}" ] && [ -n "${_boards_mdir##*/}" ]; then
        _boards_data="${_boards_cdir%/cache}/data/${_boards_pdir##*/}-${_boards_mdir##*/}"
      fi
      ;;
  esac
fi
if [ -n "$_boards_pkg" ] && [ -n "$_boards_os" ] && [ -n "$_boards_arch" ] && [ -x "$_boards_pkg/bin/boards-$_boards_os-$_boards_arch" ]; then
  _boards_bin="$_boards_pkg/bin/boards-$_boards_os-$_boards_arch"
elif [ -n "$_boards_data" ] && [ -n "$_boards_version" ] && [ -x "$_boards_data/bin/boards-$_boards_version" ]; then
  # The release build hooks/boards-binary.sh fetched for this plugin version.
  _boards_bin="$_boards_data/bin/boards-$_boards_version"
fi

boards_run() {
  if [ -n "$_boards_bin" ]; then
    CODER_FLEET_PLUGIN_ROOT="$_boards_root" "$_boards_bin" "$@"
    return
  fi
  if [ -n "$_boards_pkg" ]; then
    printf 'boards: no build at %s/bin/boards-%s-%s; run `bun run build` in %s to make one\n' "$_boards_pkg" "${_boards_os:-unknown}" "${_boards_arch:-unknown}" "$_boards_pkg" >&2
  elif [ -n "$_boards_data" ]; then
    printf 'boards: no release binary at %s/bin/boards-%s for this plugin\n' "$_boards_data" "${_boards_version:-unknown}" >&2
  else
    printf 'boards: no CLAUDE_PLUGIN_DATA, and %s is not a plugins/cache install, so there is nowhere to find the release binary\n' "$_boards_root" >&2
  fi
  return 127
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  boards_run "$@"
  exit $?
fi
