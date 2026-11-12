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
where it is committed and pushed (CF-201). That branch is its only home: it
never reaches the default branch.

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
  prune  Not a hook: run by prune-worktrees.sh. Removes the records below of
         every checkout git no longer lists as a worktree.

The merge is three-way, against the copy the agent's file grew from. Three
known bases are kept for it, under <common git dir>/coder-fleet/, one directory
per checkout named by a hash of its path: the record, what this checkout last
handed over (memory-base/); the start copy, the state copy of each note as the
agent was handed it at its start (memory-start/); and the checkout's HEAD copy.
The base is the record when there is one, since the agent's file on disk grew
from it. Sessions share the main checkout, so a record there counts only for
the session that wrote it (memory-base/<key>/<agent>.session/): one a killed
session left is no base, and a copy put back to HEAD over it is nothing new.
Before any hand-over it is whichever of the start and HEAD copies the
agent's copy kept most lines of, the one it lost fewest lines of breaking a tie.
Then:

  - the agent's copy equals the state copy or the record, or, with no record
    yet, the start or HEAD copy: nothing to carry. Once there is a record, a
    copy back at its start or HEAD copy is the agent taking its edit back;
  - the state copy equals the base: the agent's copy is taken exactly, whatever
    share of its lines it kept, so a rewrite or a prune lands as written;
  - the state copy has moved past the base, because a parallel agent changed
    it: git merge-file --union, so both changes are kept and conflicting hunks
    keep both sides;
  - no known base at all, a note made here and on the state branch at once: the
    same merge against an empty base, which keeps both copies whole.

A note gone from the state branch stays gone unless the agent's copy differs
from every known base, in which case it is the agent's edit and comes back.

Never fails the tool call: every error is logged to hooks.log and exits 0.
"""

import difflib
import hashlib
import json
import os
import re
import secrets
import shutil
import stat
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
# board.lock, as the board binary takes it (state-worktree.ts acquireLock): a
# directory made with mkdir, holding the holder's pid; stale once the pid is
# gone, after 5 s with no pid written, or after 120 s whatever. Every board
# commit takes it, and so does board state --from while it fast-forwards the
# branch, so a memory commit made under it is never moved away.
BOARD_LOCK = 'board.lock'
LOCK_WAIT = 15.0
LOCK_PID_GRACE = 5.0
LOCK_STALE = 120.0
WRITE_TOOLS = {'Write', 'Edit', 'MultiEdit', 'NotebookEdit'}
# Pushes coder-fleet/state behind each memory commit (CF-201); it detaches at
# once, so the hook never waits on the network, and logs what happened.
PUSH_SCRIPT = Path(__file__).resolve().parent.parent / 'state-push.sh'


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


def schedule_push(state):
    """Starts a background push of the state branch; never fails the hook."""
    if not PUSH_SCRIPT.is_file():
        return
    try:
        subprocess.run(['bash', str(PUSH_SCRIPT), str(state)], stdin=subprocess.DEVNULL,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    except (OSError, subprocess.SubprocessError) as error:
        log('could not start the push of %s: %s' % (STATE_BRANCH, error))


def clean_env():
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env['GIT_CONFIG_NOSYSTEM'] = '1'
    return env


def git(cwd, *args, data=None, index=None):
    env = clean_env()
    if index is not None:
        env['GIT_INDEX_FILE'] = str(index)
    try:
        p = subprocess.run(['git', '-C', str(cwd), *args], input=data, capture_output=True,
                           timeout=30, env=env)
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


DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


class Unsafe(Exception):
    """A path under an agent-writable tree that is not what it claims to be."""


def rel_parts(rel):
    """The components of a relative path inside a memory directory, or Unsafe."""
    text = str(rel)
    parts = Path(text).parts
    if not parts or Path(text).is_absolute() or any(x in ('', '.', '..') for x in parts):
        raise Unsafe('%r is not a path inside the memory directory' % text)
    return parts


def open_dir(base, parts, create=False):
    """A descriptor for base/parts..., with no component a symlink, made when create is set."""
    try:
        fd = os.open(str(base), DIR_FLAGS)
    except OSError as error:
        raise Unsafe('%s cannot be opened as a directory: %s' % (base, error))
    try:
        for name in parts:
            if create:
                try:
                    os.mkdir(name, 0o755, dir_fd=fd)
                except FileExistsError:
                    pass
            try:
                nxt = os.open(name, DIR_FLAGS, dir_fd=fd)
            except OSError as error:
                raise Unsafe('%s/%s is not a plain directory: %s' % (base, '/'.join(parts), error))
            os.close(fd)
            fd = nxt
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_at(dirfd, name):
    """A regular file's bytes, read without following a symlink; None when it is absent."""
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=dirfd)
    except FileNotFoundError:
        return None
    except OSError as error:
        raise Unsafe('%s cannot be read as a plain file: %s' % (name, error))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Unsafe('%s is not a regular file' % name)
        if info.st_nlink != 1:
            # Another name for some other file, perhaps outside the tree.
            raise Unsafe('%s has %d links' % (name, info.st_nlink))
        chunks = []
        while True:
            chunk = os.read(fd, 1 << 16)
            if not chunk:
                return b''.join(chunks)
            chunks.append(chunk)
    finally:
        os.close(fd)


def write_at(dirfd, name, data):
    """Replaces name in dirfd with data, through a new temporary file made in that directory.

    The temporary name is random and opened O_CREAT|O_EXCL, so nothing an agent
    put there in advance - a symlink or a hard link to some other file - is
    opened, and a file with more than one link after the open is refused.
    """
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    for _ in range(8):
        tmp = '.%s.%s.memory-tmp' % (name, secrets.token_hex(8))
        try:
            fd = os.open(tmp, flags, 0o644, dir_fd=dirfd)
            break
        except FileExistsError:
            continue
    else:
        raise Unsafe('no fresh temporary name for %s' % name)
    try:
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise Unsafe('%s is not a fresh regular file' % tmp)
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view):]
        finally:
            os.close(fd)
        os.replace(tmp, name, src_dir_fd=dirfd, dst_dir_fd=dirfd)
    except BaseException:
        try:
            os.unlink(tmp, dir_fd=dirfd)
        except OSError:
            pass
        raise


RECORD_AREAS = ('memory-start', 'memory-base')
RECORD_NAME = re.compile(r'[0-9a-f]{16}')


def record_key(co):
    """The directory naming a checkout's records under memory-start/ and memory-base/."""
    return hashlib.sha1(fold(co).encode()).hexdigest()[:16]


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

    def root_parts(self):
        return MEM_REL.parts + (self.dir,)

    def check_state_tree(self):
        """Unsafe when the state worktree's memory tree is reached through, or holds, a symlink or a
        file with more than one link, either of which would carry or commit some other file. A tree
        not made yet, in a project whose default branch has no memory, is no finding: each
        component that exists must be a plain directory, and harvest makes the rest."""
        parts = ()
        for name in MEM_REL.parts:
            path = self.state.joinpath(*parts, name)
            if not os.path.lexists(str(path)):
                return
            parts += (name,)
            os.close(open_dir(self.state, parts))
        for d, dirs, names in os.walk(str(self.state / MEM_REL)):
            for n in dirs + names:
                path = os.path.join(d, n)
                info = os.lstat(path)
                if stat.S_ISLNK(info.st_mode):
                    raise Unsafe('%s is a symlink in the state worktree' % path)
                if stat.S_ISREG(info.st_mode) and info.st_nlink != 1:
                    raise Unsafe('%s has %d links in the state worktree' % (path, info.st_nlink))

    def read_rel(self, co, parts):
        fd = open_dir(co, self.root_parts() + parts[:-1])
        try:
            return read_at(fd, parts[-1])
        finally:
            os.close(fd)

    def base_file(self, co, rel):
        return self.common / 'coder-fleet' / 'memory-base' / record_key(co) / self.dir / rel

    def owner_file(self, co, rel):
        """The session that wrote co's record of rel. A sanitised agent directory has no dot, so
        <agent>.session never meets one."""
        return self.common / 'coder-fleet' / 'memory-base' / record_key(co) / (self.dir + '.session') / rel

    def record_is_mine(self, co, rel):
        """Whether co's record of rel is this session's own. Sessions share the main checkout, and a
        record there that some other session wrote, one killed before its stop put the file back,
        says nothing about what this session's copy grew from. A worktree's record always counts."""
        if fold(co) != fold(self.main):
            return True
        session = str(self.event.get('session_id') or '')
        try:
            return bool(session) and self.owner_file(co, rel).read_text(encoding='utf-8') == session
        except OSError:
            return False

    def start_dir(self, co):
        """Where the state copy of this agent's notes is kept as it was when the agent started in co."""
        return self.common / 'coder-fleet' / 'memory-start' / record_key(co) / self.dir

    def record_start(self, co):
        """Keeps the state copy of every note this agent was handed at its start, as a base to merge from."""
        root = self.start_dir(co)
        shutil.rmtree(str(root), ignore_errors=True)
        self.check_state_tree()
        prefix = '/'.join(self.root_parts()) + '/'
        for name, data in self.snapshot():
            target = root / name[len(prefix):]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)

    def harvest(self, co, rel):
        """Merges co's copy of rel into the state worktree. True when the state copy changed.

        Every path is walked one component at a time with O_NOFOLLOW from a
        directory descriptor, on the source side and the state side alike, so a
        symlink anywhere on either path stops the carry rather than leading it
        out of the tree, and a swap after a check finds nothing to follow.
        """
        parts = rel_parts(rel)
        theirs = self.read_rel(co, parts)
        if theirs is None:
            return False
        self.check_state_tree()
        record = self.base_file(co, Path(*parts))
        # The known bases, copies the agent's file could have been built from:
        # what this checkout last handed over, the state copy the agent was handed
        # at its start, and the checkout's HEAD copy.
        started = self.start_dir(co) / Path(*parts)
        last = record.read_bytes() if record.is_file() else None
        # Only this session's own record is a base, or makes a copy back at its
        # start or HEAD copy an edit taken back.
        mine = last if last is not None and self.record_is_mine(co, Path(*parts)) else None
        loaded = [started.read_bytes()] if started.is_file() else []
        code, head, _ = git(co, 'show', 'HEAD:' + '/'.join(self.root_parts() + parts))
        if code == 0:
            loaded.append(head)
        candidates = ([last] if last is not None else []) + loaded
        dst_dir = open_dir(self.state, self.root_parts() + parts[:-1], create=True)
        try:
            ours = read_at(dst_dir, parts[-1])
            if ours is None:
                # Gone from the state branch. A copy the agent never changed is
                # that deletion reaching it late, and stays deleted; a changed
                # one is the agent's edit, and comes back.
                result = None if theirs in candidates else theirs
            elif ours == theirs or theirs == last or (mine is None and theirs in loaded):
                # Nothing new from the agent: its copy is what this checkout last
                # handed over or, before this session's first hand-over, the start
                # or HEAD copy it was given. After a hand-over, a copy back at its
                # start or HEAD copy is the agent taking its own edit back, and is
                # carried.
                result = None
            elif mine is None and not loaded:
                # A note no base knows of, made here and on the state branch at once.
                result = merge(ours, b'', theirs)
            else:
                # The agent's file on disk grew from what this session last
                # handed over; before any hand-over, from its start or HEAD copy.
                base = mine if mine is not None else closest_base(loaded, theirs)
                # A state copy untouched since that base makes the agent's copy
                # its edit of it, taken exactly whatever share of lines it kept.
                result = theirs if ours == base else merge(ours, base, theirs)
            if result is not None:
                write_at(dst_dir, parts[-1], result)
        finally:
            os.close(dst_dir)
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_bytes(theirs)
        if fold(co) == fold(self.main):
            owner = self.owner_file(co, Path(*parts))
            owner.parent.mkdir(parents=True, exist_ok=True)
            owner.write_text(str(self.event.get('session_id') or ''), encoding='utf-8')
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

    def snapshot(self):
        """Every note in the state worktree's memory directory for this agent, as (path, bytes).

        Read by this process through directory descriptors with O_NOFOLLOW and
        a one-link check, so what is committed is exactly what was read here,
        never what a path leads to when git looks later.
        """
        out = []

        def walk(fd, prefix):
            for name in sorted(os.listdir(fd)):
                if name.endswith('.memory-tmp'):
                    continue
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    sub_fd = os.open(name, DIR_FLAGS, dir_fd=fd)
                    try:
                        walk(sub_fd, prefix + (name,))
                    finally:
                        os.close(sub_fd)
                elif stat.S_ISREG(info.st_mode):
                    data = read_at(fd, name)
                    if data is not None:
                        out.append(('/'.join(prefix + (name,)), data))
                else:
                    raise Unsafe('%s is neither a file nor a directory' % '/'.join(prefix + (name,)))

        try:
            fd = open_dir(self.state, self.root_parts())
        except Unsafe:
            if (self.state / MEM_REL / self.dir).exists():
                raise
            return out
        try:
            walk(fd, self.root_parts())
        finally:
            os.close(fd)
        return out

    def commit(self):
        """Commits this agent's memory on the state branch from content read here, never by path.

        The tree is built in a private index from blobs this process hashed,
        the commit made with commit-tree, and the branch moved with a
        compare-and-swap update-ref, so a board commit racing it is never
        overwritten and nothing git re-reads from the working tree is committed.
        """
        if not self.commits_on():
            return
        path = '/'.join(self.root_parts())
        ref = 'refs/heads/' + STATE_BRANCH
        err = b''
        with Lock(self.common / 'coder-fleet' / BOARD_LOCK) as lock:
            for attempt in range(6):
                lock.touch()
                self.check_state_tree()
                notes = self.snapshot()
                code, head, err = git(self.state, 'rev-parse', '--verify', ref)
                if code != 0:
                    break
                head = head.decode().strip()
                with tempfile.TemporaryDirectory() as tmp:
                    index = os.path.join(tmp, 'index')
                    if git(self.state, 'read-tree', head, index=index)[0] != 0:
                        break
                    code, listed, _ = git(self.state, 'ls-files', '-z', '--', path, index=index)
                    if listed:
                        git(self.state, 'update-index', '--force-remove', '-z', '--stdin', data=listed, index=index)
                    info = b''
                    for name, data in notes:
                        code, blob, err = git(self.state, 'hash-object', '-w', '--stdin', data=data)
                        if code != 0:
                            raise RuntimeError('git hash-object failed: %s' % err.decode(errors='replace'))
                        info += b'100644 ' + blob.strip() + b'\t' + name.encode() + b'\0'
                    if info and git(self.state, 'update-index', '-z', '--index-info', data=info, index=index)[0] != 0:
                        break
                    code, tree, err = git(self.state, 'write-tree', index=index)
                if code != 0:
                    break
                tree = tree.decode().strip()
                if git(self.state, 'rev-parse', head + '^{tree}')[1].decode().strip() == tree:
                    return
                code, new, err = git(self.state, 'commit-tree', tree, '-p', head,
                                     '-m', 'Record %s memory' % self.dir, '-m', 'Board-Writer: memory')
                if code != 0:
                    break
                new = new.decode().strip()
                code, _, err = git(self.state, 'update-ref', '-m', 'memory', ref, new, head)
                if code == 0:
                    schedule_push(self.state)
                    # The state worktree's own index takes the new entries from the
                    # commit, never from the working tree.
                    for _ in range(6):
                        if git(self.state, 'reset', '-q', '--', path)[0] == 0:
                            return
                        time.sleep(0.2)
                    log('memory committed on %s but the state worktree index was not refreshed' % STATE_BRANCH)
                    return
                time.sleep(0.2 * (attempt + 1))
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
        try:
            os.close(open_dir(co, self.root_parts()))
        except Unsafe:
            return []
        out = []
        for d, dirs, names in os.walk(root):
            dirs[:] = [n for n in dirs if not (Path(d) / n).is_symlink()]
            for n in names:
                p = Path(d) / n
                if p.is_file() and not p.is_symlink() and not n.endswith('.memory-tmp'):
                    out.append(p.relative_to(root))
        return sorted(out)


def closest_base(candidates, theirs):
    """The copy the agent's copy was built from: the one most of whose lines it
    kept, and of those the one it lost fewest lines of. A prune keeps more of
    the copy it pruned than of a shorter one it happens to share lines with; an
    edit of a shorter copy loses less of it than of a longer one beside it. Ties
    go to the earlier candidate."""
    target = theirs.splitlines(keepends=True)
    best, best_score = None, None
    for cand in candidates:
        lines = cand.splitlines(keepends=True)
        matcher = difflib.SequenceMatcher(None, lines, target, autojunk=False)
        kept = sum(block.size for block in matcher.get_matching_blocks())
        score = (kept, kept - len(lines))
        if best_score is None or score > best_score:
            best, best_score = cand, score
    return best


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
    """board.lock, taken and judged stale exactly as state-worktree.ts does.

    Breaking a stale lock is atomic: it is renamed to a tombstone of this
    process's own, and deleted only if the tombstone still names the holder it
    was judged stale for; a lock somebody took in between goes back. A lock
    path that is not a plain directory is refused at once, and a release
    removes the lock only while its pid file still names this process.
    """

    def __init__(self, path):
        self.path = path

    def holder(self, path=None):
        try:
            return int(((path or self.path) / 'pid').read_text().strip())
        except (OSError, ValueError):
            return None

    def plain_dir(self, path=None):
        """True when the lock path is a directory and no symlink; False when it is gone; Unsafe otherwise."""
        try:
            info = os.lstat(str(path or self.path))
        except FileNotFoundError:
            return False
        if not stat.S_ISDIR(info.st_mode):
            raise Unsafe('%s is not a lock directory' % (path or self.path))
        return True

    def stale(self):
        try:
            age = time.time() - os.lstat(str(self.path)).st_mtime
        except OSError:
            return False
        pid = self.holder()
        if pid is None:
            return age > LOCK_PID_GRACE
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        except OSError:
            pass
        return age > LOCK_STALE

    def break_stale(self, judged):
        """Removes the lock if it still belongs to `judged`, the holder it was found stale for."""
        tomb = self.path.with_name('%s.stale-%d-%s' % (self.path.name, os.getpid(), secrets.token_hex(4)))
        try:
            os.rename(str(self.path), str(tomb))
        except FileNotFoundError:
            return
        if self.holder(tomb) == judged:
            shutil.rmtree(str(tomb))
            return
        # Taken between the check and the rename: it is somebody's live lock.
        try:
            os.rename(str(tomb), str(self.path))
        except OSError as error:
            log('a board lock taken while it was being broken could not be put back (%s); it is at %s' % (error, tomb))

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.time() + LOCK_WAIT
        while True:
            try:
                os.mkdir(str(self.path))
            except FileExistsError:
                pass
            else:
                fd = os.open(str(self.path / 'pid'), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
                with os.fdopen(fd, 'w') as fh:
                    fh.write('%d\n' % os.getpid())
                return self
            if self.plain_dir():
                judged = self.holder()
                if self.stale():
                    self.break_stale(judged)
                    if not self.plain_dir():
                        continue
            if time.time() > deadline:
                raise RuntimeError('the board lock %s is held' % self.path)
            time.sleep(0.05)

    def touch(self):
        """Keeps a held lock young, as touchLock does, so a long hold is not judged stale."""
        if self.holder() == os.getpid():
            try:
                os.utime(str(self.path))
            except OSError:
                pass

    def __exit__(self, *exc):
        try:
            if self.plain_dir() and self.holder() == os.getpid():
                shutil.rmtree(str(self.path))
        except (Unsafe, OSError) as error:
            log('the board lock %s was not released: %s' % (self.path, error))


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
    # The exact spelling Claude Code gave the agent, never a case-folded match:
    # folding would make a relative path with .. in it.
    prefix = str(repo.mem(co)) + os.sep
    if not str(target).startswith(prefix):
        return
    rel = str(target)[len(prefix):]
    if fold(co) != fold(repo.state):
        repo.harvest(co, rel)
    else:
        rel_parts(rel)
        repo.check_state_tree()
    repo.commit()


def do_start(repo):
    co = holding(repo.cwd, repo.cos)
    if co is None or fold(co) == fold(repo.state):
        return
    if fold(co) != fold(repo.main):
        repo.fence(co)
    try:
        repo.record_start(co)
    except (Unsafe, OSError) as error:
        log('no start copy of the memory kept: %s' % error)
    try:
        repo.check_state_tree()
        text = repo.read_rel(repo.state, ('MEMORY.md',))
    except Unsafe as error:
        log('no memory index handed over: %s' % error)
        return
    if text is None:
        return
    try:
        loaded = repo.read_rel(co, ('MEMORY.md',))
    except Unsafe:
        loaded = None
    if loaded == text:
        return
    lines = text.decode('utf-8', errors='replace').splitlines()[:INDEX_LINES]
    index = '\n'.join(lines)[:INDEX_BYTES]
    event_name = repo.event.get('hook_event_name') or 'SubagentStart'
    if event_name not in ('SubagentStart', 'SessionStart'):
        return
    context = (
        'Your memory index on the state branch is newer than the MEMORY.md loaded with you, or none was '
        'loaded because the project keeps memory out of its history. This is the current one. A note it '
        'names that your memory directory lacks is at %s/, readable there. Keep writing your memory where '
        'Claude Code put it: a hook carries each change to the state branch, commits it there and pushes '
        'that branch.\n\n%s' % (repo.mem(repo.state), index))
    print(json.dumps({'hookSpecificOutput': {'hookEventName': event_name, 'additionalContext': context}}))


def do_stop(repo):
    co = holding(repo.cwd, repo.cos)
    if co is None or fold(co) == fold(repo.state):
        return
    carried = []
    for rel in repo.files(co):
        try:
            repo.harvest(co, str(rel))
            carried.append(str(rel))
        except Exception as error:  # one file that cannot be carried keeps the rest moving
            log('could not carry %s to the state worktree: %s' % (repo.mem(co) / rel, error))
    repo.commit()
    if fold(co) != fold(repo.main):
        return
    for rel in carried:
        try:
            restore(repo, co, rel_parts(rel))
        except (Unsafe, OSError) as error:
            log('left %s in place: %s' % (repo.mem(co) / rel, error))


def restore(repo, co, parts):
    """Puts one carried main-checkout file back as the default branch has it, descriptor-relative."""
    record = repo.base_file(co, Path(*parts))
    if not record.is_file() or repo.read_rel(repo.state, parts) is None:
        return
    code, head, _ = git(co, 'show', 'HEAD:' + '/'.join(repo.root_parts() + parts))
    full = repo.root_parts() + parts[:-1]
    fd = open_dir(co, full)
    try:
        if read_at(fd, parts[-1]) != record.read_bytes():
            return
        if code == 0:
            write_at(fd, parts[-1], head)
        else:
            os.unlink(parts[-1], dir_fd=fd)
    finally:
        os.close(fd)
    record.unlink()
    try:
        repo.owner_file(co, Path(*parts)).unlink()
    except FileNotFoundError:
        pass
    if code != 0:
        # Empty directories the file leaves, up to and including the agent's own.
        for depth in range(len(full) - 1, len(MEM_REL.parts) - 1, -1):
            parent = open_dir(co, full[:depth])
            try:
                os.rmdir(full[depth], dir_fd=parent)
            except OSError:
                break
            finally:
                os.close(parent)


def do_prune(args):
    """Removes the records of every checkout git no longer lists. Returns the exit code.

    Run from inside the repository. Arguments other than --dry-run are worktree
    paths to count as gone, the ones a dry run of prune-worktrees.sh would
    remove. Only directories named like a record, directly under
    <common git dir>/coder-fleet/memory-start/ and memory-base/, reached with no
    symlink, are removed; the main checkout's and the state worktree's are kept
    whatever git lists. One tab-separated line per record:
    memory <area>/<key>, or would-delete-memory under --dry-run, or
    refused <path> <reason>.
    """
    dry = '--dry-run' in args
    main, common = main_checkout(os.getcwd())
    if main is None:
        sys.stderr.write('memory-state.py prune: not inside a git repository with a main checkout\n')
        return 2
    code, out, err = git(main, 'worktree', 'list', '--porcelain', '-z')
    if code != 0:
        sys.stderr.write('memory-state.py prune: git worktree list failed: %s\n' % err.decode(errors='replace').strip())
        return 1
    gone = {fold(resolve(a)) for a in args if a != '--dry-run'}
    keep = {fold(main), fold(main / STATE_REL)}
    live = {record_key(main), record_key(main / STATE_REL)}
    for field in out.decode(errors='replace').split('\0'):
        if field.startswith('worktree '):
            tree = resolve(field[len('worktree '):])
            if fold(tree) in keep or fold(tree) not in gone:
                live.add(record_key(tree))
    for area in RECORD_AREAS:
        try:
            fd = open_dir(common, ('coder-fleet', area))
        except Unsafe:
            # Never made, or not a plain directory: nothing of ours to remove.
            continue
        try:
            for name in sorted(os.listdir(fd)):
                if not RECORD_NAME.fullmatch(name) or name in live:
                    continue
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if not stat.S_ISDIR(info.st_mode):
                    continue
                label = '%s/%s' % (area, name)
                if dry:
                    print('would-delete-memory\t%s' % label)
                    continue
                try:
                    if sys.version_info >= (3, 11):
                        shutil.rmtree(name, dir_fd=fd)
                    else:
                        shutil.rmtree(str(common / 'coder-fleet' / area / name))
                except OSError as error:
                    print('refused\t%s\t%s' % (common / 'coder-fleet' / label, error))
                    continue
                print('memory\t%s' % label)
        finally:
            os.close(fd)
    return 0


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    event = json.load(sys.stdin)
    repo = Repo(event)
    if not repo.ready or not repo.dir:
        return
    {'post': do_post, 'start': do_start, 'stop': do_stop}.get(mode, lambda r: None)(repo)


if __name__ == '__main__':
    if sys.argv[1:2] == ['prune']:
        # Not a hook: run by prune-worktrees.sh, which reports what it says.
        sys.exit(do_prune(sys.argv[2:]))
    try:
        main()
    except Exception as error:
        log('memory hook failed: %s' % error)
    sys.exit(0)
