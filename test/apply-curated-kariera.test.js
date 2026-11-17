import test from "node:test";
import assert from "node:assert/strict";
import { applyCuratedKariera } from "../scripts/apply-curated-kariera.js";

const curated = (overrides = {}) => ({
  title: "Τεχνικός", company: "Example Ltd", location: "Πάτρα", source: "kariera",
  url: "https://www.kariera.gr/jobs/technology-jobs/123456",
  manuallyVerifiedAt: "2026-11-17T17:00:00Z", category: "technology", ...overrides
});
test("queued listing joins published jobs without replacing JobFind or XE", () => {
  const previous = [{ title: "A", source: "jobfind", url: "https://example.com/a" }, { title: "B", source: "xe", url: "https://example.com/b" }];
  const result = applyCuratedKariera(previous, [curated()]);
  assert.deepEqual(result.jobs.map(j => j.source), ["jobfind", "xe", "kariera"]);
  assert.equal(result.accepted.length, 1);
});
test("deduplicates canonical URLs and repeated pending entries", () => {
  const job = curated();
  const result = applyCuratedKariera([job], [curated({ url: job.url + "/?utm_source=feed" })]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, "duplicate");
  const queued = applyCuratedKariera([], [job, job]);
  assert.equal(queued.accepted.length, 1);
});
test("rejects unverifiable, wrong-domain or wrong-location listings", () => {
  const result = applyCuratedKariera([], [
    curated({ manuallyVerifiedAt: "" }),
    curated({ url: "https://example.com/jobs/123" }),
    curated({ location: "Αθήνα" }),
  ]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 3);
});
test("deduplicates matching company and title across sources", () => {
  const job = curated();
  const result = applyCuratedKariera([{ ...job, source: "jobfind", url: "https://example.com/other" }], [job]);
  assert.equal(result.accepted.length, 0);
});
