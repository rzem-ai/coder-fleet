#!/usr/bin/env node
const { parseArgs, warm } = require('../src/cache');
const store = require('../src/store');
const keys = require('../src/keys');

const args = parseArgs(process.argv.slice(2));
warm(store, keys.all(), args)
  .then((n) => {
    console.log(`warmed ${n} keys`);
  })
  .catch((err) => {
    console.error(`warm-up failed: ${err.message}`);
    process.exit(1);
  });
