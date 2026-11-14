#!/usr/bin/env python3
"""check-write-scope.py - a shim onto `boards fleet check-write-scope` (CF-1.3).

Whether an agent's write tool may land where it is pointed is TypeScript now,
boards/src/fleet/write-scope.ts, which states each role's destinations and
how a path is resolved. This file keeps its interface: the hook's event on
stdin, then

    check-write-scope.py            the role's own scope
    check-write-scope.py --outside  a break or use-mode reviewer: anywhere but the project
    check-write-scope.py --memory   the agent's own memory directory

exits 0 to allow and 1 to deny. The scope hook calls the same code in
process, and reads this file's presence as the checker's: a plugin without it
has no checker, and the reviewer's outside rule then refuses every write.

When the binary will not run, or answers with anything but the word allowed,
it exits 1: a scope that cannot be established is not satisfied.
"""

import os
import subprocess
import sys

LAUNCHER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'boards', 'boards.sh'))

ok = False
try:
    p = subprocess.run(['/bin/bash', LAUNCHER, 'fleet', 'check-write-scope'] + sys.argv[1:],
                       input=sys.stdin.buffer.read(), stdout=subprocess.PIPE, timeout=10)
    ok = p.returncode == 0 and p.stdout.decode('utf-8', 'replace').strip() == 'allowed'
except Exception:
    pass
sys.exit(0 if ok else 1)
