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

## Schema v2 (2026-11-24)
New observations retain location, employment_type, experience_level, salary_raw, external_id, date_provenance, date_changed, original_observed_date and last_seen_at. Missing fields are null, never imputed. Source-reported dates are not necessarily original publication dates. firstSeenAt is the earliest recorded evidence; originalObservedDate is the first non-null reported date in observed order; lastSeenAt changes only on fresh collection or actual manual verification. Existing history remains unchanged. Manual imports use run_type manual and status manual_verified, with verified_at separate from ingestion observed_at; they are not source-wide coverage or evidence of absence. Raw successful source records are stored before public deduplication (one source-specific posting identity per run). Scheduled skips/fallbacks never generate new positive evidence. 
