#!/usr/bin/env python3
"""Decide whether an agent's Write may land where it is pointed.

The bash hook checks a write destination with a glob on a lexically normalised
path. That misses three things, and each of them was reachable:

  * `*/docs/specs/*` matches any project's specs directory, so spec-writer
    could write into a different repository entirely.
  * lexical normalisation collapses `..` without ever asking the filesystem,
    so a symlinked `docs/specs` pointing at `src` resolved to itself.
  * ui-designer's branch returned immediately for non-Bash tools and
    tech-writer had no branch at all - both hold Write, and Write replaces a
    source file just as thoroughly as Edit does.

Roles and their destinations:

  spec-writer    <project>/docs/specs/**            one spec, nowhere else
  spec-editor    <project>/docs/specs/**            one spec, nowhere else
  fleet-steward  <repo>/**                          its own working copy
  tech-writer    documentation: docs/**, and *.md at the project root
  tech-editor    tech-writer's scope exactly
  ui-designer    prototypes/**, plus docs/runs/** for a commissioned article

With --outside it answers for a reviewer in break or use mode, whatever the
event's agent_type: anywhere EXCEPT <project>/**, because break mode mutates
copies and use mode keeps driver scripts and screenshots out of the tree it
grades. The enforce-agent-scope.sh hook decides the mode from the reviewer's
brief and passes the flag. It is the inverted rule, so it is the only one that
needs CLAUDE_PROJECT_DIR to be set: an allowlist survives a wrong project by
being narrower than intended, a denial does not. Unset, it denies.

CODER_FLEET_OUTPUT_FILES may narrow tech-writer and ui-designer to an exact
list of commissioned files, as JSON mapping role to paths. The tech editors
read tech-writer's entry, because the files they edit are the ones it wrote:

  {"tech-writer": ["README.md", "docs/adr/001-session-refresh.md"]}

It narrows and never widens: a path outside the role's default scope is not
granted by listing it. Set it in the launching environment, never in
agent-authored content - a role that can write its own allowlist has none.
Unset, the defaults above apply, because a checker that denies everything when
unconfigured is a checker nobody will leave switched on.

With --memory it answers a different question, for any role: is the target
inside the agent's own memory directory? Every fleet agent has `memory:
project`, which Claude Code keeps at <project>/.claude/agent-memory/<agent
type>/, every character of the type outside [A-Za-z0-9_-] turned into "-"
(coder-fleet:reviewer writes to coder-fleet-reviewer/). The project is
CLAUDE_PROJECT_DIR, and also the linked worktree holding the event's cwd,
because Claude Code resolves the directory against the agent's spawn cwd and a
hook's CLAUDE_PROJECT_DIR stays the main checkout. That worktree counts only
when the project's own `git worktree list` names it under the project's
.claude/worktrees/ (case folded, symlinks resolved) and it is neither the home
directory nor a parent of it: what git says about cwd itself is not believed,
since a planted .git file can lead any directory to this repository. A memory directory that resolves anywhere else has been redirected
and is refused.

Resolution is physical (symlinks followed, via os.path.realpath) on the deepest
existing ancestor, because the file being written usually does not exist yet.
Exit 0 allows, 1 denies. Any error denies: a scope that cannot be established
is not a scope that has been satisfied.

Not covered here: writes made by a program the agent runs through Bash, and a
symlink swapped between this check and the write itself. Both need filesystem
containment, which no shell-level check provides; see docs/limits.md.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROLES = {'spec-writer', 'spec-editor', 'ui-designer', 'tech-writer', 'tech-editor', 'fleet-steward'}
SPECS_ROLES = {'spec-writer', 'spec-editor'}
# A tech editor edits tech-writer's documents in place, so it is held to
# tech-writer's scope, commissioned list included, and to nothing wider.
SCOPE_OF = {'tech-editor': 'tech-writer'}


def resolve(path):
    """Absolute, with symlinks followed as far as the path actually exists."""
    path = Path(os.path.abspath(os.path.expanduser(str(path))))
    existing = path
    tail = []
    while not existing.exists() and existing != existing.parent:
        tail.append(existing.name)
        existing = existing.parent
    real = Path(os.path.realpath(str(existing)))
    for name in reversed(tail):
        real = real / name
    return real


def inside(path, root):
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return path != root


def default_scope(role, project):
    if role == 'tech-writer':
        return [project / 'docs'], ['.md', '.mdx', '.txt']
    if role == 'ui-designer':
        return [project / 'prototypes', project / 'docs' / 'runs'], None
    return [], None


def protected_roots():
    """The fleet's state directory and Claude Code's transcripts, as the hooks
    compute them. A reviewer in break or use mode writes outside the project,
    but never here."""
    home = os.environ.get('HOME', '')
    state = os.environ.get('CODER_FLEET_STATE_DIR') or os.path.join(
        os.environ.get('XDG_STATE_HOME') or os.path.join(home, '.local', 'state'), 'coder-fleet')
    config = os.environ.get('CLAUDE_CONFIG_DIR') or os.path.join(home, '.claude')
    return [resolve(state), resolve(os.path.join(config, 'projects'))]


def configured(role, project):
    raw = os.environ.get('CODER_FLEET_OUTPUT_FILES', '')
    if not raw.strip():
        return None
    entries = json.loads(raw).get(role)
    if not entries:
        return None
    allowed = set()
    for item in entries:
        path = Path(os.path.expanduser(str(item)))
        if not path.is_absolute():
            path = project / path
        allowed.add(resolve(path))
    return allowed


def clean_git_env():
    """The environment with every GIT_* variable gone, so nothing the caller set redirects git."""
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env['GIT_CONFIG_NOSYSTEM'] = '1'
    return env


def git_out(cwd, *args):
    """A git query's output, or None when git fails or is missing."""
    try:
        p = subprocess.run(['git', '-C', str(cwd), *args], capture_output=True, text=True,
                           timeout=10, env=clean_git_env())
    except (OSError, subprocess.SubprocessError):
        return None
    return p.stdout if p.returncode == 0 else None


def folded_inside(path, root):
    """inside(), with both sides case folded, as the disk the fleet runs on folds them."""
    return inside(Path(str(path).casefold()), Path(str(root).casefold()))


def registered_worktree_of(cwd, project):
    """The linked worktree holding cwd, believed only as the main checkout registers it.

    git's own answer about cwd is not used: a .git file planted in any directory,
    leading to this repository, would pass. The candidates are the worktrees
    `git worktree list` run in the project names, and only one under the
    project's .claude/worktrees/, never the home directory or a parent of it.
    """
    listing = git_out(project, 'worktree', 'list', '--porcelain', '-z')
    if not listing:
        return None
    home = resolve(os.path.expanduser('~'))
    worktrees = project / '.claude' / 'worktrees'
    best = None
    for field in listing.split('\0'):
        if not field.startswith('worktree '):
            continue
        tree = resolve(field[len('worktree '):])
        if not folded_inside(tree, worktrees):
            continue
        if str(tree).casefold() == str(home).casefold() or folded_inside(home, tree):
            continue
        if str(cwd).casefold() == str(tree).casefold() or folded_inside(cwd, tree):
            if best is None or len(str(tree)) > len(str(best)):
                best = tree
    return best


def memory_main():
    event = json.load(sys.stdin)
    data = event.get('tool_input') or {}
    raw = data.get('file_path') or data.get('notebook_path') or data.get('path')
    cwd = event.get('cwd')
    agent_type = event.get('agent_type', '')
    if not raw or not cwd or not agent_type:
        return 1
    # Claude Code's own rule for the directory name.
    name = re.sub(r'[^a-zA-Z0-9\-_]', '-', agent_type) or 'unknown'
    configured_project = os.environ.get('CLAUDE_PROJECT_DIR')
    project = resolve(configured_project or cwd)
    projects = [project]
    # Claude Code resolves memory against the agent's spawn cwd, and a hook's
    # CLAUDE_PROJECT_DIR stays the main checkout, so an agent spawned in a
    # linked worktree keeps its memory in that worktree. That worktree counts
    # too, but only one the main checkout registers under .claude/worktrees/.
    if configured_project:
        here = registered_worktree_of(resolve(cwd), project)
        if here is not None and here != project:
            projects.append(here)
    target = Path(os.path.expanduser(str(raw)))
    if not target.is_absolute():
        target = Path(cwd) / target
    target = resolve(target)
    for base in projects:
        root = base / '.claude' / 'agent-memory' / name
        if resolve(root) != root:
            continue
        if inside(target, root):
            return 0
    return 1


def main():
    if '--memory' in sys.argv[1:]:
        return memory_main()
    event = json.load(sys.stdin)
    outside = '--outside' in sys.argv[1:]
    role = event.get('agent_type', '').split(':')[-1]
    if not outside and role not in ROLES:
        return 0
    role = SCOPE_OF.get(role, role)

    data = event.get('tool_input') or {}
    raw = data.get('file_path') or data.get('notebook_path') or data.get('path')
    cwd = event.get('cwd')
    if not raw or not cwd:
        return 1

    target = Path(os.path.expanduser(str(raw)))
    if not target.is_absolute():
        target = Path(cwd) / target
    target = resolve(target)

    if not outside and role == 'fleet-steward':
        root = os.environ.get('CODER_FLEET_REPO')
        if not root:
            return 1
        return 0 if inside(target, resolve(root)) else 1

    project = resolve(os.environ.get('CLAUDE_PROJECT_DIR') or cwd)

    if outside:
        # The inverse of every scope below: a break or use-mode reviewer may
        # write anywhere EXCEPT the project. Break mode mutates copies, and a
        # mutation written back into the tree it is testing is not a mutation,
        # it is a change.
        # Physically resolved, so a symlink pointing back in resolves back in.
        #
        # inside() excludes the root itself (path == root), which is the
        # right call for every allowlist role below - "write under this
        # root" should not license overwriting the root directory entry -
        # but it is the wrong call for a role whose rule is a denial: the
        # project root is squarely inside the tree under test, not outside
        # it, so it has to be checked for on its own.
        #
        # And unlike every role below, this one cannot fall back to cwd. The
        # allowlist roles survive an unset CLAUDE_PROJECT_DIR because their
        # rule is "inside this root", so a wrong root only widens an allowance
        # that still has to be inside something. A denial has no such floor:
        # with the variable unset and the event's cwd pointing anywhere else,
        # "outside the project" resolves to a project that is not the one
        # under test, and a write into the tree under test is allowed. That is
        # the one role designed to fail closed failing open. Same stance as
        # fleet-steward above, which returns 1 when its root is unset.
        if not os.environ.get('CLAUDE_PROJECT_DIR'):
            return 1
        # Nor the records that govern the reviewer itself: its recorded mode
        # and clock under the fleet's state directory, and its own transcript,
        # which holds the brief the mode is read from. enforce-agent-scope.sh
        # refuses these first; this is the second lock.
        # Compared casefolded: APFS folds case, so .Local/State/Coder-Fleet is
        # the same directory, and refusing a look-alike on a case-sensitive
        # disk costs the reviewer nothing it needs.
        folded = str(target).casefold()
        for root in protected_roots():
            r = str(root).casefold().rstrip('/')
            if folded == r or folded.startswith(r + '/'):
                return 1
        return 1 if target == project or inside(target, project) else 0

    if role in SPECS_ROLES:
        # Anchor to the physical specs directory of *this* project. If it
        # resolves somewhere else, it has been redirected, and a redirected
        # specs root is exactly the case this is here to catch.
        root = project / 'docs' / 'specs'
        if root.exists() and resolve(root) != root:
            return 1
        return 0 if inside(target, root) else 1

    roots, suffixes = default_scope(role, project)
    in_default = any(inside(target, r) for r in roots)
    if role == 'tech-writer' and not in_default:
        # A top-level README or CHANGELOG is documentation too.
        in_default = target.parent == project and target.suffix.lower() in ('.md', '.mdx')
    if not in_default:
        return 1
    if suffixes and target.suffix.lower() not in suffixes:
        return 1

    exact = configured(role, project)
    if exact is not None and target not in exact:
        return 1
    return 0


try:
    sys.exit(main())
except Exception:
    sys.exit(1)
