import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadFirstSeen, stampFirstSeen } from "./first-seen.js";
import { makeJobKey, recoverManualEvidence } from "./job-history.js";
import { mergeManualQueue } from "./manual-queue.js";

export function applyManualPending(current, queued, options) {
  return mergeManualQueue(current, queued, options);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    const jobsPath = path.resolve("data/jobs.json");
    const queuePath = path.resolve("data/manual-pending.json");
    const existing = JSON.parse(readFileSync(jobsPath, "utf8"));
    const queue = JSON.parse(readFileSync(queuePath, "utf8"));
    const result = applyManualPending(existing.jobs, queue.jobs);
    const invalid = result.rejected.filter((entry) => entry.reason !== "duplicate");
    if (invalid.length) throw new Error(`Manual queue contains ${invalid.length} invalid or expired listing(s); refusing to clear queue`);
    const now = new Date();
    const firstSeen = await loadFirstSeen({ dataDir: path.dirname(jobsPath), previousJobs: existing.jobs, previousFetchedAt: existing.lastFetched, now });
    const acceptedKeys = new Set(result.accepted.map(makeJobKey));
    const reviewed=stampFirstSeen(result.reviewed.map(job=>({...job,observationKind:"manual"})),firstSeen,{now,isFresh:()=>true});
    recoverManualEvidence({dataDir:path.dirname(jobsPath),jobs:reviewed,completedAt:now.toISOString()});
    const stamped = stampFirstSeen(result.jobs.map(job=>acceptedKeys.has(makeJobKey(job))?{...job,observationKind:"manual"}:job), firstSeen, { now, isFresh: job => acceptedKeys.has(makeJobKey(job)) });
    writeFileSync(jobsPath, JSON.stringify({ ...existing, jobs: stamped }), "utf8");
    writeFileSync(queuePath, JSON.stringify({ jobs: [] }, null, 2) + "\n", "utf8");
    console.log(`Manual queue: accepted=${result.accepted.length}, duplicates=${result.rejected.length}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
