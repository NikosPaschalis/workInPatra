import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { shouldRunKariera, karieraJitterMs, KARIERA_JITTER_MAX_MS } from "../scripts/kariera-run-policy.js";
import { mergeSourceResults } from "../scripts/merge-source-results.js";
import { recordScrapeHistory } from "../scripts/job-history.js";

test("Kariera runs only at the evening schedule, while manual runs remain available", () => {
  assert.equal(shouldRunKariera("schedule", "0 6 * * *"), false);
  assert.equal(shouldRunKariera("schedule", "0 18 * * *"), true);
  assert.equal(shouldRunKariera("schedule", "unexpected schedule"), false);
  assert.equal(shouldRunKariera("workflow_dispatch", ""), true);
  assert.equal(shouldRunKariera("", ""), true);
});

test("random delay is Kariera-only, bounded and absent on manual runs", () => {
  assert.equal(karieraJitterMs("schedule", () => 0), 0);
  assert.equal(karieraJitterMs("schedule", () => 0.5), Math.floor((KARIERA_JITTER_MAX_MS + 1) / 2));
  assert.equal(karieraJitterMs("schedule", () => 0.999999999), KARIERA_JITTER_MAX_MS);
  assert.equal(karieraJitterMs("workflow_dispatch", () => 0.5), 0);
});

test("the morning Kariera skip retains existing listings without marking a scraper failure", () => {
  const previousJobs = [
    { source: "kariera", title: "Existing role", url: "https://example.com/old" },
  ];
  const results = [
    { status: "fulfilled", value: [{ source: "jobfind", title: "JobFind role", url: "https://example.com/jobfind" }] },
    { status: "fulfilled", value: { skipped: true } },
    { status: "fulfilled", value: [{ source: "xe", title: "XE role", url: "https://example.com/xe" }] },
  ];
  const scrapers = [{ name: "jobfind" }, { name: "kariera" }, { name: "xe" }];
  const merged = mergeSourceResults(results, scrapers, previousJobs, { log() {}, error() {} });
  assert.deepEqual(merged.jobs.map((job) => job.source), ["jobfind", "kariera", "xe"]);
  assert.deepEqual(merged.successfulSources, ["jobfind", "xe"]);
  assert.deepEqual(merged.skippedSources, ["kariera"]);
  assert.deepEqual(merged.failedSources, []);
  assert.deepEqual(merged.unrecoverableSources, []);
});

test("scheduled Kariera skip is not recorded as new observation or full-refresh success", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "kariera-schedule-test-"));
  try {
    const result = recordScrapeHistory({
      dataDir,
      jobs: [
        { source: "jobfind", title: "Fresh", url: "https://example.com/new" },
        { source: "kariera", title: "Old", url: "https://example.com/old" },
      ],
      startedAt: "2026-11-17T06:00:00Z",
      completedAt: "2026-11-17T06:03:00Z",
      sourceStats: {
        jobfind: { status: "success", scraped_count: 1, retained_count: 1 },
        kariera: { status: "skipped", scraped_count: 0, retained_count: 1 },
      },
    });
    assert.equal(result.status, "partial");
    assert.equal(result.observedCount, 1);
    const observations = readFileSync(path.join(dataDir, "observations.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(observations.map((job) => job.source), ["jobfind"]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
