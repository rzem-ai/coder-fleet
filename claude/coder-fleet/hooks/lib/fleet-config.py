"""fleet-config.py - a shim onto `boards fleet config parse` (CF-1.2).

The parser of .claude/coder-fleet.json is TypeScript now, parseConfig in
boards/src/fleet/config.ts. This file passes its arguments there, so
`python3 -I fleet-config.py <file> <core agents>` prints the same fourteen
lines it always has: the state and the names or the reason, then value, state
and reason for the phase, baseBranch, push and release.

The board's reader still runs the parse as this separate process, as
fleet-config.sh did, so a python3 that is missing or cannot run makes the file
invalid with a reason that says so. When the binary will not run, this prints
nothing and exits non-zero, and the reader honours nothing in the file.
"""

import os
import sys

LAUNCHER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'boards', 'boards.sh')

try:
    os.execvp('bash', ['bash', LAUNCHER, 'fleet', 'config', 'parse'] + sys.argv[1:])
except OSError as e:
    sys.stderr.write('fleet-config.py: could not run %s: %s\n' % (LAUNCHER, e))
    sys.exit(127)
