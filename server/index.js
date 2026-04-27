import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { isFresh, getCache, setCache, lastFetchedAt } from "./cache.js";
import { scrape as scrapeJobfind } from "./scrapers/jobfind.js";
import { scrape as scrapeKariera } from "./scrapers/kariera.js";
import { scrape as scrapeXe } from "./scrapers/xe.js";
import { categorize } from "./categorize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Serve frontend from root
app.use(express.static(path.join(__dirname, "..")));

async function fetchAll() {
  console.log("🔄 Scraping all sources...");
  const results = await Promise.allSettled([
    scrapeJobfind(),
    scrapeKariera(),
    scrapeXe(),
  ]);

  const jobs = results.flatMap((r, i) => {
    const name = ["jobfind", "kariera", "xe"][i];
    if (r.status === "fulfilled") {
      console.log(`✅ ${name}: ${r.value.length} jobs`);
      return r.value;
    } else {
      console.error(`❌ ${name}:`, r.reason?.message);
      return [];
    }
  });

  // Add category via keyword matching
  const categorized = jobs.map(j => ({ ...j, category: categorize(j.title, j.tags) }));

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
