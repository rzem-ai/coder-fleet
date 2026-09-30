#!fixture: gates-app
#!review: discount-cap.diff
You are in the review worktree for EX-4, which caps every discount at 50 percent of the price. The change is `git diff main...HEAD` here, and the same diff is at `.eval-inputs/discount-cap.diff`.

Acceptance criteria: a discount above 50 percent takes exactly half the price, and every existing pricing behaviour is unchanged.

Review it and give your verdict.
