import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { calculateReport, DURATIONS, monthOffset, selectPeriod, validateSnapshot } from "../scripts/labour-report-metrics.js";
import { generateReports } from "../scripts/labour-reports.js";
import { generateSnapshot } from "../scripts/snapshot.js";

const raw = file => readFileSync(file, "utf8");
const digest = text => createHash("sha256").update(text).digest("hex");
const snapshot = (month, total, extras = {}) => ({
  month, total, snapshotType: "active_inventory", capturedAt: monthOffset(month, 1) + "-01T09:00:00Z",
  lastFetched: monthOffset(month, 1) + "-01T06:00:00Z",
  bySource: { jobfind: total }, byCategory: { sales: total }, ...extras,
});
const fresh = capturedAt => ({
  comparable: true, status: "success", last_success_at: capturedAt, scope: "patras", method: "public_pages", observed_count: 7,
});
const qualitySnapshot = (month, total, overrides = {}, extras = {}) => {
  const entry = snapshot(month, total, extras);
  return { ...entry, quality: { schemaVersion: 1, checkedAt: entry.capturedAt, warnings: [],
    bySource: { jobfind: { ...fresh(entry.capturedAt), ...overrides } } } };
};
const reportFor = snapshots => calculateReport(selectPeriod(snapshots, snapshots.at(-1).month, 3));
const readJson = file => JSON.parse(raw(file));

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "workinpatra-reports-"));
  const dataDir = path.join(root, "data");
  const snapshotDir = path.join(dataDir, "snapshots");
  const outputDir = path.join(root, "site");
  mkdirSync(snapshotDir, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const record = snapshots => {
    const manifest = snapshots.map(({ month, total, capturedAt, lastFetched }) => ({ month, total, capturedAt, lastFetched, file: month + ".json" }));
    for (const s of snapshots) writeFileSync(path.join(snapshotDir, s.month + ".json"), JSON.stringify(s));
    writeFileSync(path.join(snapshotDir, "index.json"), JSON.stringify({ snapshotType: "active_inventory", snapshots: manifest }));
  };
  return { dataDir, snapshotDir, outputDir, record, publicationDate: "2027-02-08" };
}

test("selects each duration on calendar boundaries and preserves missing months", () => {
  const months = Array.from({ length: 12 }, (_, i) => snapshot(monthOffset("2027-01", i - 11), 20));
  for (const [duration, first] of [[3, "2026-11"], [6, "2026-08"], [12, "2026-02"]]) {
    const period = selectPeriod(months, "2027-01", duration);
    assert.equal(period.start, first);
    assert.equal(period.snapshots.length, duration);
    assert.deepEqual(period.missing, []);
  }
  assert.deepEqual(selectPeriod(months.filter(s => s.month !== "2026-12"), "2027-01", 3).missing, ["2026-12"]);
  assert.throws(() => calculateReport(selectPeriod([months[0], months.at(-1)], "2027-01", 3)), /incomplete/);
  assert.throws(() => selectPeriod(months, "2026-13", 3), /Invalid month/);
});

test("validates capture timing, numeric counts and reconciliation across dimensions", () => {
  const row = snapshot("2026-12", 10);
  assert.doesNotThrow(() => validateSnapshot(row, row.month));
  assert.throws(() => validateSnapshot({ ...row, byCategory: { sales: 9 } }, row.month), /reconcile/);
  assert.throws(() => validateSnapshot({ ...row, bySource: { jobfind: "10" } }, row.month), /reconcile/);
  assert.throws(() => validateSnapshot({ ...row, capturedAt: "2027-01-15T10:00:00Z" }, row.month), /capture/);
  assert.throws(() => validateSnapshot({ ...row, lastFetched: "2027-02-01T10:00:00Z" }, row.month), /freshness/);
});

test("handles zero denominators, sparse sectors and unknown classifications", () => {
  const result = reportFor([
    snapshot("2026-11", 0, { byCategory: { sales: 0 } }),
    snapshot("2026-12", 8, { byCategory: { sales: 4, unusual: 4 } }),
    snapshot("2027-01", 10, { byCategory: { sales: 8, unusual: 2 } }),
  ]);
  const sales = result.sectors.find(sector => sector.id === "sales");
  const health = result.sectors.find(sector => sector.id === "health");
  const unknown = result.sectors.find(sector => sector.id === "unknown");
  assert.equal(result.inventory.delta, 10);
  assert.equal(result.inventory.percent, null);
  assert.equal(result.inventory.average, 6);
  assert.equal(sales.delta, 8);
  assert.equal(sales.percent, null);
  assert.equal(sales.latestShare, 80);
  assert.equal(sales.shareChange, null);
  assert.deepEqual(health.values, [null, null, null]);
  assert.deepEqual(unknown.values, [0, 4, 2]);
  assert.equal(result.coverage.series.length, 0);
  assert.equal(result.lifecycle.available, false);
});

test("source coverage requires successful fresh consistent observations in every month", () => {
  const first = qualitySnapshot("2026-11", 30);
  const last = qualitySnapshot("2027-01", 30, { observed_count: 12 });
  assert.deepEqual(reportFor([first, qualitySnapshot("2026-12", 30), last]).coverage.series[0].values, [7, 7, 12]);
  for (const incompatible of [
    snapshot("2026-12", 30),
    qualitySnapshot("2026-12", 30, { status: "fallback" }),
    qualitySnapshot("2026-12", 30, { status: "scheduled_skip" }),
    qualitySnapshot("2026-12", 30, { status: "failed" }),
    qualitySnapshot("2026-12", 30, { last_success_at: "2026-12-28T10:00:00Z" }),
    qualitySnapshot("2026-12", 30, { scope: "achaia" }),
    qualitySnapshot("2026-12", 30, { scope: "listing_page_unverified" }),
    qualitySnapshot("2026-12", 30, { method: "other_view" }),
  ]) {
    const result = reportFor([first, incompatible, last]);
    assert.deepEqual(result.coverage, { series: [], excluded: ["jobfind"] });
    assert.equal(result.inventory.latest, 30);
  }
});

test("corporate figures reconcile independently and do not inflate public inventory", () => {
  const company = { byCompany: { Employer: 6 }, bySubcategory: { IT: 6 }, coverage: {}, unverified: 1 };
  const latest = qualitySnapshot("2027-01", 10, {}, { corporate: company, bySource: { jobfind: 6, corporate: 4 } });
  const first = qualitySnapshot("2026-11", 25);
  const mid = qualitySnapshot("2026-12", 25);
  const result = reportFor([first, mid, latest]);
  assert.equal(result.inventory.latest, 10);
  assert.equal(result.corporate.inventory, 6);
  assert.equal(result.corporate.publicInventory, 4);
  assert.deepEqual(result.latestBySource, { corporate: 4, jobfind: 6 });
  assert.deepEqual(result.corporate.coverageCounts, [null, null, 0]);
  assert.deepEqual(reportFor([first, mid, latest]).insights, result.insights);
  const inconsistent = { ...latest, corporate: { ...company, bySubcategory: { IT: 7 } } };
  assert.equal(reportFor([first, mid, inconsistent]).corporate, null);
});

test("archives are immutable, corrections traceable and reruns byte-stable", t => {
  const f = fixture(t);
  const rows = [snapshot("2026-10", 10), snapshot("2026-11", 20), snapshot("2026-12", 30)];
  f.record(rows);
  const inputs = Object.fromEntries(readdirSync(f.snapshotDir).map(file => [file, digest(raw(path.join(f.snapshotDir, file)))]));
  const initial = generateReports(f);
  assert.deepEqual(initial.windows.map(w => [w.duration, w.available, !!w.latest]), [[3, 3, true], [6, 3, false], [12, 3, false]]);
  assert.equal(initial.entries.length, 1);
  const key = path.join(f.outputDir, "reports", "2026-12", "3m");
  const original = raw(path.join(key, "index.html"));
  assert.match(original, /<h2 id="summary">Σύνοψη<\/h2>/);
  assert.match(original, /"@type":"Article"/);
  assert.match(original, /https:\/\/www.workinpatras.gr\/reports\/2026-12\/3m\//);
  assert.match(raw(path.join(f.outputDir, "report.html")), /Ανεπαρκή δεδομένα/);
  assert.deepEqual(generateReports({ ...f, publicationDate: "2027-02-09" }).changed, []);
  assert.deepEqual(Object.fromEntries(readdirSync(f.snapshotDir).map(file => [file, digest(raw(path.join(f.snapshotDir, file)))])), inputs);
  assert.equal(readJson(path.join(key, "report.json")).provenance[0].sha256, inputs["2026-10.json"]);

  const fourth = snapshot("2027-01", 40);
  f.record([...rows, fourth]);
  assert.equal(generateReports(f).entries.length, 2);
  assert.equal(raw(path.join(key, "index.html")), original);
  f.record([rows[0], rows[1], snapshot("2026-12", 31), fourth]);
  assert.throws(() => generateReports(f), /explicit correction/);
  const correction = { end: "2026-12", duration: 3, date: "2027-02-09", reason: "Corrected source file." };
  const corrected = generateReports({ ...f, correction });
  const rev = corrected.entries.find(entry => entry.end === correction.end).revisions.at(-1);
  assert.equal(rev.correction.previousUrl, "/reports/2026-12/3m/");
  assert.equal(raw(path.join(key, "index.html")), original);
  assert.match(raw(path.join(key, "r2", "index.html")), /Corrected source file/);
  assert.match(raw(path.join(f.outputDir, "sitemap.xml")), /<loc>https:\/\/www.workinpatras.gr\/reports\/2026-12\/3m\/r2\/<\/loc>/);
  assert.deepEqual(generateReports({ ...f, correction }).changed, []);
});

test("monthly workflow rejects reconstruction outside the capture window and preserves existing manifests", t => {
  const f = fixture(t);
  writeFileSync(path.join(f.dataDir, "jobs.json"), JSON.stringify({ jobs: [] }));
  assert.throws(() => generateSnapshot({ dataDir: f.dataDir, now: new Date("2027-01-10T10:00:00Z"), requireCaptureWindow: true }), /cannot be reconstructed/);
  const rows = [snapshot("2026-12", 10)];
  f.record(rows);
  generateSnapshot({ dataDir: f.dataDir, now: new Date("2027-01-10T10:00:00Z"), requireCaptureWindow: true });
  const manifest = raw(path.join(f.snapshotDir, "index.json"));
  generateSnapshot({ dataDir: f.dataDir, now: new Date("2027-01-11T10:00:00Z"), requireCaptureWindow: true });
  assert.equal(raw(path.join(f.snapshotDir, "index.json")), manifest);
  assert.deepEqual(readJson(path.join(f.snapshotDir, "2026-12.json")), rows[0]);
});

test("eligible archived editions expand automatically to 6 and 12 months", t => {
  const f = fixture(t);
  f.record(Array.from({ length: 12 }, (_, i) => snapshot(monthOffset("2027-01", i - 11), 40 + i)));
  const result = generateReports(f);
  assert.deepEqual(result.windows.map(window => window.duration), DURATIONS);
  assert.ok(result.windows.every(window => window.latest));
  assert.equal(result.entries.length, 18);
});
