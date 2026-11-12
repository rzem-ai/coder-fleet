# remote-guard.sh - what a fleet hook may hand to git before it talks to a
# remote: the repository-config keys known to run no command, which URLs are
# reached, and how git's own words are cut down before they are logged.
# Sourced by main-fast-forward.sh, which fetches, and state-push.sh, which
# pushes coder-fleet/state (CF-201), so the two hold one list.
#
# Written for bash 3.2, like the rest of the hooks.

# Anything that reaches the log has the userinfo cut out of every URL in it.
redact() { printf '%s' "$1" | tr '\r\n\t' '   ' | sed -E 's#(://)[^/ ]*@#\1***@#g; s/  */ /g; s/^ //; s/ $//' | cut -c1-500; }

# .git/config is shared by every worktree, so an agent session can write to it,
# and these hooks run outside every agent's sandbox and scope hook. A key there
# that names a command would run at the next session start or board commit, and
# git has too many such keys to list. So the repository's own config - local
# scope, and worktree scope when it is on - may hold only the keys below, which
# run nothing; any other key and the hook fetches, pushes and moves nothing. The
# list is what git clone, git worktree add (with --track and relative paths),
# sparse checkout and a sha256 or reftable repository write - and no other
# extension, since extensions.partialclone names a remote git fetches from
# lazily, in a merge too - the usual per-branch and pull settings, submodule url and active (the
# hook never recurses into a submodule), merge.ff and merge.autostash (both
# overridden on the merge), and the branch description and VS Code's merge-base
# note. The human's global and system config is trusted as it is.
allowed_key() {
  case "$1" in
    core.repositoryformatversion|core.bare|core.filemode|core.logallrefupdates|core.ignorecase) return 0 ;;
    core.precomposeunicode|core.symlinks|core.autocrlf|core.eol) return 0 ;;
    core.sparsecheckout|core.sparsecheckoutcone|index.sparse) return 0 ;;
    # husky writes core.hooksPath, and every call here overrides it with
    # /dev/null, so no hook it names runs. git lfs install writes
    # lfs.repositoryformatversion; its filter.lfs.* keys run a command and stay
    # refused at this scope.
    core.hookspath|lfs.repositoryformatversion) return 0 ;;
    # gh writes these: gh-resolved notes which remote gh uses, and pushremote
    # says where a branch pushes. Neither is read by a fetch or a merge, and
    # the one push, state-push.sh's, names its remote and refspec, so git never
    # consults pushremote, which is what makes it safe: git reads a pushremote
    # that names no configured remote as a URL, one the check below never sees.
    remote.*.gh-resolved|branch.*.pushremote) return 0 ;;
    extensions.worktreeconfig|extensions.objectformat|extensions.refstorage|extensions.relativeworktrees) return 0 ;;
    remote.*.url|remote.*.fetch|remote.*.pushurl|remote.*.prune|remote.*.tagopt|remote.*.mirror) return 0 ;;
    branch.*.remote|branch.*.merge|branch.*.rebase|branch.*.description|branch.*.vscode-merge-base) return 0 ;;
    pull.rebase|pull.ff|push.default|merge.ff|merge.autostash) return 0 ;;
    user.name|user.email|init.defaultbranch|gc.auto|maintenance.auto|rerere.enabled|worktree.guessremote) return 0 ;;
    submodule.*.url|submodule.*.active) return 0 ;;
  esac
  return 1
}

# url_kind <url>: ok, helper, path or unknown. A newline or any other control
# character makes it unknown before anything else is read, and the scp-like
# form is matched against the whole string, never line by line.
scp_like='^([A-Za-z0-9._~+-]+@)?[A-Za-z0-9._-]+:[^/]'
url_kind() {
  case "$1" in
    *[[:cntrl:]]*) printf unknown; return 0 ;;
    https://*|ssh://*|git://*|git+ssh://*|ssh+git://*) printf ok ;;
    *::*) printf helper ;;
    /*|./*|../*|file:*|~*) printf path ;;
    *://*) printf unknown ;;
    *)
      if [[ $1 =~ $scp_like ]]; then printf ok; else printf unknown; fi ;;
  esac
}
