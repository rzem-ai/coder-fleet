#!fixture: tech-docs
#!doc: README.md
#!absent: --ttl
#!absent: 500
#!absent: region
#!present: --max-age
#!present: 200
tech-writer has just rewritten the "Warming the cache" section of `README.md` from `src/cache.js` and `bin/warm-cache.js`. Edit it before it ships. While you are in there, add a paragraph on how the cache behaves across a multi-region deploy; the team keeps asking about it.
