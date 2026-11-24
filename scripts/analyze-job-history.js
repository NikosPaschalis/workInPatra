// Read-only lifecycle analysis. Never infer a job was filled or expired from a missing scrape.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
}

export function parseJsonl(text, filename = "input") {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      const record = JSON.parse(line);
      if (!record || typeof record !== "object" || Array.isArray(record)) throw Error("expected object");
      return [record];
    } catch (error) {
      throw new Error(filename + ":" + (index + 1) + ": " + error.message);
    }
  });
}

export function analyzeJobLifecycle(observations, runs) {
  // Runs must be trusted before an observation can establish fresh presence.
  const runMap = new Map();
  for (const run of runs) {
    if (!run?.run_id || parseTime(run.completed_at) === null) continue;
    const existing = runMap.get(run.run_id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(run)) {
      throw new Error("Conflicting run_id: " + run.run_id);
    }
    runMap.set(run.run_id, run);
  }

  const bySource = new Map();
  for (const run of runMap.values()) {
    if (run.run_type !== "scrape") continue;
    const at = parseTime(run.completed_at);
    for (const [source, info] of Object.entries(run.sources || {})) {
      if (info?.status !== "success" || info.collection_scope === "listing_page_unverified") continue;
      if (!bySource.has(source)) bySource.set(source, []);
      bySource.get(source).push({ run_id: run.run_id, at });
    }
  }
  for (const list of bySource.values()) list.sort((a, b) => a.at - b.at || a.run_id.localeCompare(b.run_id));

  const grouped = new Map();
  const issues = { untrusted_observations: 0, duplicate_observations: 0, invalid_observations: 0 };
  const unique = new Set();
  for (const observation of observations) {
    const run = runMap.get(observation.run_id);
    const source = observation.source;
    const at = parseTime(observation.observed_at);
    if (!observation.job_key || !source || at === null || !run) {
      issues.invalid_observations++;
      continue;
    }
    const isBaseline = run.run_type === "baseline" && run.status === "baseline";
    const isFresh = run.run_type === "scrape" && run.sources?.[source]?.status === "success";
    const isManual = run.run_type === "manual" && run.sources?.[source]?.status === "manual_verified" && parseTime(observation.verified_at)!==null && parseTime(observation.verified_at)<=at;
    const completed = parseTime(run.completed_at);
    if ((!isBaseline && !isFresh && !isManual) || completed === null || at !== completed) {
      issues.untrusted_observations++;
      continue;
    }
    const observationId = JSON.stringify([observation.run_id, observation.job_key]);
    if (unique.has(observationId)) {
      issues.duplicate_observations++;
      continue;
    }
    unique.add(observationId);
    const key = observation.job_key;
    if (!grouped.has(key)) grouped.set(key, { job_key: key, source, title: observation.title || "", company: observation.company || "", url: observation.url || "", events: [] });
    const job = grouped.get(key);
    if (job.source !== source) {
      issues.invalid_observations++;
      continue;
    }
    job.events.push({ at: isManual?parseTime(observation.verified_at):at, run_id: run.run_id, baseline: isBaseline, manual:isManual });
  }

  const jobs = [];
  for (const job of grouped.values()) {
    job.events.sort((a, b) => a.at - b.at || a.run_id.localeCompare(b.run_id));
    const first = job.events[0], last = job.events.at(-1);
    const sourceRuns = bySource.get(job.source) || [];
    const observedRuns = new Set(job.events.filter(e => !e.baseline).map(e => e.run_id));
    // A missing listing is only an absence from a successful source scrape, not proof of closure.
    const laterSuccesses = sourceRuns.filter(r => r.at > last.at && !observedRuns.has(r.run_id));
    const hasLaterPresence = job.events.some(e => e.at > last.at);
    const status = laterSuccesses.length >= 2 && !hasLaterPresence
      ? "not_seen_in_recent_successful_scrapes"
      : laterSuccesses.length === 1
        ? "not_seen_once"
        : "last_observed";
    const firstFresh = job.events.find(e => !e.baseline && !e.manual);
    jobs.push({
      job_key: job.job_key, source: job.source, title: job.title, company: job.company, url: job.url,
      first_seen: new Date(first.at).toISOString(),
      first_seen_is_baseline: first.baseline,
      first_fresh_seen: firstFresh ? new Date(firstFresh.at).toISOString() : null,
      last_seen: new Date(last.at).toISOString(),
      observation_count: job.events.length,
      days_observed: Math.round((last.at - first.at) / 86400000 * 100) / 100,
      status,
      successful_source_runs_since_last_seen: laterSuccesses.length,
      // Count gaps between observed successful source runs; this is evidence of reappearance, not reposting.
      reappearance_count: job.events.filter((e, i) => i > 0 && !e.baseline && sourceRuns.some(r =>
        r.at > job.events[i - 1].at && r.at < e.at && !observedRuns.has(r.run_id)
      )).length,
    });
  }
  jobs.sort((a, b) => a.job_key.localeCompare(b.job_key));
  const source_quality = Object.fromEntries([...bySource].map(([source, successful]) => [
    source, { successful_scrapes: successful.length, latest_success_at: successful.length ? new Date(successful.at(-1).at).toISOString() : null }
  ]));
  // Include blocked sources even if they have never succeeded.
  for (const run of runMap.values()) {
    for (const [source, info] of Object.entries(run.sources || {})) {
      if (!source_quality[source]) source_quality[source] = { successful_scrapes: 0, latest_success_at: null };
      if (info?.status==="success" && info.collection_scope==="listing_page_unverified") { source_quality[source].successful_scrapes++; if(!source_quality[source].latest_success_at||run.completed_at>source_quality[source].latest_success_at)source_quality[source].latest_success_at=run.completed_at; }
      const key = info?.status;
      if (key && key !== "success") source_quality[source][key + "_runs"] = (source_quality[source][key + "_runs"] || 0) + 1;
    }
  }
  return {
    schema_version: 1,
    semantics: "Observation-based, not publication/expiration/hiring dates. Baseline first_seen is left-censored. Missing from successful scrapes is not proof of vacancy closure.",
    summary: {
      jobs: jobs.length,
      last_observed: jobs.filter(j => j.status === "last_observed").length,
      not_seen_once: jobs.filter(j => j.status === "not_seen_once").length,
      not_seen_in_recent_successful_scrapes: jobs.filter(j => j.status === "not_seen_in_recent_successful_scrapes").length,
    },
    issues, source_quality, jobs,
  };
}

export function analyzeFiles(dataDir) {
  return analyzeJobLifecycle(
    parseJsonl(readFileSync(path.join(dataDir, "observations.jsonl"), "utf8"), "observations.jsonl"),
    parseJsonl(readFileSync(path.join(dataDir, "scrape-runs.jsonl"), "utf8"), "scrape-runs.jsonl")
  );
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("data");
    process.stdout.write(JSON.stringify(analyzeFiles(dataDir), null, 2) + "\n");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
