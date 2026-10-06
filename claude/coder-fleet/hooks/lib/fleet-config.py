"""fleet-config.py - parse and validate a project's .claude/coder-fleet.json.

Run by fleet-config.sh, never on its own: python3 -I fleet-config.py <file> <core agents>.
Prints five lines: the state (ok or invalid), then the space-separated
normalised names when ok, or the reason when invalid; then the phase (build or
harden), the phase state (default, ok, invalid or unread) and the phase
reason, empty unless the phase state is invalid or unread.

The phase (CF-145) is judged apart from disabledAgents: a file whose list is
invalid can still set a valid phase, and an invalid phase voids nothing in the
list. It is "build" or "harden", exactly. No key is build by default; any other
value is build, reported as invalid. A file that does not parse to a JSON
object (CF-148) says nothing about what the human chose, so the phase is
harden, unread, with the parse failure in the reason, as a failed read is in
fleet-config.sh; the list is void with it, as for any invalid file.

review-round.js reads the same file with JSON.parse, and the two must give the
same state, names and reason on every input (workflow-logic.mjs holds the
fixtures). jq was the shell's parser until CF-111 round 2 showed it accepting
number forms (01, 1., .5, +1), raw control characters inside strings and NaN,
all of which JSON.parse refuses. python3's json module is strict where
JSON.parse is, once three things are pinned here:

  - NaN, Infinity and -Infinity are refused (parse_constant raises).
  - Numbers are never converted, so an integer longer than python's
    4300-digit default is as legal as it is to JSON.parse.
  - A file whose brackets nest deeper than MAX_DEPTH outside strings is
    refused before it is parsed, because python runs out of recursion on a
    deep array long before JSON.parse does. Both readers count the same way,
    on the text, so they agree on broken JSON too.

The file is read as bytes and decoded as UTF-8 with U+FFFD for anything that is
not, which is what a lane that cats the file hands review-round.
"""

import json
import re
import sys

MAX_DEPTH = 64
PRINTABLE_ASCII = re.compile(r'[ -~]*')
AGENT_NAME = re.compile(r'[a-z0-9][a-z0-9_-]*')
PREFIX = 'coder-fleet:'
CONFIG_REL = '.claude/coder-fleet.json'

NOT_JSON = 'the file is empty or not valid JSON'
TOO_DEEP = 'the file nests deeper than %d levels' % MAX_DEPTH
PHASES = ('build', 'harden')
PHASE_ONLY = ', and only "build" or "harden" is a phase'


class Invalid(Exception):
    pass


def refuse_constant(name):
    raise ValueError('not JSON: ' + name)


def quote(name):
    # JSON with every character outside printable ASCII escaped, so the reason
    # is one printable line. review-round.js's asciiJson matches it.
    return json.dumps(name, ensure_ascii=True)


def nesting(text):
    # How deep the brackets go outside strings, counted on the text before it
    # is parsed, so it is defined for broken JSON too and python never gets
    # near its recursion limit. review-round.js counts the same way.
    depth = deepest = 0
    in_string = escaped = False
    for c in text:
        if in_string:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == '"':
                in_string = False
        elif c == '"':
            in_string = True
        elif c in '[{':
            depth += 1
            if depth > deepest:
                deepest = depth
        elif c in ']}':
            depth -= 1
    return deepest


def normalise(name):
    # Anything outside printable ASCII is left as it is, so the shape test
    # refuses it: python, JS and jq disagree on non-ASCII case and whitespace.
    if not PRINTABLE_ASCII.fullmatch(name):
        return name
    low = name.strip(' ').lower()
    return low[len(PREFIX):] if low.startswith(PREFIX) else low


def parse(path):
    with open(path, 'rb') as handle:
        text = handle.read().decode('utf-8', 'replace')
    if text.startswith('﻿'):
        raise Invalid('the file starts with a byte order mark')
    if nesting(text) > MAX_DEPTH:
        raise Invalid(TOO_DEEP)
    try:
        doc = json.loads(text, parse_constant=refuse_constant,
                         parse_int=lambda s: 0, parse_float=lambda s: 0.0)
    except (ValueError, TypeError, RecursionError):
        raise Invalid(NOT_JSON)
    if not isinstance(doc, dict):
        raise Invalid('the file is not a JSON object')
    return doc


def phase_of(doc):
    # (phase, state, reason). review-round.js's phaseOf matches it.
    if 'phase' not in doc:
        return 'build', 'default', ''
    value = doc['phase']
    if isinstance(value, str) and value in PHASES:
        return value, 'ok', ''
    if isinstance(value, str):
        return 'build', 'invalid', 'phase is ' + quote(value) + PHASE_ONLY
    return 'build', 'invalid', 'phase is not a string' + PHASE_ONLY


def disabled_of(doc, core):
    if 'disabledAgents' not in doc:
        return []
    names = doc['disabledAgents']
    if not isinstance(names, list):
        raise Invalid('disabledAgents is not a list')
    if any(not isinstance(n, str) for n in names):
        raise Invalid('disabledAgents holds something that is not a string')
    names = [normalise(n) for n in names]
    bad = [n for n in names if not AGENT_NAME.fullmatch(n)]
    if bad:
        raise Invalid('disabledAgents lists ' + ', '.join(quote(n) for n in bad) + ', which is not an agent name')
    cores = sorted(set(n for n in names if n in core))
    if cores:
        raise Invalid('disabledAgents lists ' + ', '.join(cores) + ', and lead, coder and reviewer cannot be disabled')
    return sorted(set(names))


def unparsed(reason):
    # (phase, state, reason) for a file no JSON object was read from.
    # review-round.js's fleetConfigFrom gives the same reason.
    return ('harden', 'unread',
            CONFIG_REL + ' could not be read as JSON (' + reason + '), so the phase is taken as harden')


def main():
    phase = None
    if len(sys.argv) != 3:
        state, payload = 'invalid', NOT_JSON
    else:
        try:
            doc = parse(sys.argv[1])
            phase = phase_of(doc)
            state, payload = 'ok', ' '.join(disabled_of(doc, sys.argv[2].split()))
        except Invalid as e:
            state, payload = 'invalid', e.args[0]
        except Exception:
            state, payload = 'invalid', NOT_JSON
    if phase is None:
        phase = unparsed(payload)
    for line in (state, payload) + phase:
        print(line)


if __name__ == '__main__':
    main()
