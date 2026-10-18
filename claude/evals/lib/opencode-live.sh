#!/usr/bin/env bash
#
# opencode-live.sh - the OpenCode port's live invariant tests, run from this
# directory so the suites name it like any other check. The port owns the
# tests and the runner; see opencode/test/run.sh for what each mode covers and
# when it skips.
#
# Usage:  evals/lib/opencode-live.sh

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
exec "$LIB_DIR/../../../opencode/test/run.sh" live
