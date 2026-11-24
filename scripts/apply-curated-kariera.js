// Apply verified, queued Kariera listings after scraping and before the single social notification step.
// The pending queue is committed separately from the published dataset.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadFirstSeen, stampFirstSeen } from "./first-seen.js";

const normalize = (s) => String(s || "").trim().toLocaleLowerCase("el").replace(/\s+/g, " ");
const identity = (job) => normalize(job.title) + "|" + normalize(job.company);
const urlIdentity = (url) => {
  try { const u = new URL(url); u.hash = ""; u.search = ""; return u.toString().replace(/\/$/, ""); }
  catch { return ""; }
};

export function applyCuratedKariera(current, queued) {
  if (!Array.isArray(current) || !Array.isArray(queued)) throw new Error("Expected job arrays");
  const urls = new Set(current.map(j => urlIdentity(j.url)).filter(Boolean));
  const titles = new Set(current.filter(j => j.title && j.company).map(identity));
  const accepted = [], rejected = [];
  for (const job of queued) {
    const url = urlIdentity(job?.url);
    if (job?.source !== "kariera" || !url || new URL(url).hostname !== "www.kariera.gr" ||
        !normalize(job.title) || !normalize(job.location).includes("πάτρα") ||
        !job.manuallyVerifiedAt || !Number.isFinite(Date.parse(job.manuallyVerifiedAt))) {
      rejected.push({ job, reason: "invalid_or_unverified" });
      continue;
    }
    const key = identity(job);
    if (urls.has(url) || (job.company && titles.has(key))) {
      rejected.push({ job, reason: "duplicate" });
      continue;
    }
    urls.add(url);
    if (job.company) titles.add(key);
    accepted.push({ ...job, source: "kariera" });
  }
  return { jobs: [...current, ...accepted], accepted, rejected };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    const jobsPath = path.resolve("data/jobs.json");
    const queuePath = path.resolve("data/kariera-pending.json");
    const existing = JSON.parse(readFileSync(jobsPath, "utf8"));
    const queue = JSON.parse(readFileSync(queuePath, "utf8"));
    const result = applyCuratedKariera(existing.jobs, queue.jobs);
    if (result.rejected.some(j => j.reason === "invalid_or_unverified")) {
      throw new Error("Invalid or unverified queued Kariera listing; refusing to clear queue");
    }
    // Write the queue first only after successful validation. If a subsequent write fails,
    // the original queue remains recoverable via Git; repeated runs are URL-deduplicated.
    const now = new Date();
    const firstSeen = await loadFirstSeen({ dataDir: path.dirname(jobsPath), previousJobs: existing.jobs, previousFetchedAt: existing.lastFetched, now });
    const stamped = stampFirstSeen(result.jobs, firstSeen, { now, isFresh: job => result.accepted.includes(job) });
    writeFileSync(jobsPath, JSON.stringify({ ...existing, jobs: stamped }), "utf8");
    writeFileSync(queuePath, JSON.stringify({ jobs: [] }, null, 2) + "\n", "utf8");
    console.log("Kariera curated: accepted=" + result.accepted.length + ", duplicates=" + result.rejected.length);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
