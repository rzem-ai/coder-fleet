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


SPECS_REL = Path('docs') / 'specs'
SPEC_RECORDS = 'spec-base.json'
SPEC_MODES = {0o100644, 0o100755}


SPEC_BAD_CHARS = re.compile(r'[\x00-\x1f\x7f\\]')


def spec_refused(parts, leaf):
    """Why a path under docs/specs/ is never carried, or None: the rule state-worktree.ts specRefused applies
    to a restore. No component starting with a dot (editor leftovers, this hook's own temporary files, .git
    in any case), no .git with trailing dots or spaces, none ending in ~, none with a control character or a
    backslash; and a file must be a .md, as every spec is."""
    for part in parts:
        if part in ('', '.', '..') or part.startswith('.'):
            return 'a component starting with a dot'
        if part.rstrip('. ').lower() == '.git':
            return 'a .git component'
        if part.endswith('~'):
            return 'an editor backup'
        if SPEC_BAD_CHARS.search(part):
            return 'a control character or backslash'
    if leaf and (len(parts[-1]) <= 3 or not parts[-1].lower().endswith('.md')):
        return 'not a .md file'
    return None


class Specs:
    """Carries the main checkout's docs/specs/ to the state branch (CF-201.1).

    A project that keeps docs/specs/ out of its history has its specs in the
    main checkout alone, written there by the lead, spec-writer, the spec
    editors and the human. This commits them on coder-fleet/state, which
    state-push.sh pushes, and nowhere else. It never writes the main checkout:
    the board puts a spec back there, only where none is, when a clone adopts
    the state branch (state-worktree.ts restoreSpecs).

    Each spec is compared by blob id with the state branch's tip and with the
    record, the copy the two last agreed on here, kept in
    <common git dir>/coder-fleet/spec-base.json:

      - local equals the tip: nothing to carry; the record takes it;
      - local equals the record: unchanged here, so a tip that moved since came
        from elsewhere and is kept; the local copy is left and the log says so;
      - otherwise the local copy is an edit, carried when the tip has none,
        still equals the record, or was committed before the file's mtime; a
        tip newer than the local file is kept and the local copy left;
      - gone locally with the tip still at the record: removed from the branch,
        as a spec goes once its item is Done; a tip that moved is kept.

    Nothing is lost: a carried copy replaces the tip, whose bytes stay in the
    branch's history, and no state copy is ever written over a local file.
    """

    def __init__(self, repo):
        self.repo = repo
        self.main, self.state, self.common = repo.main, repo.state, repo.common
        code, out, _ = git(self.main, 'rev-parse', '--show-object-format')
        self.hash = out.decode().strip() if code == 0 and out.strip() else 'sha1'

    def blob_id(self, data):
        return hashlib.new(self.hash, b'blob %d\0' % len(data) + data).hexdigest()

    def not_carried(self):
        """Why specs are not carried in this project, or None when they are."""
        code, out, _ = git(self.main, 'ls-files', '-z', '--', SPECS_REL.as_posix())
        if code != 0:
            return 'git ls-files failed in %s' % self.main
        if out:
            return ('the default branch still tracks docs/specs/, so the project is not migrated yet; '
                    '/coder-fleet:init migrates it')
        if git(self.main, 'check-ignore', '-q', '--no-index', '--', (SPECS_REL / 'x.md').as_posix())[0] != 0:
            return 'docs/specs/ is not excluded in %s, so the project is not migrated yet; /coder-fleet:init excludes it' % self.main
        return None

    def local(self):
        """({rel: (blob id, mtime)}, skipped rels, whether docs/specs/ is there) for the main checkout."""
        files, skipped = {}, []
        try:
            fd = open_dir(self.main, SPECS_REL.parts)
        except Unsafe:
            if os.path.lexists(str(self.main / SPECS_REL)):
                log('specs not carried: %s is not a plain directory' % (self.main / SPECS_REL))
                skipped.append('')
            return files, skipped, False

        def walk(dirfd, prefix):
            for name in sorted(os.listdir(dirfd)):
                rel = '/'.join(prefix + (name,))
                info = os.stat(name, dir_fd=dirfd, follow_symlinks=False)
                if spec_refused(prefix + (name,), not stat.S_ISDIR(info.st_mode)):
                    continue
                if stat.S_ISDIR(info.st_mode):
                    sub = os.open(name, DIR_FLAGS, dir_fd=dirfd)
                    try:
                        walk(sub, prefix + (name,))
                    finally:
                        os.close(sub)
                    continue
                try:
                    data = read_at(dirfd, name) if stat.S_ISREG(info.st_mode) else None
                except Unsafe as error:
                    data = None
                    log('spec not carried: %s' % error)
                if data is None:
                    skipped.append(rel)
                    if not stat.S_ISREG(info.st_mode):
                        log('spec not carried: %s is not a regular file' % (self.main / SPECS_REL / rel))
                    continue
                files[rel] = (self.blob_id(data), info.st_mtime)

        try:
            walk(fd, ())
        finally:
            os.close(fd)
        return files, skipped, True

    def tip(self):
        """(commit, {rel: blob id}) for the state branch's docs/specs/."""
        code, head, _ = git(self.main, 'rev-parse', '--verify', '-q', 'refs/heads/' + STATE_BRANCH)
        if code != 0:
            return None, {}
        head = head.decode().strip()
        code, out, _ = git(self.main, 'ls-tree', '-r', '-z', '--full-tree', head, '--', SPECS_REL.as_posix())
        found = {}
        prefix = SPECS_REL.as_posix() + '/'
        for entry in out.decode(errors='surrogateescape').split('\0') if code == 0 else []:
            meta, _, path = entry.partition('\t')
            fields = meta.split()
            if len(fields) == 3 and fields[1] == 'blob' and int(fields[0], 8) in SPEC_MODES and path.startswith(prefix) \
                    and spec_refused(tuple(path[len(prefix):].split('/')), True) is None:
                found[path[len(prefix):]] = fields[2]
        return head, found

    def records(self):
        """(agreed, noted): the blob id each spec last agreed on here, and the divergence each was last logged for."""
        try:
            fd = open_dir(self.common, ('coder-fleet',))
        except Unsafe:
            return {}, {}
        try:
            data = read_at(fd, SPEC_RECORDS)
        except Unsafe as error:
            log('spec records ignored: %s' % error)
            return {}, {}
        finally:
            os.close(fd)
        try:
            value = json.loads(data.decode()) if data else {}
        except ValueError:
            value = {}
        if not isinstance(value, dict):
            value = {}

        def strings(key):
            part = value.get(key)
            return {k: v for k, v in part.items() if isinstance(k, str) and isinstance(v, str)} if isinstance(part, dict) else {}

        return strings('agreed'), strings('noted')

    def save_records(self, agreed, noted):
        fd = open_dir(self.common, ('coder-fleet',), create=True)
        try:
            write_at(fd, SPEC_RECORDS, json.dumps({'agreed': agreed, 'noted': noted}, sort_keys=True, indent=0).encode())
        finally:
            os.close(fd)

    def committed_at(self, head, rel):
        code, out, _ = git(self.main, 'log', '-1', '--format=%ct', head, '--', (SPECS_REL / rel).as_posix())
        try:
            return int(out.decode().strip()) if code == 0 else None
        except ValueError:
            return None

    def plan(self, head, local, skipped, present, tip, records):
        """(carry, drop, records after, {rel: (divergence key, log line)})."""
        carry, drop, after, notes = [], [], dict(records), {}
        held = lambda rel: any(s == '' or rel == s or rel.startswith(s + '/') for s in skipped)
        for rel in sorted(set(local) | set(tip) | set(records)):
            mine, theirs, base = local.get(rel, (None, 0))[0], tip.get(rel), records.get(rel)
            if mine is not None:
                if mine == theirs:
                    after[rel] = mine
                elif mine == base:
                    notes[rel] = ('%s:%s' % (mine, theirs or '-'),
                                  'kept the state branch copy of docs/specs/%s, changed elsewhere since this checkout '
                                  'carried it; the main checkout copy is left as it is' % rel
                                  if theirs else
                                  'docs/specs/%s was removed from the state branch elsewhere; the main checkout copy '
                                  'is left as it is and not carried again' % rel)
                elif theirs is None or theirs == base:
                    carry.append(rel)
                else:
                    when = self.committed_at(head, rel)
                    if when is None or local[rel][1] >= when:
                        carry.append(rel)
                    else:
                        notes[rel] = ('%s:%s' % (mine, theirs), 'kept the state branch copy of docs/specs/%s, newer '
                                      'than the main checkout copy, which is left as it is and not carried' % rel)
            elif held(rel) or not present:
                continue
            elif base is not None:
                if theirs == base:
                    drop.append(rel)
                after.pop(rel, None)
        return carry, drop, after, notes

    def sweep(self):
        if not self.repo.commits_on():
            return

        def look():
            local, skipped, present = self.local()
            head, tip = self.tip()
            agreed, noted = self.records()
            if head is None:
                return None
            carry, drop, after, notes = self.plan(head, local, skipped, present, tip, agreed)
            heard = {rel: key for rel, (key, _) in notes.items()}
            return head, carry, drop, agreed, after, noted, heard, notes

        seen = look()
        if seen is None:
            return
        _, carry, drop, agreed, after, noted, heard, _ = seen
        if not carry and not drop and after == agreed and heard == noted:
            return
        with Lock(self.common / 'coder-fleet' / BOARD_LOCK) as lock:
            seen = look()
            if seen is None:
                return
            head, carry, drop, agreed, after, noted, heard, notes = seen
            for rel, (key, line) in sorted(notes.items()):
                if noted.get(rel) != key:
                    log(line)
            if carry or drop:
                blobs = self.write_state(carry, drop)
                if not self.commit(lock, head, blobs, drop):
                    return
                after.update(blobs)
            if after != agreed or heard != noted:
                self.save_records(after, heard)

    def write_state(self, carry, drop):
        """Puts each carried spec in the state worktree and takes each dropped one out; returns {rel: blob id}."""
        blobs = {}
        for rel in carry:
            parts = rel_parts(rel)
            src = open_dir(self.main, SPECS_REL.parts + parts[:-1])
            try:
                data = read_at(src, parts[-1])
            finally:
                os.close(src)
            if data is None:
                continue
            dst = open_dir(self.state, SPECS_REL.parts + parts[:-1], create=True)
            try:
                write_at(dst, parts[-1], data)
            finally:
                os.close(dst)
            code, blob, err = git(self.state, 'hash-object', '-w', '--stdin', data=data)
            if code != 0:
                raise RuntimeError('git hash-object failed: %s' % err.decode(errors='replace'))
            blobs[rel] = blob.decode().strip()
        for rel in drop:
            parts = rel_parts(rel)
            try:
                fd = open_dir(self.state, SPECS_REL.parts + parts[:-1])
            except Unsafe:
                continue
            try:
                os.unlink(parts[-1], dir_fd=fd)
            except FileNotFoundError:
                pass
            finally:
                os.close(fd)
        return blobs

    def commit(self, lock, head, blobs, drop):
        """One commit on the state branch from exactly these blobs, by compare-and-swap. True when it landed or had nothing to do."""
        ref = 'refs/heads/' + STATE_BRANCH
        path = SPECS_REL.as_posix()
        lock.touch()
        with tempfile.TemporaryDirectory() as tmp:
            index = os.path.join(tmp, 'index')
            code, _, err = git(self.state, 'read-tree', head, index=index)
            if code == 0 and drop:
                data = b''.join(('%s/%s' % (path, rel)).encode() + b'\0' for rel in drop)
                code, _, err = git(self.state, 'update-index', '--force-remove', '-z', '--stdin', data=data, index=index)
            if code == 0 and blobs:
                info = b''.join(b'100644 ' + blob.encode() + b'\t' + ('%s/%s' % (path, rel)).encode() + b'\0'
                                for rel, blob in blobs.items())
                code, _, err = git(self.state, 'update-index', '-z', '--index-info', data=info, index=index)
            if code == 0:
                code, tree, err = git(self.state, 'write-tree', index=index)
        if code != 0:
            log('spec commit failed in %s: %s' % (self.state, err.decode(errors='replace').strip()))
            return False
        tree = tree.decode().strip()
        if git(self.state, 'rev-parse', head + '^{tree}')[1].decode().strip() == tree:
            return True
        names = sorted(blobs) + sorted(drop)
        code, new, err = git(self.state, 'commit-tree', tree, '-p', head, '-m',
                             'Record specs: %s' % ', '.join(names[:5]) + (' and %d more' % (len(names) - 5) if len(names) > 5 else ''),
                             '-m', 'Board-Writer: specs')
        if code == 0:
            code, _, err = git(self.state, 'update-ref', '-m', 'specs', ref, new.decode().strip(), head)
        if code != 0:
            log('spec commit failed in %s: %s' % (self.state, err.decode(errors='replace').strip()))
            return False
        schedule_push(self.state)
        for _ in range(6):
            if git(self.state, 'reset', '-q', '--', path)[0] == 0:
                return True
            time.sleep(0.2)
        log('specs committed on %s but the state worktree index was not refreshed' % STATE_BRANCH)
        return True


def do_specs(repo, mode):
    """Carries specs on a write under the main checkout's docs/specs/, and on every start and stop."""
    if mode == 'post':
        if repo.event.get('tool_name') not in WRITE_TOOLS:
            return
        data = repo.event.get('tool_input') or {}
        raw = data.get('file_path') or data.get('notebook_path')
        if not raw:
            return
        target = Path(os.path.expanduser(str(raw)))
        if not target.is_absolute():
            target = repo.cwd / target
        if not within(resolve(target), repo.main / SPECS_REL):
            return
    elif mode not in ('start', 'stop'):
        return
    specs = Specs(repo)
    why = specs.not_carried()
    if why is not None:
        if mode == 'post' or repo.event.get('hook_event_name') == 'SessionStart':
            log('specs not carried to %s: %s' % (STATE_BRANCH, why))
        return
    specs.sweep()


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
    if not repo.ready:
        return
    try:
        do_specs(repo, mode)
    except Exception as error:  # specs never keep memory from moving
        log('spec carry failed: %s' % error)
    if not repo.dir:
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
