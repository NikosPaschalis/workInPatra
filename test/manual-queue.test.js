import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyManualCandidates,
  locationRelevance,
  mergeManualQueue,
  normalizePublicationDate,
  retainCuratedListings,
  validateManualJob,
} from "../scripts/manual-queue.js";
import { canonicalizeJobUrl } from "../scripts/job-identity.js";

const approved = (source = "jobfind", overrides = {}) => ({
  title: "Τεχνικός πεδίου",
  company: "Example SA",
  location: "Πάτρα",
  url: source === "kariera"
    ? "https://www.kariera.gr/jobs/technology-jobs/123456"
    : source === "xe"
      ? "https://www.xe.gr/εργασία/θέση-εργασίας/τεχνικοί/example-job"
      : "https://www.jobfind.gr/JobAd/View/GR/Theseis_Ergasias/example-id/",
  source,
  category: "construction",
  sourceCategory: "Τεχνικά",
  date: null,
  dateRaw: "πριν από 2 ημέρες",
  manuallyVerifiedAt: "2026-11-20T10:00:00.000Z",
  ...overrides,
});

test("canonical URLs remove presentation-only differences", () => {
  assert.equal(
    canonicalizeJobUrl("HTTP://WWW.JobFind.gr/JobAd/View/x/?utm_source=test#top"),
    "https://jobfind.gr/JobAd/View/x"
  );
});

test("all supported sources require individual listing URLs and manual approval", () => {
  for (const source of ["kariera", "jobfind", "xe"]) {
    assert.equal(validateManualJob(approved(source)).valid, true, source);
  }
  assert.equal(validateManualJob(approved("xe", { manuallyVerifiedAt: null })).valid, false);
  assert.equal(validateManualJob(approved("jobfind", { url: "https://www.jobfind.gr/jobads/all/patra1" })).valid, false);
});

test("relative dates retain evidence but do not fabricate exact dates", () => {
  assert.deepEqual(normalizePublicationDate(approved()), {
    date: null,
    dateRaw: "πριν από 2 ημέρες",
    dateProvenance: "relative_label",
  });
});

test("location rules accept covered places and flag unclear locations", () => {
  assert.equal(locationRelevance("Ρίο Αχαΐας").status, "eligible");
  assert.equal(locationRelevance("Αθήνα").status, "review");
});

test("candidate classification distinguishes published, queued and suspected duplicates", () => {
  const jobs = classifyManualCandidates([
    approved("jobfind"),
    approved("xe", { company: "Other", title: "Other role" }),
    approved("kariera", { url: "https://www.kariera.gr/jobs/other/999999" }),
  ], {
    published: [approved("jobfind")],
    manualPending: [approved("xe", { company: "Other", title: "Other role" })],
  });
  assert.deepEqual(jobs.map((job) => job.validationStatus), ["published", "queued", "suspected_duplicate"]);
});

test("manual queue merge is idempotent and adds bounded retention", () => {
  const now = new Date("2026-11-21T00:00:00.000Z");
  const result = mergeManualQueue([], [approved(), approved()], { now });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected[0].reason, "duplicate");
  assert.equal(result.accepted[0].curatedUntil, "2027-01-04T10:00:00.000Z");
  assert.equal(result.accepted[0].date, null);
});

test("expired approvals are rejected and retained jobs expire", () => {
  const old = approved("xe", { manuallyVerifiedAt: "2026-01-01T00:00:00Z" });
  assert.equal(mergeManualQueue([], [old], { now: new Date("2026-11-20") }).accepted.length, 0);
  const retained = approved("xe", { curated: true, curatedUntil: "2026-12-01T00:00:00Z" });
  assert.equal(retainCuratedListings([], [retained], "xe", new Date("2026-11-20")).length, 1);
  assert.equal(retainCuratedListings([], [retained], "xe", new Date("2026-12-02")).length, 0);
});
