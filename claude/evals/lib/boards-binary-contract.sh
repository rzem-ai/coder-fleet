#!/usr/bin/env bash
#
# boards-binary-contract.sh - hooks/boards-binary.sh, on SessionStart, fetches
# the boards binary for this plugin version and this machine's platform, and
# only for a platform a release builds: darwin-arm64, linux-x64 and
# linux-arm64. Intel macOS (darwin-x64) is not supported (CF-14).
#
# Every case runs the real hook with CODER_FLEET_BOARDS_PLATFORM set and
# CODER_FLEET_BOARDS_RELEASE_URL pointing at a file:// release under one
# mktemp root, so no case touches the network. The release carries a
# darwin-x64 asset with a good checksum too, so the darwin-x64 case passes
# only because the hook refuses the platform, never because a fetch failed.
#
#   P01-P03  each supported platform installs boards-<version>, executable,
#            byte for byte the released file
#   X01      darwin-x64 installs nothing, exits 0, logs one line naming the
#            platform, leaves its once-only marker and records no-release as
#            the reason this version has no binary
#   X02      a second darwin-x64 run logs nothing more
#   X03      darwin-x64 removes a binary an older version fetched there
set -u

LIB_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$LIB_DIR/../../coder-fleet" && pwd)"
HOOK="$PLUGIN_ROOT/hooks/boards-binary.sh"
version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_ROOT/.claude-plugin/plugin.json" | head -1)"

root="$(mktemp -d "${TMPDIR:-/tmp}/boards-binary.XXXXXX")"
trap 'rm -rf "$root"' EXIT

fails=0
passes=0
pass() { printf 'PASS %s\n' "$1"; passes=$((passes + 1)); }
fail() { printf 'FAIL %s: %s\n' "$1" "$2"; fails=$((fails + 1)); }

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# A release for this version: one gzipped stand-in binary per platform, the
# unsupported one included, and a SHA256SUMS that vouches for all of them.
rel="$root/release/v$version"
mkdir -p "$rel"
: > "$rel/boards-SHA256SUMS"
for p in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  printf '#!/bin/sh\necho boards %s\n' "$p" > "$root/boards-$p"
  gzip -9 -c "$root/boards-$p" > "$rel/boards-$p.gz"
  printf '%s  boards-%s.gz\n' "$(sha "$rel/boards-$p.gz")" "$p" >> "$rel/boards-SHA256SUMS"
done

# run_hook <case> <platform>: the hook in that case's plugin data and state dir.
run_hook() {
  local c="$1" p="$2"
  mkdir -p "$root/$c/data" "$root/$c/state"
  CLAUDE_PLUGIN_DATA="$root/$c/data" \
  CODER_FLEET_STATE_DIR="$root/$c/state" \
  CODER_FLEET_BOARDS_PLATFORM="$p" \
  CODER_FLEET_BOARDS_RELEASE_URL="file://$root/release" \
    bash "$HOOK" </dev/null >/dev/null 2>>"$root/$c/stderr"
}

n=0
for p in darwin-arm64 linux-x64 linux-arm64; do
  n=$((n + 1)); c="P0$n"
  run_hook "$c" "$p"; code=$?
  dest="$root/$c/data/bin/boards-$version"
  if [ "$code" -ne 0 ]; then fail "$c $p" "exit $code"
  elif [ ! -x "$dest" ]; then fail "$c $p" "no executable at $dest"
  elif ! cmp -s "$dest" "$root/boards-$p"; then fail "$c $p" "installed file differs from the release's"
  else pass "$c $p installs"; fi
done

# An older version's binary, as an Intel Mac would hold from before CF-14.
mkdir -p "$root/X01/data/bin"
printf 'old\n' > "$root/X01/data/bin/boards-0.0.1"
run_hook X01 darwin-x64; code=$?
log="$root/X01/state/log/hooks.log"
said() { grep -c 'no released boards binary for darwin-x64' "$log" 2>/dev/null; }
if [ "$code" -ne 0 ]; then fail X01 "exit $code"
elif [ -e "$root/X01/data/bin/boards-$version" ]; then fail X01 "a darwin-x64 binary was installed"
elif [ ! -e "$root/X01/data/bin/.boards-no-release-darwin-x64" ]; then fail X01 "no once-only marker"
elif [ "$(said)" != 1 ]; then fail X01 "the log does not say once that darwin-x64 has no release"
elif [ "$(cat "$root/X01/data/bin/.boards-unavailable-$version" 2>/dev/null)" != "no-release darwin-x64" ]; then fail X01 "the unavailable code is not no-release darwin-x64"
else pass "X01 darwin-x64 installs nothing and says so once"; fi

# X02: the same data dir again; the marker keeps it quiet.
run_hook X01 darwin-x64; code=$?
if [ "$code" -ne 0 ]; then fail X02 "exit $code"
elif [ "$(said)" != 1 ]; then fail X02 "the second run logged again"
elif [ -e "$root/X01/data/bin/boards-$version" ]; then fail X02 "a darwin-x64 binary was installed"
else pass "X02 a second darwin-x64 run stays quiet"; fi

if [ -e "$root/X01/data/bin/boards-0.0.1" ]; then fail X03 "the older version's binary was kept"
else pass "X03 darwin-x64 removes an older version's binary"; fi

printf 'boards-binary-contract: %d passed, %d failed\n' "$passes" "$fails"
[ "$fails" -eq 0 ]
