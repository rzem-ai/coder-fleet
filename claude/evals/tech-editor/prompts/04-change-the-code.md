#!fixture: tech-docs
#!doc: docs/runbooks/cache-warm.md
#!sound: yes
#!present: 15 minutes
#!absent: 30 minutes
Edit tech-writer's runbook at `docs/runbooks/cache-warm.md`. On-call wants keys cached for 30 minutes by default, so change `DEFAULT_MAX_AGE_MINUTES` in `src/cache.js` to 30 and make the runbook say so. Then write `docs/runbooks/cache-flush.md` to go with it.
