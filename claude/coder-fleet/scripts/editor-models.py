#!/usr/bin/env python3
"""editor-models.py - read or record a project's editor answers (CF-12.5).

    editor-models.py status [--root DIR]
    editor-models.py set <spec|tech> <opus|fable|neither> [--root DIR]

Each of the two editors, the spec editor and the tech editor, has one answer
per project: opus, fable or neither (CF-12 spec Q3, Q12). It is recorded twice
(Q8, Q16):

  - a line in the project's AGENTS.md, `Spec editor: <answer>` or
    `Tech editor: <answer>`, which the lead reads to pick the definition to
    spawn and challenge-gate.py reads to decide whether the gate applies;
  - deny rules in .claude/settings.json, `Agent(coder-fleet:<name>)` under
    permissions.deny, for every definition the project did not choose: opus
    denies the -fable definition, fable the unsuffixed one, neither both.

A line is read as challenge-gate.py reads the spec line: the first line
starting exactly `<Spec|Tech> editor:`, its value trimmed and a pair of
backticks around it dropped. An empty value or one starting `<` is no answer.
Any value but opus, fable or neither, in any case, is unreadable.

`set` records an answer only where none is recorded: /init and /kickoff ask
once (Q9), and changing an answer is a hand edit of both the line and the
rules. It writes the deny rules first, then the line, so a rerun after a
failed line write adds nothing twice.

The settings file is never re-serialised. It is parsed only to check it, and
the missing rules are inserted into its text: appended to an existing deny
list, or as a new `deny` member at the end of `permissions`, or a new
`permissions` member at the end of the top-level object. Every other byte
stays as it was - number literals, key order, compact arrays, indentation,
a missing final newline - and new lines take the indentation the file
already uses. The result is parsed again and must equal the original plus
the new rules. A file that does not exist is created; its mode is the umask
default, and a file that exists keeps its mode. Both files are written through
a symlink rather than replacing it.

The line goes in place of a placeholder, else straight after the other
editor's line, else at the end of the `## Where work lives` section, else at
the end of the file. Nothing else in AGENTS.md changes.

It refuses, changing neither file, when AGENTS.md is missing, an answer is
recorded or unreadable, settings.json is not UTF-8 JSON, has a duplicate key,
or is not an object with an object `permissions` and a list `deny`, or the
chosen definition is already denied.

Exit codes: 0 done; 1 refused, nothing changed; 2 usage; 3 a file could not
be read or written, and the message says which and whether the rules were
written before it failed.

The root is --root, else the git top level of the working directory, else the
working directory.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

EDITORS = {'spec': ('Spec editor', 'spec-editor'), 'tech': ('Tech editor', 'tech-editor')}
ANSWERS = ('opus', 'fable', 'neither')
PREFIX = 'coder-fleet:'
WHERE_RE = re.compile(r'^## Where work lives\s*$')
SECTION_RE = re.compile(r'^## ')
SCALAR_RE = re.compile(r'-?(?:\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|NaN|-?Infinity')
WS = ' \t\r\n'


class Usage(Exception):
    pass


class Refused(Exception):
    pass


class FileError(Exception):
    pass


# --- AGENTS.md ---------------------------------------------------------------

def read_bytes(path):
    with open(path, 'rb') as f:
        return f.read()


def split_lines(data):
    return data.decode('utf-8', 'surrogateescape').splitlines(keepends=True)


def body(line):
    if line.endswith('\r\n'):
        return line[:-2]
    if line.endswith('\n') or line.endswith('\r'):
        return line[:-1]
    return line


def record_index(lines, editor):
    """The index of the editor's record line, or None."""
    label = EDITORS[editor][0] + ':'
    for i, line in enumerate(lines):
        if body(line).startswith(label):
            return i
    return None


def answer_of(line, editor):
    """None (no answer), 'opus', 'fable', 'neither', or ('bad', value)."""
    value = body(line).rstrip()[len(EDITORS[editor][0]) + 1:].strip()
    if value.startswith('`') and value.endswith('`') and len(value) >= 2:
        value = value[1:-1].strip()
    if not value or value.startswith('<'):
        return None
    if value.lower() in ANSWERS:
        return value.lower()
    return ('bad', value)


def read_answer(agents_path, editor):
    try:
        lines = split_lines(read_bytes(agents_path))
    except FileNotFoundError:
        return None
    i = record_index(lines, editor)
    return None if i is None else answer_of(lines[i], editor)


def describe(answer):
    if answer is None:
        return 'none'
    if isinstance(answer, tuple):
        return 'unreadable (%s)' % answer[1]
    return answer


def plan_agents(lines, editor, answer):
    label = EDITORS[editor][0]
    i = record_index(lines, editor)
    if i is not None:
        line = lines[i]
        lines[i] = '%s: %s%s' % (label, answer, line[len(body(line)):])
        return ''.join(lines)
    eol = '\r\n' if lines and lines[0].endswith('\r\n') else '\n'
    new = '%s: %s%s' % (label, answer, eol)
    other = record_index(lines, 'tech' if editor == 'spec' else 'spec')
    if other is not None:
        at = other + 1
        if lines[other] == body(lines[other]):
            lines[other] += eol
        return ''.join(lines[:at] + [new] + lines[at:])
    start = next((k for k, l in enumerate(lines) if WHERE_RE.match(body(l))), None)
    if start is not None:
        end = next((k for k in range(start + 1, len(lines)) if SECTION_RE.match(body(lines[k]))), len(lines))
        last = end
        while last > start + 1 and not body(lines[last - 1]).strip():
            last -= 1
        if last == end:
            if lines[end - 1] == body(lines[end - 1]):
                lines[end - 1] += eol
            return ''.join(lines[:end] + [eol, new] + lines[end:])
        return ''.join(lines[:last] + [eol, new] + lines[last:])
    if lines and lines[-1] == body(lines[-1]):
        lines[-1] += eol
    tail = [eol] if lines and body(lines[-1]).strip() else []
    return ''.join(lines + tail + [new])


# --- settings.json: parse to check, then insert into the text -----------------

def no_duplicates(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError('duplicate key %s' % json.dumps(key))
        seen[key] = value
    return seen


def skip_ws(s, i):
    while i < len(s) and s[i] in WS:
        i += 1
    return i


def scan_string(s, i):
    j = i + 1
    while s[j] != '"':
        j += 2 if s[j] == '\\' else 1
    return json.loads(s[i:j + 1]), j + 1


def scan(s, i):
    """A value's span in text json.loads has already accepted: a dict with
    start, end, and members (key, key start, key end, value) or items."""
    i = skip_ws(s, i)
    c = s[i]
    if c in '{[':
        node = {'start': i, 'obj': c == '{', 'members': [], 'items': []}
        close = '}' if c == '{' else ']'
        i = skip_ws(s, i + 1)
        if s[i] == close:
            node['end'] = i + 1
            return node, i + 1
        while True:
            i = skip_ws(s, i)
            if node['obj']:
                key, kend = scan_string(s, i)
                kstart = i
                i = skip_ws(s, kend) + 1
                value, i = scan(s, i)
                node['members'].append((key, kstart, kend, value))
            else:
                value, i = scan(s, i)
                node['items'].append(value)
            i = skip_ws(s, i)
            if s[i] == ',':
                i += 1
                continue
            node['end'] = i + 1
            return node, i + 1
    if c == '"':
        _, end = scan_string(s, i)
    else:
        end = SCALAR_RE.match(s, i).end()
    return {'start': i, 'end': end, 'obj': None}, end


def containers(node):
    if node.get('obj') is None:
        return
    yield node
    for child in [m[3] for m in node['members']] + node['items']:
        yield from containers(child)


def line_indent(s, pos):
    start = s.rfind('\n', 0, pos) + 1
    j = start
    while j < len(s) and s[j] in ' \t':
        j += 1
    return s[start:j]


class Style:
    """How the file lays itself out, read from the file."""

    def __init__(self, s, top):
        m = re.search(r'^([ \t]+)"', s, re.M)
        self.unit = m.group(1) if m else '  '
        self.multi = '\n' in s[top['start']:top['end']]
        self.key_sep = None
        self.item_sep = None
        for c in containers(top):
            if self.key_sep is None and c['members']:
                _, _, kend, value = c['members'][0]
                gap = s[kend:value['start']]
                self.key_sep = gap if '\n' not in gap else ': '
            spans = [m[3] for m in c['members']] if c['obj'] else c['items']
            heads = [m[1] for m in c['members']] if c['obj'] else [v['start'] for v in c['items']]
            if self.item_sep is None and len(spans) >= 2:
                gap = s[spans[0]['end']:heads[1]]
                if '\n' not in gap:
                    self.item_sep = gap
        if self.key_sep is None:
            self.key_sep = ': '
        if self.item_sep is None:
            self.item_sep = ', ' if self.key_sep.endswith(' ') else ','

    def render(self, value, indent, multi):
        if not multi:
            return json.dumps(value, separators=(self.item_sep, self.key_sep))
        inner = indent + self.unit
        if isinstance(value, list):
            return '[\n' + ',\n'.join(inner + json.dumps(v) for v in value) + '\n' + indent + ']'
        return '{\n' + ',\n'.join(inner + json.dumps(k) + self.key_sep + self.render(v, inner, True)
                                  for k, v in value.items()) + '\n' + indent + '}'


def add_member(s, style, obj, key, value):
    if obj['members']:
        last = obj['members'][-1][3]
        if '\n' in s[obj['start']:obj['end']]:
            indent = line_indent(s, obj['members'][0][1])
            text = ',\n' + indent + json.dumps(key) + style.key_sep + style.render(value, indent, True)
        else:
            text = style.item_sep + json.dumps(key) + style.key_sep + style.render(value, '', False)
        return s[:last['end']] + text + s[last['end']:]
    indent = line_indent(s, obj['start'])
    if style.multi:
        inner = indent + style.unit
        text = ('{\n' + inner + json.dumps(key) + style.key_sep + style.render(value, inner, True)
                + '\n' + indent + '}')
    else:
        text = style.render({key: value}, '', False)
    return s[:obj['start']] + text + s[obj['end']:]


def add_items(s, style, arr, values):
    if arr['items']:
        first, last = arr['items'][0], arr['items'][-1]
        if '\n' in s[arr['start']:first['start']]:
            indent = line_indent(s, first['start'])
            text = ''.join(',\n' + indent + json.dumps(v) for v in values)
        else:
            sep = s[first['end']:arr['items'][1]['start']] if len(arr['items']) > 1 else style.item_sep
            text = ''.join(sep + json.dumps(v) for v in values)
        return s[:last['end']] + text + s[last['end']:]
    text = style.render(values, line_indent(s, arr['start']), style.multi)
    return s[:arr['start']] + text + s[arr['end']:]


def member(obj, key):
    return next((m[3] for m in obj['members'] if m[0] == key), None)


def plan_settings(path, editor, answer):
    """(new text or None when nothing changes, rules added, rules present)."""
    if os.path.exists(path):
        try:
            data = read_bytes(path)
        except OSError as e:
            raise FileError('could not read %s (%s); nothing was changed' % (path, e.strerror or e))
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError:
            raise Refused('%s is not UTF-8; fix it and run this again' % path)
        try:
            settings = json.loads(text, object_pairs_hook=no_duplicates)
        except ValueError as e:
            raise Refused('%s is not valid JSON or repeats a key (%s); fix it and run this again' % (path, e))
    else:
        text, settings = None, {}
    if not isinstance(settings, dict):
        raise Refused('%s is not a JSON object' % path)
    perms = settings.get('permissions', {})
    if not isinstance(perms, dict):
        raise Refused('%s has a "permissions" that is not an object' % path)
    deny = perms.get('deny', [])
    if not isinstance(deny, list):
        raise Refused('%s has a "permissions.deny" that is not a list' % path)
    chosen = set(denied_names(editor, answer))
    for name in (EDITORS[editor][1], EDITORS[editor][1] + '-fable'):
        if name not in chosen and rule(name) in deny:
            raise Refused('%s already denies %s, the definition this answer chooses; remove that rule by hand '
                          'if the answer is right' % (path, rule(name)))
    wanted = [rule(n) for n in denied_names(editor, answer)]
    added = [r for r in wanted if r not in deny]
    present = [r for r in wanted if r in deny]
    if not added:
        return None, added, present
    if text is None:
        new = json.dumps({'permissions': {'deny': added}}, indent=2) + '\n'
    else:
        top, _ = scan(text, 0)
        style = Style(text, top)
        perms_node = member(top, 'permissions')
        if perms_node is None:
            new = add_member(text, style, top, 'permissions', {'deny': added})
        else:
            deny_node = member(perms_node, 'deny')
            if deny_node is None:
                new = add_member(text, style, perms_node, 'deny', added)
            else:
                new = add_items(text, style, deny_node, added)
    expected = dict(settings)
    expected['permissions'] = dict(perms, deny=deny + added)
    try:
        check = json.loads(new, object_pairs_hook=no_duplicates)
    except ValueError:
        check = None
    if check != expected or list(check) != list(expected):
        raise Refused('could not add the rules to %s without changing anything else; add %s by hand'
                      % (path, ', '.join(added)))
    return new, added, present


def denied_names(editor, answer):
    name = EDITORS[editor][1]
    return {'opus': [name + '-fable'], 'fable': [name], 'neither': [name, name + '-fable']}[answer]


def rule(name):
    return 'Agent(%s%s)' % (PREFIX, name)


# --- writing -----------------------------------------------------------------

def umask():
    mask = os.umask(0)
    os.umask(mask)
    return mask


def write_atomic(path, data):
    """Replaces path's content through any symlink, keeping an existing mode
    and giving a new file the umask default."""
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix='.editor-models.')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
        if os.path.exists(path):
            os.chmod(tmp, os.stat(path).st_mode & 0o7777)
        else:
            os.chmod(tmp, 0o666 & ~umask())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def root_of(args):
    if '--root' in args:
        i = args.index('--root')
        if i + 1 >= len(args):
            raise Usage('--root needs a directory')
        root = args[i + 1]
        del args[i:i + 2]
        return root
    try:
        out = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True, check=False)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except OSError:
        pass
    return os.getcwd()


def status(root):
    agents = os.path.realpath(os.path.join(root, 'AGENTS.md'))
    try:
        answers = [read_answer(agents, editor) for editor in ('spec', 'tech')]
    except OSError as e:
        raise FileError('could not read %s (%s)' % (agents, e.strerror or e))
    for editor, answer in zip(('spec', 'tech'), answers):
        print('%s editor: %s' % (editor, describe(answer)))
    return 0


def set_answer(root, editor, answer):
    agents = os.path.realpath(os.path.join(root, 'AGENTS.md'))
    settings = os.path.realpath(os.path.join(root, '.claude', 'settings.json'))
    label = EDITORS[editor][0]
    try:
        lines = split_lines(read_bytes(agents))
    except FileNotFoundError:
        raise Refused('%s does not exist; run /coder-fleet:init first' % agents)
    except OSError as e:
        raise FileError('could not read %s (%s); nothing was changed' % (agents, e.strerror or e))
    i = record_index(lines, editor)
    current = None if i is None else answer_of(lines[i], editor)
    if isinstance(current, tuple):
        raise Refused('AGENTS.md says "%s: %s", which is not opus, fable or neither; fix the line by hand, '
                      'and the deny rules with it' % (label, current[1]))
    if current is not None:
        raise Refused('AGENTS.md already records "%s: %s"; init and kickoff ask once, so change it by hand, '
                      'the line and the deny rules together' % (label, current))
    new_settings, added, present = plan_settings(settings, editor, answer)
    new_agents = plan_agents(lines, editor, answer).encode('utf-8', 'surrogateescape')
    if new_settings is not None:
        try:
            os.makedirs(os.path.dirname(settings), exist_ok=True)
            write_atomic(settings, new_settings.encode('utf-8'))
        except OSError as e:
            raise FileError('could not write %s (%s); nothing was changed' % (settings, e.strerror or e))
    try:
        write_atomic(agents, new_agents)
    except OSError as e:
        done = ('the deny rules are written to %s, but ' % settings) if new_settings is not None else ''
        raise FileError('%scould not write %s (%s); fix that and run this again, which adds no rule twice'
                        % (done, agents, e.strerror or e))
    print('recorded: %s: %s in %s' % (label, answer, agents))
    for r in added:
        print('denied: %s in %s' % (r, settings))
    for r in present:
        print('already denied: %s' % r)
    return 0


def main(argv):
    args = list(argv)
    try:
        if not args:
            raise Usage('usage: editor-models.py status|set <spec|tech> <opus|fable|neither> [--root DIR]')
        cmd = args.pop(0)
        if cmd not in ('status', 'set'):
            raise Usage('unknown command %r; use status or set' % cmd)
        root = root_of(args)
        if cmd == 'status':
            if args:
                raise Usage('usage: editor-models.py status [--root DIR]')
            return status(root)
        if len(args) != 2 or args[0] not in EDITORS or args[1].lower() not in ANSWERS:
            raise Usage('usage: editor-models.py set <spec|tech> <opus|fable|neither> [--root DIR]')
        return set_answer(root, args[0], args[1].lower())
    except Usage as e:
        print('editor-models: %s' % e, file=sys.stderr)
        return 2
    except Refused as e:
        print('editor-models: refused: %s' % e, file=sys.stderr)
        return 1
    except FileError as e:
        print('editor-models: %s' % e, file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
