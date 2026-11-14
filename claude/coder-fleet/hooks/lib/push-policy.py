"""push-policy.py - judge one Bash command against a project's push and release
settings (CF-209.3).

Run by lib/push-policy.sh, never on its own: python3 -I push-policy.py, with a
JSON request on stdin. Prints one line: "ok", or "deny", a tab and the reason.
The caller refuses on any other output, or none, so a crash here refuses.

The request carries the command exactly as the agent sent it, the call's cwd,
whether the call is the lead's (the main session), who made it, and the
settings as lib/fleet-config.sh resolved them: push (all or base-only),
release (unset, off, tag or github), the base branch and the reasons behind
any value that was invalid or unread. The caller sends nothing when push is
all and release is unset, which is today's fleet.

The rules, from CF-209 comments 2 and 5:

  push base-only    No git push but the lead's plain push of the base branch,
                    and of one version tag when release allows it. No gh pr
                    create by anyone.
  release off       No tag created, no tag pushed, no gh release create, by
                    anyone, whatever push is. release unset under push
                    base-only is the same, and says to set release.
  release tag       The lead may push one annotated tag vMAJOR.MINOR.PATCH on
                    the base branch. No gh release create.
  release github    As tag, and the lead may run gh release create for a tag
                    that already exists on the remote: --verify-tag is
                    required, since without it gh creates the tag itself.

Every reading here is of hostile text. The command is lexed the way the shell
reads it - quotes, backslashes, $'...', $( ), backticks, ${ }, heredocs,
comments, redirections, subshells and operators - rather than matched as a
string, and a word whose value the shell builds at run time (a variable, a
glob, a substitution) is never guessed at: under a restrictive setting, a git
or gh command that needs such a word judged is refused. A command whose name
is built at run time is refused only when the command's text names git or gh
with a push, tag or release word, so `$(printf %s gi t) push` gets past; this
is a guard against mistakes and the obvious routes, not a security boundary,
and docs/limits.md lists what it misses. Refused too are the ways a command
reaches git without being written as git: a string handed to sh -c, eval,
env -S, su -c, script -c or watch is lexed and judged as a command; git or gh
named later in another command's words (find -exec, flock, sudo) is judged
from that word on; an alias, a shell function named git or gh, a variable
assigned anywhere in the command, a git option that changes its config or
repository, xargs in front of git or gh, a shell reading a pipe, and any
other program - python3 -c, node -e, perl -e, awk - whose own words name git
or gh with a push, tag or release word are refused when the command is about
pushing, tagging or releasing. What the words alone decide is decided before
any git runs, and the whole check refuses past a 5-second budget, well inside
the hook's 10-second timeout, past which the call would go through.

Class Guard is the write-tool half of the settings guard: no agent but the
lead writes .claude/coder-fleet.json, under any setting.

What it cannot see is recorded in docs/limits.md: a script, a variable whose
text never names git or gh, a git hook, and gh api.
"""

import json
import os
import re
import subprocess
import sys
import time

MAX_COMMAND = 65536
# The whole check, git calls included, must finish well inside the hook's
# 10-second timeout, which renders no decision and so lets the call through.
# Past this many seconds it refuses instead.
BUDGET = 5.0
MAX_UNITS = 64
MAX_PUSH_WORDS = 16
METACHARS = ' \t\n;&|()<>'
SHELLS = {'sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'yash', 'fish', 'csh', 'tcsh'}
WRAPPERS = {'command', 'env', 'builtin', 'exec', 'nohup', 'time', 'xargs', 'timeout',
            'nice', 'stdbuf', 'setsid', 'ionice', 'sudo', 'doas'}
WRAPPER_VALUE_OPTS = {
    'env': {'-u', '--unset', '-C', '--chdir'},
    'timeout': {'-s', '--signal', '-k', '--kill-after'},
    'nice': {'-n', '--adjustment'},
    'ionice': {'-c', '--class', '-n', '--classdata', '-p', '--pid', '-P', '--pgid', '-u', '--uid'},
    'stdbuf': {'-i', '-o', '-e', '--input', '--output', '--error'},
    'xargs': {'-I', '-L', '-n', '-P', '-s', '-d', '-E', '-a', '--arg-file', '--delimiter',
              '--max-args', '--max-procs', '--max-chars', '--max-lines', '--replace', '--eof'},
    'sudo': {'-u', '--user', '-g', '--group', '-h', '--host', '-p', '--prompt', '-C',
             '--close-from', '-D', '--chdir', '-r', '--role', '-t', '--type', '-U',
             '--other-user', '-T', '--command-timeout'},
    'doas': {'-u', '-C'},
    'exec': {'-a'},
    'time': {'-o', '--output', '-f', '--format'},
}
RESERVED = {'!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'fi',
            'done', 'esac'}
ASSIGNERS = {'export', 'declare', 'typeset', 'local', 'readonly'}
ASSIGN_RE = re.compile(r'[A-Za-z_][A-Za-z0-9_]*(\[[^]]*\])?\+?=')
DURATION_RE = re.compile(r'[0-9]+(\.[0-9]+)?[smhd]?')

# git's global options. Those that only change output are safe; those that
# change which config or repository git reads, or which refs it sees, are not.
GIT_SAFE_GLOBALS = {'-P', '--no-pager', '-p', '--paginate', '--no-optional-locks',
                    '--no-replace-objects', '--literal-pathspecs', '--glob-pathspecs',
                    '--noglob-pathspecs', '--icase-pathspecs', '--no-advice', '--no-lazy-fetch'}
GIT_VALUE_GLOBALS = {'-c', '--git-dir', '--work-tree', '--namespace', '--attr-source',
                     '--config-env', '--super-prefix'}
GIT_EXIT_GLOBALS = {'--version', '-v', '--help', '-h', '--exec-path', '--html-path',
                    '--man-path', '--info-path'}
PUSH_VERBS = {'push', 'send-pack', 'http-push'}
TAG_VERBS = {'tag', 'update-ref', 'symbolic-ref', 'fast-import'}
GIT_WORDS = PUSH_VERBS | TAG_VERBS
GH_WORDS = {'pr', 'release'}

# Commands that only read or print, and run nothing they are given. Any other
# command whose own words name git or gh with a push, tag or release word
# runs code this check cannot read - python3 -c, node -e, perl -e, awk's
# system(), sed's e - and is refused under a restrictive setting.
NON_EXEC = {'cat', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'wc', 'ls', 'echo', 'printf', 'less',
            'more', 'cut', 'sort', 'uniq', 'tr', 'diff', 'cmp', 'comm', 'column', 'nl', 'stat',
            'file', 'basename', 'dirname', 'pwd', 'true', 'false', 'test', '[', '[[', 'cd',
            'realpath', 'readlink', 'jq'}

# The options a plain push of the base branch may carry. Exact names only: git
# accepts any unambiguous prefix of a long option, and --mir is --mirror.
PUSH_PLAIN_LONG = {'set-upstream', 'quiet', 'verbose', 'progress', 'no-progress', 'dry-run',
                   'porcelain', 'no-verify', 'verify', 'atomic', 'no-atomic', 'no-follow-tags'}
PUSH_PLAIN_SHORT = set('uqvn')
PUSH_FORCING = ('force', 'force-with-lease', 'force-if-includes', 'delete', 'prune')
PUSH_WIDENING = ('mirror', 'all', 'branches', 'tags', 'follow-tags')
PUSH_TAGGING = ('tags', 'follow-tags', 'mirror')
PUSH_VALUE_LONG = {'push-option', 'repo', 'receive-pack', 'exec'}
VERSION_TAG_RE = re.compile(r'v[0-9]+\.[0-9]+\.[0-9]+')

# gh's own top-level commands (gh 2.103). Anything else is an alias or an
# extension, which can run any command. `co` is an alias gh ships and the
# human can redefine, so it is not here.
GH_GROUPS = {'agent-task', 'alias', 'api', 'attestation', 'auth', 'browse', 'cache',
             'codespace', 'completion', 'config', 'copilot', 'discussion', 'extension',
             'gist', 'gpg-key', 'help', 'issue', 'label', 'licenses', 'org', 'pr', 'preview',
             'project', 'release', 'repo', 'ruleset', 'run', 'search', 'secret', 'skill',
             'ssh-key', 'status', 'variable', 'workflow'}


class Refuse(Exception):
    """A verdict: the reason is the whole message."""


class Word:
    __slots__ = ('raw', 'value', 'why')

    def __init__(self, raw, value, why=None):
        self.raw = raw
        self.value = value  # None when the shell builds it at run time
        self.why = why


class Command:
    __slots__ = ('words', 'sep', 'depth', 'sub', 'stdin', 'heredocs')

    def __init__(self, sep, depth, sub):
        self.words = []
        self.sep = sep        # the operator before it: None, ;, &&, ||, |, |&, &, newline, (
        self.depth = depth    # subshell nesting
        self.sub = sub        # inside a substitution, so it runs before its command
        self.stdin = False    # a < redirection
        self.heredocs = []    # (body, expands)


class Sink:
    def __init__(self):
        self.commands = []
        self.open = []        # reasons the text could not be read to its end
        self.funcs = set()    # shell functions the command defines


# ------------------------------------------------------------------- lexing

class Lex:
    """The shell's reading of one text, into simple commands in Sink."""

    def __init__(self, text, sink, depth=0, sub=False):
        self.s = text
        self.n = len(text)
        self.i = 0
        self.sink = sink
        self.depth = depth
        self.sub = sub
        self.pending = []

    def run(self):
        self.seq(None, self.depth, self.sub)
        return self.sink

    def end(self, cmd):
        if not cmd.words:
            return
        first = cmd.words[0].value
        if first == 'function' and len(cmd.words) > 1 and cmd.words[1].value:
            self.sink.funcs.add(base_name(cmd.words[1].value))
        self.sink.commands.append(cmd)

    def seq(self, closer, depth, sub):
        cmd = Command(None, depth, sub)
        while self.i < self.n:
            c = self.s[self.i]
            if closer and c == closer:
                self.i += 1
                self.end(cmd)
                return
            if c in ' \t':
                self.i += 1
                continue
            if c == '\n':
                self.i += 1
                self.end(cmd)
                self.bodies()
                cmd = Command('\n', depth, sub)
                continue
            if c == '#':
                j = self.s.find('\n', self.i)
                self.i = self.n if j < 0 else j
                continue
            if c in ';&|':
                op = self.operator()
                self.i += len(op)
                if op in ('&>', '&>>'):
                    self.target(cmd)
                    continue
                self.end(cmd)
                cmd = Command(op, depth, sub)
                continue
            if c == '(':
                m = re.match(r'\(\s*\)', self.s[self.i:])
                if cmd.words and m:
                    # name() { ...; }: a function definition. Its body is
                    # lexed and judged like any other command.
                    name = cmd.words[-1].value
                    self.sink.funcs.add(base_name(name or ''))
                    self.i += m.end()
                    cmd = Command(cmd.sep, depth, sub)
                    continue
                if self.s.startswith('((', self.i):
                    self.arith()
                    cmd.words.append(Word('((', None, 'arithmetic'))
                    continue
                self.i += 1
                self.end(cmd)
                self.seq(')', depth + 1, sub)
                cmd = Command('(', depth, sub)
                continue
            if c == ')':
                self.sink.open.append('a ) with no ( before it')
                self.i += 1
                continue
            if c in '<>' or re.match(r'[0-9]+[<>]|\{[A-Za-z_][A-Za-z0-9_]*\}[<>]', self.s[self.i:self.i + 40]):
                self.redirection(cmd)
                continue
            cmd.words.append(self.word())
        if closer:
            self.sink.open.append('a ' + {')': '(', '`': '`'}.get(closer, closer) + ' that is never closed')
        self.end(cmd)
        self.bodies()

    def operator(self):
        for op in (';;&', '&>>', '&&', '||', ';;', ';&', '|&', '&>', '&', '|', ';'):
            if self.s.startswith(op, self.i):
                return op
        return self.s[self.i]

    def redirection(self, cmd):
        m = re.match(r'([0-9]+|\{[A-Za-z_][A-Za-z0-9_]*\})?(<<<|<<-|<<|<>|<&|>&|>>|>\||<|>)', self.s[self.i:])
        op = m.group(2)
        self.i += m.end()
        if op in ('<', '>') and self.s.startswith('(', self.i):
            self.i += 1
            self.seq(')', self.depth + 1, True)
            cmd.words.append(Word(op + '(', None, 'a process substitution'))
            return
        if op in ('<<', '<<-'):
            self.spaces()
            w = self.word()
            delim = w.raw
            for q in ('\\', "'", '"'):
                delim = delim.replace(q, '')
            expands = not any(q in w.raw for q in ('\\', "'", '"'))
            self.pending.append((delim, op == '<<-', expands, cmd))
            return
        if op == '<':
            cmd.stdin = True
        self.target(cmd)

    def target(self, cmd):
        # A redirection's target is no argument, but what it expands still runs.
        self.spaces()
        if self.i < self.n and self.s[self.i] not in METACHARS:
            self.word()

    def spaces(self):
        while self.i < self.n and self.s[self.i] in ' \t':
            self.i += 1

    def bodies(self):
        for delim, strip, expands, cmd in self.pending:
            lines = []
            while self.i < self.n:
                j = self.s.find('\n', self.i)
                line = self.s[self.i:self.n if j < 0 else j]
                self.i = self.n if j < 0 else j + 1
                if (line.lstrip('\t') if strip else line) == delim:
                    break
                lines.append(line)
            cmd.heredocs.append(('\n'.join(lines), expands))
        self.pending = []

    def word(self):
        start = self.i
        parts = []
        known = True
        why = None
        brace = False
        while self.i < self.n:
            c = self.s[self.i]
            if c in METACHARS:
                break
            if c == '\\':
                if self.i + 1 < self.n:
                    nxt = self.s[self.i + 1]
                    self.i += 2
                    if nxt != '\n':
                        parts.append(nxt)
                else:
                    self.i += 1
                continue
            if c == "'":
                j = self.s.find("'", self.i + 1)
                if j < 0:
                    self.sink.open.append('a single quote that is never closed')
                    self.i = self.n
                    known = False
                    break
                parts.append(self.s[self.i + 1:j])
                self.i = j + 1
                continue
            if c == '"':
                self.i += 1
                v = self.dquote('"')
                if v is None:
                    known, why = False, why or 'expands'
                else:
                    parts.append(v)
                continue
            if c == '$':
                nxt = self.s[self.i + 1] if self.i + 1 < self.n else ''
                if nxt == "'":
                    self.i += 2
                    parts.append(self.ansi_c())
                    continue
                if nxt == '"':
                    self.i += 2
                    v = self.dquote('"')
                    if v is None:
                        known, why = False, why or 'expands'
                    else:
                        parts.append(v)
                    continue
                if self.dollar():
                    known, why = False, why or 'expands'
                else:
                    parts.append('$')
                continue
            if c == '`':
                self.backtick()
                known, why = False, why or 'expands'
                continue
            if c in '*?[':
                known, why = False, why or 'is a glob'
                self.i += 1
                continue
            if c in '{}':
                brace = True
                parts.append(c)
                self.i += 1
                continue
            if c == '~' and self.i == start:
                m = re.match(r'~([^/' + re.escape(METACHARS) + ']*)', self.s[self.i:])
                home = os.environ.get('HOME')
                if m.group(1) == '' and home:
                    parts.append(home)
                else:
                    known, why = False, why or 'expands'
                self.i += m.end()
                continue
            parts.append(c)
            self.i += 1
        raw = self.s[start:self.i]
        value = ''.join(parts) if known else None
        if value is not None and brace and value not in ('{', '}'):
            value, why = None, 'may be a brace expansion'
        return Word(raw, value, why)

    def dquote(self, end):
        # Inside double quotes. end None reads to the end of the text, as in
        # a heredoc body. Returns the value, or None when it expands.
        parts = []
        known = True
        while self.i < self.n:
            c = self.s[self.i]
            if end and c == end:
                self.i += 1
                return ''.join(parts) if known else None
            if c == '\\' and self.i + 1 < self.n:
                nxt = self.s[self.i + 1]
                if nxt in '$`"\\\n':
                    self.i += 2
                    if nxt != '\n':
                        parts.append(nxt)
                    continue
                parts.append('\\')
                self.i += 1
                continue
            if c == '$':
                if self.dollar():
                    known = False
                else:
                    parts.append('$')
                continue
            if c == '`':
                self.backtick()
                known = False
                continue
            parts.append(c)
            self.i += 1
        if end:
            self.sink.open.append('a double quote that is never closed')
            return None
        return ''.join(parts) if known else None

    def dollar(self):
        # At a $. Consumes an expansion and returns True, or consumes the $
        # alone and returns False.
        s, i = self.s, self.i
        nxt = s[i + 1] if i + 1 < self.n else ''
        if nxt == '(':
            self.i = i + 1
            if s.startswith('((', self.i):
                self.arith()
                return True
            self.i += 1
            self.seq(')', self.depth + 1, True)
            return True
        if nxt == '{':
            self.i = i + 2
            self.param()
            return True
        m = re.match(r'[A-Za-z_][A-Za-z0-9_]*|[0-9]|[@*#?$!-]', s[i + 1:])
        if m:
            self.i = i + 1 + m.end()
            return True
        self.i = i + 1
        return False

    def param(self):
        # After ${, to its closing }. What it holds can run: ${x:-$(cmd)}.
        level = 1
        while self.i < self.n:
            c = self.s[self.i]
            if c == '\\':
                self.i += 2
                continue
            if c == "'":
                j = self.s.find("'", self.i + 1)
                self.i = self.n if j < 0 else j + 1
                continue
            if c == '"':
                self.i += 1
                self.dquote('"')
                continue
            if c == '$':
                if not self.dollar():
                    pass
                continue
            if c == '`':
                self.backtick()
                continue
            if c == '{':
                level += 1
            elif c == '}':
                level -= 1
                if level == 0:
                    self.i += 1
                    return
            self.i += 1
        self.sink.open.append('a ${ that is never closed')

    def arith(self):
        # At ((: to the matching )). A $( ) inside still runs.
        level = 0
        while self.i < self.n:
            c = self.s[self.i]
            if c == '$' and self.s.startswith('$(', self.i) and not self.s.startswith('$((', self.i):
                self.dollar()
                continue
            if c == '`':
                self.backtick()
                continue
            if c == '(':
                level += 1
            elif c == ')':
                level -= 1
                if level == 0:
                    self.i += 1
                    return
            self.i += 1
        self.sink.open.append('an arithmetic (( that is never closed')

    def backtick(self):
        j = self.i + 1
        body = []
        while j < self.n:
            c = self.s[j]
            if c == '\\' and j + 1 < self.n and self.s[j + 1] in '`$\\':
                body.append(self.s[j + 1])
                j += 2
                continue
            if c == '`':
                break
            body.append(c)
            j += 1
        if j >= self.n:
            self.sink.open.append('a backtick that is never closed')
        self.i = j + 1
        Lex(''.join(body), self.sink, self.depth + 1, True).run()

    def ansi_c(self):
        out = []
        simple = {'n': '\n', 't': '\t', 'r': '\r', 'a': '\a', 'b': '\b', 'e': '\x1b',
                  'E': '\x1b', 'f': '\f', 'v': '\v', '\\': '\\', "'": "'", '"': '"', '?': '?'}
        while self.i < self.n:
            c = self.s[self.i]
            if c == "'":
                self.i += 1
                return ''.join(out)
            if c == '\\' and self.i + 1 < self.n:
                e = self.s[self.i + 1]
                if e in simple:
                    out.append(simple[e])
                    self.i += 2
                    continue
                m = (re.match(r'x([0-9A-Fa-f]{1,2})', self.s[self.i + 1:])
                     or re.match(r'u([0-9A-Fa-f]{1,4})', self.s[self.i + 1:])
                     or re.match(r'U([0-9A-Fa-f]{1,8})', self.s[self.i + 1:]))
                if m:
                    out.append(chr(int(m.group(1), 16)))
                    self.i += 1 + m.end()
                    continue
                m = re.match(r'[0-7]{1,3}', self.s[self.i + 1:])
                if m:
                    out.append(chr(int(m.group(0), 8)))
                    self.i += 1 + m.end()
                    continue
                m = re.match(r'c(.)', self.s[self.i + 1:])
                if m:
                    out.append(chr(ord(m.group(1)) & 31))
                    self.i += 3
                    continue
                out.append('\\')
                self.i += 1
                continue
            out.append(c)
            self.i += 1
        self.sink.open.append("a $' that is never closed")
        return ''.join(out)


def lex(text, depth=0, sub=False):
    return Lex(text, Sink(), depth, sub).run()


def lex_expansions(body, sink, depth):
    # A heredoc body with an unquoted delimiter runs its $( ) and backticks.
    lx = Lex(body, sink, depth + 1, True)
    lx.dquote(None)


def base_name(v):
    return v.rstrip('/').split('/')[-1].lower() if v else ''


# ------------------------------------------------------------------ reading

class Unit:
    """One command to judge: its words from the command name on."""
    __slots__ = ('words', 'xargs', 'dir', 'sure', 'origin')

    def __init__(self, words, xargs, dir_, sure, origin):
        self.words = words
        self.xargs = xargs
        self.dir = dir_
        self.sure = sure
        self.origin = origin  # command, payload or suffix


class Prefix:
    __slots__ = ('index', 'xargs', 'chdir', 'payload', 'skip')

    def __init__(self):
        self.index = 0
        self.xargs = False
        self.chdir = False
        self.payload = None   # env -S's string, run as the command
        self.skip = False     # a for or case header: no command runs


def strip_prefix(words, assigns):
    p = Prefix()
    i = 0
    while i < len(words):
        w = words[i]
        v = w.value
        if v is not None and w.raw == v and v in RESERVED:
            i += 1
            continue
        if v in ('for', 'select') and w.raw == v:
            if i + 1 < len(words):
                assigns.append('the loop variable ' + (words[i + 1].raw or '?'))
            p.skip = True
            break
        if v == 'case' and w.raw == v:
            p.skip = True
            break
        if ASSIGN_RE.match(w.raw):
            assigns.append(w.raw.split('=', 1)[0])
            i += 1
            continue
        name = base_name(v)
        if v is not None and name in WRAPPERS:
            if name == 'xargs':
                p.xargs = True
            i += 1
            while i < len(words):
                o = words[i].value
                if o is None:
                    break
                if name == 'env' and ASSIGN_RE.match(words[i].raw):
                    assigns.append(words[i].raw.split('=', 1)[0])
                    i += 1
                    continue
                if name == 'env' and (o in ('-S', '--split-string') or o.startswith('--split-string=')
                                      or (o.startswith('-S') and len(o) > 2)):
                    if o in ('-S', '--split-string'):
                        p.payload = words[i + 1].value if i + 1 < len(words) else ''
                        if p.payload is None:
                            p.payload = False
                        i += 2
                    else:
                        p.payload = o.split('=', 1)[1] if o.startswith('--') else o[2:]
                        i += 1
                    rest = ' '.join(x.raw for x in words[i:])
                    if p.payload is not False:
                        p.payload = p.payload + (' ' + rest if rest else '')
                    p.index = len(words)
                    return p
                if o.startswith('-') and o != '-':
                    if (name, o) in (('env', '-C'), ('env', '--chdir'), ('sudo', '-D'), ('sudo', '--chdir')) \
                            or (name == 'env' and (o.startswith('--chdir=') or (o.startswith('-C') and len(o) > 2))):
                        p.chdir = True
                    if o in WRAPPER_VALUE_OPTS.get(name, ()):
                        i += 2
                    else:
                        i += 1
                    continue
                if name in ('timeout', 'nice', 'ionice') and DURATION_RE.fullmatch(o):
                    i += 1
                    continue
                break
            continue
        break
    p.index = i
    return p


def option_value(words, i, names):
    """The value of an option in names at words[i], separate or attached,
    and the index after it. None when words[i] is not one of them."""
    v = words[i].value
    if v is None:
        return None
    for n in names:
        if v == n:
            return (words[i + 1].value if i + 1 < len(words) else None, i + 2)
        if n.startswith('--') and v.startswith(n + '='):
            return v[len(n) + 1:], i + 1
    return None


class Reader:
    def __init__(self, req):
        self.req = req
        self.units = []
        self.assigns = []
        self.funcs = set()
        self.open = []
        self.stdin_shell = False
        self.strings = []   # what runs a string: why it could not be read
        self.coded = []     # (name, its words): a command that may run code naming git or gh

    def read(self, text, dir_, sure, origin, depth):
        sink = lex(text, depth, origin != 'command')
        self.open += sink.open
        self.funcs |= sink.funcs
        cmds = sink.commands
        prefixes = [strip_prefix(c.words, self.assigns) for c in cmds]
        names = [base_name(c.words[p.index].value) if p.index < len(c.words) and c.words[p.index].value else ''
                 for c, p in zip(cmds, prefixes)]
        cds = [k for k, nm in enumerate(names) if nm in ('cd', 'pushd', 'popd')]
        cd_dir = None
        if cds == [0] and cmds[0].depth == 0 and not cmds[0].sub:
            c0, p0 = cmds[0], prefixes[0]
            args = c0.words[p0.index + 1:]
            if len(args) == 1 and args[0].value and names[0] == 'cd' and dir_:
                a = args[0].value
                if a.startswith(('/', './', '../')) or a in ('.', '..'):
                    cd_dir = os.path.normpath(os.path.join(dir_, a))
        for k, (cmd, p) in enumerate(zip(cmds, prefixes)):
            here, here_sure = dir_, sure
            if cds:
                if cd_dir and k > 0 and all(cmds[j].depth == 0 and not cmds[j].sub and cmds[j].sep == '&&'
                                            for j in range(1, k + 1)):
                    here = cd_dir
                else:
                    here_sure = False
            if p.chdir:
                here_sure = False
            self.command(cmd, p, here, here_sure, origin, depth)

    def command(self, cmd, p, dir_, sure, origin, depth):
        words = cmd.words
        if p.payload is not None:
            if p.payload is False:
                self.strings.append('env -S runs a string built at run time')
            else:
                self.read(p.payload, dir_, sure, 'payload', depth + 1)
            return
        for body, expands in cmd.heredocs:
            if self.stdin_shell_command(words, p):
                self.read(body, dir_, sure, 'payload', depth + 1)
            elif expands:
                sink = Sink()
                lex_expansions(body, sink, depth)
                self.open += sink.open
                for c in sink.commands:
                    self.command(c, strip_prefix(c.words, self.assigns), dir_, False, 'payload', depth + 1)
        if p.skip or p.index >= len(words):
            return
        head = words[p.index]
        if head.value is None:
            self.strings.append('the command name "%s" is built at run time' % head.raw)
            return
        name = base_name(head.value)
        args = words[p.index + 1:]
        if name in ASSIGNERS:
            for a in args:
                if a.value is None or not a.value.startswith('-'):
                    self.assigns.append(a.raw.split('=', 1)[0])
        elif name == 'read':
            self.assigns.append('a variable read from standard input')
        elif name == 'alias':
            self.assigns.append('an alias')
        elif name == 'hash' and any(a.value == '-p' for a in args):
            self.assigns.append('the command hashed by hash -p')
        if name in self.funcs and name in ('git', 'gh'):
            self.strings.append('a shell function named %s stands in for it' % name)
        opened = self.payloads(cmd, name, args, dir_, sure, depth)
        if not opened and name not in NON_EXEC and name not in ('git', 'gh') and not name.startswith('git-'):
            self.coded.append((name, ' '.join(w.raw for w in words[p.index:])))
        self.units.append(Unit(words[p.index:], p.xargs, dir_, sure, origin))
        for j in range(p.index + 1, len(words)):
            v = words[j].value
            b = base_name(v)
            if v and (b in ('git', 'gh') or b.startswith('git-')):
                self.units.append(Unit(words[j:], p.xargs, dir_, False, 'suffix'))

    def stdin_shell_command(self, words, p):
        if p.index >= len(words):
            return False
        if base_name(words[p.index].value) not in SHELLS:
            return False
        for w in words[p.index + 1:]:
            v = w.value
            if v is None or not v.startswith(('-', '+')):
                return False
            if re.fullmatch(r'-[A-Za-z]*c[A-Za-z]*', v):
                return False
        return True

    def payloads(self, cmd, name, args, dir_, sure, depth):
        # True when the command's string was read as commands, or could not
        # be and says so in strings or stdin_shell. False when nothing was
        # opened, so the caller still looks at the command's own words.
        if name in SHELLS:
            cflag = False
            i = 0
            while i < len(args):
                v = args[i].value
                if v is None:
                    if cflag:
                        self.strings.append('%s -c runs a string built at run time' % name)
                    return cflag
                if v == '--':
                    i += 1
                    break
                if v in ('-o', '+o', '--rcfile', '--init-file', '-O', '+O'):
                    i += 2
                    continue
                if v.startswith(('-', '+')) and len(v) > 1:
                    if re.fullmatch(r'-[A-Za-z]*c[A-Za-z]*', v):
                        cflag = True
                    i += 1
                    continue
                break
            if cflag:
                if i < len(args) and args[i].value is not None:
                    self.read(args[i].value, dir_, sure, 'payload', depth + 1)
                elif i < len(args):
                    self.strings.append('%s -c runs a string built at run time' % name)
                return True
            if i >= len(args) and (cmd.sep in ('|', '|&') or cmd.stdin) and not cmd.heredocs:
                self.stdin_shell = True
                return True
            return bool(cmd.heredocs) and i >= len(args)
        if name == 'eval':
            vals = [a.value for a in args]
            if any(v is None for v in vals):
                self.strings.append('eval runs a string built at run time')
            else:
                self.read(' '.join(vals), dir_, sure, 'payload', depth + 1)
            return True
        if name in ('su', 'runuser', 'script'):
            opened = False
            for i in range(len(args)):
                got = option_value(args, i, ('-c', '--command'))
                if got:
                    opened = True
                    if got[0] is None:
                        self.strings.append('%s -c runs a string built at run time' % name)
                    else:
                        self.read(got[0], dir_, sure, 'payload', depth + 1)
            return opened
        if name == 'watch':
            i = 0
            while i < len(args) and args[i].value and args[i].value.startswith('-'):
                i += 2 if args[i].value in ('-n', '--interval', '-d') else 1
            vals = [a.value for a in args[i:]]
            if any(v is None for v in vals):
                self.strings.append('watch runs a string built at run time')
            elif vals:
                self.read(' '.join(vals), dir_, sure, 'payload', depth + 1)
            return True
        return False


# ---------------------------------------------------------------- the policy

class Policy:
    def __init__(self, req):
        self.req = req
        self.push = req.get('push')
        self.release = req.get('release')
        self.base = req.get('base') or ''
        self.lead = bool(req.get('lead'))
        self.who = req.get('who') or 'this agent'
        self.cwd = req.get('cwd') or ''
        self.base_only = self.push == 'base-only'
        self.tagblock = self.release == 'off' or (self.release == 'unset' and self.base_only)
        self.gitblock = self.base_only or self.tagblock
        self._builtins = None
        self.deadline = time.monotonic() + BUDGET

    # --- messages

    def push_part(self, specific):
        note = self.req.get('push_note') or ''
        note = ' (%s)' % note if note else ''
        if self.base:
            base = 'the base branch, %s,' % self.base
        else:
            base = 'the base branch, which could not be resolved (%s),' % (self.req.get('base_reason') or 'no reason given')
        return ('push policy: .claude/coder-fleet.json makes "push" "base-only"%s, so nothing leaves this '
                'machine but %s which only the lead pushes, plainly, and a version tag the release '
                'setting allows. %s' % (note, base, specific)).strip()

    def release_part(self, specific):
        note = self.req.get('release_note') or ''
        note = ' (%s)' % note if note else ''
        r = self.release
        if r == 'unset':
            return ('release policy: "release" is not set in .claude/coder-fleet.json, and under "push": '
                    '"base-only" that means no tag is created or pushed and no GitHub release is made. %s '
                    'To release, set "release" to "tag" or "github" in .claude/coder-fleet.json.' % specific)
        if r == 'tag':
            return ('release policy: .claude/coder-fleet.json makes "release" "tag", so the lead may push '
                    'a version tag, but no GitHub release is made. %s' % specific).strip()
        if r == 'github':
            return ('release policy: .claude/coder-fleet.json makes "release" "github", so only the lead '
                    'makes a GitHub release, and only of a tag that already exists on the remote. %s'
                    % specific).strip()
        return ('release policy: .claude/coder-fleet.json makes "release" "off"%s, so no tag is created '
                'or pushed and no GitHub release is made, whatever "push" says. %s' % (note, specific)).strip()

    def refuse(self, push=None, release=None):
        parts = []
        if push is not None:
            parts.append(self.push_part(push))
        if release is not None:
            parts.append(self.release_part(release))
        raise Refuse(' '.join(parts))

    def unread(self, why):
        settings = []
        if self.base_only:
            settings.append('"push": "base-only"')
        if self.release != 'unset' or self.base_only:
            settings.append('"release": "%s"' % (self.release if self.release != 'unset' else 'not set'))
        raise Refuse('push and release policy: %s. Under %s in .claude/coder-fleet.json, a command about '
                     'pushing, tagging or releasing that cannot be read is refused. Write the git or gh '
                     'command out plainly, on its own, with no variable, alias, wrapper or substitution, '
                     'and pass a repository with git -C <path> rather than a cd.'
                     % (why, ' and '.join(settings)))

    # --- git

    def git(self, dir_, *args):
        left = self.deadline - time.monotonic()
        if left < 0.2:
            self.out_of_time()
        try:
            r = subprocess.run(['git'] + (['-C', dir_] if dir_ else []) + list(args), stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=left,
                               env=dict(os.environ, GIT_TERMINAL_PROMPT='0'))
            return r.returncode, r.stdout.decode('utf-8', 'replace').strip()
        except subprocess.TimeoutExpired:
            self.out_of_time()
        except Exception:
            return 255, ''

    def out_of_time(self):
        raise Refuse('push and release policy: judging this command took longer than its %d-second budget, '
                     'so it is refused rather than left to the hook\'s timeout, which would let it through. '
                     'Split it into shorter commands.' % BUDGET)

    def builtins(self):
        if self._builtins is None:
            rc, out = self.git(None, '--list-cmds=builtins')
            self._builtins = set(out.split()) if rc == 0 else set()
        return self._builtins

    def config(self, dir_, *args):
        # ('set', value), ('unset', '') or ('error', '').
        rc, out = self.git(dir_, 'config', *args)
        if rc == 0:
            return 'set', out
        if rc == 1:
            return 'unset', ''
        return 'error', ''

    def is_repo(self, dir_):
        return bool(dir_) and self.git(dir_, 'rev-parse', '--git-dir')[0] == 0

    def ref_kind(self, dir_, sure, word):
        """tag, maybe or other: whether a push word sends a tag."""
        r = word[1:] if word.startswith('+') else word
        src, dst = (r.split(':', 1) + [None])[:2] if ':' in r else (r, r)
        ls, ld = src.lower(), (dst or '').lower()
        if ls.startswith('refs/tags/') or ls == 'tag' or ld.startswith('refs/tags/'):
            return 'tag'
        if not src:
            return 'other'
        if not sure:
            return 'maybe'
        if not self.is_repo(dir_):
            return 'other'
        if self.git(dir_, 'show-ref', '--verify', '-q', 'refs/tags/' + src)[0] == 0:
            return 'tag'
        rc, kind = self.git(dir_, 'cat-file', '-t', src)
        if rc == 0 and kind == 'tag':
            return 'tag'
        return 'other'

    # --- judging

    def judge(self, reader):
        for u in reader.units:
            v = u.words[0].value
            name = base_name(v)
            if name == 'git' or name.startswith('git-'):
                self.judge_git(u, reader)
            elif name == 'gh':
                self.judge_gh(u, reader)

    def judge_git(self, u, reader):
        words = u.words
        name = base_name(words[0].value)
        if name.startswith('git-'):
            verb = name[4:]
            if (verb in PUSH_VERBS and self.gitblock) or (verb in TAG_VERBS and self.tagblock):
                self.unread('"%s" runs git %s through its own program name, which this check does not read; '
                            'run it as git %s' % (words[0].raw, verb, verb))
            return
        i = 1
        dir_ = u.dir
        bad = None
        verb = None
        while i < len(words):
            v = words[i].value
            if v is None:
                if self.gitblock and u.origin != 'suffix':
                    self.unread('"%s" stands before git\'s verb and %s, so which git command runs cannot be read'
                                % (words[i].raw, words[i].why or 'expands'))
                return
            if v == '-C':
                nv = words[i + 1].value if i + 1 < len(words) else None
                dir_ = os.path.normpath(os.path.join(dir_, nv)) if (dir_ and nv) else None
                i += 2
                continue
            if v in GIT_VALUE_GLOBALS:
                bad = bad or v
                i += 2
                continue
            if v in GIT_EXIT_GLOBALS or v.startswith('--list-cmds='):
                return
            if v in GIT_SAFE_GLOBALS:
                i += 1
                continue
            if v.startswith('-'):
                bad = bad or v
                i += 1
                continue
            verb = v
            break
        args = words[i + 1:]
        if verb is None:
            if u.xargs and self.gitblock and u.origin != 'suffix':
                self.unread('xargs hands git its verb from standard input, which no check can see')
            return
        if verb not in self.builtins():
            if u.origin != 'suffix' and self.gitblock:
                self.unread('"git %s" is not one of git\'s own commands, so it may be an alias, or a program '
                            'on the PATH, that pushes or tags; write out the git command it stands for' % verb)
            return
        if verb == 'push':
            if not self.gitblock:
                return
        elif verb in ('send-pack', 'http-push'):
            if not self.gitblock:
                return
        elif verb in TAG_VERBS:
            if not self.tagblock:
                return
        else:
            return
        if u.xargs:
            self.unread('xargs hands git words from standard input, which no check can see')
        if bad:
            self.unread('"%s" before git\'s verb changes which config or repository git reads' % bad)
        if reader.assigns:
            self.unread('the command assigns %s, and a variable can change what git sends' % reader.assigns[0])
        for a in args:
            if a.value is None:
                self.unread('"%s" %s, so what git is given cannot be read' % (a.raw, a.why or 'expands'))
        vals = [a.value for a in args]
        if verb == 'push':
            self.judge_push(u, dir_, vals)
        elif verb in ('send-pack', 'http-push'):
            self.refuse(push='"git %s" pushes refs without git push\'s checks; use git push.' % verb
                        if self.base_only else None,
                        release='"git %s" can send tags.' % verb if self.tagblock else None)
        elif verb == 'tag':
            self.judge_tag(vals)
        elif verb in ('update-ref', 'symbolic-ref'):
            if any('tags' in v.lower() or v.startswith('--stdin') for v in vals):
                self.refuse(release='"git %s" here writes a tag ref.' % verb)
        elif verb == 'fast-import':
            self.refuse(release='"git fast-import" creates the tags its input names.')

    def judge_tag(self, vals):
        if not vals:
            return
        listing = creating = positional = False
        for v in vals:
            if v.startswith('--'):
                name = v[2:].split('=', 1)[0]
                if name in ('list', 'delete', 'verify', 'contains', 'no-contains', 'merged', 'no-merged',
                            'points-at'):
                    listing = True
                elif name and any(w.startswith(name) for w in ('annotate', 'sign', 'local-user', 'message',
                                                                 'file', 'force', 'edit', 'create-reflog',
                                                                 'trailer', 'cleanup', 'no-sign')):
                    creating = True
            elif v.startswith('-') and len(v) > 1:
                if set(v[1:]) & set('asumFfe'):
                    creating = True
                if set(v[1:]) & set('ldvn'):
                    listing = True
            else:
                positional = True
        if creating or (positional and not listing):
            self.refuse(release='"git tag" here creates a tag.')

    def judge_push(self, u, dir_, vals):
        force = widen = odd = tagflag = None
        nofollow = False
        pos = []
        take = after = False
        for v in vals:
            if take:
                take = False
                continue
            if after:
                pos.append(v)
                continue
            if v == '--':
                after = True
                continue
            if v.startswith('--'):
                name = v[2:].split('=', 1)[0]
                if name in PUSH_PLAIN_LONG and '=' not in v:
                    nofollow = nofollow or name == 'no-follow-tags'
                    continue
                odd = odd or v
                if name:
                    if any(w.startswith(name) for w in PUSH_FORCING):
                        force = force or v
                    if any(w.startswith(name) for w in PUSH_WIDENING):
                        widen = widen or v
                    if any(w.startswith(name) for w in PUSH_TAGGING):
                        tagflag = tagflag or v
                    if '=' not in v and any(w.startswith(name) for w in PUSH_VALUE_LONG):
                        take = True
                continue
            if v.startswith('-') and len(v) > 1:
                letters = v[1:]
                if set(letters) - PUSH_PLAIN_SHORT:
                    odd = odd or v
                if set(letters) & set('fd'):
                    force = force or v
                if letters.endswith('o'):
                    take = True
                continue
            pos.append(v)

        # What can be decided from the words alone is decided before any git
        # runs, so a long list of refspecs cannot outrun the time budget.
        if self.base_only and not self.lead:
            cheap = tagflag or any(w.lower().lstrip('+').startswith('refs/tags/') or ':refs/tags/' in w.lower()
                                   or VERSION_TAG_RE.fullmatch(w.lstrip('+')) or w == 'tag' for w in pos)
            self.refuse(push='%s is not the lead, so it pushes nothing, the base branch included.' % self.who,
                        release='This push may send a tag.' if (self.tagblock and cheap) else None)
        if self.base_only and len(pos) > 2:
            self.refuse(push='It names %d refspecs, and the base branch or one version tag goes alone.'
                             % (len(pos) - 1))
        if len(pos) > MAX_PUSH_WORDS:
            self.unread('the push names %d words after its options, more than the %d this check reads'
                        % (len(pos), MAX_PUSH_WORDS))
        sure = u.sure and dir_ is not None
        repo = sure and self.is_repo(dir_)

        # Does it send a tag? yes, no or maybe.
        tagged = 'yes' if tagflag else 'no'
        for w in pos:
            k = self.ref_kind(dir_, sure, w)
            if k == 'tag':
                tagged = 'yes'
            elif k == 'maybe' and tagged == 'no':
                tagged = 'maybe'
        if not sure and tagged == 'no':
            tagged = 'maybe'
        follow = mirror = configured = recurse = None
        if repo:
            follow = self.config(dir_, '--type=bool', '--get', 'push.followTags')
            mirror = self.config(dir_, '--get-regexp', r'^remote\..*\.mirror$')
            configured = self.config(dir_, '--get-regexp', r'^remote\..*\.push$')
            recurse = (self.config(dir_, '--get', 'push.recurseSubmodules'),
                       self.config(dir_, '--type=bool', '--get', 'submodule.recurse'))
            if (follow[0] == 'set' and follow[1] == 'true' and not nofollow) or mirror[0] == 'set':
                tagged = 'yes'
            elif (follow[0] == 'error' or mirror[0] == 'error') and tagged == 'no':
                tagged = 'maybe'
            if len(pos) <= 1 and configured[0] != 'unset' and tagged == 'no':
                tagged = 'maybe'
        rel = None
        if self.tagblock and tagged != 'no':
            rel = ('This push sends a tag.' if tagged == 'yes'
                   else 'This push may send a tag, and which refs it sends cannot be read here.')

        if not self.base_only:
            if rel:
                self.refuse(release=rel)
            return
        if not self.lead:
            self.refuse(push='%s is not the lead, so it pushes nothing, the base branch included.' % self.who,
                        release=rel)
        if not sure:
            self.refuse(push='Where this push runs cannot be read: it changes directory in a way this check '
                             'does not follow. Run it as git -C <path> push, with no cd before it.', release=rel)
        if force:
            self.refuse(push='"%s" forces or deletes, and the base branch is only ever pushed plainly.' % force,
                        release=rel)
        if widen:
            self.refuse(push='"%s" sends more than the base branch.' % widen, release=rel)
        if odd:
            self.refuse(push='"%s" is not an option a plain push here takes; those are -u, -q, -v, -n, '
                             '--porcelain, --atomic, --no-verify and --no-follow-tags.' % odd, release=rel)
        if not self.base:
            self.refuse(push='With no base branch known, nothing is pushed.', release=rel)
        if not repo:
            self.refuse(push='%s is not a repository this check can read.' % dir_, release=rel)
        if len(pos) > 2:
            self.refuse(push='It names %d refspecs, and the base branch or one version tag goes alone.'
                             % (len(pos) - 1), release=rel)
        if mirror[0] != 'unset':
            self.refuse(push='The repository\'s config sets a remote\'s mirror key, which makes a push send '
                             'every ref.', release=rel)
        if follow[0] == 'error' or (follow[1] == 'true' and not nofollow):
            self.refuse(push='push.followTags is set, so this push would send tags with it; add '
                             '--no-follow-tags.', release=rel)
        rs, sr = recurse
        if rs[0] == 'error' or (rs[0] == 'set' and rs[1] not in ('no', 'check')) \
                or sr[0] == 'error' or (sr[0] == 'set' and sr[1] == 'true'):
            self.refuse(push='The repository\'s config pushes submodules with it, which sends their refs too.',
                        release=rel)
        b = self.base
        if len(pos) <= 1:
            rc, head = self.git(dir_, 'symbolic-ref', '-q', 'HEAD')
            if rc != 0 or head != 'refs/heads/' + b:
                self.refuse(push='A bare git push from %s sends %s, which is not the base branch, %s.'
                                 % (dir_, head[len('refs/heads/'):] if head.startswith('refs/heads/')
                                    else 'a detached HEAD', b), release=rel)
            if configured[0] != 'unset':
                self.refuse(push='The repository\'s config names push refspecs for a remote, and they, not '
                                 'the base branch alone, decide what a bare push sends. Name the branch: '
                                 'git push <remote> %s.' % b, release=rel)
            pd = self.config(dir_, '--get', 'push.default')
            if pd[0] == 'error' or (pd[0] == 'set' and pd[1] not in ('simple', 'current')):
                self.refuse(push='push.default is "%s", so a bare push may send more than %s, or send it '
                                 'somewhere else. Name the branch: git push <remote> %s.' % (pd[1], b, b),
                            release=rel)
            if rel:
                self.refuse(release=rel)
            return
        ref = pos[1]
        if ref in (b, 'refs/heads/' + b, b + ':' + b, b + ':refs/heads/' + b, 'refs/heads/' + b + ':' + b,
                   'refs/heads/' + b + ':refs/heads/' + b):
            if tagged != 'no':
                self.refuse(push='This push would send a tag with %s.' % b, release=rel)
            return
        tag = None
        if ref.startswith('refs/tags/') and ':' not in ref:
            tag = ref[len('refs/tags/'):]
        elif ':' in ref and ref.split(':', 1)[0] == ref.split(':', 1)[1] and ref.startswith('refs/tags/'):
            tag = ref.split(':', 1)[0][len('refs/tags/'):]
        elif ':' not in ref and self.ref_kind(dir_, True, ref) == 'tag':
            tag = ref
        if tag is not None and VERSION_TAG_RE.fullmatch(tag):
            if self.tagblock:
                self.refuse(release='Pushing the tag %s is a tag push.' % tag)
            if self.git(dir_, 'cat-file', '-t', 'refs/tags/' + tag) != (0, 'tag'):
                self.refuse(push='%s is a lightweight tag, or no tag at all, and only an annotated tag is '
                                 'pushed.' % tag)
            if self.git(dir_, 'show-ref', '--verify', '-q', 'refs/heads/' + tag)[0] == 0:
                self.refuse(push='A branch is named %s too, so the push cannot be read as the tag alone.' % tag)
            rc, commit = self.git(dir_, 'rev-parse', '-q', '--verify', 'refs/tags/%s^{commit}' % tag)
            if rc != 0 or self.git(dir_, 'merge-base', '--is-ancestor', commit, 'refs/heads/' + b)[0] != 0:
                self.refuse(push='%s points at a commit that is not on the base branch, %s.' % (tag, b))
            return
        if tag is not None or tagged != 'no':
            self.refuse(push='"%s" is a tag, and the one tag pushed is an annotated vMAJOR.MINOR.PATCH on '
                             'the base branch, pushed alone.' % ref, release=rel)
        self.refuse(push='"%s" is not the base branch, %s.' % (ref, b))

    def judge_gh(self, u, reader):
        words = u.words
        suffix = u.origin == 'suffix'
        i = 1
        while i < len(words):
            v = words[i].value
            if v in ('-R', '--repo'):
                i += 2
                continue
            if v is not None and (v.startswith('--repo=') or (v.startswith('-R') and len(v) > 2)):
                i += 1
                continue
            break
        if i >= len(words):
            return
        g = words[i]
        if g.value is None:
            if not suffix:
                self.unread('"%s" %s, so which gh command runs cannot be read' % (g.raw, g.why or 'expands'))
            return
        group = g.value
        if group.startswith('-'):
            if group in ('--version', '--help', '-h') or suffix:
                return
            self.unread('"%s" stands before gh\'s command, and gh may read the next word as its value' % group)
        if u.xargs and not suffix:
            self.unread('xargs hands gh words from standard input, which no check can see')
        if group not in GH_GROUPS:
            if not suffix:
                self.unread('"gh %s" is not one of gh\'s own commands, so it may be an alias or an extension, '
                            'which can run anything' % group)
            return
        sub = None
        j = i + 1
        if j < len(words):
            s = words[j]
            if s.value is None:
                if not suffix and group in ('pr', 'release', 'extension'):
                    self.unread('"%s" %s, so which gh %s command runs cannot be read'
                                % (s.raw, s.why or 'expands', group))
                return
            if s.value.startswith('-') and group in ('pr', 'release', 'extension') and not suffix \
                    and s.value not in ('--help', '-h'):
                self.unread('"%s" stands before the gh %s subcommand, and gh may read the next word as its '
                            'value' % (s.value, group))
            sub = s.value
        if group == 'pr' and sub in ('create', 'new'):
            if self.base_only:
                self.refuse(push='"gh pr create" opens a pull request, and the branch it proposes is a push '
                                 'the human did not grant.')
            return
        if group == 'extension' and sub == 'exec' and not suffix:
            self.unread('"gh extension exec" runs an extension, which can do anything')
        if group == 'release' and sub in ('create', 'new'):
            self.judge_release(words[j + 1:], reader)

    def judge_release(self, args, reader):
        if self.tagblock:
            self.refuse(release='"gh release create" makes a GitHub release, and creates its tag on the remote '
                                'when the tag is missing.')
        if self.release == 'tag':
            self.refuse(release='"gh release create" makes a GitHub release.')
        if self.release != 'github':
            return
        if not self.lead:
            self.refuse(release='%s is not the lead.' % self.who)
        if reader.assigns:
            self.unread('the command assigns %s, and a variable can change what gh does' % reader.assigns[0])
        vals = []
        for a in args:
            if a.value is None:
                self.unread('"%s" %s, so what gh is given cannot be read' % (a.raw, a.why or 'expands'))
            vals.append(a.value)
        if '--' in vals:
            self.refuse(release='"--" ends gh\'s options, so a --verify-tag after it is not a flag; '
                                'write the command without it.')
        odd = [v for v in vals if 'verify-tag' in v and v != '--verify-tag']
        if odd:
            self.refuse(release='"%s" sets verify-tag with a value, and only the bare --verify-tag is read: '
                                'a later --verify-tag=false turns it off.' % odd[0])
        if vals.count('--verify-tag') != 1:
            self.refuse(release='Give --verify-tag exactly once, bare, which makes gh stop when the tag is not '
                                'already on the remote; without it gh creates the tag itself.')
        if any(v == '--target' or v.startswith('--target=') for v in vals):
            self.refuse(release='--target names where gh creates a missing tag, and the tag must already '
                                'exist.')


def relevant(command, policy):
    """Whether the raw text names git or gh with a word about pushing,
    tagging or releasing, for the commands no lexing can open."""
    flat = command.lower().replace('\\', '').replace('"', '').replace("'", '')
    words = set(re.split(r'[^a-z0-9_./-]+', flat))
    names = {w.rstrip('/').split('/')[-1] for w in words}
    git = any(n == 'git' or n.startswith('git-') for n in names)
    gh = 'gh' in names
    if policy.gitblock and git and (names & GIT_WORDS or any(n[4:] in GIT_WORDS for n in names if n.startswith('git-'))):
        return True
    return gh and bool(names & GH_WORDS)


class Guard:
    """The settings guard's write-tool half: no agent but the lead aims Write,
    Edit, MultiEdit or NotebookEdit at the main checkout's
    .claude/coder-fleet.json, through a symlink, a hard link or another case
    of the name (CF-209.3, the human's decision of card comment 4). The Bash
    half is a text match in lib/push-policy.sh."""

    def __init__(self, req):
        self.cwd = req.get('cwd') or ''
        self.config = os.path.join(req.get('main') or '', '.claude', 'coder-fleet.json')

    def check_path(self, path):
        if not path:
            return
        target = os.path.realpath(os.path.join(self.cwd or '/', path))
        # APFS, the default macOS filesystem, folds case.
        same = target.casefold() == os.path.realpath(self.config).casefold()
        try:
            same = same or (os.path.exists(target) and os.path.exists(self.config)
                            and os.path.samefile(target, self.config))
        except OSError:
            pass
        if same:
            raise Refuse('settings guard: only the lead changes %s, which holds the push and release '
                         'settings the scope hook enforces. Say in your handoff what should change, and '
                         'the lead decides.' % self.config)


def main():
    try:
        req = json.load(sys.stdin)
    except Exception:
        print('deny\tpush and release policy: the scope hook sent a request this check could not read, so '
              'the command is refused.')
        return
    policy = Policy(req)
    active = bool(req.get('active'))
    command = req.get('command') or ''
    try:
        if req.get('mode') == 'path':
            Guard(req).check_path(req.get('path') or '')
            print('ok')
            return
        if len(command) > MAX_COMMAND:
            if active and relevant(command, policy):
                policy.unread('the command is over %d bytes' % MAX_COMMAND)
            print('ok')
            return
        reader = Reader(req)
        reader.read(command, policy.cwd, True, 'command', 0)
        if active:
            if relevant(command, policy):
                if reader.open:
                    policy.unread('it has %s' % reader.open[0])
                if reader.strings:
                    policy.unread(reader.strings[0])
                if reader.stdin_shell:
                    policy.unread('it pipes text into a shell, and what the shell runs is not in the command')
                if len(reader.units) > MAX_UNITS:
                    policy.unread('it holds %d commands, more than the %d this check reads'
                                  % (len(reader.units), MAX_UNITS))
            for name, text in reader.coded:
                if relevant(text, policy):
                    policy.unread('"%s" runs code that names git or gh, which this check cannot read; run the '
                                  'git or gh command itself' % name)
            policy.judge(reader)
    except Refuse as r:
        print('deny\t' + str(r).replace('\n', ' ').replace('\t', ' '))
        return
    except RecursionError:
        print('deny\tpush and release policy: the command nests too deeply to read, so it is refused.')
        return
    print('ok')


if __name__ == '__main__':
    main()
