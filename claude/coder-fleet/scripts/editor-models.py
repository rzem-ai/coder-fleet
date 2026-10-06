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
rules. It writes the deny rules first, adding only those missing to the end of
the list and touching no other key, then the line: in place of a placeholder,
else straight after the other editor's line, else at the end of the
`## Where work lives` section, else at the end of the file. A rerun after a
failed line write therefore adds nothing twice. It refuses, changing neither
file, when AGENTS.md is missing, an answer is recorded or unreadable, the
settings are not a JSON object with an object `permissions` and a list
`deny`, or the chosen definition is already denied.

Exit codes: 0 done, 1 refused, 2 usage.

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


class Usage(Exception):
    pass


class Refused(Exception):
    pass


# --- reading -----------------------------------------------------------------

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


def denied_names(editor, answer):
    name = EDITORS[editor][1]
    return {'opus': [name + '-fable'], 'fable': [name], 'neither': [name, name + '-fable']}[answer]


def rule(name):
    return 'Agent(%s%s)' % (PREFIX, name)


# --- writing -----------------------------------------------------------------

def write_atomic(path, data):
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix='.editor-models.')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
        if os.path.exists(path):
            os.chmod(tmp, os.stat(path).st_mode & 0o7777)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def indent_of(text):
    """The indent unit a JSON file uses, from its first indented key."""
    m = re.search(r'^([ \t]+)"', text, re.M)
    if not m:
        return 2
    unit = m.group(1)
    return unit if '\t' in unit else len(unit)


def plan_settings(path, editor, answer):
    """(new bytes or None when nothing changes, rules added, rules present)."""
    if os.path.exists(path):
        text = read_bytes(path).decode('utf-8')
        try:
            settings = json.loads(text)
        except ValueError as e:
            raise Refused('%s is not valid JSON (%s); fix it and run this again' % (path, e))
        indent = indent_of(text)
    else:
        settings, indent = {}, 2
    if not isinstance(settings, dict):
        raise Refused('%s is not a JSON object' % path)
    perms = settings.get('permissions', {})
    if not isinstance(perms, dict):
        raise Refused('%s has a "permissions" that is not an object' % path)
    deny = perms.get('deny', [])
    if not isinstance(deny, list):
        raise Refused('%s has a "permissions.deny" that is not a list' % path)
    for name in (EDITORS[editor][1], EDITORS[editor][1] + '-fable'):
        if name not in denied_names(editor, answer) and rule(name) in deny:
            raise Refused('%s already denies %s, the definition this answer chooses; remove that rule by hand '
                          'if the answer is right' % (path, rule(name)))
    wanted = [rule(n) for n in denied_names(editor, answer)]
    added = [r for r in wanted if r not in deny]
    present = [r for r in wanted if r in deny]
    if not added:
        return None, added, present
    perms = dict(perms)
    perms['deny'] = deny + added
    settings['permissions'] = perms
    return (json.dumps(settings, indent=indent, ensure_ascii=False) + '\n').encode('utf-8'), added, present


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
    agents = os.path.join(root, 'AGENTS.md')
    for editor in ('spec', 'tech'):
        print('%s editor: %s' % (editor, describe(read_answer(agents, editor))))
    return 0


def set_answer(root, editor, answer):
    agents = os.path.join(root, 'AGENTS.md')
    settings = os.path.join(root, '.claude', 'settings.json')
    label = EDITORS[editor][0]
    try:
        lines = split_lines(read_bytes(agents))
    except FileNotFoundError:
        raise Refused('%s does not exist; run /coder-fleet:init first' % agents)
    current = read_answer(agents, editor)
    if isinstance(current, tuple):
        raise Refused('AGENTS.md says "%s: %s", which is not opus, fable or neither; fix the line by hand, '
                      'and the deny rules with it' % (label, current[1]))
    if current is not None:
        raise Refused('AGENTS.md already records "%s: %s"; init and kickoff ask once, so change it by hand, '
                      'the line and the deny rules together' % (label, current))
    new_settings, added, present = plan_settings(settings, editor, answer)
    new_agents = plan_agents(lines, editor, answer).encode('utf-8', 'surrogateescape')
    if new_settings is not None:
        os.makedirs(os.path.dirname(settings), exist_ok=True)
        write_atomic(settings, new_settings)
    write_atomic(agents, new_agents)
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


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
