import test from "node:test";
import assert from "node:assert/strict";
import { mergeSourceResults } from "../scripts/merge-source-results.js";

const scrapers = [
  { name: "jobfind" },
  { name: "kariera" },
  { name: "xe" },
];

const silentLogger = { log() {}, error() {} };

test("keeps previous jobs for a rejected source", () => {
  const previousJobs = [
    { source: "jobfind", url: "old-jobfind" },
    { source: "kariera", url: "old-kariera" },
    { source: "xe", url: "old-xe" },
  ];
  const results = [
    { status: "fulfilled", value: [{ source: "jobfind", url: "new-jobfind" }] },
    { status: "fulfilled", value: [{ source: "kariera", url: "new-kariera" }] },
    { status: "rejected", reason: new Error("timeout") },
  ];

  const merged = mergeSourceResults(results, scrapers, previousJobs, silentLogger);

  assert.deepEqual(merged.jobs.map((job) => job.url), [
    "new-jobfind",
    "new-kariera",
    "old-xe",
  ]);
  assert.deepEqual(merged.successfulSources, ["jobfind", "kariera"]);
  assert.deepEqual(merged.failedSources, ["xe"]);
  assert.deepEqual(merged.unrecoverableSources, []);
});

test("treats an empty source result as a failure and preserves its old jobs", () => {
  const previousJobs = [{ source: "kariera", url: "old-kariera" }];
  const results = [
    { status: "fulfilled", value: [{ source: "jobfind", url: "new-jobfind" }] },
    { status: "fulfilled", value: [] },
    { status: "fulfilled", value: [{ source: "xe", url: "new-xe" }] },
  ];

  const merged = mergeSourceResults(results, scrapers, previousJobs, silentLogger);

  assert.deepEqual(merged.jobs.map((job) => job.url), [
    "new-jobfind",
    "old-kariera",
    "new-xe",
  ]);
  assert.deepEqual(merged.failedSources, ["kariera"]);
  assert.deepEqual(merged.unrecoverableSources, []);
});

test("reports zero successful sources when every scraper fails", () => {
  const previousJobs = [
    { source: "jobfind", url: "old-jobfind" },
    { source: "kariera", url: "old-kariera" },
    { source: "xe", url: "old-xe" },
  ];
  const results = scrapers.map(() => ({
    status: "rejected",
    reason: new Error("offline"),
  }));

  const merged = mergeSourceResults(results, scrapers, previousJobs, silentLogger);

  assert.deepEqual(merged.jobs, previousJobs);
  assert.deepEqual(merged.successfulSources, []);
  assert.deepEqual(merged.failedSources, ["jobfind", "kariera", "xe"]);
  assert.deepEqual(merged.unrecoverableSources, []);
});

test("reports a failed source without previous jobs as unrecoverable", () => {
  const results = [
    { status: "fulfilled", value: [{ source: "jobfind", url: "new-jobfind" }] },
    { status: "fulfilled", value: [{ source: "kariera", url: "new-kariera" }] },
    { status: "rejected", reason: new Error("offline") },
  ];

  const merged = mergeSourceResults(results, scrapers, [], silentLogger);

  assert.deepEqual(merged.successfulSources, ["jobfind", "kariera"]);
  assert.deepEqual(merged.failedSources, ["xe"]);
  assert.deepEqual(merged.unrecoverableSources, ["xe"]);
});
