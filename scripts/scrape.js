// Standalone scraper — runs in GitHub Actions, writes current jobs and history.
import { scrape as scrapeJobfind } from "../server/scrapers/jobfind.js";
import { scrape as scrapeKariera } from "../server/scrapers/kariera.js";
import { scrape as scrapeXe } from "../server/scrapers/xe.js";
import { loadFirstSeen, stampFirstSeen } from "./first-seen.js";
import { collectCorporate } from "../server/scrapers/corporate.js";
import { categorizeJob } from "../server/categorize.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { mergeSourceResults } from "./merge-source-results.js";
import { shouldRunKariera, karieraJitterMs } from "./kariera-run-policy.js";
import {
  initializeHistory,
  recordScrapeHistory,
  recordFailedRun,
} from "./job-history.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_TIMEOUT_MS = 90_000;

function withTimeout(promise, ms, name) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(name + " timed out after " + ms / 1000 + "s")), ms)
  );
  return Promise.race([promise, timeout]);
}

async function fetchAll(previousJobs) {
  console.log("🔄 Scraping all sources...");
  console.log("⏱  Per-scraper timeout: " + SCRAPER_TIMEOUT_MS / 1000 + "s\n");

  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const runKariera = shouldRunKariera(eventName, process.env.KARIERA_CRON || "", process.env.KARIERA_PAUSE_UNTIL || "");
  const karieraDelay = runKariera ? karieraJitterMs(eventName) : 0;

  const scrapers = [
    { name: "jobfind", fn: scrapeJobfind },
    { name: "kariera", fn: async () => {
      if (!runKariera) return { skipped: true };
      if (karieraDelay > 0) {
        console.log("⏱ Kariera-only delay: " + Math.ceil(karieraDelay / 1000) + " seconds");
        await new Promise((resolve) => setTimeout(resolve, karieraDelay));
      }
      return scrapeKariera();
    } },
    { name: "xe", fn: scrapeXe },
  ];

  const results = await Promise.allSettled(
    scrapers.map(({ name, fn }) =>
      withTimeout(fn(), SCRAPER_TIMEOUT_MS + (name === "kariera" ? karieraDelay : 0), name)
    )
  );

  const {
    jobs,
    successfulSources,
    failedSources,
    skippedSources,
    unrecoverableSources,
  } = mergeSourceResults(results, scrapers, previousJobs);

  if (successfulSources.length === 0) {
    throw new Error(
      "All scrapers failed (" + failedSources.join(", ") + ") — keeping existing jobs.json"
    );
  }

  if (unrecoverableSources.length > 0) {
    throw new Error(
      "No fallback data available for " + unrecoverableSources.join(", ") + " — refusing to publish an incomplete jobs.json"
    );
  }

  const corporate = await collectCorporate(previousJobs, { enabled: process.env.CORPORATE_CAREERS_ENABLED === "true" && process.env.SMARTRECRUITERS_REUSE_AUTHORIZED === "true" });
  const categorized = [...jobs, ...corporate.jobs].map((job) => ({
    ...job,
    category: job.source === "corporate" ? job.category : categorizeJob(job),
  }));

  const namedSeen = new Set();
  const anonSeen = new Set();
  const corporateUrls = new Set();
  const deduplicated = categorized.filter((job) => {
    if (job.source === "corporate") {
      const key = job.url;
      const namedKey = job.title.toLowerCase().trim() + "|" + (job.company || "").toLowerCase().trim();
      if (corporateUrls.has(key) || namedSeen.has(namedKey)) return false;
      corporateUrls.add(key);
      return true;
    }
    const title = job.title.toLowerCase().trim();
    const company = job.company?.toLowerCase().trim() || "";
    if (company) {
      const key = title + "|" + company;
      if (namedSeen.has(key)) return false;
      namedSeen.add(key);
    } else {
      if (anonSeen.has(title)) return false;
      anonSeen.add(title);
    }
    return true;
  });

  const sourceStats = Object.fromEntries(scrapers.map(({ name }, index) => {
    const result = results[index];
    const freshCount = result.status === "fulfilled" && Array.isArray(result.value)
      ? result.value.length
      : 0;
    const fallbackCount = previousJobs.filter((job) => job.source === name).length;
    const status = skippedSources.includes(name)
      ? "skipped"
      : successfulSources.includes(name)
        ? "success"
        : fallbackCount > 0 ? "fallback" : "failed";

    return [name, {
      status,
      scraped_count: freshCount,
      fallback_count: status === "fallback" ? fallbackCount : 0,
      retained_count: deduplicated.filter((job) => job.source === name).length,
    }];
  }));

  for (const [key, stats] of Object.entries(corporate.sourceStats)) {
    if (stats.status === "skipped" && stats.retained_count === 0) continue;
    sourceStats[key] = { ...stats, retained_count: deduplicated.filter(j => j.sourceKey === key).length };
  }
  const corporateCoverage = Object.fromEntries(Object.entries(corporate.sourceStats).map(([key, stats]) => [key, { ...stats, retained_count: deduplicated.filter(j => j.sourceKey === key).length }]));
  // Track all verified corporate observations, even if an existing board has the same listing.
  const historyJobs = [...deduplicated.filter(j => j.source !== "corporate"), ...corporate.jobs];
  return { jobs: deduplicated, historyJobs, sourceStats, corporateCoverage };
}

function loadPreviousJobs(jobsPath) {
  try {
    const data = JSON.parse(readFileSync(jobsPath, "utf8"));
    return {
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
      lastFetched: data.lastFetched || null,
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("⚠️  Could not read existing jobs.json: " + error.message);
    }
    return { jobs: [], lastFetched: null };
  }
}

(async () => {
  const dataDir = path.join(__dirname, "..", "data");
  const jobsPath = path.join(dataDir, "jobs.json");
  const startedAt = new Date().toISOString();

  try {
    const previous = loadPreviousJobs(jobsPath);
    const baseline = initializeHistory({
      dataDir,
      previousJobs: previous.jobs,
      lastFetched: previous.lastFetched,
    });
    if (baseline.initialized) {
      console.log("🧱 Initialized history baseline with " + baseline.baselineCount + " existing jobs");
    }

    const result = await fetchAll(previous.jobs);
    const sourceStats = result.sourceStats;
    const now = new Date();
    const firstSeen = await loadFirstSeen({ dataDir, previousJobs: previous.jobs, previousFetchedAt: previous.lastFetched, now });
    const options = { now, isFresh: job => sourceStats[job.sourceKey || job.source]?.status === "success" };
    const historyJobs = stampFirstSeen(result.historyJobs, firstSeen, options);
    const jobs = stampFirstSeen(result.jobs, firstSeen, options);

    if (jobs.length === 0) {
      throw new Error("No jobs returned from any scraper — aborting write to avoid overwriting good data");
    }

    const completedAt = new Date().toISOString();
    const output = { jobs, lastFetched: completedAt, corporateCoverage: result.corporateCoverage };

    mkdirSync(dataDir, { recursive: true });
    writeFileSync(jobsPath, JSON.stringify(output), "utf8");

    const historyResult = recordScrapeHistory({
      dataDir,
      jobs: historyJobs,
      startedAt,
      completedAt,
      sourceStats,
    });

    console.log("\n✅ Saved " + jobs.length + " jobs → data/jobs.json");
    console.log("📚 Recorded " + historyResult.observedCount + " fresh observations (" + historyResult.status + ")");
  } catch (error) {
    try {
      recordFailedRun({ dataDir, startedAt, error });
    } catch (historyError) {
      console.error("⚠️ Could not record failed scrape run:", historyError);
    }
    console.error("❌ Scrape failed:", error);
    process.exitCode = 1;
  }
})();
