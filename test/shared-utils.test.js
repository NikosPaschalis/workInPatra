import assert from "node:assert/strict";
import test from "node:test";

import {
  compareJobsByDateNewestFirst,
  getCalendarCutoff,
  normalizeSearchText,
} from "../client-utils.js";
import { parseGreekDate } from "../server/scrapers/_shared.js";

test("parseGreekDate rejects invalid and unknown dates", () => {
  assert.equal(parseGreekDate("31/02/2026"), null);
  assert.equal(parseGreekDate("07/26/2026"), null);
  assert.equal(parseGreekDate("άγνωστη ημερομηνία"), null);
  assert.equal(parseGreekDate(""), null);
});

test("parseGreekDate parses explicit and relative dates deterministically", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  assert.equal(parseGreekDate("29/07/2026", now), "2026-07-29T00:00:00.000Z");
  assert.equal(parseGreekDate("πριν από 3 ημέρες", now), "2026-07-29T00:00:00.000Z");
  assert.equal(parseGreekDate("πριν από 1 μήνα", now), "2026-07-01T00:00:00.000Z");
});

test("normalizeSearchText ignores Greek accents, case, and final sigma", () => {
  assert.equal(normalizeSearchText("Οδηγός"), normalizeSearchText("οδηγοσ"));
  assert.equal(normalizeSearchText("ΠΩΛΗΤΉΣ"), normalizeSearchText("πωλητης"));
});

test("getCalendarCutoff creates an inclusive calendar-day window", () => {
  const now = new Date(2026, 7, 1, 18, 30);
  const cutoff = getCalendarCutoff(7, now);
  assert.deepEqual(
    [cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), cutoff.getHours()],
    [2026, 6, 26, 0]
  );
});

test("date sorting puts missing or invalid dates last", () => {
  const jobs = [
    { title: "unknown", date: null },
    { title: "old", date: "2026-07-01T00:00:00.000Z" },
    { title: "invalid", date: "not-a-date" },
    { title: "new", date: "2026-08-01T00:00:00.000Z" },
  ];
  jobs.sort(compareJobsByDateNewestFirst);
  assert.deepEqual(jobs.map(job => job.title), ["new", "old", "unknown", "invalid"]);
});
