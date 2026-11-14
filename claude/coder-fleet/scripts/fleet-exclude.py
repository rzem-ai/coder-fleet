#!/usr/bin/env python3
"""fleet-exclude.py - a shim onto `boards fleet exclude` (CF-1.2).

Keeping the fleet's files out of a project's history (CF-201) is TypeScript
now, in boards/src/fleet/exclude.ts. This file passes its arguments there, so
`python3 -I fleet-exclude.py status|write|migrate` from the project root, as
the old board and claude/scripts/fleet-layout.py run it, works as it did.

Exit codes: 0 done, 1 refused and nothing changed, 2 usage, 3 a git step
failed and what this run changed was put back, 127 the binary will not run.
"""

import os
import sys

LAUNCHER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'boards', 'boards.sh'))

try:
    os.execv('/bin/bash', ['/bin/bash', LAUNCHER, 'fleet', 'exclude'] + sys.argv[1:])
except OSError as e:
    sys.stderr.write('fleet-exclude.py: could not run %s: %s\n' % (LAUNCHER, e))
    sys.exit(127)
