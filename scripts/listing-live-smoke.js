import { scrape as scrapeJobfind } from "../server/scrapers/jobfind.js";
import { scrape as scrapeXe } from "../server/scrapers/xe.js";

const sources = [
  { name: "jobfind", scrape: scrapeJobfind },
  { name: "xe", scrape: scrapeXe },
];

let failed = false;
for (const source of sources) {
  try {
    const jobs = await source.scrape();
    if (!Array.isArray(jobs) || jobs.length === 0) {
      throw new Error("No valid listings were returned");
    }
    const count = (field) => jobs.filter((job) => Boolean(job[field])).length;
    const summary = {
      jobs: jobs.length,
      titles: count("title"),
      urls: count("url"),
      companies: count("company"),
      locations: count("location"),
      sourceCategories: count("sourceCategory"),
      employmentTypes: count("employmentType"),
      salaries: count("salaryRaw"),
      dates: count("date"),
    };
    if (summary.titles !== jobs.length || summary.urls !== jobs.length) {
      throw new Error("Some listings are missing a title or URL");
    }
    if (source.name === "jobfind" && summary.locations === 0) {
      throw new Error("No JobFind locations were extracted");
    }
    if (source.name === "xe" && (summary.locations === 0 || summary.dates === 0)) {
      throw new Error("XE locations or publication dates were not extracted");
    }
    console.log("[listing-live-smoke] PASS " + source.name + " " + JSON.stringify(summary));
  } catch (error) {
    failed = true;
    console.error("[listing-live-smoke] FAIL " + source.name, error);
  }
}

if (failed) process.exitCode = 1;
