import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function appendJsonl(filePath, record) {
  appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
}

function makeJobKey(job) {
  const source = String(job?.source || "unknown").trim().toLowerCase();
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

function toObservation(job, observedAt, runId) {
  return {
    observed_at: observedAt,
    run_id: runId,
    job_key: makeJobKey(job),
    source: job.source || "unknown",
    title: job.title || "",
    company: job.company || "",
    url: job.url || "",
    source_category: job.sourceCategory || "",
    category: job.category || "other",
    source_published_at: job.date || null,
    source_date_raw: job.dateRaw || "",
    tags: Array.isArray(job.tags) ? job.tags : [],
  };
}

export function initializeHistory({ dataDir, previousJobs, lastFetched }) {
  mkdirSync(dataDir, { recursive: true });
  const observationsPath = path.join(dataDir, "observations.jsonl");
  const runsPath = path.join(dataDir, "scrape-runs.jsonl");

  if (existsSync(observationsPath) && statSync(observationsPath).size > 0) {
    return { initialized: false, baselineCount: 0 };
  }

  const parsedLastFetched = lastFetched ? new Date(lastFetched) : null;
  const observedAt = parsedLastFetched && !Number.isNaN(parsedLastFetched.getTime())
    ? parsedLastFetched.toISOString()
    : new Date().toISOString();
  const runId = "baseline-" + observedAt.replace(/[^0-9]/g, "").slice(0, 14);

  for (const job of previousJobs) {
    appendJsonl(observationsPath, toObservation(job, observedAt, runId));
  }

  const bySource = {};
  for (const job of previousJobs) {
    const source = job.source || "unknown";
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

  const freshJobs = jobs.filter((job) => sourceStats[job.source]?.status === "success");
  for (const job of freshJobs) {
    appendJsonl(observationsPath, toObservation(job, completedAt, runId));
  }

  const hasFallback = Object.values(sourceStats).some((source) => source.status === "fallback");
  const hasFailure = Object.values(sourceStats).some((source) => source.status === "failed");
  const status = hasFailure || hasFallback ? "partial" : "success";

  appendJsonl(runsPath, {
    run_id: runId,
    run_type: "scrape",
    status,
    started_at: startedAt,
    completed_at: completedAt,
    total_observed: freshJobs.length,
    sources: sourceStats,
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
