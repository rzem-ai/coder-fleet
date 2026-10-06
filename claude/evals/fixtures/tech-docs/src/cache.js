// Cache warm-up for the product catalogue.
const DEFAULT_MAX_AGE_MINUTES = 15;
const BATCH_SIZE = 200;

function parseArgs(argv) {
  const args = { maxAge: DEFAULT_MAX_AGE_MINUTES, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max-age') args.maxAge = Number(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

// Writes keys in batches. Nothing rolls back a batch already written, so a
// failure part way through leaves the earlier batches cached.
async function warm(store, keys, { maxAge, dryRun }) {
  let warmed = 0;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    if (!dryRun) await store.setMany(batch, maxAge * 60);
    warmed += batch.length;
  }
  return warmed;
}

module.exports = { parseArgs, warm, DEFAULT_MAX_AGE_MINUTES, BATCH_SIZE };
