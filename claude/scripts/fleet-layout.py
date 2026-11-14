#!/usr/bin/env python3
"""fleet-layout.py - where this checkout keeps one of the fleet's own files (CF-201.2).

The coder-fleet repo runs the fleet on itself, so some checks read its own
installed glossary rule. Before the repo is migrated it commits the fleet's
files, and every checkout has them. After `fleet-exclude.py migrate` they are
kept out of its history: the main checkout still has them on disk, and a linked
worktree and a CI clone do not. A check that reads one of them asks this
script which case it is in, so it proves the file where the file is and says
so where it is not.

Usage:  fleet-layout.py [--repo DIR] <path>

<path> is relative to the top level and must fall under an entry
`fleet-exclude.py` lists. Prints one line, `<layout> <arm> <file>`:

  layout  tracked   the history carries some of the fleet's files, so this one
                    is committed too and must be here
          excluded  the history carries none of them (`fleet-exclude.py status`
                    lists nothing tracked), whether or not this clone has the
                    exclude written
  arm     worktree      the file is in the working tree; <file> is its path
          absent        not here and nowhere this script can read; <file> is -

Exit 0 when the line describes a layout the file may be in, 1 for `tracked
absent` (the history should carry it and this checkout lacks it), 2 for a usage
error, a path that is not the fleet's, or a git or fleet-exclude failure.
"""

import fnmatch
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXCLUDE_SCRIPT = os.path.join(os.path.dirname(HERE), 'coder-fleet', 'scripts', 'fleet-exclude.py')


def clean_env():
    return {k: v for k, v in os.environ.items() if k not in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE')}


def git(repo, *args):
    return subprocess.run(['git', '-C', repo, *args], capture_output=True, env=clean_env())


def fail(message):
    sys.stderr.write('fleet-layout: %s\n' % message)
    sys.exit(2)


def parse(argv):
    repo = None
    rest = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--repo' and i + 1 < len(argv):
            repo = argv[i + 1]
            i += 2
            continue
        rest.append(a)
        i += 1
    if len(rest) != 1:
        fail('usage: fleet-layout.py [--repo DIR] <path>')
    return repo or HERE, rest[0].lstrip('/')


def covers(entry, rel):
    pattern = entry.lstrip('/')
    if pattern.endswith('/'):
        return fnmatch.fnmatchcase(rel, pattern + '*')
    return fnmatch.fnmatchcase(rel, pattern)


def main(argv):
    repo, rel = parse(argv)
    p = git(repo, 'rev-parse', '--show-toplevel')
    if p.returncode != 0:
        fail('%s is not inside a git working tree' % repo)
    top = p.stdout.decode().strip()
    s = subprocess.run([sys.executable, '-I', EXCLUDE_SCRIPT, 'status'], cwd=top, capture_output=True, env=clean_env())
    if s.returncode != 0:
        fail('fleet-exclude.py status failed: %s' % (s.stderr or s.stdout).decode(errors='replace').strip())
    lines = s.stdout.decode().splitlines()
    entries = [l.split(' ', 1)[1] for l in lines if l.startswith(('present ', 'missing '))]
    if not any(covers(e, rel) for e in entries):
        fail('%s is not one of the paths fleet-exclude.py keeps out of history' % rel)
    layout = 'tracked' if any(l.startswith('tracked ') for l in lines) else 'excluded'
    here = os.path.join(top, rel)
    if os.path.isfile(here):
        print('%s worktree %s' % (layout, here))
        return 0
    print('%s absent -' % layout)
    return 1 if layout == 'tracked' else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
