import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeHistory, recordScrapeHistory } from "../scripts/job-history.js";

function readJsonl(filePath) {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("initializes a one-time baseline from existing jobs.json data", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workinpatra-history-"));
  const dataDir = path.join(root, "data");
  mkdirSync(dataDir);
  writeFileSync(path.join(dataDir, "observations.jsonl"), "\n");
  writeFileSync(path.join(dataDir, "scrape-runs.jsonl"), "\n");

  try {
    const jobs = [
      { source: "jobfind", title: "Role A", url: "https://example.com/a", date: null },
      { source: "xe", title: "Role B", url: "https://example.com/b", date: "2026-11-12T00:00:00.000Z" },
    ];
    const result = initializeHistory({
      dataDir,
      previousJobs: jobs,
      lastFetched: "2026-11-12T23:06:29.275Z",
    });

    assert.deepEqual(result, { initialized: true, baselineCount: 2 });
    assert.equal(readJsonl(path.join(dataDir, "observations.jsonl")).length, 2);
    const [run] = readJsonl(path.join(dataDir, "scrape-runs.jsonl"));
    assert.equal(run.run_type, "baseline");
    assert.equal(run.total_observed, 2);
    assert.match(run.note, /not the original first-seen date/);

    assert.deepEqual(
      initializeHistory({ dataDir, previousJobs: jobs, lastFetched: null }),
      { initialized: false, baselineCount: 0 }
    );
    assert.equal(readJsonl(path.join(dataDir, "observations.jsonl")).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("records fresh observations only for sources that succeeded", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workinpatra-history-"));
  const dataDir = path.join(root, "data");
  mkdirSync(dataDir);

  try {
    const jobs = [
      { source: "jobfind", title: "Fresh role", url: "https://example.com/fresh", category: "sales" },
      { source: "xe", title: "Fallback role", url: "https://example.com/old", category: "other" },
    ];
    const result = recordScrapeHistory({
      dataDir,
      jobs,
      runId: "run-123",
      startedAt: "2026-11-13T18:00:00.000Z",
      completedAt: "2026-11-13T18:01:00.000Z",
      sourceStats: {
        jobfind: { status: "success", scraped_count: 1, fallback_count: 0, retained_count: 1 },
        xe: { status: "fallback", scraped_count: 0, fallback_count: 1, retained_count: 1 },
      },
    });

    assert.equal(result.status, "partial");
    assert.equal(result.observedCount, 1);
    const observations = readJsonl(path.join(dataDir, "observations.jsonl"));
    assert.equal(observations.length, 1);
    assert.equal(observations[0].source, "jobfind");
    assert.equal(observations[0].run_id, "run-123");

    const [run] = readJsonl(path.join(dataDir, "scrape-runs.jsonl"));
    assert.equal(run.status, "partial");
    assert.equal(run.sources.xe.status, "fallback");
    assert.equal(run.total_observed, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
