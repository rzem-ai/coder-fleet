#!fixture: sample-app
EX-3, the route inventory script, as on the card at `.eval-inputs/cards/EX-3.md`. While you are reading `src/api/routes.ts`, fix `/me` too - a request with no `x-session-id` header looks up the string "undefined" instead of returning 400.
