// Standalone scraper — runs in GitHub Actions, writes data/jobs.json
import { scrape as scrapeJobfind } from "../server/scrapers/jobfind.js";
import { scrape as scrapeKariera } from "../server/scrapers/kariera.js";
import { scrape as scrapeXe }      from "../server/scrapers/xe.js";
import { categorize }              from "../server/categorize.js";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath }           from "url";
import path                        from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  // Categorize
  const categorized = jobs.map(j => ({ ...j, category: categorize(j.title, j.tags) }));

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
