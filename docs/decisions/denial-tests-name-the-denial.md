# A denial test names the denial it expects

A test that a call is denied asserts which rule denied it, by a fragment of the reason, and an empty fragment is refused. In the OpenCode port, `expectDenied` in `opencode/test/invariants/scope.test.ts` fails on an empty fragment and checks that the reason quotes an invariant and contains the fragment.

An empty fragment is contained in every string, so an assertion carrying one checks only that something denied the call. Such a test passes whenever any rule fires first, including a rule that has nothing to do with the behaviour it is named for. The port's scope tests held 26 such assertions; two of them, named for interpreter-payload recovery, passed because `bash` is off `scout`'s allowlist rather than because the payload was recovered and judged, so they would have passed with the recovery gone.

So a deny test that passes says which rule held, and a rule removed under it turns it red. The same reasoning applies to any suite that asserts a refusal: assert the reason, not only the verdict.
