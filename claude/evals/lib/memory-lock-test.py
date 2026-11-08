#!/usr/bin/env python3
"""The memory hook's board.lock: breaking, refusing and releasing it safely.

Run by memory-state-contract.sh with the helper's path. Each case drives the
Lock class in hooks/lib/memory-state.py directly, because the moments that
matter - another process taking the lock between the stale check and the
removal, or between a holder's last write and its release - cannot be timed
from outside. The class is wrapped here, in the test, never given a knob.

Prints one "ok" or "FAIL" line per case and exits 1 on any failure.
"""

import importlib.util
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location('memory_state', sys.argv[1])
ms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ms)
ms.LOCK_WAIT = 1.5

failed = 0


def check(label, passed, detail=''):
    global failed
    print('  %s  %s%s' % ('ok  ' if passed else 'FAIL', label, ('\n        ' + detail) if (detail and not passed) else ''))
    if not passed:
        failed += 1


def dead_pid():
    """A pid no process has: a child that has already been reaped."""
    pid = os.fork()
    if pid == 0:
        os._exit(0)
    os.waitpid(pid, 0)
    return pid


def plant(lock, pid, age=0.0):
    lock.mkdir()
    (lock / 'pid').write_text('%d\n' % pid)
    if age:
        then = time.time() - age
        os.utime(lock, (then, then))


tmp = Path(tempfile.mkdtemp())
try:
    # 1. A stale lock that another process takes between the stale check and
    # the removal: the new owner's lock must survive, and the waiter keeps waiting.
    lock = tmp / 'race' / 'board.lock'
    lock.parent.mkdir()
    plant(lock, dead_pid())
    original = ms.Lock.stale
    swapped = []

    def stale_then_taken(self):
        verdict = original(self)
        if verdict and not swapped:
            # Between this answer and the removal, a live process breaks the
            # stale lock and takes it for itself.
            shutil.rmtree(self.path)
            plant(self.path, os.getppid())
            swapped.append(True)
        return verdict

    ms.Lock.stale = stale_then_taken
    raised = False
    try:
        with ms.Lock(lock):
            pass
    except Exception:
        raised = True
    ms.Lock.stale = original
    owner = (lock / 'pid').read_text().strip() if (lock / 'pid').exists() else ''
    check('a lock taken between the stale check and the removal survives', swapped == [True] and owner == str(os.getppid()),
          'pid file holds %r' % owner)
    check('and the waiter does not take it', raised)
    leftovers = [p.name for p in lock.parent.iterdir() if p.name != 'board.lock']
    check('and no tombstone is left behind', leftovers == [], repr(leftovers))

    # 2. A lock path that is a symlink is refused at once, not waited on.
    lock = tmp / 'link' / 'board.lock'
    lock.parent.mkdir()
    os.symlink(str(tmp / 'nowhere'), str(lock))
    start = time.time()
    refused = False
    try:
        with ms.Lock(lock):
            pass
    except Exception:
        refused = True
    took = time.time() - start
    check('a symlink at the lock path is refused', refused)
    check('without waiting out the deadline', took < 1.0, '%.2fs' % took)
    check('and the symlink is left alone', os.path.islink(str(lock)))

    # 3. A holder whose lock was broken and retaken by another process does not
    # remove the new owner's lock when it releases.
    lock = tmp / 'release' / 'board.lock'
    lock.parent.mkdir()
    held = ms.Lock(lock)
    held.__enter__()
    shutil.rmtree(lock)
    plant(lock, os.getppid())
    held.__exit__(None, None, None)
    owner = (lock / 'pid').read_text().strip() if (lock / 'pid').exists() else ''
    check('a release by a process that no longer owns the lock leaves the new owner\'s', owner == str(os.getppid()),
          'pid file holds %r' % owner)

    # 4. Its own lock it does remove, and a stale one it breaks and takes.
    lock = tmp / 'own' / 'board.lock'
    lock.parent.mkdir()
    plant(lock, dead_pid())
    with ms.Lock(lock):
        mine = (lock / 'pid').read_text().strip()
    check('a stale lock is broken and taken', mine == str(os.getpid()), mine)
    check('and its own lock is removed on release', not os.path.lexists(str(lock)))
finally:
    shutil.rmtree(str(tmp), ignore_errors=True)

sys.exit(1 if failed else 0)
