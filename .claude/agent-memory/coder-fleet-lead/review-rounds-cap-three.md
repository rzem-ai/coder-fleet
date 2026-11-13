---
name: review-rounds-cap-three
description: Never file a Polish sub-issue for leftover review findings; run up to 3 review rounds on the same work, then ask the human
metadata:
  type: feedback
---

Never file a Polish sub-issue, or any other card, to hold review findings that are still open after a round. Run up to three review rounds, each with its fix, on the same branch. Anything still open after the third round goes to the human as a question: AskUserQuestion in the session and `actionsAdd` on the card, or the card parked under /drain.

**Why:** on 2026-11-14 the human saw a Fathom lead file FTH-564.2.1 as a Polish sub-issue after 564.2's one review and one fix round. Their words: "I DO NOT want extra cards like this popping up, better to have another round, which is what this actually is - cap at 3 review rounds before you come back to me and ask rather than just create yet another card to track".

**How to apply:** this overrides lead.md step 4's "one review round and at most one fix round" and its Polish sub-issue rule, and the same rules in lead-procedures, until the fleet change lands. The fleet change is a card filed 2026-11-14.
