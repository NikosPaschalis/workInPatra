// Standalone scraper — runs in GitHub Actions, writes data/jobs.json
import { scrape as scrapeJobfind } from "../server/scrapers/jobfind.js";
import { scrape as scrapeKariera } from "../server/scrapers/kariera.js";
import { scrape as scrapeXe }      from "../server/scrapers/xe.js";
import { categorize }              from "../server/categorize.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath }           from "url";
import path                        from "path";
import { mergeSourceResults }      from "./merge-source-results.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rejects after `ms` milliseconds — prevents a hanging scraper from
// blocking Promise.allSettled() forever (which caused the 6h GH Actions hang)
const SCRAPER_TIMEOUT_MS = 90_000; // 90 seconds per scraper

function withTimeout(promise, ms, name) {
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`${name} timed out after ${ms / 1000}s`)),
      ms
    )
  );
  return Promise.race([promise, timeout]);
}

async function fetchAll(previousJobs) {
  console.log("🔄 Scraping all sources...");
  console.log(`⏱  Per-scraper timeout: ${SCRAPER_TIMEOUT_MS / 1000}s\n`);

  const scrapers = [
    { name: "jobfind", fn: scrapeJobfind },
    { name: "kariera", fn: scrapeKariera },
    { name: "xe",      fn: scrapeXe      },
  ];

  const results = await Promise.allSettled(
    scrapers.map(({ name, fn }) => withTimeout(fn(), SCRAPER_TIMEOUT_MS, name))
  );

  const {
    jobs,
    successfulSources,
    failedSources,
    unrecoverableSources,
  } = mergeSourceResults(results, scrapers, previousJobs);

  // If every source failed, keep the published file byte-for-byte unchanged.
  // Updating lastFetched in that situation would incorrectly imply fresh data.
  if (successfulSources.length === 0) {
    throw new Error(
      `All scrapers failed (${failedSources.join(", ")}) — keeping existing jobs.json`
    );
  }

  if (unrecoverableSources.length > 0) {
    throw new Error(
      `No fallback data available for ${unrecoverableSources.join(", ")} — refusing to publish an incomplete jobs.json`
    );
  }

  // Categorize
  const categorized = jobs.map(j => ({
    ...j,
    category: categorize(j.title, j.tags),
  }));

  // Deduplicate
  const namedSeen = new Set();
  const anonSeen  = new Set();
  return categorized.filter(j => {
    const t = j.title.toLowerCase().trim();
    const c = j.company?.toLowerCase().trim() || "";
    if (c) {
      const key = `${t}|${c}`;
      if (namedSeen.has(key)) return false;
      namedSeen.add(key);
    } else {
      if (anonSeen.has(t)) return false;
      anonSeen.add(t);
    }
    return true;
  });
}

function loadPreviousJobs(jobsPath) {
  try {
    const data = JSON.parse(readFileSync(jobsPath, "utf8"));
    return Array.isArray(data.jobs) ? data.jobs : [];
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn(`⚠️  Could not read existing jobs.json: ${err.message}`);
    }
    return [];
  }
}

(async () => {
  try {
    const dataDir = path.join(__dirname, "..", "data");
    const jobsPath = path.join(dataDir, "jobs.json");
    const previousJobs = loadPreviousJobs(jobsPath);
    const jobs = await fetchAll(previousJobs);

    if (jobs.length === 0) {
      console.warn("⚠️  No jobs returned from any scraper — aborting write to avoid overwriting good data");
      process.exit(1);
    }

    const output = {
      jobs,
      lastFetched: new Date().toISOString(),
    };

    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      jobsPath,
      JSON.stringify(output)
    );
    console.log(`\n✅ Saved ${jobs.length} jobs → data/jobs.json`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Scrape failed:", err);
    process.exit(1);
  }
})();
