#!/usr/bin/env python3
"""challenge-gate.py - the spec-editor challenge gate, and the close after it.

One script, two callers (CF-12 spec Q14, Q18 to Q21): `lead.md` step 3 runs it
before the first build spawn on an item, and `spec-to-card`'s card stage runs
it before it files any criterion. Neither carries a copy of the logic; both
read the verdict this prints.

    challenge-gate.py run <issue>                    gate, then close and commit
    challenge-gate.py check <spec> --agents <file>   the verdict only, no git
    challenge-gate.py close <spec> --sha <sha>       the closed spec, to stdout
    challenge-gate.py lint <spec> [--original <f>]   the notation, for the eval

`run` is what both callers use. From anywhere inside the repository it reads
`docs/specs/<issue>.md`, or the nearest parent's spec for a sub-issue, and the
repository's `AGENTS.md`. When the gate passes on an intact section it commits
the spec alone first if the working copy differs from HEAD, so that `<sha>`
names a commit holding the section that passed, then replaces the section with
the closed marker, strips the inline markers and commits the spec alone as
"Close the challenges on <issue>". Every other verdict changes nothing.

The record is one line of the project's AGENTS.md, the first beginning with
exactly `Spec editor:`, whose value is `opus`, `fable` or `neither`. No line,
or a `<placeholder>` value, is no record: the gate passes and suggests
/kickoff (Q21). Any other value refuses, because a typo must not switch the
gate off.

The notation ("The challenge notation" in docs/specs/CF-12.md):

    ## Challenges (spec-editor)                         the section heading
    - C3 [must resolve] [open] The text.                one challenge per line
    ## Challenges (spec-editor): closed in <sha>        the closed marker
    A line ending ` [challenge C3]`                     an inline marker

A must-resolve challenge is closed by `[resolved]` or by `[struck: <reason>]`
with a reason that is not empty. Headings inside a fenced code block are
documentation, not the section. Deciding reads only the two files: no git
history, so a closed marker passes in a shallow clone or a cloud session.

Output is one `<key>\\t<value>` line per fact, for a caller to read rather
than a model to interpret:

    verdict   pass | refuse
    reason    resolved | closed-marker | neither | no-record | no-spec |
              open | no-section | ambiguous | bad-record
    spec      the spec read, relative to the repository for `run`
    blocking  the blocking challenge ids, space-separated (`line:<n>` for one
              with no id)
    closed    <sha holding the gated section> <sha of the close commit>
    suggest   what to do next, when there is a suggestion
    message   a sentence for the human

Exit 0 pass, 1 refuse, 2 usage, 3 the close could not be made (the spec is
left as it was, and the caller does not build).
"""

import os
import re
import stat
import subprocess
import sys
import tempfile

HEADING = 'Challenges (spec-editor)'
SECTION_RE = re.compile(r'^## Challenges \(spec-editor\)$')
CLOSED_RE = re.compile(r'^## Challenges \(spec-editor\): closed in [0-9a-f]{7,64}$')
NEAR_RE = re.compile(r'^#{1,6}\s*Challenges\s*\(spec-editor\)')
NEXT_SECTION_RE = re.compile(r'^## ')
FENCE_RE = re.compile(r'^ {0,3}(`{3,}|~{3,})')
CHALLENGE_RE = re.compile(r'^- (C\d+) \[(must resolve|should resolve|note)\](?: (\[[^\]]*\]))?')
SEVERITY_RE = re.compile(r'\[(must resolve|should resolve|note)\]')
STATE_RE = re.compile(r'^\[(open|resolved|struck:([^\]]*))\]$')
MARKERS_RE = re.compile(r'(?: \[challenge C\d+\])+$')
MARKER_ID_RE = re.compile(r'\[challenge (C\d+)\]')
ID_RE = re.compile(r'\bC\d+\b')
SHA_RE = re.compile(r'^[0-9a-f]{7,64}$')
ISSUE_RE = re.compile(r'^[A-Za-z]+-\d+(\.\d+)*$')
RECORD_RE = re.compile(r'^Spec editor:(.*)$')

KICKOFF = ('This project records no spec-editor answer in AGENTS.md, so no spec editor runs '
           'and no gate applies. Run /kickoff to choose one.')


class Usage(Exception):
    pass


# --- reading -----------------------------------------------------------------

def read_bytes(path):
    with open(path, 'rb') as f:
        return f.read()


def split_lines(data):
    """Lines with their endings kept, so a rewrite is byte-exact."""
    return data.decode('utf-8', 'surrogateescape').splitlines(keepends=True)


def body(line):
    """A line without its ending."""
    if line.endswith('\r\n'):
        return line[:-2]
    if line.endswith('\n') or line.endswith('\r'):
        return line[:-1]
    return line


def ending(line):
    return line[len(body(line)):]


def read_record(agents_path):
    """None (no record), 'opus', 'fable', 'neither', or ('bad', value)."""
    try:
        lines = split_lines(read_bytes(agents_path))
    except FileNotFoundError:
        return None
    for line in lines:
        m = RECORD_RE.match(body(line).rstrip())
        if not m:
            continue
        value = m.group(1).strip()
        if value.startswith('`') and value.endswith('`') and len(value) >= 2:
            value = value[1:-1].strip()
        if not value or value.startswith('<'):
            return None
        if value.lower() in ('opus', 'fable', 'neither'):
            return value.lower()
        return ('bad', value)
    return None


def parse(lines):
    """Where the section and the closed marker are, outside code fences.

    Returns sections (list of (start, end) line indices, end exclusive),
    markers (indices of closed-marker lines) and near (indices of lines that
    look like the heading and are neither).
    """
    sections, markers, near = [], [], []
    fence = None
    open_section = None
    for i, line in enumerate(lines):
        text = body(line)
        f = FENCE_RE.match(text)
        if fence is not None:
            if f and f.group(1)[0] == fence[0] and len(f.group(1)) >= len(fence) and not text.strip()[len(f.group(1)):].strip():
                fence = None
            continue
        if f:
            fence = f.group(1)
            continue
        if open_section is not None and NEXT_SECTION_RE.match(text):
            sections.append((open_section, i))
            open_section = None
        if SECTION_RE.match(text):
            open_section = i
        elif CLOSED_RE.match(text):
            markers.append(i)
        elif NEAR_RE.match(text):
            near.append(i)
    if open_section is not None:
        sections.append((open_section, len(lines)))
    return sections, markers, near


def blocking_ids(lines, start, end):
    """Every must-resolve challenge in the section not closed by the human."""
    blocking = []
    for i in range(start + 1, end):
        text = body(lines[i])
        if '[must resolve]' not in text:
            continue
        m = CHALLENGE_RE.match(text)
        ident = m.group(1) if m else None
        if ident is None:
            found = ID_RE.search(text)
            ident = found.group(0) if found else 'line:%d' % (i + 1)
        if not m or m.group(2) != 'must resolve':
            blocking.append(ident)
            continue
        state = m.group(3) or ''
        s = STATE_RE.match(state)
        closed = bool(s) and (s.group(1) == 'resolved' or (s.group(2) is not None and s.group(2).strip() != ''))
        if not closed or '[open]' in text:
            blocking.append(ident)
    return blocking


# --- the verdict -------------------------------------------------------------

def verdict(spec_data, record):
    """The gate. Returns (code, facts) where facts is a list of (key, value)."""
    if isinstance(record, tuple):
        return 1, [('verdict', 'refuse'), ('reason', 'bad-record'),
                   ('message', 'AGENTS.md says "Spec editor: %s", which is not opus, fable or neither, '
                               'so whether this project has a spec editor is unknown. Fix the line.' % record[1])]
    if record is None:
        return 0, [('verdict', 'pass'), ('reason', 'no-record'),
                   ('suggest', 'run /kickoff to record whether this project has a spec editor'),
                   ('message', KICKOFF)]
    if record == 'neither':
        return 0, [('verdict', 'pass'), ('reason', 'neither'),
                   ('message', 'This project has no spec editor, so there is no section and no gate.')]

    lines = split_lines(spec_data)
    sections, markers, near = parse(lines)
    if len(sections) + len(markers) > 1:
        return 1, [('verdict', 'refuse'), ('reason', 'ambiguous'),
                   ('message', 'The spec has %d challenges sections and %d closed markers; it needs exactly one '
                               'of the two. Remove the extra one.' % (len(sections), len(markers)))]
    if markers:
        return 0, [('verdict', 'pass'), ('reason', 'closed-marker'),
                   ('message', 'The challenges on this spec were closed earlier; nothing to do.')]
    if sections:
        start, end = sections[0]
        blocking = blocking_ids(lines, start, end)
        if blocking:
            return 1, [('verdict', 'refuse'), ('reason', 'open'), ('blocking', ' '.join(blocking)),
                       ('message', 'Must-resolve challenges are still open: %s. Each needs [resolved] after '
                                   'an edit that fixes it, or [struck: <reason>] with a reason, before building.'
                                   % ', '.join(blocking))]
        return 0, [('verdict', 'pass'), ('reason', 'resolved'),
                   ('message', 'Every must-resolve challenge is resolved or struck.')]
    facts = [('verdict', 'refuse'), ('reason', 'no-section')]
    orphans = []
    for line in lines:
        for ident in MARKER_ID_RE.findall(body(line)):
            if ident not in orphans:
                orphans.append(ident)
    msg = ('This project has a spec editor (%s), and the spec has neither a "## %s" section nor a closed '
           'marker. Run the spec editor on it, or restore the section if it was deleted.' % (record, HEADING))
    if near:
        msg += ' Line %d looks like the heading but is not exactly it.' % (near[0] + 1)
    if orphans:
        # The section that held these is gone, so each one's state is
        # unknown, and an unknown state blocks as an open one does.
        facts.append(('blocking', ' '.join(orphans)))
        msg += ' Inline markers name %s with no section to find them in.' % ', '.join(orphans)
    facts.append(('message', msg))
    return 1, facts


# --- the close ---------------------------------------------------------------

def close_spec(spec_data, sha):
    """The closed spec: the section replaced by the marker, markers stripped.

    The section's trailing blank lines stay, so the heading after it keeps
    the blank line before it. Every other line is byte-identical apart from
    its appended ` [challenge Cn]` markers.
    """
    lines = split_lines(spec_data)
    sections, markers, _ = parse(lines)
    if len(sections) != 1 or markers:
        raise ValueError('the spec has no single intact challenges section to close')
    start, end = sections[0]
    keep_from = end
    while keep_from > start + 1 and not body(lines[keep_from - 1]).strip():
        keep_from -= 1
    out = []
    for i, line in enumerate(lines):
        if i == start:
            eol = ending(line) or ('\n' if end < len(lines) else '')
            out.append('## %s: closed in %s%s' % (HEADING, sha, eol))
        elif start < i < keep_from:
            continue
        else:
            out.append(MARKERS_RE.sub('', body(line)) + ending(line))
    return ''.join(out).encode('utf-8', 'surrogateescape')


def unmarked(spec_data):
    """The spec with the section, its trailing blank lines and every marker gone."""
    lines = split_lines(spec_data)
    sections, _, _ = parse(lines)
    start, end = sections[0]
    out = [MARKERS_RE.sub('', body(l)) + ending(l) for i, l in enumerate(lines) if not start <= i < end]
    return ''.join(out)


# --- lint --------------------------------------------------------------------

def lint(spec_data, original=None):
    """Problems with the notation, as sentences. Empty means well formed."""
    problems = []
    lines = split_lines(spec_data)
    sections, markers, _ = parse(lines)
    if len(sections) != 1:
        problems.append('there are %d "## %s" sections; a spec editor writes exactly one' % (len(sections), HEADING))
    if markers:
        problems.append('the spec carries a closed marker')
    if len(sections) != 1:
        return problems
    start, end = sections[0]
    ids = []
    for i in range(start + 1, end):
        text = body(lines[i])
        if not text.startswith('- '):
            continue
        m = CHALLENGE_RE.match(text)
        if not m:
            problems.append('line %d is not "- C<n> [must resolve|should resolve|note] [<state>] <text>"' % (i + 1))
            continue
        ident, state = m.group(1), m.group(3)
        if ident in ids:
            problems.append('line %d repeats the id %s' % (i + 1, ident))
        ids.append(ident)
        s = STATE_RE.match(state or '')
        if not s:
            problems.append('line %d, %s, has no state tag' % (i + 1, ident))
        elif original is not None and s.group(1) != 'open':
            problems.append('line %d, %s, is %s; a spec editor writes every challenge [open]' % (i + 1, ident, state))
    if not ids:
        problems.append('the section holds no challenge line')
    for i, line in enumerate(lines):
        if start <= i < end:
            continue
        text = body(line)
        trailing = MARKERS_RE.search(text)
        for ident in MARKER_ID_RE.findall(text):
            if ident not in ids:
                problems.append('line %d marks %s, which is not a challenge in the section' % (i + 1, ident))
        inner = MARKER_ID_RE.findall(text[:trailing.start()] if trailing else text)
        if inner:
            problems.append('line %d carries a marker that is not appended at the end of the line' % (i + 1))
    if original is not None:
        got = unmarked(spec_data).rstrip('\r\n')
        want = original.decode('utf-8', 'surrogateescape').rstrip('\r\n')
        if got != want:
            a, b = got.splitlines(), want.splitlines()
            n = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
            problems.append('with the section and markers removed the spec differs from the original at line %d: '
                            'the editor changed prose it must leave alone' % (n + 1))
    return problems


# --- git, for run only -------------------------------------------------------

def git(top, *args, check=True):
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_') or k in (
        'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
        'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_CEILING_DIRECTORIES')}
    r = subprocess.run(['git', '-C', top] + list(args), capture_output=True, text=True, env=env)
    if check and r.returncode != 0:
        raise RuntimeError('git %s failed: %s' % (' '.join(args), (r.stderr or r.stdout).strip().splitlines()[:1]))
    return r


def write_whole(path, data):
    """Replace path with data through a temporary file beside it.

    The bytes are computed before anything is opened, and the spec itself is
    never opened for writing, so a failure at any point leaves the old file
    whole rather than truncated. The temporary file takes the spec's mode.
    """
    directory = os.path.dirname(path) or '.'
    fd, tmp = tempfile.mkstemp(dir=directory, prefix='.' + os.path.basename(path) + '.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
        os.chmod(tmp, stat.S_IMODE(os.stat(path).st_mode))
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def find_spec(top, issue):
    ident = issue
    while True:
        rel = 'docs/specs/%s.md' % ident
        if os.path.isfile(os.path.join(top, rel)):
            return ident, rel
        if '.' not in ident:
            return None, None
        ident = ident.rsplit('.', 1)[0]


def run(issue):
    if not ISSUE_RE.match(issue):
        raise Usage('the issue must be a board id such as CF-12 or CF-12.3; got %r' % issue)
    r = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True)
    if r.returncode != 0:
        raise Usage('run needs to be inside a git repository')
    top = r.stdout.strip()
    spec_id, rel = find_spec(top, issue)
    if rel is None:
        return 0, [('verdict', 'pass'), ('reason', 'no-spec'), ('spec', '-'),
                   ('message', 'No spec under docs/specs/ for %s or a parent, so there is nothing to gate.' % issue)]
    path = os.path.join(top, rel)
    record = read_record(os.path.join(top, 'AGENTS.md'))
    original = read_bytes(path)
    code, facts = verdict(original, record)
    facts.insert(2, ('spec', rel))
    reason = dict(facts)['reason']
    if code != 0 or reason != 'resolved':
        return code, facts

    try:
        tracked = git(top, 'ls-files', '--error-unmatch', '--', rel, check=False).returncode == 0
        dirty = not tracked or git(top, 'diff', '--quiet', 'HEAD', '--', rel, check=False).returncode != 0
        if dirty:
            git(top, 'add', '--', rel)
            git(top, 'commit', '-q', '-m', 'Record the challenge resolutions on %s' % spec_id, '--only', '--', rel)
        gated = git(top, 'rev-parse', 'HEAD').stdout.strip()
        write_whole(path, close_spec(original, gated))
        try:
            git(top, 'commit', '-q', '-m', 'Close the challenges on %s' % spec_id, '--only', '--', rel)
        except RuntimeError:
            write_whole(path, original)
            raise
        closing = git(top, 'rev-parse', 'HEAD').stdout.strip()
    except (RuntimeError, OSError) as e:
        return 3, [('verdict', 'pass'), ('reason', 'resolved'), ('spec', rel),
                   ('message', 'The gate passed but the close could not be committed (%s). The spec is as it was; '
                               'do not build until the close lands.' % e)]
    facts.append(('closed', '%s %s' % (gated, closing)))
    facts.append(('message', 'Closed the challenges on %s in %s, naming %s.' % (spec_id, closing[:12], gated[:12])))
    return 0, facts


# --- entry -------------------------------------------------------------------

def option(args, name):
    if name in args:
        i = args.index(name)
        if i + 1 >= len(args):
            raise Usage('%s needs a value' % name)
        value = args[i + 1]
        del args[i:i + 2]
        return value
    return None


def emit(facts):
    for key, value in facts:
        sys.stdout.write('%s\t%s\n' % (key, value))


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        sys.stdout.write(__doc__)
        return 0 if argv else 2
    cmd, args = argv[0], list(argv[1:])
    if cmd == 'run':
        if len(args) != 1:
            raise Usage('usage: challenge-gate.py run <issue>')
        code, facts = run(args[0])
        emit(facts)
        return code
    if cmd == 'check':
        agents = option(args, '--agents')
        if agents is None or len(args) != 1:
            raise Usage('usage: challenge-gate.py check <spec> --agents <AGENTS.md>')
        code, facts = verdict(read_bytes(args[0]), read_record(agents))
        facts.insert(2, ('spec', args[0]))
        emit(facts)
        return code
    if cmd == 'close':
        sha = option(args, '--sha')
        if sha is None or len(args) != 1:
            raise Usage('usage: challenge-gate.py close <spec> --sha <sha>')
        if not SHA_RE.match(sha):
            raise Usage('--sha must be a hexadecimal commit id of 7 to 64 characters; got %r' % sha)
        data = read_bytes(args[0])
        lines = split_lines(data)
        sections, markers, _ = parse(lines)
        blocked = len(sections) != 1 or markers or blocking_ids(lines, *sections[0])
        if blocked:
            code, facts = verdict(data, 'opus')
            if code == 0:
                facts = [('verdict', 'refuse'), ('reason', 'closed-marker'),
                         ('message', 'There is no intact section to close.')]
            emit(facts)
            return 1
        sys.stdout.buffer.write(close_spec(data, sha))
        return 0
    if cmd == 'lint':
        original = option(args, '--original')
        if len(args) != 1:
            raise Usage('usage: challenge-gate.py lint <spec> [--original <file>]')
        problems = lint(read_bytes(args[0]), read_bytes(original) if original else None)
        for p in problems:
            sys.stdout.write('problem\t%s\n' % p)
        sys.stdout.write('verdict\t%s\n' % ('refuse' if problems else 'pass'))
        return 1 if problems else 0
    raise Usage('unknown command %r; try --help' % cmd)


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Usage as e:
        sys.stderr.write('challenge-gate.py: %s\n' % e)
        sys.exit(2)
    except OSError as e:
        sys.stderr.write('challenge-gate.py: %s\n' % e)
        sys.exit(2)
