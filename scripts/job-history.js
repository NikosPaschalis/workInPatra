import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function appendJsonl(filePath, record) {
  appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
}

export function makeJobKey(job) {
  const source = String(job?.sourceKey || job?.source || "unknown").trim().toLowerCase();
  if (job?.source === "corporate" && job.externalId) return source + ":posting:" + job.externalId;
  if (job?.url) {
    try {
      const url = new URL(job.url);
      url.hash = "";
      const normalizedUrl = url.toString().replace(/\/+$/, "");
      return source + ":" + normalizedUrl;
    } catch {
      // Use the title/company fallback when the URL is malformed.
    }
  }

  const title = String(job?.title || "").trim().toLocaleLowerCase("el");
  const company = String(job?.company || "").trim().toLocaleLowerCase("el");
  return source + ":fallback:" + title + "|" + company;
}

export function toObservation(job, observedAt, runId, kind = "scrape") {
  return {
    schema_version: 2,
    observation_kind: kind,
    observed_at: observedAt,
    verified_at: kind === "manual" ? job.manuallyVerifiedAt : kind === "baseline" ? null : observedAt,
    run_id: runId,
    job_key: makeJobKey(job),
    source: job.sourceKey || job.source || "unknown",
    ...(job.sourceKey ? { source_group: job.source, company_id: job.companyId, subcategory: job.subcategory } : {}),
    title: job.title || "",
    company: job.company || "",
    url: job.url || "",
    source_category: job.sourceCategory || "",
    category: job.category || "other",
    source_published_at: job.date || null,
    first_seen_at: job.firstSeenAt || null,
    source_date_raw: job.dateRaw || "",
    date_provenance: job.dateProvenance || null,
    date_changed: job.dateChanged === true,
    original_observed_date: job.originalObservedDate || null,
    last_seen_at: job.lastSeenAt || null,
    location: job.location || null,
    employment_type: job.employmentType || null,
    experience_level: job.experienceLevel || null,
    salary_raw: job.salaryRaw || null,
    external_id: job.externalId || null,
    tags: Array.isArray(job.tags) ? job.tags : [],
  };
}

export function initializeHistory({ dataDir, previousJobs, lastFetched }) {
  mkdirSync(dataDir, { recursive: true });
  const observationsPath = path.join(dataDir, "observations.jsonl");
  const runsPath = path.join(dataDir, "scrape-runs.jsonl");

  if (existsSync(observationsPath) && readFileSync(observationsPath, "utf8").trim().length > 0) {
    return { initialized: false, baselineCount: 0 };
  }

  const parsedLastFetched = lastFetched ? new Date(lastFetched) : null;
  const observedAt = parsedLastFetched && !Number.isNaN(parsedLastFetched.getTime())
    ? parsedLastFetched.toISOString()
    : new Date().toISOString();
  const runId = "baseline-" + observedAt.replace(/[^0-9]/g, "").slice(0, 14);

  for (const job of previousJobs) {
    appendJsonl(observationsPath, toObservation(job, observedAt, runId, "baseline"));
  }

  const bySource = {};
  for (const job of previousJobs) {
    const source = job.sourceKey || job.source || "unknown";
    bySource[source] = (bySource[source] || 0) + 1;
  }

  appendJsonl(runsPath, {
    run_id: runId,
    run_type: "baseline",
    status: "baseline",
    started_at: observedAt,
    completed_at: observedAt,
    total_observed: previousJobs.length,
    sources: Object.fromEntries(
      Object.entries(bySource).map(([source, count]) => [
        source,
        { status: "baseline_existing_dataset", observed_count: count },
      ])
    ),
    note: "Initial history seed from the existing jobs.json dataset. This is not the original first-seen date of these jobs.",
  });

  return { initialized: true, baselineCount: previousJobs.length };
}

export function recordScrapeHistory({
  dataDir,
  jobs,
  runId = randomUUID(),
  startedAt,
  completedAt = new Date().toISOString(),
  sourceStats,
}) {
  mkdirSync(dataDir, { recursive: true });
  const observationsPath = path.join(dataDir, "observations.jsonl");
  const runsPath = path.join(dataDir, "scrape-runs.jsonl");

  const freshJobs = [...new Map(jobs.filter(job => sourceStats[job.sourceKey || job.source]?.status === "success").map(job=>[makeJobKey(job),job])).values()];
  for (const job of freshJobs) {
    appendJsonl(observationsPath, toObservation(job, completedAt, runId));
  }

  const hasFallback = Object.values(sourceStats).some((source) => source.status === "fallback");
  const hasFailure = Object.values(sourceStats).some((source) => source.status === "failed");
  const hasSkipped = Object.values(sourceStats).some((source) => source.status === "skipped");
  const status = hasFailure || hasFallback || hasSkipped ? "partial" : "success";

  appendJsonl(runsPath, {
    run_id: runId,
    run_type: "scrape",
    status,
    started_at: startedAt,
    completed_at: completedAt,
    total_observed: freshJobs.length,
    sources: Object.fromEntries(Object.entries(sourceStats).map(([key,stats])=>[key,{...stats,observed_count:freshJobs.filter(j=>(j.sourceKey||j.source)===key).length}])),
  });

  return { runId, status, observedCount: freshJobs.length };
}

export function recordFailedRun({ dataDir, startedAt, error, runId = randomUUID() }) {
  mkdirSync(dataDir, { recursive: true });
  appendJsonl(path.join(dataDir, "scrape-runs.jsonl"), {
    run_id: runId,
    run_type: "scrape",
    status: "failed",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    total_observed: 0,
    sources: {},
    error: String(error?.message || error || "Unknown scraper error"),
  });
  return runId;
}

// Manual imports are positive evidence only, never a full-source scrape.
export function recordManualHistory({dataDir,jobs,completedAt=new Date().toISOString(),runId=randomUUID()}){
 if(!jobs.length)return {observedCount:0};
 const unique=[...new Map(jobs.map(j=>[makeJobKey(j),j])).values()];
 for(const j of unique){
  if(!Number.isFinite(Date.parse(j.manuallyVerifiedAt||""))||Date.parse(j.manuallyVerifiedAt)>Date.parse(completedAt))throw Error("Invalid manual verification timestamp");
 }
 mkdirSync(dataDir,{recursive:true});
 const sources={};
 for(const j of unique){
  const k=j.sourceKey||j.source;
  sources[k]||={status:"manual_verified",observed_count:0};
  sources[k].observed_count++;
  appendJsonl(path.join(dataDir,"observations.jsonl"),toObservation(j,completedAt,runId,"manual"));
 }
 appendJsonl(path.join(dataDir,"scrape-runs.jsonl"),{run_id:runId,run_type:"manual",status:"success",started_at:completedAt,completed_at:completedAt,total_observed:unique.length,sources});
 return {runId,observedCount:unique.length};
}
