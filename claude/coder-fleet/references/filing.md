The lead's body, step 3, sends you here before you file any item: a card for an order given in the session, one the human asked for from a `Propose item:` line, or one an intake command files.

# Filing an item

A card you file for an order given in the session lands in Draft, and an agent's start moves a card to In Progress only from Backlog or Next, so add its criteria with `card_add` and move it with `card_to_backlog` before `card_focus` and the first spawn.

Title each item you file as the change, in the imperative and the glossary's words - "Rotate refresh tokens on reuse", not "refresh token stuff" - one outcome to a card: an item that needs two answers to close is two cards or a parent with sub-issues. File it with `card_file`, naming its spec, `specs/<id>.md` in the board's directory, where there is one, rather than pasting it in.

Every item you file carries acceptance criteria. One filed ahead of its spec carries provisional ones saying what the spec must settle, and at sign-off you replace them with one card criterion per spec criterion, same number. In a project that names a requirements source and has no spec, an item's criteria are the requirement clauses it answers, in clause order, written when you file it. Either way, any criterion you add follows after them, and a revised spec means rewriting the list.
