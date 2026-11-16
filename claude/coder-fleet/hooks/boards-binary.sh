#!/usr/bin/env bash
# SessionStart: put the new board's `boards` binary for this plugin version on
# the machine. It is the one hook that cannot be the binary, since it is what
# fetches it.
#
# .github/workflows/boards-binaries.yml builds the binary for darwin-arm64,
# darwin-x64, linux-x64 and linux-arm64 on every vX.Y.Z tag and attaches each,
# gzipped, as boards-<platform>.gz beside boards-SHA256SUMS. This fetches the
# one for this machine, for the version in plugin.json, into
# ${CLAUDE_PLUGIN_DATA}/bin/boards-<version>, where scripts/boards.sh looks
# after a binary built in a checkout. Once per version: when the file is there
# this is one test and an exit. Older versions are removed, a newer one never.
#
# The checksum comes from the same release: it proves the file arrived whole,
# over HTTPS from github.com, on the trust the plugin itself is installed on.
#
# Soft, like hooks/board-binary.sh, the old board's fetcher it is modelled on:
# no platform build, no curl, no release yet or a bad checksum is one log line
# and an exit 0, and boards.sh then exits 127, in an install and in a checkout
# alike, unless the checkout holds a local build. Each of those leaves a code
# in bin/.boards-unavailable-<version>, and a download in progress writes how
# far it has got to bin/.boards-fetch-progress, for the lines boards-status.ts
# draws under the prompt. boards-session-start.sh runs this before the
# board's own hook.
#
# Knobs, all environment variables:
#   CODER_FLEET_BOARDS_DOWNLOAD=off  never fetch
#   CODER_FLEET_BOARDS_RELEASE_URL   where releases live (tests use file://)
#   CODER_FLEET_BOARDS_PLATFORM      override the detected platform
#
# Written for bash 3.2.
set -u

log() {
  local dir="${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/coder-fleet}/log"
  local line
  line="$(date -u '+%Y-%m-%dT%H:%M:%SZ') [BoardsBinary] $1"
  printf '%s\n' "$line" >&2
  mkdir -p "$dir" 2>/dev/null && printf '%s\n' "$line" >> "$dir/hooks.log" 2>/dev/null
  return 0
}

[ "${CODER_FLEET_BOARDS_DOWNLOAD:-on}" = off ] && exit 0
data="${CLAUDE_PLUGIN_DATA:-}"
[ -n "$data" ] || exit 0
here="$(cd "$(dirname "$0")" && pwd)"

version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$here/../.claude-plugin/plugin.json" | head -1)"
[ -n "$version" ] || { log "could not read the plugin version from plugin.json; no boards binary fetched"; exit 0; }

if [ -n "${CODER_FLEET_BOARDS_PLATFORM:-}" ]; then
  platform="$CODER_FLEET_BOARDS_PLATFORM"
else
  case "$(uname -s 2>/dev/null)" in Darwin) os=darwin ;; Linux) os=linux ;; *) os=unknown ;; esac
  case "$(uname -m 2>/dev/null)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) arch=unknown ;; esac
  platform="$os-$arch"
fi
bin_dir="$data/bin"
# unavailable <code>: records why this version has no binary, for the lines
# hooks/boards-status.ts draws (hooks/boards-state.ts reads the codes).
# A fetch that installs the binary removes it.
unavailable() {
  mkdir -p "$bin_dir" 2>/dev/null && printf '%s\n' "$1" > "$bin_dir/.boards-unavailable-$version" 2>/dev/null
  return 0
}
case "$platform" in
  darwin-arm64|darwin-x64|linux-x64|linux-arm64) ;;
  *)
    unavailable "no-release $platform"
    if [ ! -e "$bin_dir/.boards-no-release-$platform" ]; then
      : > "$bin_dir/.boards-no-release-$platform" 2>/dev/null
      log "no released boards binary for $platform; boards.sh runs only a build made in a checkout of the coder-fleet repo"
    fi
    exit 0 ;;
esac

dest="$bin_dir/boards-$version"
[ -x "$dest" ] && exit 0

# older <a> <b>: success when version a is strictly older than b.
older() {
  local a="$1" b="$2" x y
  case "$a" in ''|*[!0-9.]*|.*|*.|*..*) return 1 ;; esac
  case "$b" in ''|*[!0-9.]*|.*|*.|*..*) return 1 ;; esac
  while [ -n "$a" ] || [ -n "$b" ]; do
    case "$a" in *.*) x="${a%%.*}"; a="${a#*.}" ;; *) x="$a"; a="" ;; esac
    case "$b" in *.*) y="${b%%.*}"; b="${b#*.}" ;; *) y="$b"; b="" ;; esac
    x=$((10#${x:-0})); y=$((10#${y:-0}))
    [ "$x" -lt "$y" ] && return 0
    [ "$x" -gt "$y" ] && return 1
  done
  return 1
}
prune_old() {
  local old
  for old in "$bin_dir"/boards-*; do
    [ -f "$old" ] || continue
    older "${old##*/boards-}" "$version" && rm -f "$old"
  done
  return 0
}
[ -d "$bin_dir" ] && prune_old

command -v curl >/dev/null 2>&1 || { unavailable no-curl; log "curl is not installed, so the boards binary for v$version cannot be fetched"; exit 0; }
command -v gzip >/dev/null 2>&1 || { unavailable no-gzip; log "gzip is not installed, so the boards binary for v$version cannot be unpacked"; exit 0; }
mkdir -p "$bin_dir" 2>/dev/null || { log "could not create $bin_dir; no boards binary fetched"; exit 0; }

# One fetch at a time; a lock older than ten minutes is a fetch that died.
lock="$bin_dir/.boards-fetch.lock"
if ! mkdir "$lock" 2>/dev/null; then
  [ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ] || exit 0
  rm -rf "$lock"
  mkdir "$lock" 2>/dev/null || exit 0
fi
work="$(mktemp -d "$bin_dir/.boards-fetch.XXXXXX" 2>/dev/null)" || { unavailable fetch-failed; rmdir "$lock"; exit 0; }
# How far the download has gone, for the lines under the prompt in this
# session and any other (hooks/boards-state.ts reads it): one line, the bytes
# arrived and the bytes expected, 0 while the size is not known yet. It goes
# with the lock, and a download still running goes with this script.
progress="$bin_dir/.boards-fetch-progress"
fetching=
trap '[ -n "$fetching" ] && kill "$fetching" 2>/dev/null; rm -rf "$work" "$lock" "$progress"' EXIT

base="${CODER_FLEET_BOARDS_RELEASE_URL:-https://github.com/rzem-ai/coder-fleet/releases/download}/v$version"
asset="boards-$platform.gz"
# A failure is said once per version and platform.
failed="$bin_dir/.boards-fetch-failed-$version-$platform"
fail() {
  [ -e "$failed" ] && return 0
  : > "$failed" 2>/dev/null
  log "$1"
}
# write_progress: the bytes arrived so far and the size the last response's
# headers gave (after any redirect), written whole by a rename.
write_progress() {
  local got total
  got="$(wc -c < "$work/$asset" 2>/dev/null | tr -d ' ')"
  total="$(awk 'tolower($1) == "content-length:" { n = $2 } END { print n + 0 }' "$work/headers" 2>/dev/null | tr -d '\r')"
  printf '%s %s\n' "${got:-0}" "${total:-0}" > "$progress.tmp" 2>/dev/null && mv -f "$progress.tmp" "$progress" 2>/dev/null
  return 0
}
printf '0 0\n' > "$progress" 2>/dev/null
# The headers are written as they arrive, before the body, so the size is
# known while the body comes in.
curl -fsSL --max-time 120 -D "$work/headers" -o "$work/$asset" "$base/$asset" 2>/dev/null &
fetching=$!
while kill -0 "$fetching" 2>/dev/null; do
  write_progress
  sleep 0.2 2>/dev/null || sleep 1
done
wait "$fetching" \
  || { unavailable fetch-failed; fail "could not fetch $base/$asset; boards.sh has no binary to run in an install (said once for v$version $platform)"; exit 0; }
write_progress
curl -fsSL --max-time 30 -o "$work/SUMS" "$base/boards-SHA256SUMS" 2>/dev/null \
  || { unavailable fetch-failed; fail "could not fetch $base/boards-SHA256SUMS; the binary is not installed unchecked (said once for v$version $platform)"; exit 0; }
want="$(awk -v f="$asset" '$2 == f || $2 == "*" f { print $1; exit }' "$work/SUMS")"
if command -v sha256sum >/dev/null 2>&1; then got="$(sha256sum "$work/$asset" | cut -d' ' -f1)"
elif command -v shasum >/dev/null 2>&1; then got="$(shasum -a 256 "$work/$asset" | cut -d' ' -f1)"
else unavailable no-checksum-tool; log "no sha256sum or shasum on PATH; the boards binary is not installed unchecked"; exit 0; fi
if [ -z "$want" ] || [ "$want" != "$got" ]; then
  unavailable bad-checksum
  log "$asset does not match its line in boards-SHA256SUMS (want ${want:-none}, got $got); not installed"
  exit 0
fi
gzip -dc "$work/$asset" > "$work/boards" 2>/dev/null || { unavailable fetch-failed; log "$asset did not unpack; not installed"; exit 0; }
chmod 0755 "$work/boards"
# Same directory, so the rename is atomic.
mv -f "$work/boards" "$dest" || { unavailable fetch-failed; log "could not move the boards binary into $dest"; exit 0; }
rm -f "$failed" "$bin_dir/.boards-unavailable-$version"
log "installed the boards binary for v$version ($platform) at $dest"
exit 0
