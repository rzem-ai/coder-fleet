"""push-policy.py - a shim onto `boards fleet push-policy` (CF-1.3).

The push and release policy is TypeScript now, boards/src/fleet/push-policy.ts,
which lexes the command as the shell reads it and holds the rules (CF-209.3)
and the three gaps docs/limits.md records. This file keeps its interface:
`python3 -I push-policy.py`, with a JSON request on stdin, prints one line,
"ok", or "deny", a tab and the reason.

When the binary will not run, or answers with anything else, it prints a
deny, so a check that could not be made refuses.
"""

import os
import subprocess
import sys

LAUNCHER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'boards', 'boards.sh'))
REFUSED = ('deny\tpush and release policy: the boards binary could not run, so this command could not be '
           'judged, and a command that cannot be judged is refused.')

out = ''
try:
    p = subprocess.run(['/bin/bash', LAUNCHER, 'fleet', 'push-policy'], input=sys.stdin.buffer.read(),
                       stdout=subprocess.PIPE, timeout=8)
    if p.returncode == 0:
        out = p.stdout.decode('utf-8', 'replace').rstrip('\n')
except Exception:
    pass
print(out if out == 'ok' or out.startswith('deny\t') else REFUSED)
