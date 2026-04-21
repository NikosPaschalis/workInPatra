const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const cache = {
  jobs: [],
  lastFetched: null,
};

export function isFresh() {
  return cache.lastFetched && (Date.now() - cache.lastFetched) < TTL_MS;
}

export function getCache() {
  return cache.jobs;
}

export function setCache(jobs) {
  cache.jobs = jobs;
  cache.lastFetched = Date.now();
}

export function lastFetchedAt() {
  return cache.lastFetched ? new Date(cache.lastFetched).toISOString() : null;
}
