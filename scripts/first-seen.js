import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { makeJobKey } from "./job-history.js";
import { jobIdentity } from "./job-identity.js";

function identities(job) {
  return [makeJobKey(job), job?.source === "corporate" ? null : jobIdentity(job)].filter(Boolean);
}
export function recordEarliest(map, key, value, now = new Date()) {
  const stamp = Date.parse(value || "");
  if (!key || !Number.isFinite(stamp) || stamp > now.getTime()) return;
  const old = Date.parse(map.get(key) || "");
  if (!Number.isFinite(old) || stamp < old) map.set(key, new Date(stamp).toISOString());
}
export async function loadFirstSeen({ dataDir, previousJobs = [], previousFetchedAt, now = new Date() }) {
  const map = new Map();
  for (const job of previousJobs) for (const key of identities(job)) {
    // Legacy inventory has only a conservative observation timestamp, not a new publication.
    recordEarliest(map, key, job.firstSeenAt || job.manuallyVerifiedAt || previousFetchedAt, now);
  }
  const file = path.join(dataDir, "observations.jsonl");
  if (existsSync(file)) {
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const obs = JSON.parse(line);
      const value = obs.first_seen_at || obs.observed_at;
      recordEarliest(map, obs.job_key, value, now);
      if (!obs.source_group || obs.source_group !== "corporate") recordEarliest(map, jobIdentity(obs), value, now);
    }
  }
  return map;
}
export function stampFirstSeen(jobs, known, { now = new Date(), isFresh = () => true } = {}) {
  return jobs.map(job => {
    const keys = identities(job);
    for (const key of keys) recordEarliest(known, key, job.firstSeenAt || job.manuallyVerifiedAt, now);
    const dates = keys.map(key => known.get(key)).filter(Boolean).sort();
    const firstSeenAt = dates[0] || (isFresh(job) ? now.toISOString() : null);
    if (firstSeenAt) for (const key of keys) recordEarliest(known, key, firstSeenAt, now);
    return { ...job, firstSeenAt };
  });
}
