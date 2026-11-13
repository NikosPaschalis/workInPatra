# Historical job data

The scraper stores append-only history in two JSON Lines files:

- `observations.jsonl`: one record each time a job is present in a successfully completed scrape.
- `scrape-runs.jsonl`: one record per scrape run, including per-source status and counts.

## Important semantics

- `observed_at` is when WorkInPatra observed the listing. It is not the job's publication date.
- `source_published_at` is the date parsed from the source, when available. `source_date_raw` preserves the source's original date text.
- `job_key` uses source + URL where possible. A title/company fallback is used only when a URL is unavailable.
- The first baseline is seeded from the current `jobs.json`. Its timestamp comes from `jobs.json.lastFetched` when valid. This does not reconstruct the true historical first-seen date.
- A missing job in one run is not marked expired or inactive. Absence can only be evaluated later when source-run completeness is understood.
- A source that fails or returns no jobs falls back to its previously published listings in `jobs.json`. The run record marks that source as `fallback`. Fallback listings are deliberately excluded from new observations because they were not freshly retrieved in that run.

## Files

- `observations.jsonl`: append-only job observations.
- `scrape-runs.jsonl`: append-only run log.

Each line is an independent JSON object. Do not reformat the files as a single JSON array.
