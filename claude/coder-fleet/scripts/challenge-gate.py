#!/usr/bin/env python3
"""challenge-gate.py - a shim onto `boards fleet challenge-gate` (CF-1.2).

The spec-editor challenge gate and the close after it are TypeScript now, in
boards/src/fleet/challenge-gate.ts. This file passes its arguments there, so
spec-to-card and lead.md step 3 run it as they always have:

    challenge-gate.py run <issue>                    gate, then close and commit
    challenge-gate.py check <spec> [--spec-editor-disabled]
    challenge-gate.py close <spec> --sha <sha>
    challenge-gate.py lint <spec> [--original <f>]

When the binary will not run it exits 127 with nothing on stdout, which every
caller reads as a refusal: nothing is built.
"""

import os
import sys

LAUNCHER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'boards', 'boards.sh'))

try:
    os.execv('/bin/bash', ['/bin/bash', LAUNCHER, 'fleet', 'challenge-gate'] + sys.argv[1:])
except OSError as e:
    sys.stderr.write('challenge-gate.py: could not run %s: %s\n' % (LAUNCHER, e))
    sys.exit(127)
