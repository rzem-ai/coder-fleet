#!/usr/bin/env bash
# SessionStart: put the board binary for this plugin version on the machine.
#
# The release workflow (.github/workflows/board-binaries.yml) builds the binary
# for each platform on every vX.Y.Z tag and attaches it to that release,
# gzipped, beside a SHA256SUMS file. This fetches the one for this machine, for
# the version in plugin.json, into the plugin's own data directory,
# ${CLAUDE_PLUGIN_DATA}/bin/board-<version>[.exe], where board/board.sh looks
# first. A machine therefore needs no install script and no bun to have a board.
#
# Once per version, not once per session: when the file is already there this
# is one test and an exit. The data directory survives plugin updates, so the
# binary for a new version is fetched on the first session after the update,
# and older ones are removed once it is in place.
#
# The checksum is read from the same release as the binary. It proves the file
# arrived whole, not who built it: the trust here is the repository's, the same
# trust the plugin's own code is installed on, over HTTPS from github.com.
#
# Soft by design, like every board hook: nothing here can stop a session. A
# platform with no build (macOS on Intel), no curl, a release not published
# yet, a checksum that does not match - each is one log line and an exit 0, and
# board.sh falls back to a binary built in the plugin or to bun.
#
# Knobs, all environment variables:
#   CODER_FLEET_BOARD_DOWNLOAD=off   never fetch; build with board/build.sh instead
#   CODER_FLEET_BOARD_RELEASE_URL    where releases live (the contract suite
#                                    points it at a file:// tree)
#   CODER_FLEET_BOARD_PLATFORM       override the detected platform, for tests
#
# Written for bash 3.2, like the rest of the hooks.
set -u

HOOK=BoardBinary
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/board.sh
. "$here/lib/board.sh"

[ "${CODER_FLEET_BOARD_DOWNLOAD:-on}" = off ] && exit 0
data="${CLAUDE_PLUGIN_DATA:-}"
# Outside Claude Code there is no data directory to put it in.
[ -n "$data" ] || exit 0

version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$here/../.claude-plugin/plugin.json" | head -1)"
if [ -z "$version" ]; then
  board_log "$HOOK" "could not read the plugin version from plugin.json; no board binary fetched"
  exit 0
fi

# The release's asset name for this machine, or empty when there is none.
board_platform() {
  local os arch
  if [ -n "${CODER_FLEET_BOARD_PLATFORM:-}" ]; then printf '%s\n' "$CODER_FLEET_BOARD_PLATFORM"; return 0; fi
  case "$(uname -s 2>/dev/null)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    MINGW*|MSYS*|CYGWIN*) os=windows ;;
    *) os=unknown ;;
  esac
  case "$(uname -m 2>/dev/null)" in
    x86_64|amd64) arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) arch=unknown ;;
  esac
  printf '%s-%s\n' "$os" "$arch"
}
platform="$(board_platform)"
case "$platform" in
  darwin-arm64|linux-x64|linux-arm64) ext="" ;;
  windows-x64|windows-arm64) ext=".exe" ;;
  *)
    # Said once per platform, not on every session start.
    mkdir -p "$data/bin" 2>/dev/null
    if [ ! -e "$data/bin/.no-release-$platform" ]; then
      : > "$data/bin/.no-release-$platform" 2>/dev/null
      board_log "$HOOK" "no released board binary for $platform; build one with board/build.sh, or install bun"
    fi
    exit 0 ;;
esac

bin_dir="$data/bin"
dest="$bin_dir/board-$version$ext"
[ -x "$dest" ] && exit 0

command -v curl >/dev/null 2>&1 || { board_log "$HOOK" "curl is not installed, so the board binary for v$version cannot be fetched"; exit 0; }
command -v gzip >/dev/null 2>&1 || { board_log "$HOOK" "gzip is not installed, so the board binary for v$version cannot be unpacked"; exit 0; }

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else return 1; fi
}

mkdir -p "$bin_dir" 2>/dev/null || { board_log "$HOOK" "could not create $bin_dir; no board binary fetched"; exit 0; }

# One fetch at a time. Two sessions starting together would otherwise both
# download, and the loser's rename would land over a file the winner's hooks
# may already be running. A lock older than ten minutes is a fetch that died.
lock="$bin_dir/.fetch.lock"
if ! mkdir "$lock" 2>/dev/null; then
  if [ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
    rm -rf "$lock"
    mkdir "$lock" 2>/dev/null || exit 0
  else
    board_log "$HOOK" "another session is fetching the board binary for v$version"
    exit 0
  fi
fi
work="$(mktemp -d "$bin_dir/.fetch.XXXXXX" 2>/dev/null)" || { rmdir "$lock"; exit 0; }
trap 'rm -rf "$work" "$lock"' EXIT

base="${CODER_FLEET_BOARD_RELEASE_URL:-https://github.com/rzem-ai/coder-fleet/releases/download}/v$version"
asset="board-$platform$ext.gz"

if ! curl -fsSL --max-time 120 -o "$work/$asset" "$base/$asset" 2>"$work/err"; then
  board_log "$HOOK" "could not fetch $base/$asset ($(head -c 200 "$work/err" | tr '\n' ' ')); board.sh falls back to a local build or bun"
  exit 0
fi
if ! curl -fsSL --max-time 30 -o "$work/SHA256SUMS" "$base/SHA256SUMS" 2>"$work/err"; then
  board_log "$HOOK" "could not fetch $base/SHA256SUMS; the binary is not installed unchecked"
  exit 0
fi
want="$(awk -v f="$asset" '$2 == f || $2 == "*" f { print $1; exit }' "$work/SHA256SUMS")"
got="$(sha256 "$work/$asset")" || { board_log "$HOOK" "no sha256sum or shasum on PATH; the binary is not installed unchecked"; exit 0; }
if [ -z "$want" ] || [ "$want" != "$got" ]; then
  board_log "$HOOK" "$asset does not match its line in SHA256SUMS (want ${want:-none}, got $got); not installed"
  exit 0
fi
if ! gzip -dc "$work/$asset" > "$work/board$ext" 2>/dev/null; then
  board_log "$HOOK" "$asset did not unpack; not installed"
  exit 0
fi
chmod 0755 "$work/board$ext"
# Same directory, so the rename is atomic: a hook running the shim at this
# moment sees either no binary or the whole one.
mv -f "$work/board$ext" "$dest" || { board_log "$HOOK" "could not move the binary into $dest"; exit 0; }

# Older versions are dead weight once this one is in place.
for old in "$bin_dir"/board-*; do
  [ -e "$old" ] || continue
  [ "$old" = "$dest" ] && continue
  rm -f "$old"
done
board_log "$HOOK" "installed the board binary for v$version ($platform) at $dest"
exit 0
