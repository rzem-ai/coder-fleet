#!/usr/bin/env python3
"""Carry every agent's memory to the state worktree and commit it there (CF-183.2).

Claude Code keeps an agent's `memory: project` directory at
<spawn cwd>/.claude/agent-memory/<agent type>/, loads its MEMORY.md before any
hook runs, and refuses a tool write anywhere else: a worktree-isolated agent
may write only its own worktree, and any other agent's write into another
checkout's .claude/ is a protected path no hook can approve. So agents keep
writing where Claude Code puts memory, and this moves each change, from outside
the tool layer, to the state worktree that CF-183.1 made the board's home
(<main checkout>/.claude/worktrees/coder-fleet-state, branch coder-fleet/state),
where it is committed and from where CF-183.3's flush lands it on the default
branch after a release tag.

Modes, one per hook:

  post   PostToolUse on a write tool. A file the agent wrote in its own memory
         directory, in the main checkout or a worktree the main checkout
         registers under .claude/worktrees/, is merged into the state
         worktree's copy and committed on the state branch.
  start  SubagentStart and SessionStart. In a linked agent worktree, the
         tracked memory files are marked skip-worktree and untracked ones are
         excluded, so the agent's own `git add -A` or `commit -a` carries none.
         When the state worktree's MEMORY.md for this agent differs from the
         one Claude Code just loaded, it is handed over as additionalContext.
  stop   SubagentStop and SessionEnd. Every file in the agent's own memory
         directory in its checkout is carried as `post` carries one, which
         catches a write no tool call showed; in the main checkout each file
         that was carried is then put back as the default branch has it, so
         the human's checkout does not stay dirty with memory.

The merge is three-way: the base is what this checkout last handed over (kept
under the common git dir), or the checkout's HEAD copy before that, so a
parallel agent's change on the state branch is kept and a second write of the
same file does not repeat the first. Conflicting hunks keep both sides.

Never fails the tool call: every error is logged to hooks.log and exits 0.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

STATE_REL = Path('.claude') / 'worktrees' / 'coder-fleet-state'
STATE_BRANCH = 'coder-fleet/state'
MEM_REL = Path('.claude') / 'agent-memory'
EXCLUDE_LINE = '/.claude/agent-memory/'
INDEX_LINES = 200
INDEX_BYTES = 25 * 1024
LOCK_WAIT = 15.0
LOCK_STALE = 60.0
WRITE_TOOLS = {'Write', 'Edit', 'MultiEdit', 'NotebookEdit'}


def log(message):
    state_dir = os.environ.get('CODER_FLEET_STATE_DIR') or os.path.join(
        os.environ.get('XDG_STATE_HOME') or os.path.expanduser('~/.local/state'), 'coder-fleet')
    path = os.environ.get('BOARD_LOG_FILE') or os.path.join(state_dir, 'log', 'hooks.log')
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'a', encoding='utf-8') as fh:
            fh.write('%s [Memory] %s\n' % (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), message))
    except OSError:
        pass


def clean_env():
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env['GIT_CONFIG_NOSYSTEM'] = '1'
    return env


def git(cwd, *args, data=None):
    try:
        p = subprocess.run(['git', '-C', str(cwd), *args], input=data, capture_output=True,
                           timeout=30, env=clean_env())
    except (OSError, subprocess.SubprocessError) as error:
        return 1, b'', str(error).encode()
    return p.returncode, p.stdout, p.stderr


def resolve(path):
    path = Path(os.path.abspath(os.path.expanduser(str(path))))
    existing, tail = path, []
    while not existing.exists() and existing != existing.parent:
        tail.append(existing.name)
        existing = existing.parent
    real = Path(os.path.realpath(str(existing)))
    for name in reversed(tail):
        real = real / name
    return real


def fold(path):
    return str(path).casefold()


def within(path, root):
    """True when path is root or under it, case folded."""
    p, r = fold(path), fold(root).rstrip('/')
    return p == r or p.startswith(r + '/')


def main_checkout(start):
    code, out, _ = git(start, 'rev-parse', '--path-format=absolute', '--git-common-dir')
    if code != 0:
        return None, None
    common = resolve(out.decode().strip())
    if common.name != '.git':
        return None, None
    return common.parent, common


def state_ready(state):
    try:
        line = (state / '.git').read_text(encoding='utf-8').strip()
        if not line.startswith('gitdir:'):
            return False
        gitdir = (state / line[len('gitdir:'):].strip()).resolve()
        head = (gitdir / 'HEAD').read_text(encoding='utf-8').strip()
        return head == 'ref: refs/heads/' + STATE_BRANCH and (state / '.boards').is_dir()
    except OSError:
        return False


def checkouts(main):
    """The main checkout, and every worktree it registers under its .claude/worktrees/."""
    code, out, _ = git(main, 'worktree', 'list', '--porcelain', '-z')
    if code != 0:
        return [main]
    home = resolve(os.path.expanduser('~'))
    under = main / '.claude' / 'worktrees'
    found = [main]
    for field in out.decode(errors='replace').split('\0'):
        if not field.startswith('worktree '):
            continue
        tree = resolve(field[len('worktree '):])
        if fold(tree) == fold(main) or not within(tree, under) or fold(tree) == fold(under):
            continue
        if within(home, tree):
            continue
        found.append(tree)
    return found


def holding(path, cos):
    best = None
    for co in cos:
        if within(path, co) and (best is None or len(str(co)) > len(str(best))):
            best = co
    return best


def agent_dir(agent_type):
    return re.sub(r'[^a-zA-Z0-9\-_]', '-', agent_type) if agent_type else ''


class Repo:
    def __init__(self, event):
        self.event = event
        self.cwd = resolve(event.get('cwd') or '.')
        start = os.environ.get('CLAUDE_PROJECT_DIR') or str(self.cwd)
        self.main, self.common = main_checkout(start)
        self.state = self.main / STATE_REL if self.main else None
        self.ready = bool(self.state) and state_ready(self.state)
        self.cos = checkouts(self.main) if self.ready else []
        self.dir = agent_dir(event.get('agent_type', ''))

    def mem(self, co):
        return co / MEM_REL / self.dir

    def base_file(self, co, rel):
        key = hashlib.sha1(fold(co).encode()).hexdigest()[:16]
        return self.common / 'coder-fleet' / 'memory-base' / key / self.dir / rel

    def safe_state_dir(self):
        root = self.mem(self.state)
        for p in (self.state / '.claude', self.state / MEM_REL, root):
            if p.is_symlink():
                return None
        return root

    def harvest(self, co, rel):
        """Merges co's copy of rel into the state worktree. True when the state copy changed."""
        src = self.mem(co) / rel
        if src.is_symlink() or not src.is_file():
            return False
        root = self.safe_state_dir()
        if root is None:
            raise RuntimeError('the state worktree memory directory is a symlink')
        theirs = src.read_bytes()
        record = self.base_file(co, rel)
        if record.is_file():
            base = record.read_bytes()
        else:
            code, out, _ = git(co, 'show', 'HEAD:' + (MEM_REL / self.dir / rel).as_posix())
            base = out if code == 0 else b''
        dst = root / rel
        if dst.is_symlink():
            raise RuntimeError('%s is a symlink' % dst)
        ours = dst.read_bytes() if dst.is_file() else None
        if ours is None:
            result = theirs
        elif theirs == base or ours == theirs:
            result = None
        elif ours == base:
            result = theirs
        else:
            result = merge(ours, base, theirs)
        if result is not None:
            dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.with_name('.' + dst.name + '.memory-tmp')
            tmp.write_bytes(result)
            os.replace(tmp, dst)
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_bytes(theirs)
        return result is not None

    def commits_on(self):
        if os.environ.get('CODER_FLEET_BOARD_NO_COMMIT') == '1':
            return False
        try:
            text = (self.state / '.boards' / 'config.yml').read_text(encoding='utf-8')
        except OSError:
            return False
        m = re.search(r'^auto_commit:\s*(.*)$', text, re.M)
        return bool(m) and re.sub(r'["\'\s]', '', m.group(1)).lower() == 'true'

    def commit(self):
        if not self.commits_on():
            return
        path = (MEM_REL / self.dir).as_posix()
        with Lock(self.common / 'coder-fleet' / 'memory.lock'):
            for attempt in range(6):
                code, _, err = git(self.state, 'add', '-f', '--', path)
                if code == 0:
                    if git(self.state, 'diff', '--cached', '--quiet', '--', path)[0] == 0:
                        return
                    code, _, err = git(self.state, 'commit', '-q', '-m', 'Record %s memory' % self.dir,
                                       '-m', 'Board-Writer: memory', '--', path)
                    if code == 0:
                        return
                time.sleep(0.3 * (attempt + 1))
            log('memory commit failed in %s: %s' % (self.state, err.decode(errors='replace').strip()))

    def fence(self, co):
        """Keeps a linked agent worktree's memory out of the agent's own commits."""
        code, out, _ = git(co, 'ls-files', '-z', '--', MEM_REL.as_posix())
        if code == 0 and out:
            git(co, 'update-index', '--skip-worktree', '-z', '--stdin', data=out)
        exclude = self.common / 'info' / 'exclude'
        try:
            text = exclude.read_text(encoding='utf-8') if exclude.exists() else ''
            if EXCLUDE_LINE not in text.splitlines():
                exclude.parent.mkdir(parents=True, exist_ok=True)
                sep = '' if not text or text.endswith('\n') else '\n'
                exclude.write_text(text + sep + '# agent memory lives on the state branch (coder-fleet)\n' + EXCLUDE_LINE + '\n',
                                   encoding='utf-8')
        except OSError as error:
            log('could not exclude agent memory in %s: %s' % (exclude, error))

    def files(self, co):
        root = self.mem(co)
        if root.is_symlink() or not root.is_dir():
            return []
        out = []
        for d, dirs, names in os.walk(root):
            dirs[:] = [n for n in dirs if not (Path(d) / n).is_symlink()]
            for n in names:
                p = Path(d) / n
                if p.is_file() and not p.is_symlink() and not n.endswith('.memory-tmp'):
                    out.append(p.relative_to(root))
        return sorted(out)


def merge(ours, base, theirs):
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for name, data in (('ours', ours), ('base', base), ('theirs', theirs)):
            p = os.path.join(tmp, name)
            with open(p, 'wb') as fh:
                fh.write(data)
            paths.append(p)
        code, out, err = git(tmp, 'merge-file', '-p', '--union', *paths)
        if code < 0 or code > 127:
            raise RuntimeError('git merge-file failed: %s' % err.decode(errors='replace'))
        return out


class Lock:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.time() + LOCK_WAIT
        while True:
            try:
                os.mkdir(self.path)
                return self
            except FileExistsError:
                try:
                    if time.time() - self.path.stat().st_mtime > LOCK_STALE:
                        os.rmdir(self.path)
                        continue
                except OSError:
                    pass
                if time.time() > deadline:
                    raise RuntimeError('the memory lock %s is held' % self.path)
                time.sleep(0.05)

    def __exit__(self, *exc):
        try:
            os.rmdir(self.path)
        except OSError:
            pass


def do_post(repo):
    if repo.event.get('tool_name') not in WRITE_TOOLS:
        return
    data = repo.event.get('tool_input') or {}
    raw = data.get('file_path') or data.get('notebook_path')
    if not raw:
        return
    target = Path(os.path.expanduser(str(raw)))
    if not target.is_absolute():
        target = repo.cwd / target
    target = resolve(target)
    co = holding(target, repo.cos)
    if co is None:
        return
    root = resolve(repo.mem(co))
    if not within(target, root) or fold(target) == fold(root):
        return
    if fold(co) != fold(repo.state):
        repo.harvest(co, Path(os.path.relpath(str(target), str(root))))
    repo.commit()


def do_start(repo):
    co = holding(repo.cwd, repo.cos)
    if co is None or fold(co) == fold(repo.state):
        return
    if fold(co) != fold(repo.main):
        repo.fence(co)
    fresh = repo.mem(repo.state) / 'MEMORY.md'
    loaded = repo.mem(co) / 'MEMORY.md'
    if fresh.is_symlink() or not fresh.is_file():
        return
    text = fresh.read_bytes()
    if loaded.is_file() and loaded.read_bytes() == text:
        return
    lines = text.decode('utf-8', errors='replace').splitlines()[:INDEX_LINES]
    index = '\n'.join(lines)[:INDEX_BYTES]
    event_name = repo.event.get('hook_event_name') or 'SubagentStart'
    if event_name not in ('SubagentStart', 'SessionStart'):
        return
    context = (
        'Your memory index on the state branch is newer than the MEMORY.md loaded with you, which is '
        'the default branch\'s copy as of the last flush. This is the newer one. A note it names that '
        'your memory directory lacks is at %s/, readable there. Keep writing your memory where Claude '
        'Code put it: a hook carries each change to the state branch, and it reaches the default branch '
        'in the flush after the next release tag.\n\n%s' % (repo.mem(repo.state), index))
    print(json.dumps({'hookSpecificOutput': {'hookEventName': event_name, 'additionalContext': context}}))


def do_stop(repo):
    co = holding(repo.cwd, repo.cos)
    if co is None or fold(co) == fold(repo.state):
        return
    carried = []
    for rel in repo.files(co):
        try:
            repo.harvest(co, rel)
            carried.append(rel)
        except Exception as error:  # one file that cannot be carried keeps the rest moving
            log('could not carry %s to the state worktree: %s' % (repo.mem(co) / rel, error))
    repo.commit()
    if fold(co) != fold(repo.main):
        return
    for rel in carried:
        src = repo.mem(co) / rel
        record = repo.base_file(co, rel)
        if not record.is_file() or record.read_bytes() != src.read_bytes():
            continue
        if not (repo.mem(repo.state) / rel).is_file():
            continue
        code, out, _ = git(co, 'show', 'HEAD:' + (MEM_REL / repo.dir / rel).as_posix())
        if code == 0:
            src.write_bytes(out)
        else:
            src.unlink()
            parent = src.parent
            while fold(parent) != fold(repo.mem(co).parent):
                try:
                    parent.rmdir()
                except OSError:
                    break
                parent = parent.parent
        record.unlink()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    event = json.load(sys.stdin)
    repo = Repo(event)
    if not repo.ready or not repo.dir:
        return
    {'post': do_post, 'start': do_start, 'stop': do_stop}.get(mode, lambda r: None)(repo)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        log('memory hook failed: %s' % error)
    sys.exit(0)
