import assert from "node:assert/strict";
import test from "node:test";

import { extractDates } from "../server/scrapers/kariera.js";

test("extractDates associates a job with its date across large card markup", () => {
  const html = [
    '<a href="/jobs/example-jobs/123">Job</a>',
    ".".repeat(5_000),
    '<time dateTime="2026-07-30T01:01:03.474Z"></time>',
  ].join("");

  assert.deepEqual(extractDates(html), {
    123: "2026-07-30T01:01:03.474Z",
  });
});

test("extractDates maps each time to the nearest preceding job link", () => {
  const html = [
    '<a href="/jobs/example-jobs/123"></a>',
    '<time datetime="2026-07-30T01:01:03.474Z"></time>',
    '<a href="/jobs/example-jobs/456"></a>',
    '<time datetime="2026-07-31T09:37:19.758Z"></time>',
  ].join("");

  assert.deepEqual(extractDates(html), {
    123: "2026-07-30T01:01:03.474Z",
    456: "2026-07-31T09:37:19.758Z",
  });
});

test("extractDates ignores invalid timestamps", () => {
  const html = [
    '<a href="/jobs/example-jobs/123"></a>',
    '<time datetime="not-a-date"></time>',
  ].join("");

  assert.deepEqual(extractDates(html), {});
});
