// Standalone scraper — runs in GitHub Actions, writes data/jobs.json
import { scrape as scrapeJobfind } from "../server/scrapers/jobfind.js";
import { scrape as scrapeKariera } from "../server/scrapers/kariera.js";
import { scrape as scrapeXe }      from "../server/scrapers/xe.js";
import { categorize }              from "../server/categorize.js";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath }           from "url";
import path                        from "path";

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

async function fetchAll() {
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

  const jobs = results.flatMap((r, i) => {
    const { name } = scrapers[i];
    if (r.status === "fulfilled") {
      console.log(`✅ ${name}: ${r.value.length} jobs`);
      return r.value;
    } else {
      // Timeout and real errors both land here — logged but don't crash the run
      console.error(`❌ ${name}: ${r.reason?.message}`);
      return [];
    }
  });

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

(async () => {
  try {
    const jobs = await fetchAll();

    if (jobs.length === 0) {
      console.warn("⚠️  No jobs returned from any scraper — aborting write to avoid overwriting good data");
      process.exit(1);
    }

    const output = {
      jobs,
      lastFetched: new Date().toISOString(),
    };

    const dataDir = path.join(__dirname, "..", "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      path.join(dataDir, "jobs.json"),
      JSON.stringify(output)
    );
    console.log(`\n✅ Saved ${jobs.length} jobs → data/jobs.json`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Scrape failed:", err);
    process.exit(1);
  }
})();
