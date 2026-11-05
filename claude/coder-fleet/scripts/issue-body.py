#!/usr/bin/env python3
"""issue-body.py - file an issue, or write its criteria, through gh.

The one writer of an issue body that spec-to-card uses, so that what reaches
GitHub is built here from what gh says now, never from a model's copy of the
body. The human's words are never round-tripped through a lane: this reads the
live body, changes only the sections it is asked to, and writes it back with
`gh issue edit --body-file`.

    issue-body.py create          stdin: {"title": T, "words": W}
    issue-body.py criteria <ref>  stdin: {"expect": [...], "criteria": [...],
                                          "spec": "docs/specs/<n>.md" | null}

<ref> is `12`, `#12` or the issue's URL. The request is one JSON object on
standard input, so no criterion passes through a shell word.

`create` files a new issue whose body is the human's words and nothing else;
`spec-to-card` adds the rest once a spec or the clauses are settled.

`criteria` makes the `## Acceptance criteria` section read as `criteria`, a
list of {"text", "checked"} in order, provided it reads as `expect` now - the
same list form, compared by text with whitespace collapsed and by tick. A body
that no longer reads as `expect` is refused and nothing is written: the
workflow decided on a body that is not the one on GitHub. Any other line in
the section stays, after the items. With `spec`, a `Spec: <path>` line goes
just before the section when the body has no `Spec:` line. A body with no
`## Definition of Done` section gets the list under the heading `Definition
of Done` in the repository's AGENTS.md, unticked, when it has one. Nothing
else in the body changes. A body already in that shape is not written.

The sections are read as hooks/lib/board.sh reads them: a level-2 heading,
matched ignoring case and trailing space, to the next level-2 heading; an item
is `- [ ] text` or `- [x] text` (`*` for `-` too).

Output is one `<key>\\t<value>` line per fact:

    result    created | filed | unchanged | changed | no-issue | unreadable
    number    the issue number
    criteria  the acceptance criteria after the write, as a JSON list of texts
    ticked    how many of them are ticked
    dod       how many Definition of Done items the body carries
    spec      the body's Spec: line, or nothing
    message   a sentence for the human

Exit 0 done, 1 refused (changed, no-issue), 2 usage, 3 gh could not read or
write the issue. gh is BOARD_GH when set, else gh on PATH, and it finds the
repository from the working directory as gh always does.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

GH = os.environ.get('BOARD_GH') or 'gh'
TIMEOUT = 60

ITEM_RE = re.compile(r'^[-*][ \t]+\[([ xX])\][ \t]')
ITEM_TEXT_RE = re.compile(r'^[-*][ \t]+\[[ xX]\][ \t]+')
LEVEL2_RE = re.compile(r'^##[ \t]')
SPEC_LINE_RE = re.compile(r'^Spec:[ \t]*\S')
NO_ISSUE_RE = re.compile(r'Could not resolve to an issue', re.I)
URL_NUMBER_RE = re.compile(r'/issues/(\d+)(?:[/#].*)?$')
MD_HEADING_RE = re.compile(r'^ {0,3}#{1,6}[ \t]')
DOD_HEADING_RE = re.compile(r'^ {0,3}#{1,6}[ \t]+definition of done[ \t#]*$', re.I)
LIST_ITEM_RE = re.compile(r'^ {0,3}(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?(.*)$')
FENCE_RE = re.compile(r'^ {0,3}(`{3,}|~{3,})')


class Usage(Exception):
    pass


class GhFailed(Exception):
    def __init__(self, stderr, missing):
        Exception.__init__(self, stderr)
        self.stderr = stderr
        self.missing = missing


def normalise_ref(raw):
    """The bare issue number of `12`, `#12` or an issue URL, or None."""
    s = str(raw).replace('\r', '').strip()
    if s.startswith('http://') or s.startswith('https://'):
        m = URL_NUMBER_RE.search(s.split('?', 1)[0])
        n = m.group(1) if m else ''
    else:
        n = s[1:] if s.startswith('#') else s
    if not n.isdigit() or not n.isascii() or n.startswith('0'):
        return None
    return n


def same_text(t):
    return ' '.join(str(t or '').split())


def gh(*args):
    try:
        r = subprocess.run([GH] + list(args), capture_output=True, text=True, timeout=TIMEOUT)
    except FileNotFoundError:
        raise GhFailed('%s is not installed or not on PATH' % GH, False)
    except subprocess.TimeoutExpired:
        raise GhFailed('%s did not answer within %d seconds' % (GH, TIMEOUT), False)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or '').strip() or '%s exited %d' % (GH, r.returncode)
        raise GhFailed(err, bool(NO_ISSUE_RE.search(err)))
    return r.stdout


# --- the body ----------------------------------------------------------------

def lines_of(body):
    return str(body or '').replace('\r\n', '\n').replace('\r', '\n').split('\n')


def heading(name):
    return re.compile(r'^##[ \t]+' + re.escape(name) + r'[ \t]*$', re.I)


def section(lines, name):
    """(start, end) of the first level-2 section called name, or None."""
    want = heading(name)
    for i, line in enumerate(lines):
        if want.match(line):
            end = next((j for j in range(i + 1, len(lines)) if LEVEL2_RE.match(lines[j])), len(lines))
            return i, end
    return None


def items(lines, span):
    if span is None:
        return []
    out = []
    for line in lines[span[0] + 1:span[1]]:
        m = ITEM_RE.match(line)
        if m:
            out.append({'text': ITEM_TEXT_RE.sub('', line), 'checked': m.group(1) in 'xX'})
    return out


def as_list(value, name, empty_ok=False):
    if not isinstance(value, list):
        raise Usage('%s must be a list' % name)
    out = []
    for v in value:
        if not isinstance(v, dict) or not isinstance(v.get('text'), str) or not isinstance(v.get('checked'), bool):
            raise Usage('every entry of %s must be {"text": string, "checked": true|false}' % name)
        text = same_text(v['text'])
        if not text and not empty_ok:
            raise Usage('an entry of %s has no text' % name)
        out.append({'text': text, 'checked': v['checked']})
    return out


def task_line(item):
    return '- [%s] %s' % ('x' if item['checked'] else ' ', item['text'])


def trim_blank(block):
    while block and not block[0].strip():
        block = block[1:]
    while block and not block[-1].strip():
        block = block[:-1]
    return block


def repo_dod():
    """The list under `Definition of Done` in the repository's AGENTS.md."""
    r = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True)
    top = r.stdout.strip() if r.returncode == 0 else os.getcwd()
    try:
        with open(os.path.join(top, 'AGENTS.md'), encoding='utf-8') as f:
            lines = lines_of(f.read())
    except (OSError, UnicodeDecodeError):
        return []
    out, inside, fence = [], False, None
    for line in lines:
        f = FENCE_RE.match(line)
        if fence is not None:
            if f and f.group(1)[0] == fence[0] and len(f.group(1)) >= len(fence):
                fence = None
            continue
        if f:
            fence = f.group(1)
            continue
        if MD_HEADING_RE.match(line):
            if inside:
                break
            inside = bool(DOD_HEADING_RE.match(line))
            continue
        if not inside:
            continue
        m = LIST_ITEM_RE.match(line)
        if m:
            out.append(m.group(1))
        elif out and line.strip() and line[:1] in ' \t':
            out[-1] += ' ' + line.strip()
        elif not line.strip():
            continue
        elif out:
            # Prose after the list ends it.
            break
    return [t for t in (same_text(x) for x in out) if t]


def rewrite(body, criteria, spec, dod):
    """The new body text, from the live one."""
    lines = lines_of(body)
    while lines and not lines[-1].strip():
        lines.pop()
    ac = section(lines, 'acceptance criteria')
    new_items = [task_line(i) for i in criteria]
    if ac is None:
        dod_span = section(lines, 'definition of done')
        block = ['## Acceptance criteria'] + new_items + ['']
        if dod_span is None:
            lines = (lines + [''] if lines else []) + block
        else:
            lines = lines[:dod_span[0]] + block + lines[dod_span[0]:]
        ac = section(lines, 'acceptance criteria')
    else:
        start, end = ac
        others = trim_blank([l for l in lines[start + 1:end] if not ITEM_RE.match(l)])
        block = [lines[start]] + new_items + ([''] + others if others else []) + ([''] if end < len(lines) else [])
        lines = lines[:start] + block + lines[end:]
        ac = section(lines, 'acceptance criteria')
    if spec and not any(SPEC_LINE_RE.match(l) for l in lines):
        at = ac[0]
        before = lines[:at]
        while before and not before[-1].strip():
            before.pop()
        lines = before + ([''] if before else []) + ['Spec: ' + spec, ''] + lines[at:]
    if dod and section(lines, 'definition of done') is None:
        while lines and not lines[-1].strip():
            lines.pop()
        lines = lines + ['', '## Definition of Done'] + ['- [ ] ' + t for t in dod]
    while lines and not lines[-1].strip():
        lines.pop()
    return '\n'.join(lines) + '\n'


def facts_of(n, body):
    lines = lines_of(body)
    ac = items(lines, section(lines, 'acceptance criteria'))
    dod = items(lines, section(lines, 'definition of done'))
    spec = next((l.strip() for l in lines if SPEC_LINE_RE.match(l)), '')
    return [('number', n),
            ('criteria', json.dumps([i['text'] for i in ac], ensure_ascii=False)),
            ('ticked', str(sum(1 for i in ac if i['checked']))),
            ('dod', str(len(dod))),
            ('spec', spec)]


def view_body(n):
    out = gh('issue', 'view', n, '--json', 'body')
    try:
        data = json.loads(out)
    except ValueError:
        raise GhFailed('gh answered with something that is not JSON', False)
    if not isinstance(data, dict) or not isinstance(data.get('body', ''), str):
        raise GhFailed('gh answered without a body', False)
    return data.get('body') or ''


def write_body(n, text):
    fd, tmp = tempfile.mkstemp(prefix='issue-body-', suffix='.md')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(text)
        gh('issue', 'edit', n, '--body-file', tmp)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def create(req):
    title = req.get('title')
    words = req.get('words', '')
    if not isinstance(title, str) or not same_text(title):
        raise Usage('create needs a title')
    if not isinstance(words, str):
        raise Usage('words must be a string')
    body = '\n'.join(trim_blank(lines_of(words))) + '\n'
    fd, tmp = tempfile.mkstemp(prefix='issue-body-', suffix='.md')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(body)
        out = gh('issue', 'create', '--title', same_text(title), '--body-file', tmp)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass
    m = URL_NUMBER_RE.search(out.strip().splitlines()[-1] if out.strip() else '')
    if not m:
        return 3, [('result', 'unreadable'),
                   ('message', 'gh filed something but printed no issue URL, so its number is unknown: %s' % out.strip()[:200])]
    return 0, [('result', 'created'), ('number', m.group(1)), ('message', 'Filed #%s.' % m.group(1))]


def criteria(ref, req):
    n = normalise_ref(ref)
    if n is None:
        raise Usage('%r is not an issue ref (#12, 12 or the issue URL)' % ref)
    expect = as_list(req.get('expect'), 'expect', empty_ok=True)
    want = as_list(req.get('criteria'), 'criteria')
    spec = req.get('spec')
    if spec is not None and (not isinstance(spec, str) or not same_text(spec)):
        raise Usage('spec must be a path or null')
    body = view_body(n)
    lines = lines_of(body)
    live = [{'text': same_text(i['text']), 'checked': i['checked']} for i in items(lines, section(lines, 'acceptance criteria'))]
    if live != expect:
        return 1, [('result', 'changed'), ('number', n),
                   ('message', 'The acceptance criteria on #%s are not the ones this run read (%d live, %d read), '
                               'so nothing was written. Read the issue again before filing.' % (n, len(live), len(expect)))]
    dod = repo_dod() if section(lines, 'definition of done') is None else []
    text = rewrite(body, want, spec and same_text(spec), dod)
    if text == '\n'.join(lines_of(body)).rstrip('\n') + '\n':
        return 0, [('result', 'unchanged')] + facts_of(n, body) + [('message', '#%s already reads as asked; nothing was written.' % n)]
    write_body(n, text)
    after = view_body(n)
    return 0, [('result', 'filed')] + facts_of(n, after) + [('message', 'Wrote the criteria on #%s.' % n)]


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        sys.stdout.write(__doc__)
        return 0 if argv else 2
    cmd, args = argv[0], argv[1:]
    try:
        req = json.loads(sys.stdin.read() or '{}')
    except ValueError:
        raise Usage('standard input is not one JSON object')
    if not isinstance(req, dict):
        raise Usage('standard input is not one JSON object')
    try:
        if cmd == 'create':
            if args:
                raise Usage('usage: issue-body.py create < request.json')
            code, facts = create(req)
        elif cmd == 'criteria':
            if len(args) != 1:
                raise Usage('usage: issue-body.py criteria <ref> < request.json')
            code, facts = criteria(args[0], req)
        else:
            raise Usage('unknown command %r; try --help' % cmd)
    except GhFailed as e:
        first = e.stderr.strip().splitlines()[0] if e.stderr.strip() else ''
        if e.missing:
            code, facts = 1, [('result', 'no-issue'), ('message', 'gh has no such issue: %s' % first)]
        else:
            code, facts = 3, [('result', 'unreadable'),
                              ('message', 'gh could not read or write the issue: %s. Check gh auth status.' % first)]
    for key, value in facts:
        sys.stdout.write('%s\t%s\n' % (key, str(value).replace('\n', ' ')))
    return code


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Usage as e:
        sys.stderr.write('issue-body.py: %s\n' % e)
        sys.exit(2)
