// client/src/utils/authCache.js
// Ultra-light GET cache in front of the authed fetch: same URL twice within
// the TTL = instant cached JSON, concurrent duplicates = ONE network request.
// ANY mutation (POST/PUT/PATCH/DELETE) bumps the generation, which
// invalidates every entry at once — pages never have to remember to refresh.
const CACHE_TTL = 15000;
const MAX_ENTRIES = 80;

let generation = 0;
const entries = new Map(); // key -> { gen, at, promise }
const inflight = new Map(); // key -> promise (dedupe concurrent identical GETs)

export function invalidateAuthCache() { generation++; }

export function cachedJson(path, { ttl = CACHE_TTL, force = false } = {}, fetcher) {
  if (force) {
    entries.delete(path);
    inflight.delete(path);
    return fetcher().then(r => r.json());
  }
  const hit = entries.get(path);
  if (hit && hit.gen === generation && Date.now() - hit.at < ttl) return hit.promise;

  // Shared in-flight promise so parallel mounts issue one request, not N.
  let promise = inflight.get(path);
  if (!promise) {
    promise = fetcher()
      .then((res) => res.json())
      .then((data) => {
        inflight.delete(path);
        // Only cache successes; errors pass through and are never remembered.
        if (data && data.success !== false) {
          entries.set(path, { gen: generation, at: Date.now(), promise: Promise.resolve(data) });
          if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
        } else {
          entries.delete(path);
        }
        return data;
      })
      .catch((err) => { inflight.delete(path); entries.delete(path); throw err; });
    inflight.set(path, promise);
  }
  // Under the TTL a retry (or a concurrent second caller) reuses this promise;
  // if it was a failure, the negative entry expires and the next call refetches.
  entries.set(path, { gen: generation, at: Date.now(), promise });
  return promise;
}
