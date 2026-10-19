/**
 * The calls live.test.ts makes through a running OpenCode, one or more per
 * denial site in coder-fleet/lib/scope.ts. They live in their own module so
 * deny-sites.test.ts can check, without the OpenCode binary, that every
 * `return deny(` site is hit by one of them; a test file cannot import another
 * without registering its tests twice.
 */

export type Call = { tool: string; args: Record<string, unknown> }
export type Case = Call & { agent: string; site: string; writes?: string }

export const sh = (command: string) => ({ tool: "shell", args: { command } })

/**
 * At least one case per `return deny(` in `decide`. `site` is a fragment only
 * that site's message carries. `writes` names a file the call would create if
 * the denial did not hold.
 */
export const CASES: Case[] = [
  // No `writes`: OpenCode 2.0.32 rejects this line as a hunk header itself, so
  // .npmrc could not land with the denial gone. This case proves only that the
  // plugin's message, not the parser's, reaches the model. Not every patch the
  // site refuses is one the parser rejects: the scan judges some lines OpenCode
  // reads as context or ignores (see patchTargets in scope.ts).
  {
    agent: "coder",
    tool: "patch",
    args: { patchText: "*** Begin Patch\n*** Add File:.npmrc\n+x\n*** End Patch" },
    site: "is meant as a patch header but is not exactly one",
  },
  { agent: "coder", tool: "read", args: { path: ".env" }, site: "Nothing the fleet does needs the contents of that file" },
  // A real patch, so the case fails unless 2.x hands the hook `patchText`.
  {
    agent: "coder",
    tool: "patch",
    args: { patchText: "*** Begin Patch\n*** Update File: AGENTS.md\n*** Move to: .ssh/authorized_keys\n@@\n-a file for the fixture to read\n+x\n*** End Patch" },
    site: "Nothing the fleet does needs the contents of that file",
    writes: ".ssh/authorized_keys",
  },
  { agent: "scout", tool: "write", args: { path: "pwned-write.txt", content: "x" }, site: "writes a file", writes: "pwned-write.txt" },
  { agent: "refuter", tool: "patch", args: { patchText: "no file headers here" }, site: "named no path" },
  { agent: "refuter", tool: "write", args: { path: "pwned-refuter.txt", content: "x" }, site: "which is inside", writes: "pwned-refuter.txt" },
  { agent: "spec-writer", tool: "write", args: { path: "pwned-spec.md", content: "x" }, site: "Never write anywhere except under docs/specs/", writes: "pwned-spec.md" },
  {
    agent: "spec-writer",
    tool: "patch",
    args: { patchText: "*** Begin Patch\n*** Add File: pwned-patch.ts\n+x\n*** End Patch" },
    site: "Never write anywhere except under docs/specs/",
    writes: "pwned-patch.ts",
  },
  { agent: "coder", ...sh(Array.from({ length: 300 }, () => "true").join(" && ")), site: "too many commands" },
  { agent: "scout", ...sh("for i in 1; do gh issue view 1; done"), site: "has a for loop" },
  { agent: "scout", ...sh("read x; gh issue view 1"), site: "runs read" },
  { agent: "scout", ...sh("GH_HOST=x gh issue list"), site: "may assign no variable" },
  { agent: "scout", ...sh('gh issue view "$X"'), site: "holds a $ or a backtick" },
  { agent: "scout", ...sh('gh pr view 1 "--web=true"'), site: "has a quoted option" },
  { agent: "scout", ...sh("cat AGENTS.md > pwned-redirect.txt"), site: "redirects", writes: "pwned-redirect.txt" },
  { agent: "scout", ...sh("echo 1 | xargs gh issue view"), site: "never through xargs" },
  { agent: "scout", ...sh("gh --hostname x issue list"), site: "stands before the subcommand" },
  { agent: "scout", ...sh("gh auth token"), site: '"gh auth" is denied' },
  { agent: "scout", ...sh("gh issue close 1"), site: "is not one of them" },
  { agent: "scout", ...sh("gh issue view 1*"), site: "which the shell expands" },
  { agent: "scout", ...sh('gh issue view 1 --comments"=x y"'), site: "an option with a quoted part" },
  { agent: "scout", ...sh("gh issue list --web"), site: "no --web or -w" },
  { agent: "scout", ...sh("gh api -X POST repos/o/r/issues"), site: "so gh api is a plain GET" },
  { agent: "scout", ...sh("npm test"), site: "is not one of the commands this agent reads with" },
  { agent: "coder", ...sh("git filter-branch --tree-filter x HEAD"), site: "rewrites published history" },
  { agent: "refuter", ...sh("git commit -m fix"), site: "is not a read-only verb" },
  { agent: "scout", ...sh("git diff --output=pwned-diff.txt"), site: "makes git write a file", writes: "pwned-diff.txt" },
  // The headline: an interpreter payload is one AST node to OpenCode's own
  // permission walk, so only the plugin sees the push inside it.
  { agent: "coder", ...sh('bash -c "git push --force"'), site: "force-pushes" },
  { agent: "fleet-steward", ...sh("git push origin main"), site: "names a default branch" },
  { agent: "reviewer", ...sh("find . -delete"), site: "find -exec, -execdir, -delete" },
  { agent: "reviewer", ...sh("sed -i s/a/b/ AGENTS.md"), site: "sed -i edits the file in place" },
  { agent: "scout", ...sh("sed -n 'w pwned-sed.txt' AGENTS.md"), site: "contains a w, W or e command", writes: "pwned-sed.txt" },
  { agent: "reviewer", ...sh("sort -o pwned-sort.txt AGENTS.md"), site: "sort", writes: "pwned-sort.txt" },
  { agent: "coder", ...sh("cat .env"), site: `".env" is on the fleet's credential deny list` },
  // From a workdir, a word is read as the path it resolves to. HOME_DIR is
  // filled in once the fixture exists.
  { agent: "coder", tool: "shell", args: { command: "cat op/token", workdir: "HOME_DIR/.config" }, site: `"op/token" is on the fleet's credential deny list` },
  { agent: "scout", ...sh("cat $(echo AGENTS.md)"), site: "a command substitution" },
]
