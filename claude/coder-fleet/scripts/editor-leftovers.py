#!/usr/bin/env python3
"""editor-leftovers.py - find and remove what an earlier /init wrote for the editors.

    editor-leftovers.py status [--root DIR]
    editor-leftovers.py remove [--root DIR]

Both editors, spec-editor and tech-editor, run in every project, and
/coder-fleet:agents disable is the one switch for either. An earlier /init
asked whether a project ran each editor and wrote the answer down twice; both
are leftovers now, which /kickoff finds with `status` and, on the human's yes,
removes with `remove`:

  - in AGENTS.md, every line starting exactly `Spec editor:` or `Tech editor:`,
    and the template's explanatory paragraph beginning `Those two lines say`
    when it follows them;
  - in .claude/settings.json and .claude/settings.local.json, every
    permissions.deny entry that is exactly `Agent(coder-fleet:spec-editor)`,
    `Agent(coder-fleet:tech-editor)`, or either with `-fable` appended.

Nothing else is touched. A removed AGENTS.md line or paragraph takes one blank
line beside it, so the file keeps one blank line between the paragraphs that
were around it. A settings file is never re-serialised: each removed entry
takes the comma beside it, a list that empties becomes `[]`, and every other
byte stays as it was - key order, number literals, indentation, compact
lists, a missing final newline. The result is parsed again and must equal the
original less the removed entries.

`remove` checks every file before it writes any. It refuses, changing nothing,
when a settings file is not UTF-8 JSON, has a duplicate key, or is a link
resolving outside the project. A file keeps its mode, and a link is written
through rather than replaced.

Output is one `<kind>\\t<file>\\t<what>` line per leftover, `found` for status
and `removed` for remove, then `state: none`, `state: found` or
`state: removed`. A refusal prints `refused\\t<file>\\t<why>`.

Exit codes: 0 done; 1 refused, nothing changed; 2 usage; 3 a file could not be
read or written, and the message says which files were already written. A
rerun after 3 is safe: it finds only what is left.
"""

import json
import os
import re
import stat
import subprocess
import sys
import tempfile

RULES = ('Agent(coder-fleet:spec-editor)', 'Agent(coder-fleet:tech-editor)',
         'Agent(coder-fleet:spec-editor-fable)', 'Agent(coder-fleet:tech-editor-fable)')
SETTINGS = ('.claude/settings.json', '.claude/settings.local.json')
LINE_RE = re.compile(r'^(Spec|Tech) editor:')
PARAGRAPH = 'Those two lines say'


class Refused(Exception):
    pass


class Usage(Exception):
    pass


def body(line):
    return line.rstrip('\r\n')


# --- AGENTS.md -----------------------------------------------------------------

def agents_plan(text):
    """(new text, [(line number, line)]) with every leftover line removed."""
    lines = text.splitlines(keepends=True)
    drop = set()
    found = []
    for i, line in enumerate(lines):
        if LINE_RE.match(body(line)):
            drop.add(i)
            found.append((i + 1, body(line)))
    if not found:
        return text, []
    # The template's paragraph, after a blank line, following an editor line.
    for i in sorted(drop):
        j = i + 1
        while j in drop:
            j += 1
        if j + 1 < len(lines) and not body(lines[j]).strip() and body(lines[j + 1]).startswith(PARAGRAPH):
            k = j + 1
            while k < len(lines) and body(lines[k]).strip():
                drop.add(k)
                found.append((k + 1, body(lines[k])))
                k += 1
            drop.add(j)
    # Each dropped run takes one blank separator, so the paragraphs around it
    # keep the one blank line between them.
    i = 0
    while i < len(lines):
        if i not in drop:
            i += 1
            continue
        end = i
        while end in drop:
            end += 1
        before_blank = i > 0 and (i - 1) not in drop and not body(lines[i - 1]).strip()
        after_blank = end < len(lines) and not body(lines[end]).strip()
        if after_blank and (before_blank or i == 0):
            drop.add(end)
        elif before_blank and end >= len(lines):
            drop.add(i - 1)
        i = end + 1
    out = ''.join(l for n, l in enumerate(lines) if n not in drop)
    # A file whose last kept line had no newline of its own keeps that shape;
    # one that ended in a newline still does.
    if text.endswith(('\n', '\r')) and out and not out.endswith(('\n', '\r')):
        out += '\r\n' if text.endswith('\r\n') else '\n'
    found.sort()
    return out, found


# --- JSON, located by byte span --------------------------------------------------

class Scanner:
    """Spans of a JSON text's values, for the one path this script edits."""

    WS = ' \t\r\n'

    def __init__(self, text):
        self.t = text

    def ws(self, i):
        while i < len(self.t) and self.t[i] in self.WS:
            i += 1
        return i

    def string_end(self, i):
        i += 1
        while self.t[i] != '"':
            i += 2 if self.t[i] == '\\' else 1
        return i + 1

    def value(self, i):
        """(start, end, kind, children). Objects: [(key, start, end, children)];
        arrays: [(start, end, children)]."""
        i = self.ws(i)
        c = self.t[i]
        if c == '"':
            return i, self.string_end(i), 'string', None
        if c == '{':
            kids, j = [], self.ws(i + 1)
            if self.t[j] == '}':
                return i, j + 1, 'object', kids
            while True:
                j = self.ws(j)
                ke = self.string_end(j)
                key = json.loads(self.t[j:ke])
                j = self.ws(ke) + 1
                s, e, kind, ch = self.value(j)
                kids.append((key, s, e, kind, ch))
                j = self.ws(e)
                if self.t[j] == '}':
                    return i, j + 1, 'object', kids
                j += 1
        if c == '[':
            kids, j = [], self.ws(i + 1)
            if self.t[j] == ']':
                return i, j + 1, 'array', kids
            while True:
                s, e, kind, ch = self.value(j)
                kids.append((s, e, kind, ch))
                j = self.ws(e)
                if self.t[j] == ']':
                    return i, j + 1, 'array', kids
                j += 1
        j = i
        while j < len(self.t) and self.t[j] not in self.WS + ',]}':
            j += 1
        return i, j, 'scalar', None


def no_duplicates(pairs):
    seen = set()
    for k, _ in pairs:
        if k in seen:
            raise Refused('it has the key "%s" twice, so which one counts is unknown' % k)
        seen.add(k)
    return dict(pairs)


def parse(text):
    def constant(name):
        raise ValueError(name)
    return json.loads(text, object_pairs_hook=no_duplicates, parse_constant=constant)


def settings_plan(text):
    """(new text, [rule]) with every leftover deny entry removed."""
    try:
        data = parse(text)
    except Refused:
        raise
    except ValueError as e:
        raise Refused('it is not valid JSON (%s)' % e)
    perms = data.get('permissions') if isinstance(data, dict) else None
    deny = perms.get('deny') if isinstance(perms, dict) else None
    if not isinstance(deny, list) or not any(isinstance(r, str) and r in RULES for r in deny):
        return text, []
    _, _, _, top = Scanner(text).value(0)
    p = next(k for k in top if k[0] == 'permissions')
    d = next(k for k in p[4] if k[0] == 'deny')
    start, end, _, elems = d[1], d[2], d[3], d[4]
    t = text
    pres, posts = [], []
    for n, (s, e, _, _) in enumerate(elems):
        prev = start + 1 if n == 0 else t.index(',', elems[n - 1][1], s) + 1
        pres.append(t[prev:s])
        nxt = end - 1 if n == len(elems) - 1 else t.index(',', e, elems[n + 1][0])
        posts.append(t[e:nxt])
    keep = [n for n, (s, e, _, _) in enumerate(elems) if json.loads(t[s:e]) not in RULES]
    removed = [json.loads(t[s:e]) for n, (s, e, _, _) in enumerate(elems) if n not in keep]
    if not keep:
        new_list = '[]'
    else:
        parts = []
        for idx, n in enumerate(keep):
            pre = pres[n]
            if idx == 0 and '\n' not in pre:
                pre = pres[0]
            post = posts[n] if idx < len(keep) - 1 else posts[-1]
            parts.append(pre + t[elems[n][0]:elems[n][1]] + post)
        new_list = '[' + ','.join(parts) + ']'
    out = t[:start] + new_list + t[end:]
    want = data
    want['permissions']['deny'] = [r for r in deny if not (isinstance(r, str) and r in RULES)]
    if parse(out) != want:
        raise Refused('the edit would change more than the deny entries, so it is not made')
    return out, removed


# --- files -------------------------------------------------------------------

def project_root(arg):
    if arg:
        return os.path.realpath(arg)
    r = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True)
    return os.path.realpath(r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else os.getcwd())


def target(root, rel):
    """The real file behind rel, refused when a link leads outside root."""
    path = os.path.join(root, rel)
    real = os.path.realpath(path)
    if os.path.islink(path) and not (real == root or real.startswith(root + os.sep)):
        raise Refused('it is a link to %s, outside the project' % real)
    return real


def read_text(path):
    with open(path, 'rb') as f:
        data = f.read()
    try:
        return data.decode('utf-8')
    except UnicodeDecodeError:
        raise Refused('it is not UTF-8')


def write_whole(path, text):
    directory = os.path.dirname(path) or '.'
    mode = stat.S_IMODE(os.stat(path).st_mode)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix='.' + os.path.basename(path) + '.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
            f.write(text)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def plan(root):
    """[(rel, real path, new text, [(kind, what)])], refusing before any write."""
    plans, refusals = [], []
    for rel, planner in [('AGENTS.md', 'agents')] + [(s, 'settings') for s in SETTINGS]:
        path = os.path.join(root, rel)
        if not os.path.lexists(path):
            continue
        try:
            real = target(root, rel)
            text = read_text(real)
            if planner == 'agents':
                new, found = agents_plan(text)
                items = [('AGENTS.md:%d' % n, line) for n, line in found]
            else:
                new, found = settings_plan(text)
                items = [(rel, r) for r in found]
        except Refused as e:
            refusals.append((rel, str(e)))
            continue
        if items:
            plans.append((rel, real, new, items))
    return plans, refusals


def main(argv):
    args = list(argv)
    root = None
    if '--root' in args:
        i = args.index('--root')
        if i + 1 >= len(args):
            raise Usage('--root needs a directory')
        root = args[i + 1]
        del args[i:i + 2]
    if len(args) != 1 or args[0] not in ('status', 'remove'):
        raise Usage('usage: editor-leftovers.py status|remove [--root DIR]')
    root = project_root(root)
    plans, refusals = plan(root)
    for rel, why in refusals:
        print('refused\t%s\t%s' % (rel, why))
    if args[0] == 'status':
        for _, _, _, items in plans:
            for where, what in items:
                print('found\t%s\t%s' % (where, what))
        print('state: %s' % ('found' if plans else 'none'))
        return 1 if refusals else 0
    if refusals:
        print('Nothing was removed: fix the file named above, then run this again.')
        return 1
    written = []
    for rel, real, new, items in plans:
        try:
            write_whole(real, new)
        except OSError as e:
            print('error\t%s\t%s' % (rel, e))
            print('Already written: %s. Run this again once the file can be written.' % (', '.join(written) or 'nothing'))
            return 3
        written.append(rel)
        for where, what in items:
            print('removed\t%s\t%s' % (where, what))
    print('state: %s' % ('removed' if plans else 'none'))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Usage as e:
        sys.stderr.write('editor-leftovers.py: %s\n' % e)
        sys.exit(2)
    except OSError as e:
        sys.stderr.write('editor-leftovers.py: %s\n' % e)
        sys.exit(3)
