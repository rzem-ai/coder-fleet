#!/usr/bin/env python3
"""editor-leftovers.py - a shim onto `boards fleet editor-leftovers` (CF-1.2).

Finding and removing what an earlier /init wrote for the editors is
TypeScript now, in boards/src/fleet/editor-leftovers.ts. This file passes its
arguments there:

    editor-leftovers.py status [--root DIR]
    editor-leftovers.py remove [--root DIR]

Exit codes: 0 done; 1 refused, nothing changed; 2 usage; 3 a file could not
be read or written; 127 the binary will not run, having changed nothing.
"""

import os
import sys

LAUNCHER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'boards', 'boards.sh'))

try:
    os.execv('/bin/bash', ['/bin/bash', LAUNCHER, 'fleet', 'editor-leftovers'] + sys.argv[1:])
except OSError as e:
    sys.stderr.write('editor-leftovers.py: could not run %s: %s\n' % (LAUNCHER, e))
    sys.exit(127)
