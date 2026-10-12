import { scrape } from "../server/scrapers/kariera.js";

// This is a read-only smoke test: scrape() fetches and parses the public page;
// it does not write to the site's published jobs dataset.
try {
  const jobs = await scrape();
  const uniqueUrls = new Set(jobs.map((job) => job.url));
  const invalidJobs = jobs.filter(
    (job) => !job.title?.trim() || !/^https:\/\//i.test(job.url || "")
  );

  if (jobs.length < 10) {
    throw new Error(
      `Expected at least 10 live listings from the Patras page, received ${jobs.length}`
    );
  }

  if (uniqueUrls.size !== jobs.length) {
    throw new Error(
      `Expected unique listing URLs, received ${jobs.length} jobs and ${uniqueUrls.size} unique URLs`
    );
  }

  if (invalidJobs.length > 0) {
    throw new Error(`Found ${invalidJobs.length} listings without a title or absolute URL`);
  }

  console.log(
    "[kariera-live-smoke] PASS",
    JSON.stringify(
      {
        jobCount: jobs.length,
        uniqueUrlCount: uniqueUrls.size,
        sample: jobs.slice(0, 5).map(({ title, url, sourceCategory }) => ({
          title,
          url,
          hasSourceCategory: Boolean(sourceCategory),
        })),
      },
      null,
      2
    )
  );
} catch (error) {
  console.error("[kariera-live-smoke] FAIL", error);
  process.exitCode = 1;
}
