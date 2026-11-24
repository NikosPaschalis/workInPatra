# Job lifecycle analysis (phase 1)

Read-only analysis of the existing append-only history. No scraper, production JSON, or site behavior is changed.

Run from repository root:

```bash
node scripts/analyze-job-history.js > /tmp/workinpatra-lifecycle.json
npm test
```

The command reads `data/observations.jsonl` and `data/scrape-runs.jsonl`. You can pass a different data directory as the first argument.

## Definitions and limits

- `first_seen`: earliest **recorded observation**, not source publication date. `first_seen_is_baseline` flags left-censored historical seeds.
- `first_fresh_seen`: earliest observation from a successful source scrape, or null.
- `last_seen`: latest recorded trusted observation, not proof the listing remains active today.
- `observation_count`: distinct (run, job) observations, including baseline.
- `days_observed`: elapsed time between first and last trusted observation, **not** vacancy lifetime.
- `not_seen_once`: one later successful scrape of that same source did not contain the job.
- `not_seen_in_recent_successful_scrapes`: at least two later successful scrapes of the same source did not contain the job. This is **not** an expiration or hiring event.
- `reappearance_count`: gaps between recorded appearances where the source successfully scraped at least once. This is **not** evidence of reposting.
- `last_observed`: no subsequent successful scrape of that source shows the listing absent. This is **not** an active-job guarantee.
- Fallback, skipped and failed source runs **never** count as evidence of job disappearance.
- `issues`: malformed/untrusted/duplicate observations. Invalid JSONL syntax fails loudly instead of silently dropping history.
- `source_quality`: count of successful scrapes and other source-run statuses. These are coverage indicators, **not** a calibrated confidence score.

The original job key is preserved, so different sources are not automatically merged. No backfilling of first-seen dates, publication dates, expiry dates, or job closures is performed. This phase deliberately does not overwrite the current report page or publish its output.

Schema v2 adds manually verified positive observations. They never establish source-wide absence. A scrape explicitly marked listing_page_unverified also does not establish absence; legacy runs retain their historical interpretation with unverified completeness. No historical fields are backfilled in the append-only files.
