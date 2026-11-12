#!/usr/bin/env python3
"""fleet-exclude.py - keep the fleet's files out of a project's history (CF-201).

/init runs this from the project root. The board (.boards/), the fleet's agent
memory (.claude/agent-memory/coder-fleet-*/), each rule file the plugin
installs under .claude/rules/, .claude/coder-fleet.json, docs/specs/ and
docs/runs/ are listed in the common git dir's info/exclude. That file is shared
by every linked worktree, the state worktree included, and is never committed,
and it hides untracked files only. The board and the memory are committed on
the coder-fleet/state branch instead; .claude/settings.json and AGENTS.md are
not listed and stay committed.

Modes:

  status   One line per tracked group (`tracked <path> <n> file(s)`), one per
           .gitignore line an earlier /init wrote (`gitignore <line>`), one per
           entry (`present <entry>` or `missing <entry>`), and last
           `state: excluded`, `state: needs-migration` or `state: not-excluded`.
  write    Appends every missing entry under one header. Prints `added` or
           `present` per entry. Refuses, exit 1, writing nothing, while any of
           those paths is tracked or an old .gitignore line is there: the
           project is half set up until `migrate` runs.
  migrate  From the main checkout only, with nothing else staged: untracks
           every tracked path above with `git rm --cached` (the files stay on
           disk), removes the old .gitignore lines, writes the exclude, and
           commits the removals and the .gitignore change as one commit. The
           coder-fleet/state branch is never touched. With nothing to migrate
           it writes the exclude, says so and commits nothing.

Exit codes: 0 done, 1 refused and nothing changed, 2 usage, 3 a git step failed
and what this run changed was put back.
"""

import os
import subprocess
import sys

HEADER = '# coder-fleet: kept out of this project\'s history; the board and memory are on coder-fleet/state'
FIXED = ['/.boards/', '/.claude/agent-memory/coder-fleet-*/']
AFTER_RULES = ['/.claude/coder-fleet.json', '/docs/specs/', '/docs/runs/']
# The lines /init wrote to the root .gitignore before CF-201: docs/runs/ in
# step 2, and .boards/ and .claude/agent-memory/ on an ignore answer in step 2a.
OLD_GITIGNORE = ['docs/runs/', '.boards/', '.claude/agent-memory/']
SUBJECT = 'Keep the fleet\'s board, memory, rules, config and specs out of this project\'s history'
BODY = ('They stay on disk, are listed in the common git dir\'s info/exclude, and the board and the agents\' '
        'memory are committed on the coder-fleet/state branch.')
PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Refusal(Exception):
    pass


class GitFailed(Exception):
    pass


def git(cwd, *args, data=None, check=True):
    env = {k: v for k, v in os.environ.items() if k not in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE')}
    p = subprocess.run(['git', '-C', cwd, *args], input=data, capture_output=True, env=env)
    if check and p.returncode != 0:
        raise GitFailed('git %s: %s' % (' '.join(args), (p.stderr or p.stdout).decode(errors='replace').strip()))
    return p


def entries():
    rules = os.path.join(PLUGIN_ROOT, 'templates', 'rules')
    try:
        names = sorted(n for n in os.listdir(rules) if os.path.isfile(os.path.join(rules, n)))
    except OSError:
        names = []
    return FIXED + ['/.claude/rules/%s' % n for n in names] + AFTER_RULES


def pathspecs(wanted):
    """The pathspecs that find a tracked copy of each entry, from the top level."""
    out = []
    for e in wanted:
        rel = e.lstrip('/').rstrip('/')
        out.append(':(top,glob)%s/**' % rel if e.endswith('/') else ':(top,literal)%s' % rel)
    return out


def group_of(path, wanted):
    """The entry a tracked path falls under, spelled as the path it names: `.boards/`, `.claude/agent-memory/coder-fleet-coder/`."""
    if path.startswith('.claude/agent-memory/'):
        return '/'.join(path.split('/')[:3]) + '/'
    for e in wanted:
        rel = e.lstrip('/')
        if rel.endswith('/') and path.startswith(rel):
            return rel
    return path


class Repo:
    def __init__(self, cwd):
        p = git(cwd, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir',
                check=False)
        if p.returncode != 0:
            raise Refusal('%s is not inside a git repository with a working tree, so there is nothing to exclude' % cwd)
        self.top, gitdir, common = p.stdout.decode().splitlines()[:3]
        self.main = os.path.realpath(gitdir) == os.path.realpath(common)
        self.exclude = os.path.join(common, 'info', 'exclude')
        self.gitignore = os.path.join(self.top, '.gitignore')
        self.wanted = entries()

    def tracked(self):
        out = git(self.top, 'ls-files', '-z', '--', *pathspecs(self.wanted)).stdout.decode()
        return [p for p in out.split('\0') if p]

    def groups(self, files):
        counts = {}
        for f in files:
            g = group_of(f, self.wanted)
            counts[g] = counts.get(g, 0) + 1
        return counts

    def read(self, path):
        try:
            with open(path, encoding='utf-8') as fh:
                return fh.read()
        except FileNotFoundError:
            return None

    def write_text(self, path, text):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(text)

    def old_lines(self):
        text = self.read(self.gitignore) or ''
        found = []
        for line in text.splitlines():
            line = line.rstrip('\r').rstrip()
            if line in OLD_GITIGNORE and line not in found:
                found.append(line)
        return found

    def present(self):
        lines = {l.strip() for l in (self.read(self.exclude) or '').splitlines()}
        return {e for e in self.wanted if e in lines or e.lstrip('/') in lines}

    def add_entries(self):
        """Appends the missing entries; returns (added, present)."""
        text = self.read(self.exclude) or ''
        have = self.present()
        missing = [e for e in self.wanted if e not in have]
        if missing:
            sep = '' if not text or text.endswith('\n') else '\n'
            header = '' if HEADER in text.splitlines() else HEADER + '\n'
            self.write_text(self.exclude, text + sep + header + ''.join(e + '\n' for e in missing))
        return missing, [e for e in self.wanted if e in have]


def say_entries(added, present):
    for e in added:
        print('added %s' % e)
    for e in present:
        print('present %s' % e)


def status(repo):
    files = repo.tracked()
    for g, n in sorted(repo.groups(files).items()):
        print('tracked %s %d file(s)' % (g, n))
    old = repo.old_lines()
    for line in old:
        print('gitignore %s' % line)
    have = repo.present()
    for e in repo.wanted:
        print('%s %s' % ('present' if e in have else 'missing', e))
    if files or old:
        print('state: needs-migration')
    elif len(have) == len(repo.wanted):
        print('state: excluded')
    else:
        print('state: not-excluded')
    return 0


def write(repo):
    if repo.tracked() or repo.old_lines():
        raise Refusal('the project is half set up: the fleet\'s files are still tracked, or the .gitignore still has the '
                      'lines an earlier /init wrote, so nothing was written; run `fleet-exclude.py migrate` once the human '
                      'agrees to the one commit it makes, then this is done')
    say_entries(*repo.add_entries())
    return 0


def migrate(repo):
    if not repo.main:
        raise Refusal('%s is a linked worktree; run migrate from the main checkout, whose branch takes the commit' % repo.top)
    files = repo.tracked()
    old = repo.old_lines()
    if not files and not old:
        say_entries(*repo.add_entries())
        print('nothing to migrate: none of the fleet\'s files is tracked and the .gitignore has none of the old lines')
        return 0
    if git(repo.top, 'diff', '--cached', '--quiet', check=False).returncode != 0:
        raise Refusal('something else is staged, and the migration commits on its own; commit or unstage it, then run '
                      'migrate again. Nothing was changed')
    exclude_before = repo.read(repo.exclude)
    gitignore_before = repo.read(repo.gitignore)
    try:
        if files:
            git(repo.top, 'rm', '-r', '--cached', '-q', '--pathspec-from-file=-', '--pathspec-file-nul',
                data=''.join(f + '\0' for f in files).encode())
        if old:
            kept = [l for l in (gitignore_before or '').splitlines(keepends=True)
                    if l.rstrip('\r\n').rstrip() not in OLD_GITIGNORE]
            repo.write_text(repo.gitignore, ''.join(kept))
            git(repo.top, 'add', '--', '.gitignore')
        added, present = repo.add_entries()
        git(repo.top, 'commit', '-q', '-m', SUBJECT, '-m', BODY, '-m', 'Board-Writer: init')
    except GitFailed:
        git(repo.top, 'reset', '-q', '--', *(files + (['.gitignore'] if old else [])), check=False)
        if gitignore_before is not None:
            repo.write_text(repo.gitignore, gitignore_before)
        if exclude_before is None:
            try:
                os.unlink(repo.exclude)
            except FileNotFoundError:
                pass
        else:
            repo.write_text(repo.exclude, exclude_before)
        raise
    for g, n in sorted(repo.groups(files).items()):
        print('untracked %s %d file(s), kept on disk' % (g, n))
    for line in old:
        print('removed .gitignore line %s' % line)
    say_entries(added, present)
    sha = git(repo.top, 'rev-parse', '--short', 'HEAD').stdout.decode().strip()
    print('committed %s "%s"' % (sha, SUBJECT))
    return 0


def main(argv):
    modes = {'status': status, 'write': write, 'migrate': migrate}
    if len(argv) != 1 or argv[0] not in modes:
        sys.stderr.write('usage: fleet-exclude.py status|write|migrate\n')
        return 2
    try:
        return modes[argv[0]](Repo(os.getcwd()))
    except Refusal as error:
        print('refused: %s' % error)
        return 1
    except GitFailed as error:
        print('failed, and what this run changed was put back: %s' % error)
        return 3


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
