/**
 * Combine fresh scraper results with the last published dataset.
 *
 * A rejected scraper (or an unexpectedly empty result) falls back to the
 * previously published jobs for that source. This prevents a temporary source
 * outage or selector breakage from removing otherwise valid jobs.
 */
export function mergeSourceResults(results, scrapers, previousJobs, logger = console) {
  const previousBySource = new Map(
    scrapers.map(({ name }) => [
      name,
      previousJobs.filter((job) => job.source === name),
    ])
  );

  const successfulSources = [];
  const failedSources = [];
  const unrecoverableSources = [];

  const jobs = results.flatMap((result, index) => {
    const { name } = scrapers[index];
    const freshJobs = result.status === "fulfilled" && Array.isArray(result.value)
      ? result.value
      : null;

    if (freshJobs?.length > 0) {
      successfulSources.push(name);
      logger.log(`✅ ${name}: ${freshJobs.length} jobs`);
      return freshJobs;
    }

    failedSources.push(name);
    const previous = previousBySource.get(name) || [];
    if (previous.length === 0) unrecoverableSources.push(name);
    const reason = result.status === "rejected"
      ? result.reason?.message || "unknown error"
      : "scraper returned 0 jobs";

    logger.error(
      `❌ ${name}: ${reason} — keeping ${previous.length} previously published jobs`
    );
    return previous;
  });

  return { jobs, successfulSources, failedSources, unrecoverableSources };
}
