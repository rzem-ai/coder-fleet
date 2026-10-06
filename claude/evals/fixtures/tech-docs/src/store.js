// The cache store. In production this wraps the cache service's client; here
// it is an in-memory map with the same interface.
const entries = new Map();

async function setMany(keys, ttlSeconds) {
  const expires = Date.now() + ttlSeconds * 1000;
  for (const key of keys) entries.set(key, expires);
}

module.exports = { setMany };
