import express from "express";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { isFresh, getCache, setCache, lastFetchedAt } from "./cache.js";
import { scrape as scrapeJobfind } from "./scrapers/jobfind.js";
import { scrape as scrapeKariera } from "./scrapers/kariera.js";
import { scrape as scrapeXe } from "./scrapers/xe.js";
import { categorizeJob } from "./categorize.js";
import { mergeSourceResults } from "../scripts/merge-source-results.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLISHED_JOBS_PATH = path.join(__dirname, "..", "data", "jobs.json");
const app = express();
const PORT = 3000;

// Serve frontend from root
app.use(express.static(path.join(__dirname, "..")));

function getPreviousJobs() {
  const cached = getCache();
  if (cached.length > 0) return cached;

  try {
    const data = JSON.parse(readFileSync(PUBLISHED_JOBS_PATH, "utf8"));
    return Array.isArray(data.jobs) ? data.jobs : [];
  } catch (err) {
    console.warn(`⚠️  Could not read published jobs for fallback: ${err.message}`);
    return [];
  }
}

async function fetchAll(previousJobs = getPreviousJobs()) {
  console.log("🔄 Scraping all sources...");
  const scrapers = [
    { name: "jobfind", fn: scrapeJobfind },
    { name: "kariera", fn: scrapeKariera },
    { name: "xe", fn: scrapeXe },
  ];
  const results = await Promise.allSettled(scrapers.map(({ fn }) => fn()));
  const {
    jobs,
    successfulSources,
    failedSources,
    unrecoverableSources,
  } = mergeSourceResults(results, scrapers, previousJobs);

  if (successfulSources.length === 0) {
    throw new Error(
      `All scrapers failed (${failedSources.join(", ")}) — keeping existing cache`
    );
  }

  if (unrecoverableSources.length > 0) {
    throw new Error(
      `No fallback data available for ${unrecoverableSources.join(", ")} — keeping existing cache`
    );
  }

  // Prefer each site's source category, then fall back to title/tag matching.
  const categorized = jobs.map(j => ({ ...j, category: categorizeJob(j) }));

  // Deduplicate:
  // - named jobs   → dedup by title + company (same job, same company)
  // - anonymous    → dedup by title only (jobfind hides company names)
  const namedSeen = new Set(); // "title|company"
  const anonSeen  = new Set(); // "title"

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

// GET /api/jobs — returns cached or fresh jobs
app.get("/api/jobs", async (req, res) => {
  try {
    if (!isFresh()) {
      const jobs = await fetchAll();
      setCache(jobs);
    }
    res.json({ jobs: getCache(), lastFetched: lastFetchedAt() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scraping failed", detail: err.message });
  }
});

// GET /api/refresh — force re-scrape
app.get("/api/refresh", async (req, res) => {
  try {
    const jobs = await fetchAll();
    setCache(jobs);
    res.json({ jobs, lastFetched: lastFetchedAt() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scraping failed", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 WorkInPatra running at http://localhost:${PORT}`);
});
