// Standalone scraper — runs in GitHub Actions, writes current jobs and history.
import { scrape as scrapeJobfind } from "../server/scrapers/jobfind.js";
import { scrape as scrapeKariera } from "../server/scrapers/kariera.js";
import { scrape as scrapeXe } from "../server/scrapers/xe.js";
import { loadFirstSeen, stampFirstSeen } from "./first-seen.js";
import { mergeCorporateListings, previousCorporateInventory } from "../server/corporate-inventory.js";
import { corporateEnabled, corporateDue } from "../server/corporate-permissions.js";
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
  makeJobKey,
  recoverManualEvidence,
} from "./job-history.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_TIMEOUT_MS = 90_000;

function withTimeout(promise, ms, name) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(name + " timed out after " + ms / 1000 + "s")), ms); });
  return Promise.race([promise, timeout]).finally(()=>clearTimeout(timer));
}

export async function fetchAll(previousJobs, previousCorporate, { boardScrapers, corporateCollector = collectCorporate, enabled = corporateEnabled, due = corporateDue } = {}) {
  console.log("🔄 Scraping all sources...");
  console.log("⏱  Per-scraper timeout: " + SCRAPER_TIMEOUT_MS / 1000 + "s\n");

  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const runKariera = shouldRunKariera(eventName, process.env.KARIERA_CRON || "", process.env.KARIERA_PAUSE_UNTIL || "");
  const karieraDelay = runKariera ? karieraJitterMs(eventName) : 0;

  const scrapers = boardScrapers || [
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

  const corporate = await corporateCollector(previousCorporate, { enabled, due });
  const boards = jobs.map(job=>({...job,category:categorizeJob(job)}));
  // Use raw successful adapter output, not retained curated rows or public deduplication.
  const freshBoards = results.flatMap((r,i)=>successfulSources.includes(scrapers[i].name)&&Array.isArray(r.value)?r.value.map(j=>({...j,category:categorizeJob(j)})):[]);
  const freshKeys = new Set([...freshBoards,...corporate.jobs.filter(j=>corporate.sourceStats[j.sourceKey]?.status==="success")].map(makeJobKey));
  const deduplicated = mergeCorporateListings(boards,corporate.jobs);

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
      collection_scope: "listing_page_unverified",
      collection_method: name+":listing-page:v1",
      scraped_count: freshCount,
      fallback_count: status === "fallback" ? fallbackCount : 0,
      retained_count: deduplicated.filter((job) => job.source === name).length,
    }];
  }));

  for (const [key, stats] of Object.entries(corporate.sourceStats)) {
    sourceStats[key] = { ...stats, collection_scope:"employer_adapter", collection_method:key+":posting-adapter:v1", retained_count: deduplicated.filter(j => j.sourceKey === key).length };
  }
  const corporateCoverage = Object.fromEntries(Object.entries(corporate.sourceStats).map(([key, stats]) => [key, { ...stats, public_count: deduplicated.filter(j => j.sourceKey === key).length }]));
  // Track all verified corporate observations, even if an existing board has the same listing.
  const historyJobs = [...new Map([...freshBoards,...corporate.jobs.filter(j=>corporate.sourceStats[j.sourceKey]?.status==="success")].map(j=>[makeJobKey(j),j])).values()];
  return { jobs: deduplicated, historyJobs, freshKeys, corporateInventory:corporate.jobs, sourceStats, corporateCoverage };
}

function loadPreviousJobs(jobsPath) {
  try {
    const data = JSON.parse(readFileSync(jobsPath, "utf8"));
    return {
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
      corporateInventory: previousCorporateInventory(data),
      lastFetched: data.lastFetched || null,
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("⚠️  Could not read existing jobs.json: " + error.message);
    }
    return { jobs: [], corporateInventory:[], lastFetched: null };
  }
}

export async function runScrape({ dataDir = path.join(__dirname, "..", "data"), ...options } = {}) {
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

    // Explicitly timestamped legacy manual approvals are evidence, not fresh scrapes.
    recoverManualEvidence({dataDir,jobs:previous.jobs,completedAt:startedAt});
    const result = await fetchAll(previous.jobs, previous.corporateInventory, options);
    const sourceStats = result.sourceStats;
    const now = new Date();
    const firstSeen = await loadFirstSeen({ dataDir, previousJobs: [...previous.jobs,...previous.corporateInventory], previousFetchedAt: previous.lastFetched, now });
    const stampOptions = { now, isFresh: job => result.freshKeys.has(makeJobKey(job)) };
    const historyJobs = stampFirstSeen(result.historyJobs, firstSeen, stampOptions);
    const jobs = stampFirstSeen(result.jobs, firstSeen, stampOptions);

    if (jobs.length === 0) {
      throw new Error("No jobs returned from any scraper — aborting write to avoid overwriting good data");
    }

    const completedAt = new Date().toISOString();
    const corporateInventory=stampFirstSeen(result.corporateInventory,firstSeen,stampOptions);
    const output = { jobs, lastFetched: completedAt, corporateCoverage: result.corporateCoverage, corporateInventory };

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
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runScrape().catch(()=>{ process.exitCode=1; });
}
